const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

let print;
try {
  print = require('pdf-to-printer');
} catch (e) {
  console.warn('pdf-to-printer not available, print dispatch will be simulated');
  print = null;
}

function isImageFile(file) {
  const t = (file.fileType || '').toLowerCase();
  return ['jpg', 'jpeg', 'png', 'webp'].includes(t);
}

const { spawn } = require('child_process');
const officeExts = ['.docx', '.pptx', '.xlsx', '.doc', '.ppt', '.xls'];

const converterScript = path.join(__dirname, 'convert-office-to-pdf.ps1');

// Convert office file (docx/pptx/xlsx) to PDF using Microsoft Office COM automation via PowerShell
async function convertOfficeToPdf(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!officeExts.includes(ext)) return filePath;

  const dir = path.dirname(filePath);
  const base = path.basename(filePath, ext);
  const tempDir = path.join(dir, 'print-ready');
  await fsPromises.mkdir(tempDir, { recursive: true });
  const outPdf = path.join(tempDir, `${base}.pdf`);

  // If already converted, return cached
  try {
    await fsPromises.access(outPdf);
    console.log(`Using cached PDF conversion: ${outPdf}`);
    return outPdf;
  } catch {}

  console.log(`[convertOfficeToPdf] Converting ${filePath} to PDF via Office COM automation...`);
  return new Promise((resolve, reject) => {
    const args = [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', converterScript,
      '-inputFile', filePath,
      '-outputPdf', outPdf
    ];
    const child = spawn('powershell.exe', args, { timeout: 180000, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      console.log(`[convertOfficeToPdf] PowerShell exit code: ${code}, stdout: ${stdout.trim()}, stderr: ${stderr.trim()}`);
      if (code === 0 && stdout.trim().startsWith('OK:')) {
        console.log(`[convertOfficeToPdf] Converted to PDF: ${outPdf}`);
        resolve(outPdf);
      } else {
        console.error('[convertOfficeToPdf] Conversion failed:', stderr || stdout);
        reject(new Error(`Office-to-PDF conversion failed: ${stderr || stdout}`));
      }
    });
    child.on('error', (err) => {
      console.error('[convertOfficeToPdf] Process error:', err);
      reject(err);
    });
  });
}

function imageGrid(nUp) {
  switch (nUp) {
    case 2: return { cols: 2, rows: 1 };
    case 4: return { cols: 2, rows: 2 };
    case 6: return { cols: 3, rows: 2 };
    case 8: return { cols: 4, rows: 2 };
    case 9: return { cols: 3, rows: 3 };
    case 16: return { cols: 4, rows: 4 };
    default: return { cols: 1, rows: 1 };
  }
}

async function embedImage(doc, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const data = await fsPromises.readFile(filePath);
  if (ext === '.jpg' || ext === '.jpeg') return doc.embedJpg(data);
  if (ext === '.png') return doc.embedPng(data);
  if (ext === '.webp') {
    const sharp = require('sharp');
    const png = await sharp(data).png().toBuffer();
    return doc.embedPng(png);
  }
  throw new Error(`Unsupported image type: ${ext}`);
}

// Combines multiple image files into a single PDF with `nUp` pictures per page
async function createContactSheet(imageFiles, nUp, paperSize, jobId) {
  const n = nUp || 1;
  const { cols, rows } = imageGrid(n);
  const dims = paperDims(paperSize);
  const newDoc = await PDFDocument.create();

  for (let i = 0; i < imageFiles.length; i += n) {
    const chunk = imageFiles.slice(i, i + n);
    const page = newDoc.addPage([dims.w, dims.h]);
    const cellW = dims.w / cols;
    const cellH = dims.h / rows;
    const margin = 10;

    for (let j = 0; j < chunk.length; j++) {
      const col = j % cols;
      const rowFromTop = Math.floor(j / cols);
      try {
        const embedded = await embedImage(newDoc, chunk[j].storagePath);
        const imgW = embedded.width || cellW;
        const imgH = embedded.height || cellH;
        const scale = Math.min((cellW - margin * 2) / imgW, (cellH - margin * 2) / imgH);
        const drawW = imgW * scale;
        const drawH = imgH * scale;
        const x = col * cellW + (cellW - drawW) / 2;
        const y = dims.h - (rowFromTop + 1) * cellH + (cellH - drawH) / 2;
        page.drawImage(embedded, { x, y, width: drawW, height: drawH });
      } catch (err) {
        console.error(`Failed to embed image ${chunk[j].storagePath}:`, err.message);
      }
    }
  }

  const bytes = await newDoc.save();
  const dir = path.join(path.dirname(imageFiles[0].storagePath), 'print-ready');
  await fsPromises.mkdir(dir, { recursive: true });
  const outPath = path.join(dir, `${jobId || 'contact'}_contact.pdf`);
  await fsPromises.writeFile(outPath, bytes);
  return outPath;
}

async function processOrder(orderId, prisma) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { files: true },
  });

  if (!order) throw new Error('Order not found');

  console.log(`Processing order ${orderId}`);
  const results = [];

  for (const file of order.files) {
    const settings = file.settings || {};
    const pages = settings.pageRange === 'all' || !settings.pageRange
      ? null
      : parsePageRange(settings.pageRange, file.pageCount);

    try {
      const printReadyPath = await processFile(file, pages, settings);
      results.push({ fileId: file.id, filePath: printReadyPath });
    } catch (err) {
      console.error(`Failed to process file ${file.id}:`, err);
    }
  }

  return results;
}

async function processFile(file, pageRange, settings, jobId) {
  console.log(`[processFile] Called for: ${file.originalName} (type: ${file.fileType}, ext: ${path.extname(file.originalName).toLowerCase()})`);
  const ext = path.extname(file.originalName).toLowerCase();

  if (ext === '.pdf') {
    return processPDF(file, pageRange, settings, jobId);
  }

  // Office files: convert to PDF first, then process through PDF pipeline
  if (officeExts.includes(ext)) {
    const pdfPath = await convertOfficeToPdf(file.storagePath);
    // Create a temporary file object with the PDF path
    const pdfFile = {
      ...file,
      storagePath: pdfPath,
      originalName: path.basename(pdfPath),
      pageCount: file.pageCount, // preserve original page count for page range logic
    };
    return processPDF(pdfFile, pageRange, settings, jobId);
  }

  return file.storagePath;
}

async function processPDF(file, pageRange, settings, jobId) {
  const pagesPerSheet = settings.pagesPerSheet || 1;
  const pages = pageRange || Array.from({ length: file.pageCount }, (_, i) => i);

  const isAllPages = pages.length === file.pageCount && pages.every((p, i) => p === i);

  if (isAllPages && pagesPerSheet <= 1) {
    return file.storagePath;
  }

  const pdfBuffer = await fsPromises.readFile(file.storagePath);
  const pdfDoc = await PDFDocument.load(pdfBuffer);

  let processedDoc;

  if (pagesPerSheet > 1) {
    processedDoc = await applyNUp(pdfDoc, pages, pagesPerSheet, settings.paperSize);
  } else {
    processedDoc = await extractPages(pdfDoc, pages);
  }

  const printReadyBytes = await processedDoc.save();
  const printReadyDir = path.join(path.dirname(file.storagePath), 'print-ready');
  await fsPromises.mkdir(printReadyDir, { recursive: true });
  const suffix = jobId || file.id;
  const printReadyPath = path.join(printReadyDir, `${suffix}_printready.pdf`);
  await fsPromises.writeFile(printReadyPath, printReadyBytes);

  return printReadyPath;
}

function parsePageRange(pageRange, totalPages) {
  if (!pageRange || pageRange === 'all') {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  const pages = [];
  const parts = pageRange.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(Number);
      for (let i = start; i <= Math.min(end, totalPages); i++) {
        pages.push(i - 1);
      }
    } else {
      const pageNum = parseInt(trimmed);
      if (pageNum >= 1 && pageNum <= totalPages) {
        pages.push(pageNum - 1);
      }
    }
  }

  return [...new Set(pages)].sort((a, b) => a - b);
}

function countPagesFromRange(pageRange, totalPages) {
  if (!pageRange || pageRange === 'all') {
    return totalPages;
  }
  return parsePageRange(pageRange, totalPages).length;
}

function calculateSheetCount(pageCount, nUp, duplex) {
  let sheets = Math.ceil(pageCount / nUp);
  if (duplex === 'duplex') {
    sheets = Math.ceil(sheets / 2);
  }
  return sheets;
}

async function extractPages(pdfDoc, pages) {
  const newDoc = await PDFDocument.create();
  const copiedPages = await newDoc.copyPages(pdfDoc, pages);
  copiedPages.forEach((page) => newDoc.addPage(page));
  return newDoc;
}

function sourceOrientation(pdfDoc) {
  const first = pdfDoc.getPage(0);
  return first.getWidth() > first.getHeight() ? 'landscape' : 'portrait';
}

function paperDims(paperSize) {
  switch (paperSize) {
    case 'A3': return { w: 841.89, h: 1190.55 };
    case 'Letter': return { w: 612, h: 792 };
    case 'Legal': return { w: 612, h: 1008 };
    default: return { w: 595.28, h: 841.89 };
  }
}

async function applyNUp(pdfDoc, pages, nUp, paperSize) {
  const newDoc = await PDFDocument.create();
  const srcOrient = sourceOrientation(pdfDoc);
  const dims = paperDims(paperSize || 'A4');

  // Grid and page orientation match the system print dialog behavior:
  // Landscape source: 2-up → portrait page, slides stacked (1×2)
  //                   4-up → landscape page, 2×2 grid
  // Portrait source:  2-up → landscape page, slides side-by-side (2×1)
  //                   4-up → portrait page, 2×2 grid
  let cols, rows;
  if (srcOrient === 'landscape') {
    switch (nUp) {
      case 2: cols = 1; rows = 2; break;
      case 4: cols = 2; rows = 2; break;
      case 6: cols = 3; rows = 2; break;
      case 8: cols = 4; rows = 2; break;
      case 9: cols = 3; rows = 3; break;
      case 16: cols = 4; rows = 4; break;
      default: cols = 1; rows = 1;
    }
  } else {
    switch (nUp) {
      case 2: cols = 2; rows = 1; break;
      case 4: cols = 2; rows = 2; break;
      case 6: cols = 2; rows = 3; break;
      case 8: cols = 2; rows = 4; break;
      case 9: cols = 3; rows = 3; break;
      case 16: cols = 4; rows = 4; break;
      default: cols = 1; rows = 1;
    }
  }

  const pageLandscape = nUp === 2 ? srcOrient !== 'landscape' : srcOrient === 'landscape';
  const pageW = pageLandscape ? Math.max(dims.w, dims.h) : Math.min(dims.w, dims.h);
  const pageH = pageLandscape ? Math.min(dims.w, dims.h) : Math.max(dims.w, dims.h);

  for (let i = 0; i < pages.length; i += nUp) {
    const page = newDoc.addPage([pageW, pageH]);

    for (let j = 0; j < nUp && i + j < pages.length; j++) {
      const col = j % cols;
      const row = Math.floor(j / cols);
      const cellW = page.getWidth() / cols;
      const cellH = page.getHeight() / rows;
      const x = col * cellW;
      const y = page.getHeight() - (row + 1) * cellH;

      try {
        const [embeddedPage] = await newDoc.embedPdf(pdfDoc, [pages[i + j]]);
        const scale = Math.min(cellW / embeddedPage.width, cellH / embeddedPage.height);
        const drawW = embeddedPage.width * scale;
        const drawH = embeddedPage.height * scale;
        page.drawPage(embeddedPage, {
          x: x + (cellW - drawW) / 2,
          y: y + (cellH - drawH) / 2,
          width: drawW,
          height: drawH,
        });
      } catch (err) {
        console.error(`Failed to embed page ${pages[i + j]}:`, err);
      }
    }
  }

  return newDoc;
}

async function dispatchPrintJob(printJob, filePath) {
  const printerName = printJob.assignedPrinter;

  if (!printerName) {
    console.warn(`Print job ${printJob.id} has no assigned printer, skipping`);
    return { success: false, message: 'No printer assigned' };
  }

  if (!print) {
    console.log(`[SIMULATED] Print job ${printJob.id} -> ${printerName} -> ${filePath}`);
    return { success: true, message: 'Simulated (pdf-to-printer not available)', simulated: true };
  }

  try {
    const options = {
      printer: printerName,
      silent: true,
    };

    if (printJob.copies && printJob.copies > 1) {
      options.copies = printJob.copies;
    }

    if (printJob.printStyle === 'duplex') {
      options.side = printJob.flipDirection === 'short-edge' ? 'duplexshort' : 'duplex';
    } else {
      options.side = 'simplex';
    }

    if (printJob.paperSize) {
      options.paperSize = printJob.paperSize;
    }

    console.log(`Dispatching print: ${filePath} -> ${printerName} (duplex=${options.side}, copies=${options.copies || 1}, paper=${options.paperSize})`);
    await print.print(filePath, options);
    console.log(`Print dispatched successfully: ${printJob.id}`);
    return { success: true, message: `Sent to ${printerName}` };
  } catch (err) {
    console.error(`Print dispatch failed for ${printJob.id}:`, err.message);
    return { success: false, message: err.message };
  }
}

async function processAndDispatchOrder(orderId, prisma) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { files: true, printJobs: true },
  });

  if (!order) throw new Error('Order not found');

  console.log(`Processing and dispatching order ${orderId}`);
  const results = [];

  const processOne = async (printJob) => {
    const file = order.files.find(f => f.id === printJob.fileId);
    if (!file) {
      console.warn(`File not found for print job ${printJob.id}`);
      return { printJobId: printJob.id, success: false, message: 'File not found' };
    }

    try {
      // Contact-sheet job: pages holds an array of image file IDs (strings)
      let parsedPages = null;
      try { parsedPages = JSON.parse(printJob.pages); } catch { parsedPages = null; }

      if (Array.isArray(parsedPages) && parsedPages.length > 0 && typeof parsedPages[0] === 'string') {
        const imageFiles = parsedPages
          .map((id) => order.files.find((f) => f.id === id))
          .filter(Boolean);
        if (imageFiles.length > 0) {
          const printReadyPath = await createContactSheet(
            imageFiles,
            printJob.pagesPerSheet || 1,
            printJob.paperSize,
            printJob.id
          );
          // Agent will handle printing — just mark as ready
          await prisma.printJob.update({
            where: { id: printJob.id },
            data: { status: 'PRINTING' },
          });
          return { printJobId: printJob.id, success: true, message: 'Queued for agent' };
        }
      }

      let pages;
      try {
        const parsed = JSON.parse(printJob.pages);
        if (Array.isArray(parsed)) {
          pages = parsed;
        } else {
          pages = parsePageRange(printJob.pages, file.pageCount);
        }
      } catch {
        pages = parsePageRange(printJob.pages, file.pageCount);
      }

      const settings = {
        pagesPerSheet: printJob.pagesPerSheet || 1,
        paperSize: printJob.paperSize,
      };

      const printReadyPath = await processFile(file, pages, settings, printJob.id);

      // Agent will handle printing — just mark as ready
      await prisma.printJob.update({
        where: { id: printJob.id },
        data: { status: 'PRINTING' },
      });

      return { printJobId: printJob.id, success: true, message: 'Queued for agent' };
    } catch (err) {
      console.error(`Failed to process print job ${printJob.id}:`, err.message);
      try {
        await prisma.printJob.update({
          where: { id: printJob.id },
          data: { status: 'FAILED' },
        });
      } catch (updateErr) {
        console.error(`Failed to update print job status:`, updateErr.message);
      }
      return { printJobId: printJob.id, success: false, message: err.message };
    }
  };

  const sortedJobs = [...order.printJobs].sort(
    (a, b) => (a.sectionIndex || 0) - (b.sectionIndex || 0)
  );

  for (const job of sortedJobs) {
    const r = await processOne(job);
    results.push(r);
  }

  return results;
}

module.exports = {
  processOrder,
  processFile,
  processPDF,
  parsePageRange,
  countPagesFromRange,
  calculateSheetCount,
  dispatchPrintJob,
  processAndDispatchOrder,
  isImageFile,
  createContactSheet,
};
