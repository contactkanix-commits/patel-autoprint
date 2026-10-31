const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const { PDFDocument, degrees, rgb, pushGraphicsState, popGraphicsState, translate, rotateRadians, moveTo, lineTo, closePath, clip, endPath } = require('pdf-lib');

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

function imageGrid(nUp, orientation = 'landscape') {
  const portrait = orientation === 'portrait';
  switch (nUp) {
    case 2: return { cols: 2, rows: 1 };
    case 4: return { cols: 2, rows: 2 };
    case 6: return portrait ? { cols: 2, rows: 3 } : { cols: 3, rows: 2 };
    case 8: return portrait ? { cols: 2, rows: 4 } : { cols: 4, rows: 2 };
    case 9: return { cols: 3, rows: 3 };
    case 16: return { cols: 4, rows: 4 };
    default: return { cols: 1, rows: 1 };
  }
}

async function embedImage(doc, filePath) {
  const data = await fsPromises.readFile(filePath);

  if (!data || data.length === 0) {
    throw new Error(`Empty file: ${filePath} (0 bytes)`);
  }

  // Detect format from file header bytes (magic numbers)
  const isJpg = data[0] === 0xFF && data[1] === 0xD8;
  const isPng = data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47;
  const isWebp = data.length >= 12 && data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP';

  // Try direct embed based on detected format
  if (isJpg) {
    try { return doc.embedJpg(data); } catch (e) {
      throw new Error(`embedJpg failed: ${e.message}`);
    }
  }
  if (isPng) {
    try { return doc.embedPng(data); } catch (e) {
      throw new Error(`embedPng failed: ${e.message}`);
    }
  }
  if (isWebp) {
    try {
      const sharp = require('sharp');
      const png = await sharp(data).png().toBuffer();
      return doc.embedPng(png);
    } catch (e) {
      throw new Error(`WebP sharp conversion failed: ${e.message}`);
    }
  }

  // Unknown format: try all embed methods as fallback
  try { return doc.embedJpg(data); } catch {}
  try { return doc.embedPng(data); } catch {}

  throw new Error(`Unknown image format (first bytes: ${data[0]},${data[1]},${data[2]},${data[3]})`);
}

// Combines multiple image files into a contact-sheet PDF.
// - nUp === 1: one image per page, each page oriented to its image (like
//   Windows "Print picture"), so photos fill the page instead of being tiny.
// - nUp > 1: a grid laid out using the chosen paper orientation.
async function createContactSheet(imageFiles, nUp, paperSize, jobId, orientation = 'auto', photoFit = 'fill') {
  const n = Math.max(1, parseInt(nUp) || 1);
  const newDoc = await PDFDocument.create();
  const baseDims = paperDims(paperSize, 'portrait');

  const infos = [];
  for (const f of imageFiles) {
    try {
      const embedded = await embedImage(newDoc, f.storagePath);
      infos.push({
        embedded,
        w: embedded.width,
        h: embedded.height,
        landscape: embedded.width > embedded.height,
      });
    } catch (err) {
      console.error(`Failed to embed image ${f.storagePath}:`, err.message);
    }
  }

  if (infos.length === 0) {
    throw new Error('createContactSheet: no images could be embedded');
  }

  if (n === 1) {
    for (const info of infos) {
      const imgIsLandscape = info.w > info.h;
      const pageW = imgIsLandscape ? baseDims.h : baseDims.w;
      const pageH = imgIsLandscape ? baseDims.w : baseDims.h;
      const page = newDoc.addPage([pageW, pageH]);

      const scale = Math.min((pageW - 4) / info.w, (pageH - 4) / info.h);
      const drawW = info.w * scale;
      const drawH = info.h * scale;

      page.drawImage(info.embedded, {
        x: (pageW - drawW) / 2,
        y: (pageH - drawH) / 2,
        width: drawW,
        height: drawH,
      });
    }
  } else {
    let sheetLandscape;
    if (orientation === 'landscape') {
      sheetLandscape = true;
    } else {
      sheetLandscape = false;
    }

    let cols, rows;
    if (sheetLandscape) {
      switch (n) {
        case 2: cols = 2; rows = 1; break;
        case 4: cols = 2; rows = 2; break;
        case 6: cols = 3; rows = 2; break;
        case 8: cols = 4; rows = 2; break;
        case 9: cols = 3; rows = 3; break;
        case 16: cols = 4; rows = 4; break;
        default: cols = Math.ceil(Math.sqrt(n)); rows = Math.ceil(n / cols);
      }
    } else {
      switch (n) {
        case 2: cols = 1; rows = 2; break;
        case 4: cols = 2; rows = 2; break;
        case 6: cols = 2; rows = 3; break;
        case 8: cols = 2; rows = 4; break;
        case 9: cols = 3; rows = 3; break;
        case 16: cols = 4; rows = 4; break;
        default: cols = Math.ceil(Math.sqrt(n)); rows = Math.ceil(n / cols);
      }
    }

    const sheetW = sheetLandscape ? baseDims.h : baseDims.w;
    const sheetH = sheetLandscape ? baseDims.w : baseDims.h;
    const margin = 4;

    for (let i = 0; i < infos.length; i += n) {
      const chunk = infos.slice(i, i + n);
      const page = newDoc.addPage([sheetW, sheetH]);
      const cellW = sheetW / cols;
      const cellH = sheetH / rows;
      const boxW = cellW - margin * 2;
      const boxH = cellH - margin * 2;

      for (let j = 0; j < chunk.length; j++) {
        const { embedded, w: imgW, h: imgH } = chunk[j];
        const col = j % cols;
        const rowFromTop = Math.floor(j / cols);
        const cellCenterX = col * cellW + cellW / 2;
        const cellCenterY = sheetH - (rowFromTop + 1) * cellH + cellH / 2;

        const slotIsLandscape = boxW > boxH;
        const imgIsLandscape = imgW > imgH;

        const shouldRotate = slotIsLandscape !== imgIsLandscape;

        let scaleW, scaleH;
        if (shouldRotate) {
          scaleW = boxW / imgH;
          scaleH = boxH / imgW;
        } else {
          scaleW = boxW / imgW;
          scaleH = boxH / imgH;
        }
        const scale = Math.min(scaleW, scaleH);

        const drawW = imgW * scale;
        const drawH = imgH * scale;

        if (shouldRotate) {
          page.drawImage(embedded, {
            x: cellCenterX + drawH / 2,
            y: cellCenterY - drawW / 2,
            width: drawW,
            height: drawH,
            rotate: degrees(90),
          });
        } else {
          page.drawImage(embedded, {
            x: cellCenterX - drawW / 2,
            y: cellCenterY - drawH / 2,
            width: drawW,
            height: drawH,
          });
        }
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

  // Office files: convert to PDF first, then process through PDF pipeline.
  // Office COM (via powershell.exe) only exists on Windows. On Linux servers
  // (e.g. Render) conversion is skipped and the original file is served so the
  // agent can convert it locally on the machine that will print it.
  if (officeExts.includes(ext)) {
    if (process.platform !== 'win32') {
      console.log(`[processFile] Office conversion skipped on ${process.platform}; agent will convert locally.`);
      return file.storagePath;
    }
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

function paperDims(paperSize, orientation = 'auto') {
  const dims = (() => {
    switch (paperSize) {
      case 'A3': return { w: 841.89, h: 1190.55 };
      case 'Letter': return { w: 612, h: 792 };
      case 'Legal': return { w: 612, h: 1008 };
      default: return { w: 595.28, h: 841.89 };
    }
  })();

  if (orientation === 'landscape') {
    return { w: dims.h, h: dims.w };
  }
  return dims;
}

async function applyNUp(pdfDoc, pages, nUp, paperSize) {
  const newDoc = await PDFDocument.create();
  const srcOrient = sourceOrientation(pdfDoc);
  const dims = paperDims(paperSize || 'A4');

  // --- Layout Partitioning: grid based on source orientation ---
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

  const sheetLandscape = cols > rows;
  const sheetW = sheetLandscape ? Math.max(dims.w, dims.h) : Math.min(dims.w, dims.h);
  const sheetH = sheetLandscape ? Math.min(dims.w, dims.h) : Math.max(dims.w, dims.h);

  const margin = 0;

  for (let i = 0; i < pages.length; i += nUp) {
    const page = newDoc.addPage([sheetW, sheetH]);
    const cellW = sheetW / cols;
    const cellH = sheetH / rows;
    const boxW = cellW - margin * 2;
    const boxH = cellH - margin * 2;

    for (let j = 0; j < nUp && i + j < pages.length; j++) {
      const col = j % cols;
      const rowFromTop = Math.floor(j / cols);
      const cellCenterX = col * cellW + cellW / 2;
      const cellCenterY = sheetH - (rowFromTop + 1) * cellH + cellH / 2;

      try {
        const [embeddedPage] = await newDoc.embedPdf(pdfDoc, [pages[i + j]]);
        const pageW = embeddedPage.width;
        const pageH = embeddedPage.height;
        const pageIsLandscape = pageW > pageH;

        const slotIsLandscape = boxW > boxH;
        let shouldRotate = false;

        if (slotIsLandscape !== pageIsLandscape) {
          shouldRotate = true;
        }

        let scaleW, scaleH, drawW, drawH;

        if (shouldRotate) {
          scaleW = boxW / pageH;
          scaleH = boxH / pageW;
        } else {
          scaleW = boxW / pageW;
          scaleH = boxH / pageH;
        }
        const scale = Math.min(scaleW, scaleH);

        drawW = pageW * scale;
        drawH = pageH * scale;

        if (shouldRotate) {
          page.drawPage(embeddedPage, {
            x: cellCenterX + drawH / 2,
            y: cellCenterY - drawW / 2,
            width: drawW,
            height: drawH,
            rotate: degrees(90),
          });
        } else {
          page.drawPage(embeddedPage, {
            x: cellCenterX - drawW / 2,
            y: cellCenterY - drawH / 2,
            width: drawW,
            height: drawH,
          });
        }
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

    // Always announce the generated PDF's orientation to the printer: with
    // "auto" the driver otherwise prints landscape sheets rotated/shrunk
    // onto portrait paper (looks portrait with cut-off images).
    try {
      const pdoc = await PDFDocument.load(await fsPromises.readFile(filePath));
      const pg = pdoc.getPage(0);
      options.orientation = pg.getWidth() > pg.getHeight() ? 'landscape' : 'portrait';
    } catch {
      if (printJob.orientation && printJob.orientation !== 'auto') options.orientation = printJob.orientation;
    }

    console.log(`Dispatching print: ${filePath} -> ${printerName} (duplex=${options.side}, copies=${options.copies || 1}, paper=${options.paperSize}, orientation=${options.orientation})`);
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
      // Mark job as PRINTING - agent will download original file(s) and generate locally
      await prisma.printJob.update({
        where: { id: printJob.id },
        data: { status: 'PRINTING' },
      });

      return { printJobId: printJob.id, success: true, message: 'Queued for agent (local generation)' };
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
