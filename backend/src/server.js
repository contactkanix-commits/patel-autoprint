const express = require('express');
const { createServer } = require('http');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');
const WebSocket = require('ws');
const Razorpay = require('razorpay');

require('dotenv').config();

const { AppError, errorHandler, asyncHandler } = require('./middleware/errorHandler');
const { authenticate, requireRole, requireSuperAdmin } = require('./middleware/auth');
const { analyzeFile, getFileType, isSupportedFileType } = require('./services/analyzer');
const { calculatePrice } = require('./services/pricing');
const { determineFlipDirection } = require('./services/duplex');
const { discoverPrinters, routeJob } = require('./services/printer');
const { processOrder, processPDF, parsePageRange, calculateSheetCount, countPagesFromRange, processAndDispatchOrder } = require('./services/printProcessor');

const ENCRYPTION_KEY = process.env.PAYMENT_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + encrypted.toString('hex') + ':' + tag.toString('hex');
}

function decrypt(encryptedText) {
  if (!encryptedText) return null;
  const parts = encryptedText.split(':');
  if (parts.length !== 3) return null;
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

function getRazorpayInstance(shop) {
  const config = shop?.settings?.paymentGatewayConfig?.razorpay;
  if (!config?.enabled || !config?.keyId || !config?.keySecret) return null;
  return new Razorpay({
    key_id: config.keyId,
    key_secret: decrypt(config.keySecret)
  });
}


// Helper: get next token for a shop
async function getNextToken(shopId) {
  const maxOrder = await prisma.order.findFirst({
    where: { shopId, token: { not: null } },
    orderBy: { token: 'desc' },
    select: { token: true },
  });
  return (maxOrder?.token || 0) + 1;
}

// Helper: load a shop's own pricing rates (fall back to defaults)
async function getShopPricingConfig(shopId) {
  const pricing = shopId ? await prisma.pricingRule.findFirst({ where: { shopId } }) : null;
  return {
    bwPerPage: pricing?.bwPerPage ?? 1,
    colorPerPage: pricing?.colorPerPage ?? 5,
    colorDuplexPerPage: pricing?.colorDuplexPerPage ?? 10,
  };
}

// Helper: generate a unique shop agent key (PAP-XXXX-XXXX-XXXX)
function generateAgentKey() {
  const hex = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `PAP-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

// Helper: assign agent keys to any shops created before this feature existed
async function ensureAgentKeys() {
  const shops = await prisma.shop.findMany({ where: { agentKey: null }, select: { id: true, name: true } });
  for (const s of shops) {
    await prisma.shop.update({ where: { id: s.id }, data: { agentKey: generateAgentKey() } });
  }
  if (shops.length > 0) {
    console.log(`Generated agent keys for ${shops.length} shop(s)`);
  }
}

// Helper: turn a shop name into a URL slug (lowercase, dashes for spaces/symbols)
function slugify(text) {
  return (text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Helper: assign unique slugs to shops that don't have one
async function ensureShopSlugs() {
  const shops = await prisma.shop.findMany({ where: { slug: null }, select: { id: true, name: true } });
  for (const s of shops) {
    let base = slugify(s.name) || 'shop';
    let slug = base;
    let n = 2;
    while (await prisma.shop.findUnique({ where: { slug } })) {
      slug = `${base}-${n++}`;
    }
    await prisma.shop.update({ where: { id: s.id }, data: { slug } });
  }
  if (shops.length > 0) {
    console.log(`Generated slugs for ${shops.length} shop(s)`);
  }
}

// Helper: resolve a shop by slug, id, or name
async function findShopByRef(ref) {
  if (!ref) return prisma.shop.findFirst();
  const bySlug = await prisma.shop.findUnique({ where: { slug: String(ref).toLowerCase() } });
  if (bySlug) return bySlug;
  const byId = await prisma.shop.findUnique({ where: { id: ref } });
  if (byId) return byId;
  return prisma.shop.findFirst({ where: { name: ref } });
}

// Helper: ensure every shop has a subscription record (defaults to free)
async function ensureSubscriptions() {
  const shops = await prisma.shop.findMany({ where: { subscription: null }, select: { id: true } });
  for (const s of shops) {
    await prisma.subscription.create({
      data: { shopId: s.id, plan: 'FREE', status: 'ACTIVE', price: 0, maxPrinters: 1 },
    });
  }
  if (shops.length > 0) {
    console.log(`Created default subscriptions for ${shops.length} shop(s)`);
  }
}

// Helper: derive a shop's subscription status.
// ACTIVE until 5 days before expiry, then EXPIRING (daysLeft counts down),
// then automatically EXPIRED after the expiry date passes.
async function getSubscriptionStatus(shopId) {
  const sub = await prisma.subscription.findUnique({ where: { shopId } });
  if (!sub) {
    return { active: true, status: 'ACTIVE', plan: 'FREE', price: 0, endDate: null, daysLeft: null, maxPrinters: 1 };
  }

  const end = sub.endDate ? new Date(sub.endDate) : null;
  const now = new Date();

  if (sub.status === 'SUSPENDED' || sub.status === 'CANCELLED') {
    return {
      active: false,
      status: sub.status,
      plan: sub.plan,
      price: sub.price,
      endDate: end ? end.toISOString() : null,
      daysLeft: 0,
      maxPrinters: sub.maxPrinters,
    };
  }

  if (end && end.getTime() < now.getTime()) {
    return {
      active: false,
      status: 'EXPIRED',
      plan: sub.plan,
      price: sub.price,
      endDate: end.toISOString(),
      daysLeft: 0,
      maxPrinters: sub.maxPrinters,
    };
  }

  let daysLeft = null;
  if (end) {
    const msLeft = end.getTime() - now.getTime();
    daysLeft = Math.max(1, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
  }

  return {
    active: true,
    status: 'ACTIVE',
    plan: sub.plan,
    price: sub.price,
    endDate: end ? end.toISOString() : null,
    daysLeft,
    maxPrinters: sub.maxPrinters,
  };
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

// Capture raw body for Razorpay webhook signature verification
// This middleware runs BEFORE express.json() to preserve raw body
app.use('/api/webhooks/razorpay/:shopId', (req, res, next) => {
  console.log('[Webhook Middleware] Called for:', req.method, req.path);
  if (req.method === 'POST') {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { 
      try { data += chunk; } catch (e) { console.error('[Webhook Middleware] Data error:', e.message); next(e); }
    });
    req.on('error', (err) => {
      console.error('[Webhook Middleware] Request error:', err.message);
      next(err);
    });
    req.on('end', () => {
      try {
        req.rawBody = data;
        console.log('[Webhook Middleware] Body captured, length:', data.length);
        next();
      } catch (err) {
        console.error('[Webhook Middleware] End error:', err.message);
        next(err);
      }
    });
  } else {
    next();
  }
});

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Simple test endpoint to verify routing works
app.post('/api/test-webhook-debug', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Debug route works', 
    rawBody: req.rawBody,
    body: req.body,
    path: req.path,
    method: req.method
  });
});

// Razorpay Webhook (per shop) - uses req.rawBody captured by middleware
app.post('/api/webhooks/razorpay/:shopId', async (req, res) => {
  try {
    const { shopId } = req.params;
    const signature = req.headers['x-razorpay-signature'];
    console.log('[Webhook] Received for shop:', shopId, 'hasSignature:', !!signature, 'rawBodyLength:', req.rawBody?.length || 0, 'rawBodyPreview:', req.rawBody?.substring(0, 100) || 'empty');
    
    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) {
      console.log('[Webhook] Shop not found:', shopId);
      return res.status(404).send('Shop not found');
    }
    console.log('[Webhook] Shop found:', shop.name);
    
    const razorpayConfig = shop.settings?.paymentGatewayConfig?.razorpay;
    if (!razorpayConfig?.enabled || !razorpayConfig?.webhookSecret) {
      console.log('[Webhook] Webhook not configured for shop:', shopId);
      return res.status(400).send('Webhook not configured');
    }
    console.log('[Webhook] Razorpay config found, hasWebhookSecret:', !!razorpayConfig.webhookSecret);
    
    const webhookSecret = decrypt(razorpayConfig.webhookSecret);
    console.log('[Webhook] Decrypted webhook secret, length:', webhookSecret?.length || 0);
    
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(req.rawBody || '')
      .digest('hex');
    
    if (signature !== expectedSignature) {
      console.error('[Razorpay Webhook] Invalid signature for shop', shopId, 'expected:', expectedSignature, 'got:', signature);
      return res.status(400).send('Invalid signature');
    }
    
    let event;
    try {
      event = JSON.parse(req.rawBody || '{}');
    } catch (e) {
      console.log('[Webhook] JSON parse error:', e.message);
      return res.status(400).send('Invalid JSON');
    }
    
    console.log('[Razorpay Webhook] Event:', event.event, 'for shop', shopId);
    
    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity;
      const orderId = payment.notes?.orderId;
      const razorpayOrderId = payment.order_id;
      
      if (orderId) {
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (order && order.status === 'PENDING' && order.paymentStatus === 'UNPAID') {
          await completeOrderWithPayment(orderId, payment.id, razorpayOrderId);
          console.log('[Razorpay Webhook] Order completed:', orderId);
        }
      }
    } else if (event.event === 'payment.failed') {
      const payment = event.payload.payment.entity;
      const orderId = payment.notes?.orderId;
      if (orderId) {
        await prisma.order.update({
          where: { id: orderId },
          data: { paymentStatus: 'FAILED', paymentFailureReason: payment.error_description || 'Payment failed' }
        });
        console.log('[Razorpay Webhook] Payment failed for order:', orderId);
      }
    }
    
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[Webhook] Error:', err.message, err.stack);
return res.status(500).json({ success: false, message: 'Webhook error: ' + err.message });
  }
});

// Static files
const FRONTEND_DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
}
app.use('/uploads', express.static(UPLOAD_DIR));

// Super admin panel (vendor)
const SUPERADMIN_DIST = path.join(__dirname, '..', '..', 'superadmin', 'dist');
if (fs.existsSync(SUPERADMIN_DIST)) {
  app.use('/superadmin', express.static(SUPERADMIN_DIST));
}

// Desktop app auto-update files (latest.yml + installer + blockmap)
const UPDATES_DIR = path.join(__dirname, '..', 'updates');
if (fs.existsSync(UPDATES_DIR)) {
  app.use('/updates', express.static(UPDATES_DIR));
}

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
    data: { name: shopName, agentKey: generateAgentKey() },
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
  const subscription = user.shopId ? await getSubscriptionStatus(user.shopId) : null;

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
      subscription,
    },
  });
}));

app.get('/api/auth/profile', authenticate, asyncHandler(async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { id: req.user.shopId } });
  const subscription = req.user.shopId ? await getSubscriptionStatus(req.user.shopId) : null;

  res.json({
    success: true,
    data: {
      ...req.user,
      shopName: shop ? shop.name : null,
      subscription,
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
  }, await getShopPricingConfig(shopId));

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
  const pricing = calculatePrice(totalPages, totalColorPages, fileSettings, await getShopPricingConfig(order.shopId));

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
  }, await getShopPricingConfig(order.shopId));

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

  // Resolve the target shop from the portal link (/s/:slug) or fall back to the default shop
  const shop = await findShopByRef(req.body.shopId || req.body.shopRef || req.query.shop);
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
  const pricing = calculatePrice(totalPages, totalColorPages, avgSettings, await getShopPricingConfig(order.shopId));

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

  const pricingConfig = await getShopPricingConfig(order.shopId);
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
    }, pricingConfig);
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
        const price = calculatePrice(secPages, secColorPages, secSettings, pricingConfig);
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
      const price = calculatePrice(actualPages, actualColorPages, s, pricingConfig);
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

// Initiate Razorpay payment (UPI Intent flow)
app.post('/api/guest/orders/:id/payment/initiate', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { method } = req.body; // 'razorpay' for UPI intent
  
  if (method !== 'razorpay') {
    throw new AppError('Unsupported payment method', 400, 'UNSUPPORTED_METHOD');
  }
  
  const order = await prisma.order.findUnique({
    where: { id },
    include: { files: true }
  });
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  if (order.status !== 'PENDING') {
    throw new AppError('Order already processed', 400, 'ORDER_NOT_PENDING');
  }
  
  const shop = await prisma.shop.findUnique({ where: { id: order.shopId } });
  if (!shop) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');
  
  const razorpayConfig = shop.settings?.paymentGatewayConfig?.razorpay;
  if (!razorpayConfig?.enabled || !razorpayConfig?.keyId || !razorpayConfig?.keySecret) {
    throw new AppError('Razorpay not configured for this shop', 400, 'GATEWAY_NOT_CONFIGURED');
  }
  
  const razorpay = new Razorpay({
    key_id: razorpayConfig.keyId,
    key_secret: decrypt(razorpayConfig.keySecret)
  });
  
  const rpOrder = await razorpay.orders.create({
    amount: Math.round(order.totalPrice * 100), // paise
    currency: 'INR',
    receipt: `order_${order.token}`,
    notes: { 
      shopId: shop.id, 
      orderId: order.id,
      customerPhone: order.customer?.phone || ''
    }
  });
  
  // Update order with Razorpay order ID
  await prisma.order.update({
    where: { id },
    data: { 
      paymentMethod: 'razorpay',
      razorpayOrderId: rpOrder.id
    }
  });
  
  res.json({
    success: true,
    data: {
      orderId: rpOrder.id,
      amount: rpOrder.amount,
      currency: rpOrder.currency,
      keyId: razorpayConfig.keyId,
      shopName: shop.name,
      orderToken: order.token,
      upiIntent: true
    }
  });
}));

app.post('/api/guest/orders/:id/confirm', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { paymentMethod } = req.body;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { files: true, printJobs: true, customer: true },
  });
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  
  // Idempotency: if already confirmed, return existing order (handles double-click)
  if (order.status !== 'PENDING') {
    return res.json({ success: true, data: order, message: 'Order already confirmed' });
  }

  const shop = await prisma.shop.findUnique({ where: { id: order.shopId } });
  const shopSettings = shop?.settings || {};
  
  // Respect the shop's accepted payment methods (empty/missing = accept all)
  const accepted = shopSettings.acceptedPaymentMethods || ALL_PAYMENT_METHODS;
  const method = paymentMethod || 'cash';
  if (!accepted.includes(method)) {
    throw new AppError('This shop does not accept this payment method', 400, 'PAYMENT_METHOD_NOT_ACCEPTED');
  }

  const printers = await prisma.printer.findMany({ where: { shopId: order.shopId } });

  // Check auto-print mode
  const printMode = shopSettings.printMode || 'admin_approval';
  const autoPrintPrinterId = shopSettings.autoPrintPrinterId || null;

  // Create print jobs - need printer NAME not ID for pdf-to-printer
  let targetPrinterName = null;
  let shouldAutoPrint = false;
  
  if (printMode === 'auto_print') {
    const targetPrinter = autoPrintPrinterId
      ? printers.find(p => p.id === autoPrintPrinterId)
      : null;
    // Fallback to first online printer
    targetPrinterName = targetPrinter?.name || printers.find(p => p.status === 'ONLINE')?.name || printers[0]?.name || null;
    
    // Only auto-print for cash payments; online payments wait for payment confirmation
    shouldAutoPrint = targetPrinterName && method === 'cash';
  }

  for (const file of order.files) {
    const created = await createPrintJobsForFile(file, order.id, order.shopId, printers, targetPrinterName, targetPrinterName);
  }

  const initialStatus = shouldAutoPrint ? 'APPROVED' : 'PENDING';
  const initialApprovedAt = shouldAutoPrint ? new Date() : null;
  const initialPaymentStatus = shouldAutoPrint ? 'PAID' : 'UNPAID';

  await prisma.order.update({
    where: { id },
    data: {
      status: initialStatus,
      paymentStatus: initialPaymentStatus,
      paymentMethod: method,
      approvedAt: initialApprovedAt,
    },
  });

  // If auto-print (cash only), dispatch to printer
  if (shouldAutoPrint) {
    const { processAndDispatchOrder } = require('./services/printProcessor');
    await processAndDispatchOrder(order.id, prisma);
  }

  const updatedOrder = await prisma.order.findUnique({
    where: { id },
    include: { files: true, printJobs: true, customer: true },
  });

  res.json({ success: true, data: updatedOrder });
}));

// ============================================
// WHATSAPP FILE RECEIVING (shop's own number)
// ============================================
// The desktop app pairs to the shop's own WhatsApp number (Baileys
// multi-device). It uploads files customers send to that number to
// /api/agent/whatsapp/inbox and auto-replies with the link returned here.
// Claim a WhatsApp job from the portal (?wa=<token>): creates the order
// and reuses the same analyze pipeline as a normal portal upload.
app.post('/api/guest/whatsapp/:token/claim', asyncHandler(async (req, res) => {
  const session = await prisma.whatsAppSession.findUnique({ where: { token: req.params.token } });
  if (!session) throw new AppError('WhatsApp job not found', 404, 'WA_SESSION_NOT_FOUND');
  if (session.status !== 'NEW') {
    throw new AppError('This WhatsApp job has already been used. Please send your files again.', 409, 'WA_SESSION_USED');
  }
  if (session.expiresAt < new Date()) {
    await prisma.whatsAppSession.update({ where: { id: session.id }, data: { status: 'EXPIRED' } });
    throw new AppError('This WhatsApp job has expired. Please send your files again.', 410, 'WA_SESSION_EXPIRED');
  }

  const sessionFiles = session.files || [];
  if (sessionFiles.length === 0) {
    throw new AppError('No files found in this WhatsApp job', 400, 'WA_NO_FILES');
  }

  const shop = await prisma.shop.findUnique({ where: { id: session.shopId } });
  const shopSettings = shop?.settings || {};
  const printMode = shopSettings.printMode || 'admin_approval';
  const autoPrintPrinterId = shopSettings.autoPrintPrinterId || null;

  const shopId = session.shopId;
  let customer = await prisma.customer.findFirst({
    where: { shopId, phone: session.customerPhone },
  });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        shopId,
        name: session.customerName || 'WhatsApp Customer',
        phone: session.customerPhone,
      },
    });
  }

  const token = await getNextToken(shopId);
  // WhatsApp orders always PENDING - customer pays on portal
  const initialStatus = 'PENDING';
  const order = await prisma.order.create({
    data: {
      shopId,
      token,
      customerId: customer.id,
      notes: 'Received via WhatsApp',
      status: initialStatus,
    },
  });

  let created = 0;

  for (const file of sessionFiles) {
    if (!fs.existsSync(file.storagePath)) continue;
    const fileType = getFileType(file.originalName);
    const analysis = await analyzeFile(file.storagePath, fileType);

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

    await prisma.orderFile.create({
      data: {
        orderId: order.id,
        originalName: file.originalName,
        storagePath: file.storagePath,
        fileType,
        size: file.size,
        pageCount: analysis.pageCount,
        colorPageCount: analysis.colorPageCount,
        orientation: analysis.orientation || 'portrait',
        settings: defaultSettings,
        shopId,
      },
    });
    created++;
  }

  if (created === 0) {
    throw new AppError('Could not read the received files. Please send them again.', 400, 'WA_FILES_MISSING');
  }

  await prisma.whatsAppSession.update({
    where: { id: session.id },
    data: { status: 'CLAIMED', claimedAt: new Date() },
  });

  // WhatsApp orders don't auto-print - customer pays on portal

  const orderWithFiles = await prisma.order.findUnique({
    where: { id: order.id },
    include: { files: true, customer: true },
  });

  res.json({
    success: true,
    data: {
      order: orderWithFiles,
      customerPhone: session.customerPhone,
      customerName: session.customerName,
    },
  });
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
      defaultBwPrinter: settings.defaultBwPrinter || '',
      defaultColorPrinter: settings.defaultColorPrinter || '',
      acceptedPaymentMethods: settings.acceptedPaymentMethods || ALL_PAYMENT_METHODS,
      printMode: settings.printMode || 'admin_approval',
      autoPrintPrinterId: settings.autoPrintPrinterId || '',
    },
  });
}));

app.put('/api/settings/pricing', authenticate, asyncHandler(async (req, res) => {
  const shopId = req.user.shopId;
  const { bwPerPage, colorPerPage, colorDuplexPerPage, upiQrUrl, defaultBwPrinter, defaultColorPrinter, printMode, autoPrintPrinterId } = req.body;

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

  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  const currentSettings = shop?.settings || {};
  await prisma.shop.update({
    where: { id: shopId },
    data: { 
      settings: { 
        ...currentSettings, 
        upiQrUrl, 
        defaultBwPrinter, 
        defaultColorPrinter,
        printMode: printMode || currentSettings.printMode || 'admin_approval',
        autoPrintPrinterId: autoPrintPrinterId || currentSettings.autoPrintPrinterId || '',
      } 
    },
  });

  res.json({ success: true, data: { message: 'Settings saved' } });
}));

const ALL_PAYMENT_METHODS = ['cash', 'card', 'upi', 'online'];

app.put('/api/settings/payment-methods', authenticate, asyncHandler(async (req, res) => {
  const shopId = req.user.shopId;
  const { acceptedPaymentMethods } = req.body;

  let methods = Array.isArray(acceptedPaymentMethods) ? acceptedPaymentMethods : [];
  methods = methods.filter((m) => ALL_PAYMENT_METHODS.includes(m));
  if (methods.length === 0) {
    methods = ALL_PAYMENT_METHODS; // empty = accept everything
  }

  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  await prisma.shop.update({
    where: { id: shopId },
    data: { settings: { ...(shop?.settings || {}), acceptedPaymentMethods: methods } },
  });

  res.json({ success: true, data: { acceptedPaymentMethods: methods } });
}));

app.get('/api/settings/public/upi-qr', asyncHandler(async (req, res) => {
  const shop = await findShopByRef(req.query.shop);
  const url = (shop?.settings || {}).upiQrUrl || '';
  res.json({ success: true, data: { url } });
}));

app.get('/api/settings/public/pricing', asyncHandler(async (req, res) => {
  const shop = await findShopByRef(req.query.shop);
  const pricing = shop ? await prisma.pricingRule.findFirst({ where: { shopId: shop.id } }) : null;
  res.json({
    success: true,
    data: {
      bwPerPage: pricing?.bwPerPage ?? 1,
      colorPerPage: pricing?.colorPerPage ?? 5,
      colorDuplexPerPage: pricing?.colorDuplexPerPage ?? 10,
    },
  });
}));

// Payment Gateway Configuration (per shop)
app.get('/api/settings/payment-gateways', authenticate, asyncHandler(async (req, res) => {
  const shopId = req.user.shopId;
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  const config = shop?.settings?.paymentGatewayConfig || {};
  
  // Return full config for admin (including actual keyId for form)
  // Frontend will mask for display if needed
  const masked = {};
  for (const [gateway, cfg] of Object.entries(config)) {
    masked[gateway] = {
      enabled: cfg.enabled,
      mode: cfg.mode,
      keyId: cfg.keyId || '',  // Return actual keyId for form
      hasSecret: !!cfg.keySecret,
      hasWebhookSecret: !!cfg.webhookSecret,
      webhookUrl: cfg.webhookUrl || `${process.env.PUBLIC_URL || 'https://patel-autoprint.onrender.com'}/api/webhooks/${gateway}/${shopId}`
    };
  }
  res.json({ success: true, data: masked });
}));

app.put('/api/settings/payment-gateways/:gateway', authenticate, asyncHandler(async (req, res) => {
  const shopId = req.user.shopId;
  const { gateway } = req.params;
  const { enabled, mode, keyId, keySecret, webhookSecret } = req.body;
  
  const allowedGateways = ['razorpay'];
  if (!allowedGateways.includes(gateway)) {
    throw new AppError('Unsupported gateway', 400, 'UNSUPPORTED_GATEWAY');
  }
  
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  const currentConfig = shop?.settings?.paymentGatewayConfig || {};
  
  const updatedGateway = {
    enabled: !!enabled,
    mode: mode || 'test',
    keyId: keyId || currentConfig[gateway]?.keyId || '',
    keySecret: keySecret ? encrypt(keySecret) : currentConfig[gateway]?.keySecret || '',
    webhookSecret: webhookSecret ? encrypt(webhookSecret) : currentConfig[gateway]?.webhookSecret || '',
    webhookUrl: `${process.env.PUBLIC_URL || 'https://patel-autoprint.onrender.com'}/api/webhooks/${gateway}/${shopId}`
  };
  
  await prisma.shop.update({
    where: { id: shopId },
    data: { settings: { ...(shop?.settings || {}), paymentGatewayConfig: { ...currentConfig, [gateway]: updatedGateway } } },
  });
  
  res.json({ success: true, data: { message: 'Gateway config saved' } });
}));

app.post('/api/settings/payment-gateways/:gateway/test', authenticate, asyncHandler(async (req, res) => {
  const shopId = req.user.shopId;
  const { gateway } = req.params;
  const { keyId, keySecret } = req.body;
  
  if (gateway !== 'razorpay') {
    throw new AppError('Unsupported gateway', 400, 'UNSUPPORTED_GATEWAY');
  }
  
  try {
    const testRazorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    await testRazorpay.orders.create({ amount: 100, currency: 'INR', receipt: 'test_connection' });
    res.json({ success: true, data: { message: 'Connection successful' } });
  } catch (err) {
    throw new AppError('Invalid credentials: ' + err.message, 400, 'INVALID_CREDENTIALS');
  }
}));

// Public payment config for customer portal
app.get('/api/guest/shop/:ref/payment-config', asyncHandler(async (req, res) => {
  const shop = await findShopByRef(req.params.ref);
  if (!shop) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');
  
  const config = shop.settings?.paymentGatewayConfig || {};
  const razorpay = config.razorpay;
  
  if (!razorpay?.enabled) {
    return res.json({ success: true, data: { razorpay: null } });
  }
  
  res.json({
    success: true,
    data: {
      razorpay: {
        keyId: razorpay.keyId,
        mode: razorpay.mode
      }
    }
  });
}));

// Public info for a shop's customer portal (/s/:slug)
app.get('/api/guest/shop/:ref', asyncHandler(async (req, res) => {
  const shop = await findShopByRef(req.params.ref);
  if (!shop) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');
  res.json({
    success: true,
    data: {
      id: shop.id,
      name: shop.name,
      slug: shop.slug,
      settings: shop.settings || {},
    },
  });
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

async function completeOrderWithPayment(orderId, paymentId, razorpayOrderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { files: true, shop: true }
  });
  if (!order) return;
  
  const shopSettings = order.shop?.settings || {};
  const printMode = shopSettings.printMode || 'admin_approval';
  const autoPrintPrinterId = shopSettings.autoPrintPrinterId || null;
  
  const printers = await prisma.printer.findMany({ where: { shopId: order.shopId } });
  
  let targetPrinterName = null;
  let shouldAutoPrint = false;
  
  if (printMode === 'auto_print') {
    const targetPrinter = autoPrintPrinterId
      ? printers.find(p => p.id === autoPrintPrinterId)
      : null;
    targetPrinterName = targetPrinter?.name || printers.find(p => p.status === 'ONLINE')?.name || printers[0]?.name || null;
    shouldAutoPrint = !!targetPrinterName;
  }
  
  for (const file of order.files) {
    await createPrintJobsForFile(file, order.id, order.shopId, printers, targetPrinterName, targetPrinterName);
  }
  
  const initialStatus = shouldAutoPrint ? 'APPROVED' : 'PENDING';
  const initialApprovedAt = shouldAutoPrint ? new Date() : null;
  
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: initialStatus,
      paymentStatus: 'PAID',
      paymentMethod: 'razorpay',
      razorpayPaymentId: paymentId,
      razorpayOrderId: razorpayOrderId,
      approvedAt: initialApprovedAt,
    },
  });
  
  if (shouldAutoPrint) {
    const { processAndDispatchOrder } = require('./services/printProcessor');
    await processAndDispatchOrder(orderId, prisma);
  }
}

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

// Middleware: block shops whose subscription has expired/suspended
const requireActiveSubscription = asyncHandler(async (req, res, next) => {
  if (!req.user.shopId) throw new AppError('Not a shop user', 403, 'FORBIDDEN');
  const sub = await getSubscriptionStatus(req.user.shopId);
  if (!sub.active) {
    throw new AppError(
      'This shop\'s subscription has expired. Contact Patel AutoPrint to renew.',
      403,
      'SUBSCRIPTION_SUSPENDED'
    );
  }
  req.subscription = sub;
  next();
});

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

// Activate a shop with a one-time agent key. Returns a long-lived token so the
// desktop app only needs the key entered once during setup.
app.post('/api/agent/key-login', asyncHandler(async (req, res) => {
  const { agentKey } = req.body;
  if (!agentKey) throw new AppError('Agent key is required', 400, 'MISSING_AGENT_KEY');

  const shop = await prisma.shop.findFirst({
    where: { agentKey: String(agentKey).trim().toUpperCase() },
  });
  if (!shop) throw new AppError('Invalid agent key', 401, 'INVALID_AGENT_KEY');

  const subscription = await getSubscriptionStatus(shop.id);
  if (!subscription.active) {
    throw new AppError(
      'This shop\'s subscription has expired. Contact Patel AutoPrint to renew.',
      403,
      'SUBSCRIPTION_SUSPENDED'
    );
  }

  let user = await prisma.user.findFirst({ where: { shopId: shop.id, role: 'OWNER' } });
  if (!user) user = await prisma.user.findFirst({ where: { shopId: shop.id } });
  if (!user) throw new AppError('No account found for this shop', 404, 'NO_USER');

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '365d' });

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
      subscription,
    },
  });
}));

// Receive files a customer sent to the shop's WhatsApp number. The desktop app
// is paired to that number, downloads the media and uploads it here; we reply
// with the portal link that pre-loads these files for print options + payment.
app.post('/api/agent/whatsapp/inbox', authenticate, requireActiveSubscription, upload.array('files', 20), asyncHandler(async (req, res) => {
  const shopId = req.user.shopId;
  const customerPhone = String(req.body.customerPhone || '').replace(/\D/g, '');
  if (!customerPhone) throw new AppError('customerPhone is required', 400, 'WA_NO_PHONE');
  if (!req.files || req.files.length === 0) throw new AppError('No files received', 400, 'WA_NO_FILES');

  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new AppError('Shop not found', 404, 'NOT_FOUND');

  let session = await prisma.whatsAppSession.findFirst({
    where: { shopId, customerPhone, status: 'NEW' },
    orderBy: { createdAt: 'desc' },
  });

  if (!session) {
    session = await prisma.whatsAppSession.create({
      data: {
        token: crypto.randomBytes(16).toString('hex'),
        shopId,
        customerPhone,
        customerName: req.body.customerName || null,
        files: [],
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  const currentFiles = session.files || [];
  const updatedFiles = [...currentFiles];
  for (const file of req.files) {
    const originalName = file.originalname;
    if (!isSupportedFileType(originalName)) continue;
    updatedFiles.push({
      messageId: `wa_${Date.now()}_${file.filename}`,
      originalName,
      storagePath: file.path,
      fileType: getFileType(originalName),
      size: file.size,
    });
  }

  if (updatedFiles.length === currentFiles.length) {
    throw new AppError('No supported files in that upload', 400, 'WA_UNSUPPORTED');
  }

  await prisma.whatsAppSession.update({
    where: { id: session.id },
    data: { files: updatedFiles, customerName: req.body.customerName || session.customerName },
  });

  const link = `${process.env.PUBLIC_URL || 'https://patel-autoprint.onrender.com'}/s/${shop.slug}?wa=${session.token}`;

  res.json({
    success: true,
    data: {
      sessionId: session.id,
      token: session.token,
      link,
      fileCount: updatedFiles.length,
      customerPhone,
    },
  });
}));

// Get pending print jobs for this shop
app.get('/api/agent/jobs', authenticate, requireActiveSubscription, asyncHandler(async (req, res) => {
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

  res.json({ success: true, data: jobs, subscription: req.subscription });
}));

// Get print-ready file for a job
app.get('/api/agent/jobs/:id/file', authenticate, requireActiveSubscription, asyncHandler(async (req, res) => {
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
app.put('/api/agent/jobs/:id/status', authenticate, requireActiveSubscription, asyncHandler(async (req, res) => {
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
// SUPER ADMIN ROUTES (vendor / tool owner)
// ============================================

// Overall stats for the super admin dashboard
app.get('/api/superadmin/stats', authenticate, requireSuperAdmin, asyncHandler(async (req, res) => {
  const [shops, orders, printers, printJobs] = await Promise.all([
    prisma.shop.count(),
    prisma.order.count(),
    prisma.printer.count(),
    prisma.printJob.count(),
  ]);

  const shopRows = await prisma.shop.findMany({
    select: { id: true, subscription: { select: { status: true, endDate: true } } },
  });

  const statuses = await Promise.all(
    shopRows.map(async (s) => (await getSubscriptionStatus(s.id)).status)
  );

  const counts = { ACTIVE: 0, EXPIRING: 0, EXPIRED: 0, SUSPENDED: 0, CANCELLED: 0 };
  statuses.forEach((st) => {
    if (st === 'ACTIVE') counts.ACTIVE++;
    else if (st === 'SUSPENDED') counts.SUSPENDED++;
    else if (st === 'CANCELLED') counts.CANCELLED++;
    else counts.EXPIRED++;
  });

  res.json({
    success: true,
    data: {
      shops,
      orders,
      printers,
      printJobs,
      subscriptions: counts,
    },
  });
}));

// List all shops with subscription + counts
app.get('/api/superadmin/shops', authenticate, requireSuperAdmin, asyncHandler(async (req, res) => {
  const q = (req.query.q || '').toString().trim().toLowerCase();

  const shops = await prisma.shop.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      subscription: true,
      _count: {
        select: { orders: true, printers: true, users: true },
      },
    },
  });

  const enriched = await Promise.all(
    shops.map(async (s) => {
      const sub = await getSubscriptionStatus(s.id);
      if (q && !s.name.toLowerCase().includes(q) && !(s.agentKey || '').toLowerCase().includes(q)) {
        return null;
      }
      return {
        ...s,
        subStatus: sub,
        customerPortalUrl: (process.env.PUBLIC_URL || 'https://patel-autoprint.onrender.com') + '/s/' + s.slug,
      };
    })
  );

  res.json({ success: true, data: enriched.filter(Boolean) });
}));

// Shop detail with activity stats
app.get('/api/superadmin/shops/:id', authenticate, requireSuperAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const shop = await prisma.shop.findUnique({
    where: { id },
    include: {
      subscription: true,
      _count: {
        select: {
          orders: true,
          printers: true,
          users: true,
          customers: true,
          printJobs: true,
        },
      },
    },
  });

  if (!shop) throw new AppError('Shop not found', 404, 'NOT_FOUND');

  const [lastOrder, completedOrders, recentJobs] = await Promise.all([
    prisma.order.findFirst({ where: { shopId: id }, orderBy: { createdAt: 'desc' } }),
    prisma.order.count({ where: { shopId: id, status: 'COMPLETED' } }),
    prisma.printJob.findMany({
      where: { shopId: id },
      orderBy: { id: 'desc' },
      take: 5,
      select: { id: true, status: true, paperSize: true, colorMode: true },
    }),
  ]);

  res.json({
    success: true,
    data: {
      ...shop,
      subStatus: await getSubscriptionStatus(id),
      lastOrder,
      completedOrders,
      recentJobs,
    },
  });
}));

// Create a shop (shop + owner + subscription + agent key)
app.post('/api/superadmin/shops', authenticate, requireSuperAdmin, asyncHandler(async (req, res) => {
  const {
    name,
    adminName,
    adminEmail,
    adminPassword,
    plan,
    price,
    endDate,
    maxPrinters,
  } = req.body;

  if (!name || !adminEmail || !adminPassword) {
    throw new AppError('Shop name, admin email and password are required', 400, 'MISSING_FIELDS');
  }

  const existing = await prisma.user.findFirst({ where: { email: adminEmail } });
  if (existing) {
    throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
  }

  let slug = req.body.slug ? slugify(req.body.slug) : slugify(name);
  if (!slug) slug = 'shop';
  const baseSlug = slug;
  let n = 2;
  while (await prisma.shop.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${n++}`;
  }

  // Default shop settings
  const defaultSettings = {
    acceptedPaymentMethods: ['cash'],
    printMode: 'admin_approval',
    autoPrintPrinterId: '',
    defaultBwPrinter: '',
    defaultColorPrinter: '',
    upiQrUrl: '',
  };

  const shop = await prisma.shop.create({
    data: { name, slug, agentKey: generateAgentKey(), settings: defaultSettings },
  });

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const user = await prisma.user.create({
    data: {
      shopId: shop.id,
      email: adminEmail,
      passwordHash,
      name: adminName || 'Shop Owner',
      role: 'OWNER',
    },
  });

  const subscription = await prisma.subscription.create({
    data: {
      shopId: shop.id,
      plan: plan || 'FREE',
      status: 'ACTIVE',
      price: price || 0,
      endDate: endDate ? new Date(endDate) : null,
      maxPrinters: maxPrinters || 1,
    },
  });

res.json({
    success: true,
    data: {
      id: shop.id,
      name: shop.name,
      slug: shop.slug,
      agentKey: shop.agentKey,
      customerPortalUrl: (process.env.PUBLIC_URL || 'https://patel-autoprint.onrender.com') + '/s/' + shop.slug,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      subscription,
    },
  });
}));

// Update a shop (name + subscription)
app.put('/api/superadmin/shops/:id', authenticate, requireSuperAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, plan, status, price, endDate, maxPrinters } = req.body;

  const shop = await prisma.shop.findUnique({ where: { id } });
  if (!shop) throw new AppError('Shop not found', 404, 'NOT_FOUND');

  let slug;
  if (req.body.slug) {
    slug = slugify(req.body.slug);
    const clash = await prisma.shop.findFirst({ where: { slug, id: { not: id } } });
    if (clash) throw new AppError('Slug already in use', 409, 'SLUG_EXISTS');
  } else if (name && name !== shop.name) {
    slug = slugify(name);
  }

  const updatedShop = await prisma.shop.update({
    where: { id },
    data: {
      name: name || shop.name,
      ...(slug ? { slug } : {}),
    },
  });

  const subData = {};
  if (plan !== undefined) subData.plan = plan;
  if (status !== undefined) subData.status = status;
  if (price !== undefined) subData.price = price;
  if (maxPrinters !== undefined) subData.maxPrinters = maxPrinters;
  if (endDate !== undefined) subData.endDate = endDate ? new Date(endDate) : null;

  let subscription = await prisma.subscription.findUnique({ where: { shopId: id } });
  if (subscription) {
    subscription = await prisma.subscription.update({
      where: { shopId: id },
      data: subData,
    });
  } else {
    subscription = await prisma.subscription.create({
      data: { shopId: id, ...subData },
    });
  }

  res.json({ success: true, data: { shop: updatedShop, subscription } });
}));

// Delete a shop (cascades to users, orders, printers, etc.)
app.delete('/api/superadmin/shops/:id', authenticate, requireSuperAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const shop = await prisma.shop.findUnique({ where: { id } });
  if (!shop) throw new AppError('Shop not found', 404, 'NOT_FOUND');

  await prisma.shop.delete({ where: { id } });
  res.json({ success: true, data: { id } });
}));

// Generate a new agent key for a shop (old key stops working)
app.post('/api/superadmin/shops/:id/regenerate-key', authenticate, requireSuperAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const shop = await prisma.shop.update({
    where: { id },
    data: { agentKey: generateAgentKey() },
  });

  res.json({ success: true, data: { agentKey: shop.agentKey } });
}));

// Change super admin password
app.post('/api/superadmin/change-password', authenticate, requireSuperAdmin, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    throw new AppError('New password must be at least 6 characters', 400, 'WEAK_PASSWORD');
  }

  const admin = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!admin) throw new AppError('Account not found', 404, 'NOT_FOUND');

  if (currentPassword) {
    const valid = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!valid) throw new AppError('Current password is incorrect', 401, 'INVALID_PASSWORD');
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: admin.id }, data: { passwordHash } });

  res.json({ success: true, message: 'Password updated' });
}));

// ============================================
// CATCH ALL - SPA ROUTES (must be last)
// ============================================

if (fs.existsSync(SUPERADMIN_DIST)) {
  app.get('/superadmin/*', (req, res) => {
    res.sendFile(path.join(SUPERADMIN_DIST, 'index.html'));
  });
}

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

    await ensureAgentKeys();
    await ensureShopSlugs();
    await ensureSubscriptions();

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




