const express = require('express');
const { createServer } = require('http');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');
const WebSocket = require('ws');

require('dotenv').config();

const { AppError, errorHandler, asyncHandler } = require('./middleware/errorHandler');
const { authenticate, requireRole } = require('./middleware/auth');
const { analyzeFile, getFileType, isSupportedFileType } = require('./services/analyzer');
const { calculatePrice } = require('./services/pricing');
const { determineFlipDirection } = require('./services/duplex');
const { discoverPrinters, routeJob } = require('./services/printer');
const { processOrder, processPDF, parsePageRange, calculateSheetCount, countPagesFromRange, processAndDispatchOrder } = require('./services/printProcessor');

// Helper: get next token for a shop
async function getNextToken(shopId) {
  const maxOrder = await prisma.order.findFirst({
    where: { shopId, token: { not: null } },
    orderBy: { token: 'desc' },
    select: { token: true },
  });
  return (maxOrder?.token || 0) + 1;
}

// Helper: detect image files for contact-sheet grouping
function isImageFileType(file) {
  const t = (file.fileType || '').toLowerCase();
  return ['jpg', 'jpeg', 'png', 'webp'].includes(t);
}

// Helper: creates ONE print job combining all image files into a contact sheet
async function createContactSheetPrintJob(imageFiles, order, shopId, printers, bwOverridePrinter, colorOverridePrinter) {
  const first = imageFiles[0];
  const settings = first.settings || {};
  const nUp = settings.pagesPerSheet || 1;
  const colorMode = imageFiles.some((f) => (f.settings?.colorMode || 'color') === 'color') ? 'color' : 'bw';
  const copies = settings.copies || 1;
  const paperSize = settings.paperSize || 'A4';

  const job = {
    orderId: order.id,
    fileId: first.id,
    sectionIndex: 0,
    pages: JSON.stringify(imageFiles.map((f) => f.id)), // file IDs as strings
    colorMode,
    printStyle: 'single',
    paperSize,
    pagesPerSheet: nUp,
    flipDirection: 'long-edge',
    copies,
    shopId,
  };

  const isColor = colorMode === 'color';
  let assigned;
  if (isColor && colorOverridePrinter) assigned = colorOverridePrinter;
  else if (!isColor && bwOverridePrinter) assigned = bwOverridePrinter;
  else assigned = routeJob(job, printers, {}).assignedPrinter;

  return prisma.printJob.create({ data: { ...job, assignedPrinter: assigned } });
}

// Helper: creates print jobs from file settings, respecting sections
async function createPrintJobsForFile(file, orderId, shopId, printers, bwOverridePrinter, colorOverridePrinter) {
  const s = file.settings || {};
  const sections = s.sections || [];

  // Cache the chosen printer per color mode so all sections of the same
  // mode in one order print on the same machine (keeps sequence intact).
  const modePrinterCache = {};

  const assignPrinter = (job) => {
    const isColor = job.colorMode === 'color';
    if (isColor && colorOverridePrinter) {
      return { ...job, assignedPrinter: colorOverridePrinter };
    }
    if (!isColor && bwOverridePrinter) {
      return { ...job, assignedPrinter: bwOverridePrinter };
    }
    return routeJob(job, printers, modePrinterCache);
  };

  if (sections.length > 0) {
    const jobs = [];
    for (const [index, section] of sections.entries()) {
      const sectionPages = [];
      for (let p = (section.startPage || 1) - 1; p < (section.endPage || file.pageCount); p++) {
        sectionPages.push(p);
      }
      const sectionPagesPerSheet = section.pagesPerSheet || s.pagesPerSheet || 1;
      const job = {
        orderId,
        fileId: file.id,
        sectionIndex: index,
        pages: JSON.stringify(sectionPages),
        colorMode: section.colorMode || s.colorMode || 'bw',
        printStyle: section.printStyle || s.printStyle || 'single',
        paperSize: section.paperSize || s.paperSize || 'A4',
        pagesPerSheet: sectionPagesPerSheet,
        flipDirection: determineFlipDirection(
          file.orientation,
          section.paperSize || s.paperSize || 'A4',
          section.pagesPerSheet || s.pagesPerSheet || 1,
          section.orientation || s.orientation || 'auto'
        ),
        copies: section.copies || s.copies || 1,
        shopId,
      };
      const printJob = await prisma.printJob.create({ data: assignPrinter(job) });
      jobs.push(printJob);
    }
    return jobs;
  }

  const pages = s.pageRange === 'all' || !s.pageRange
    ? Array.from({ length: file.pageCount }, (_, i) => i)
    : parsePageRange(s.pageRange, file.pageCount);

  const job = {
    orderId,
    fileId: file.id,
    sectionIndex: 0,
    pages: JSON.stringify(pages),
    colorMode: s.colorMode || 'bw',
    printStyle: s.printStyle || 'single',
    paperSize: s.paperSize || 'A4',
    pagesPerSheet: s.pagesPerSheet || 1,
    flipDirection: determineFlipDirection(
      file.orientation,
      s.paperSize || 'A4',
      s.pagesPerSheet || 1,
      s.orientation
    ),
    copies: s.copies || 1,
    shopId,
  };

  const printJob = await prisma.printJob.create({ data: assignPrinter(job) });
  return [printJob];
}

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Multer setup
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.pptx', '.xlsx', '.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new AppError('File type not allowed', 400, 'INVALID_FILE_TYPE'));
    }
  },
});

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Static files
const FRONTEND_DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
}
app.use('/uploads', express.static(UPLOAD_DIR));

// ============================================
// AUTH ROUTES
// ============================================

app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const { email, password, name, shopName } = req.body;

  if (!email || !password || !name || !shopName) {
    throw new AppError('Missing required fields', 400, 'MISSING_FIELDS');
  }

  const existingUser = await prisma.user.findFirst({ where: { email } });
  if (existingUser) {
    throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
  }

  const shop = await prisma.shop.create({
    data: { name: shopName },
  });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      shopId: shop.id,
      email,
      passwordHash,
      name,
      role: 'OWNER',
    },
  });

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        shopId: shop.id,
        shopName: shop.name,
      },
    },
  });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError('Missing email or password', 400, 'MISSING_FIELDS');
  }

  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        shopId: user.shopId,
      },
    },
  });
}));

app.get('/api/auth/profile', authenticate, asyncHandler(async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { id: req.user.shopId } });

  res.json({
    success: true,
    data: {
      ...req.user,
      shopName: shop ? shop.name : null,
    },
  });
}));

// ============================================
// FILE UPLOAD & ORDER ROUTES
// ============================================

app.post('/api/upload', authenticate, upload.array('files', 20), asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw new AppError('No files uploaded', 400, 'NO_FILES');
  }

  const shopId = req.user.shopId;

  // Create or find customer
  let customer = null;
  if (req.body.customerPhone) {
    customer = await prisma.customer.findFirst({
      where: { shopId, phone: req.body.customerPhone },
    });
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          shopId,
          name: req.body.customerName || 'Walk-in Customer',
          phone: req.body.customerPhone,
          email: req.body.customerEmail,
        },
      });
    }
  }

  // Create order
  const token = await getNextToken(shopId);
  const order = await prisma.order.create({
    data: {
      shopId,
      token,
      customerId: customer ? customer.id : null,
      notes: req.body.notes,
    },
  });

  const files = [];

  for (const file of req.files) {
    const fileType = getFileType(file.originalname);
    const analysis = await analyzeFile(file.path, fileType);

    const defaultSettings = {
      paperSize: 'A4',
      orientation: 'auto',
      colorMode: isImageFileType({ fileType }) ? 'color' : 'bw',
      printStyle: 'single',
      copies: 1,
      pageRange: 'all',
      pagesPerSheet: 1,
    };

    const orderFile = await prisma.orderFile.create({
      data: {
        orderId: order.id,
        originalName: file.originalname,
        storagePath: file.path,
        fileType,
        size: file.size,
        pageCount: analysis.pageCount,
        colorPageCount: analysis.colorPageCount,
        orientation: analysis.orientation,
        settings: defaultSettings,
        shopId,
      },
    });

    files.push({
      ...orderFile,
      analysis,
    });
  }

  // Calculate initial price
  let totalPages = 0;
  let totalColorPages = 0;
  files.forEach(f => {
    totalPages += f.pageCount;
    totalColorPages += f.colorPageCount;
  });

  const pricing = calculatePrice(totalPages, totalColorPages, {
    colorMode: 'bw',
    printStyle: 'single',
    copies: 1,
    pagesPerSheet: 1,
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { totalPrice: pricing.total },
  });

  res.json({
    success: true,
    data: {
      order: {
        id: order.id,
        token: order.token,
        status: order.status,
        totalPrice: pricing.total,
        createdAt: order.createdAt,
      },
      files: files.map(f => ({
        id: f.id,
        originalName: f.originalName,
        fileType: f.fileType,
        size: f.size,
        pageCount: f.pageCount,
        colorPageCount: f.colorPageCount,
        orientation: f.orientation,
        settings: f.settings,
        analysis: f.analysis,
      })),
      pricing,
    },
  });
}));

app.put('/api/orders/:id/settings', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { fileId, settings } = req.body;

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  }

  if (fileId) {
    await prisma.orderFile.update({
      where: { id: fileId },
      data: { settings },
    });
  }

  // Recalculate total price
  const files = await prisma.orderFile.findMany({ where: { orderId: id } });
  const imgFiles = files.filter((f) => isImageFileType(f));
  const nonImg = files.filter((f) => !isImageFileType(f));

  let totalPages = 0;
  let totalColorPages = 0;

  for (const file of nonImg) {
    totalPages += file.pageCount;
    totalColorPages += file.colorPageCount;
  }

  // Contact-sheet images charged per sheet
  if (imgFiles.length > 0) {
    const s = imgFiles[0].settings || {};
    const nUp = s.pagesPerSheet || 1;
    const colorMode = imgFiles.some((f) => (f.settings?.colorMode || 'color') === 'color') ? 'color' : 'bw';
    totalPages += Math.ceil(imgFiles.length / nUp);
    totalColorPages += colorMode === 'color' ? Math.ceil(imgFiles.length / nUp) : 0;
  }

  const fileSettings = settings || { paperSize: 'A4', printStyle: 'single', copies: 1, pagesPerSheet: 1, colorMode: 'bw' };
  const pricing = calculatePrice(totalPages, totalColorPages, fileSettings);

  await prisma.order.update({
    where: { id },
    data: { totalPrice: pricing.total },
  });

  res.json({
    success: true,
    data: { pricing, totalPrice: pricing.total },
  });
}));

app.get('/api/orders/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      files: true,
      printJobs: true,
      customer: true,
    },
  });

  if (!order) {
    throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  }

  res.json({ success: true, data: order });
}));

app.get('/api/orders/:id/price', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { files: true },
  });

  if (!order) {
    throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  }

  let totalPages = 0;
  let totalColorPages = 0;

  for (const file of order.files) {
    totalPages += file.pageCount;
    totalColorPages += file.colorPageCount;
  }

  const pricing = calculatePrice(totalPages, totalColorPages, {
    colorMode: 'auto',
    printStyle: 'single',
    copies: 1,
    pagesPerSheet: 1,
  });

  res.json({ success: true, data: pricing });
}));

app.post('/api/orders/:id/confirm', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { files: true },
  });

  if (!order) {
    throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  }

  if (order.status !== 'PENDING') {
    throw new AppError('Order already processed', 400, 'ORDER_NOT_PENDING');
  }

  // Discover printers
  const printers = await prisma.printer.findMany({
    where: { shopId: order.shopId },
  });

  const printJobs = [];

  for (const file of order.files) {
    const settings = file.settings || {};
    const pages = settings.pageRange === 'all' || !settings.pageRange
      ? Array.from({ length: file.pageCount }, (_, i) => i)
      : parsePageRange(settings.pageRange, file.pageCount);

    const job = {
      orderId: order.id,
      fileId: file.id,
      pages: JSON.stringify(pages),
      colorMode: settings.colorMode || 'auto',
      printStyle: settings.printStyle || 'single',
      paperSize: settings.paperSize || 'A4',
      flipDirection: determineFlipDirection(
        file.orientation,
        settings.paperSize || 'A4',
        settings.pagesPerSheet || 1,
        settings.orientation
      ),
      copies: settings.copies || 1,
      shopId: order.shopId,
    };

    const routed = routeJob(job, printers);

    const printJob = await prisma.printJob.create({
      data: routed,
    });

    printJobs.push(printJob);
  }

  // Update order status
  await prisma.order.update({
    where: { id },
    data: {
      status: 'APPROVED',
      approvedAt: new Date(),
    },
  });

  res.json({
    success: true,
    data: {
      order: { id: order.id, status: 'APPROVED' },
      printJobs,
    },
  });
}));

// ============================================
// GUEST ROUTES (Customer Portal - no auth)
// ============================================

app.post('/api/guest/upload', upload.array('files', 20), asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw new AppError('No files uploaded', 400, 'NO_FILES');
  }

  // Use the default shop
  const shop = await prisma.shop.findFirst();
  if (!shop) throw new AppError('No shop configured', 500, 'NO_SHOP');
  const shopId = shop.id;

  let customer = null;
  if (req.body.customerPhone) {
    customer = await prisma.customer.findFirst({
      where: { shopId, phone: req.body.customerPhone },
    });
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          shopId,
          name: req.body.customerName || 'Walk-in Customer',
          phone: req.body.customerPhone,
          email: req.body.customerEmail || null,
        },
      });
    }
  }

  const token = await getNextToken(shopId);
  const order = await prisma.order.create({
    data: {
      shopId,
      token,
      customerId: customer ? customer.id : null,
      notes: req.body.notes || '',
    },
  });

  const files = [];

  for (const file of req.files) {
    const fileType = getFileType(file.originalname);
    const analysis = await analyzeFile(file.path, fileType);

    const defaultSettings = {
      paperSize: analysis.suggestedPaperSize || 'A4',
      orientation: analysis.orientation || 'auto',
      colorMode: isImageFileType({ fileType }) ? 'color' : 'bw',
      printStyle: 'single',
      copies: 1,
      pageRange: 'all',
      pagesPerSheet: 1,
      sections: [],
    };

    const orderFile = await prisma.orderFile.create({
      data: {
        orderId: order.id,
        originalName: file.originalname,
        storagePath: file.path,
        fileType,
        size: file.size,
        pageCount: analysis.pageCount,
        colorPageCount: analysis.colorPageCount,
        orientation: analysis.orientation || 'portrait',
        settings: defaultSettings,
        shopId,
      },
    });

    files.push({ ...orderFile, analysis });
  }

  const orderWithFiles = await prisma.order.findUnique({
    where: { id: order.id },
    include: { files: true, customer: true },
  });

  res.json({
    success: true,
    data: orderWithFiles,
  });
}));

app.put('/api/guest/orders/:id/settings', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { fileId, settings } = req.body;

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');

  if (fileId) {
    await prisma.orderFile.update({
      where: { id: fileId },
      data: { settings },
    });
  }

  // Recalculate total
  const files = await prisma.orderFile.findMany({ where: { orderId: id } });
  let totalPages = 0;
  let totalColorPages = 0;

  for (const file of files) {
    totalPages += file.pageCount;
    totalColorPages += file.colorPageCount;
  }

  const avgSettings = settings || { paperSize: 'A4', printStyle: 'single', copies: 1, pagesPerSheet: 1, colorMode: 'auto' };
  const pricing = calculatePrice(totalPages, totalColorPages, avgSettings);

  await prisma.order.update({
    where: { id },
    data: { totalPrice: pricing.total },
  });

  const updatedOrder = await prisma.order.findUnique({
    where: { id },
    include: { files: true, customer: true },
  });

  res.json({ success: true, data: updatedOrder });
}));

app.get('/api/guest/orders/:id', asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { files: true, printJobs: true, customer: true },
  });
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  res.json({ success: true, data: order });
}));

app.get('/api/guest/orders/:id/price', asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { files: true },
  });
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');

  const breakdowns = [];
  let grandTotal = 0;

  const imageFiles = order.files.filter((f) => isImageFileType(f));
  const docFiles = order.files.filter((f) => !isImageFileType(f));

  // Contact-sheet: charge per combined sheet, not per image
  if (imageFiles.length > 0) {
    const s = imageFiles[0].settings || {};
    const nUp = s.pagesPerSheet || 1;
    const colorMode = imageFiles.some((f) => (f.settings?.colorMode || 'color') === 'color') ? 'color' : 'bw';
    const copies = s.copies || 1;
    const totalPages = Math.ceil(imageFiles.length / nUp);
    const colorPages = colorMode === 'color' ? totalPages : 0;
    const price = calculatePrice(totalPages, colorPages, {
      colorMode,
      printStyle: 'single',
      copies,
      pagesPerSheet: 1, // already collapsed to sheets
    });
    breakdowns.push({
      fileId: imageFiles[0].id,
      fileName: `Contact sheet (${imageFiles.length} photos × ${nUp}/page)`,
      pageCount: totalPages,
      colorPages,
      totalSheets: totalPages,
      copies,
      amount: price.total,
      breakdown: price.breakdown,
    });
    grandTotal += price.total;
  }

  for (const file of docFiles) {
    const s = file.settings || {};
    const sections = s.sections || [];

    if (sections.length > 0) {
      let fileTotal = 0;
      const fileBreakdown = [];
      for (const sec of sections) {
        const secPages = (sec.endPage || file.pageCount) - (sec.startPage || 1) + 1;
        const secColorMode = sec.colorMode || s.colorMode || 'auto';
        let secColorPages = 0;
        if (secColorMode === 'color') secColorPages = secPages;
        else if (secColorMode === 'auto' && file.pageCount > 0) {
          secColorPages = Math.round(secPages * (file.colorPageCount / file.pageCount));
        }
        const secSettings = {
          colorMode: secColorMode,
          printStyle: sec.printStyle || s.printStyle || 'single',
          copies: sec.copies || s.copies || 1,
          pagesPerSheet: sec.pagesPerSheet || s.pagesPerSheet || 1,
        };
        const price = calculatePrice(secPages, secColorPages, secSettings);
        fileBreakdown.push({
          label: 'Section ' + (sections.indexOf(sec) + 1) + ' (p' + sec.startPage + '-' + sec.endPage + ')',
          pageCount: secPages,
          colorPages: secColorPages,
          amount: price.total,
          items: price.breakdown,
        });
        fileTotal += price.total;
      }
      breakdowns.push({
        fileId: file.id,
        fileName: file.originalName,
        pageCount: null,
        colorPages: null,
        totalSheets: null,
        copies: null,
        amount: fileTotal,
        sections: fileBreakdown,
        breakdown: [{ label: 'See sections below', amount: 0 }],
      });
      grandTotal += fileTotal;
    } else {
      const actualPages = countPagesFromRange(s.pageRange, file.pageCount);
      const colorRatio = file.pageCount > 0 ? file.colorPageCount / file.pageCount : 0;
      const actualColorPages = Math.round(actualPages * colorRatio);
      const price = calculatePrice(actualPages, actualColorPages, s);
      breakdowns.push({
        fileId: file.id,
        fileName: file.originalName,
        pageCount: actualPages,
        colorPages: actualColorPages,
        totalSheets: actualPages,
        copies: s.copies || 1,
        amount: price.total,
        breakdown: price.breakdown,
      });
      grandTotal += price.total;
    }
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { totalPrice: grandTotal },
  });

  res.json({ success: true, data: { breakdowns, total: grandTotal } });
}));

app.post('/api/guest/orders/:id/confirm', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { paymentMethod } = req.body;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { files: true },
  });
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  if (order.status !== 'PENDING') throw new AppError('Order already processed', 400, 'ORDER_NOT_PENDING');

  const printers = await prisma.printer.findMany({ where: { shopId: order.shopId } });
  const printJobs = [];

  for (const file of order.files) {
    const created = await createPrintJobsForFile(file, order.id, order.shopId, printers);
    printJobs.push(...created);
  }

  await prisma.order.update({
    where: { id },
    data: {
      status: 'APPROVED',
      paymentStatus: 'PAID',
      paymentMethod: paymentMethod || 'cash',
      approvedAt: new Date(),
    },
  });

  const updatedOrder = await prisma.order.findUnique({
    where: { id },
    include: { files: true, printJobs: true, customer: true },
  });

  res.json({ success: true, data: updatedOrder });
}));

// ============================================
// ADMIN ROUTES
// ============================================

app.get('/api/admin/orders', authenticate, asyncHandler(async (req, res) => {
  const { search, status, page = 1, limit = 20 } = req.query;
  const shopId = req.user.shopId;

  const where = { shopId };
  if (status) where.status = status;
  if (search) {
    const tokenMatch = parseInt(search);
    where.OR = [
      { notes: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
      { token: isNaN(tokenMatch) ? undefined : tokenMatch },
    ].filter(Boolean);
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { files: true, customer: true },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    }),
    prisma.order.count({ where }),
  ]);

  res.json({
    success: true,
    data: {
      orders,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    },
  });
}));

app.get('/api/admin/orders/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { files: true, printJobs: true, customer: true },
  });

  if (!order) {
    throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  }

  res.json({ success: true, data: order });
}));

app.put('/api/admin/orders/:id/status', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, bwPrinterName, colorPrinterName } = req.body;

  const validStatuses = ['PENDING', 'APPROVED', 'PRINTING', 'COMPLETED', 'REJECTED'];
  if (!validStatuses.includes(status)) {
    throw new AppError('Invalid status', 400, 'INVALID_STATUS');
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: { files: true, printJobs: true },
  });
  if (!order) {
    throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  }

  const updateData = { status };
  if (status === 'APPROVED' || status === 'PRINTING') updateData.approvedAt = new Date();
  if (status === 'PRINTING') updateData.printedAt = new Date();
  if (status === 'PRINTING') updateData.paymentStatus = 'PAID';

  if (status === 'PRINTING') {
    const printers = await prisma.printer.findMany({
      where: { shopId: order.shopId },
    });

    // Delete old print jobs so they get re-created with correct printer
    if (order.printJobs.length > 0) {
      await prisma.printJob.deleteMany({ where: { orderId: id } });
    }

    const imageFiles = order.files.filter((f) => isImageFileType(f));
    const docFiles = order.files.filter((f) => !isImageFileType(f));

    if (imageFiles.length > 0) {
      await createContactSheetPrintJob(imageFiles, order, order.shopId, printers, bwPrinterName || null, colorPrinterName || null);
    }
    for (const file of docFiles) {
      await createPrintJobsForFile(file, order.id, order.shopId, printers, bwPrinterName || null, colorPrinterName || null);
    }
  }

  await prisma.order.update({ where: { id }, data: updateData });

  let printResults = [];
  if (status === 'PRINTING') {
    try {
      printResults = await processAndDispatchOrder(id, prisma);
      console.log(`Print dispatch results for order ${id}:`, printResults);
    } catch (err) {
      console.error(`Print dispatch failed for order ${id}:`, err);
    }
  }

  res.json({ success: true, data: { id, status, printResults } });
}));

app.get('/api/admin/orders/:id/print-jobs', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const printJobs = await prisma.printJob.findMany({
    where: { orderId: id },
    orderBy: { id: 'asc' },
  });

  res.json({ success: true, data: printJobs });
}));

app.post('/api/admin/orders/:id/reprint', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { bwPrinterName, colorPrinterName } = req.body;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { files: true, printJobs: true },
  });

  if (!order) {
    throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  }

  // Create new print jobs
  const printers = await prisma.printer.findMany({
    where: { shopId: order.shopId },
  });

  const printJobs = [];

  const imageFiles = order.files.filter((f) => isImageFileType(f));
  const docFiles = order.files.filter((f) => !isImageFileType(f));

  if (imageFiles.length > 0) {
    const created = await createContactSheetPrintJob(imageFiles, order, order.shopId, printers, bwPrinterName || null, colorPrinterName || null);
    printJobs.push(created);
  }
  for (const file of docFiles) {
    const created = await createPrintJobsForFile(file, order.id, order.shopId, printers, bwPrinterName || null, colorPrinterName || null);
    printJobs.push(...created);
  }

  await prisma.order.update({
    where: { id },
    data: { status: 'PRINTING', printedAt: new Date() },
  });

  res.json({ success: true, data: { printJobs } });
}));

// ============================================
// PRINTER ROUTES
// ============================================

app.get('/api/printers', authenticate, asyncHandler(async (req, res) => {
  const shopId = req.user.shopId;

  const printers = await prisma.printer.findMany({
    where: { shopId },
    orderBy: { name: 'asc' },
  });

  // Also try to discover system printers
  const systemPrinters = await discoverPrinters();

  res.json({
    success: true,
    data: {
      printers,
      systemPrinters,
    },
  });
}));

app.post('/api/printers', authenticate, asyncHandler(async (req, res) => {
  const { name, ip, paperSizes, colorSupport, duplexSupport } = req.body;
  const shopId = req.user.shopId;

  if (!name) {
    throw new AppError('Printer name is required', 400, 'MISSING_NAME');
  }

  const printer = await prisma.printer.create({
    data: {
      name,
      ip,
      paperSizes: paperSizes || ['A4'],
      colorSupport: colorSupport || false,
      duplexSupport: duplexSupport || false,
      shopId,
    },
  });

  res.json({ success: true, data: printer });
}));

app.put('/api/printers/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, ip, paperSizes, colorSupport, duplexSupport, status } = req.body;

  const printer = await prisma.printer.findUnique({ where: { id } });
  if (!printer) {
    throw new AppError('Printer not found', 404, 'PRINTER_NOT_FOUND');
  }

  const updated = await prisma.printer.update({
    where: { id },
    data: {
      name: name || printer.name,
      ip: ip !== undefined ? ip : printer.ip,
      paperSizes: paperSizes || printer.paperSizes,
      colorSupport: colorSupport !== undefined ? colorSupport : printer.colorSupport,
      duplexSupport: duplexSupport !== undefined ? duplexSupport : printer.duplexSupport,
      status: status || printer.status,
    },
  });

  res.json({ success: true, data: updated });
}));

app.delete('/api/printers/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const printer = await prisma.printer.findUnique({ where: { id } });
  if (!printer) {
    throw new AppError('Printer not found', 404, 'PRINTER_NOT_FOUND');
  }

  await prisma.printer.delete({ where: { id } });

  res.json({ success: true, data: { id } });
}));

// ============================================
// SETTINGS ROUTES
// ============================================

const qrStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `upi_qr${path.extname(file.originalname)}`),
});
const qrUpload = multer({ storage: qrStorage, limits: { fileSize: 5 * 1024 * 1024 } });

app.get('/api/settings/pricing', authenticate, asyncHandler(async (req, res) => {
  const shopId = req.user.shopId;
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  const pricing = await prisma.pricingRule.findFirst({ where: { shopId } });
  const settings = (shop?.settings || {});

  res.json({
    success: true,
    data: {
      bwPerPage: pricing?.bwPerPage || 1,
      colorPerPage: pricing?.colorPerPage || 5,
      colorDuplexPerPage: pricing?.colorDuplexPerPage || 10,
      upiQrUrl: settings.upiQrUrl || '',
    },
  });
}));

app.put('/api/settings/pricing', authenticate, asyncHandler(async (req, res) => {
  const shopId = req.user.shopId;
  const { bwPerPage, colorPerPage, colorDuplexPerPage, upiQrUrl } = req.body;

  const existing = await prisma.pricingRule.findFirst({ where: { shopId } });
  if (existing) {
    await prisma.pricingRule.update({
      where: { id: existing.id },
      data: { bwPerPage, colorPerPage, colorDuplexPerPage },
    });
  } else {
    await prisma.pricingRule.create({
      data: { name: 'Default', bwPerPage, colorPerPage, colorDuplexPerPage, shopId },
    });
  }

  if (upiQrUrl !== undefined) {
    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    await prisma.shop.update({
      where: { id: shopId },
      data: { settings: { ...(shop?.settings || {}), upiQrUrl } },
    });
  }

  res.json({ success: true, data: { message: 'Settings saved' } });
}));

app.get('/api/settings/public/upi-qr', asyncHandler(async (req, res) => {
  const shop = await prisma.shop.findFirst();
  const url = (shop?.settings || {}).upiQrUrl || '';
  res.json({ success: true, data: { url } });
}));

app.post('/api/settings/upi-qr', authenticate, qrUpload.single('qr'), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('No file uploaded', 400, 'NO_FILE');
  const shopId = req.user.shopId;
  const url = `/uploads/${req.file.filename}`;
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  await prisma.shop.update({
    where: { id: shopId },
    data: { settings: { ...(shop?.settings || {}), upiQrUrl: url } },
  });
  res.json({ success: true, data: { url } });
}));

// ============================================
// HEALTH CHECK
// ============================================

app.get('/api/health', asyncHandler(async (req, res) => {
  await prisma.$queryRaw`SELECT 1`;

  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
  });
}));

// ============================================
// AGENT API ROUTES
// ============================================

// Agent login - same as user login, returns JWT
app.post('/api/agent/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new AppError('Email and password required', 400, 'MISSING_FIELDS');

  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });

  res.json({
    success: true,
    data: {
      token,
      shopId: user.shopId,
      shopName: user.shop?.name,
      printerName: null,
    },
  });
}));

// Get pending print jobs for this shop
app.get('/api/agent/jobs', authenticate, asyncHandler(async (req, res) => {
  const shopId = req.user.shopId;

  const jobs = await prisma.printJob.findMany({
    where: {
      shopId,
      status: 'PRINTING',
    },
    include: {
      order: { select: { id: true, token: true, notes: true } },
      file: { select: { id: true, originalName: true, fileType: true } },
    },
    orderBy: { id: 'asc' },
  });

  res.json({ success: true, data: jobs });
}));

// Get print-ready file for a job
app.get('/api/agent/jobs/:id/file', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const job = await prisma.printJob.findUnique({
    where: { id },
    include: { file: true },
  });

  if (!job) throw new AppError('Print job not found', 404, 'NOT_FOUND');
  if (job.shopId !== req.user.shopId) throw new AppError('Access denied', 403, 'FORBIDDEN');

  // Find the print-ready file
  const printReadyDir = path.join(path.dirname(job.file.storagePath), 'print-ready');
  const pattern = `${id}_printready.pdf`;

  let filePath;
  try {
    const files = await fsPromises.readdir(printReadyDir);
    const match = files.find(f => f.includes(id) && f.endsWith('_printready.pdf'));
    if (match) filePath = path.join(printReadyDir, match);
  } catch {}

  // Fallback: try the job ID directly
  if (!filePath) {
    filePath = path.join(printReadyDir, pattern);
  }

  if (!filePath || !fs.existsSync(filePath)) {
    // Fallback: for 1-up all-pages, processPDF returns the original file path
    filePath = job.file.storagePath;
  }

  if (!filePath || !fs.existsSync(filePath)) {
    throw new AppError('Print file not ready yet', 404, 'FILE_NOT_READY');
  }

  res.sendFile(filePath);
}));

// Update print job status (agent reports result)
app.put('/api/agent/jobs/:id/status', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, message } = req.body;

  if (!['PROCESSING', 'COMPLETED', 'FAILED'].includes(status)) {
    throw new AppError('Invalid status', 400, 'INVALID_STATUS');
  }

  const job = await prisma.printJob.findUnique({ where: { id } });
  if (!job) throw new AppError('Print job not found', 404, 'NOT_FOUND');
  if (job.shopId !== req.user.shopId) throw new AppError('Access denied', 403, 'FORBIDDEN');

  await prisma.printJob.update({
    where: { id },
    data: { status },
  });

  // Check if all jobs for the order are done
  const orderJobs = await prisma.printJob.findMany({
    where: { orderId: job.orderId },
  });
  const allDone = orderJobs.every(j => j.status === 'COMPLETED' || j.status === 'FAILED');
  if (allDone) {
    await prisma.order.update({
      where: { id: job.orderId },
      data: { status: 'COMPLETED' },
    });
  }

  res.json({ success: true, message: `Job ${status.toLowerCase()}` });
}));

// ============================================
// CATCH ALL - SPA ROUTES (must be last)
// ============================================

if (fs.existsSync(FRONTEND_DIST)) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

// Error handler
app.use(errorHandler);

// Start server
const start = async () => {
  try {
    await prisma.$connect();
    console.log('Database connected successfully');

    const server = createServer(app);

    // WebSocket
    const wss = new WebSocket.Server({ server });
    wss.on('connection', (ws) => {
      console.log('WebSocket client connected');
      ws.on('close', () => console.log('WebSocket client disconnected'));
    });

    // Make wss available to routes
    app.set('wss', wss);

    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

start();

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = app;
