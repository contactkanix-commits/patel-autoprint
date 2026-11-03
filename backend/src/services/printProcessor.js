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
    try {
      const img = await doc.embedJpg(data);
      // Phone photos carry an EXIF Orientation tag (pixels stored sideways).
      // Remember it so layout math works with the DISPLAYED orientation.
      img.exifOrientation = exifOrientation(data);
      return img;
    } catch (e) {
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
        exif: embedded.exifOrientation || 1,
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
      // Single image per sheet: page orientation matches the DISPLAYED image
      // (EXIF-aware), so portrait phone photos print upright on portrait paper.
      const exifRot = exifRotationDeg(info.exif || 1);
      const dispLandscape = displayLandscape(info);
      const pageW = dispLandscape ? baseDims.h : baseDims.w;
      const pageH = dispLandscape ? baseDims.w : baseDims.h;
      const page = newDoc.addPage([pageW, pageH]);

      const bboxSwapped = exifRot % 180 === 90;
      const scale = bboxSwapped
        ? Math.min((pageW - 4) / info.h, (pageH - 4) / info.w)
        : Math.min((pageW - 4) / info.w, (pageH - 4) / info.h);

      drawOriented(page, info.embedded, pageW / 2, pageH / 2, exifRot, info.w * scale, info.h * scale);
    }
  } else {
    // Sheet orientation from orientation parameter ('auto' uses dominant
    // DISPLAY orientation of the images, EXIF-aware)
    let sheetLandscape;
    if (orientation === 'portrait') {
      sheetLandscape = false;
    } else if (orientation === 'landscape') {
      sheetLandscape = true;
    } else {
      // 'auto': portrait images → landscape sheet, landscape images → portrait sheet
      const landCount = infos.filter((i) => displayLandscape(i)).length;
      sheetLandscape = landCount < infos.length - landCount;
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
        const info = chunk[j];
        const col = j % cols;
        const rowFromTop = Math.floor(j / cols);
        const cellCenterX = col * cellW + cellW / 2;
        const cellCenterY = sheetH - (rowFromTop + 1) * cellH + cellH / 2;

        // The only rotation applied is EXIF compensation, so the photo always
        // sits upright inside its cell. Never "twist to fill": Windows/Chrome
        // n-up keeps every page upright and letterboxes it instead of turning
        // a portrait photo 90° sideways.
        const totalRot = exifRotationDeg(info.exif || 1);

        const scale = (totalRot === 90 || totalRot === 270)
          ? Math.min(boxW / info.h, boxH / info.w)
          : Math.min(boxW / info.w, boxH / info.h);

        drawOriented(page, info.embedded, cellCenterX, cellCenterY, totalRot, info.w * scale, info.h * scale);
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
    processedDoc = await applyNUp(pdfDoc, pages, pagesPerSheet, settings.paperSize, settings.orientation);
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

// Geometry of a source PDF page as a viewer displays it. pdf-lib's embedPdf
// keeps only the MediaBox and ignores /Rotate, so a scanned or WhatsApp PDF
// (sidebar stored + "rotate 90") would otherwise be laid out sideways on a
// sheet chosen from the wrong orientation.
function pdfPageDisplay(page) {
  const raw = page.getRotation ? page.getRotation().angle : 0;
  const angle = ((Math.round(raw / 90) * 90) % 360 + 360) % 360;
  const width = page.getWidth();
  const height = page.getHeight();
  const swapped = angle === 90 || angle === 270;
  return {
    angle,
    width,
    height,
    displayWidth: swapped ? height : width,
    displayHeight: swapped ? width : height,
  };
}

function sourceOrientation(pdfDoc) {
  const geo = pdfPageDisplay(pdfDoc.getPage(0));
  return geo.displayWidth > geo.displayHeight ? 'landscape' : 'portrait';
}

// ---------------------------------------------------------------------------
// EXIF orientation support.
// Phone/WhatsApp photos are very often stored with raw LANDSCAPE pixels plus
// an EXIF Orientation tag saying "rotate 90° to display". Viewers (browsers)
// apply the tag, but pdf-lib embeds raw pixels as-is — so photo layout math
// must compensate, or every phone photo lays out as landscape and 2-up prints
// stacked vertically instead of side by side.
// ---------------------------------------------------------------------------
function exifOrientation(data) {
  try {
    if (!data || data.length < 12 || data[0] !== 0xFF || data[1] !== 0xD8) return 1;
    let i = 2;
    while (i + 4 <= data.length) {
      if (data[i] !== 0xFF) { i += 1; continue; }
      const marker = data[i + 1];
      if (marker === 0x01 || marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
      if (marker === 0xDA || marker === 0xD9) break; // start of scan / EOI — EXIF comes before
      const len = (data[i + 2] << 8) | data[i + 3];
      if (len < 2 || i + 2 + len > data.length) break;
      if (marker === 0xE1 && len >= 10) {
        let sig = '';
        for (let k = 0; k < 6; k++) sig += String.fromCharCode(data[i + 4 + k]);
        if (sig === 'Exif\u0000\u0000') {
          const t = i + 10; // TIFF header starts here
          const little = data[t] === 0x49 && data[t + 1] === 0x49;
          const u16 = (p) => little ? data[p] | (data[p + 1] << 8) : (data[p] << 8) | data[p + 1];
          const u32 = (p) => little
            ? (data[p] | (data[p + 1] << 8) | (data[p + 2] << 16) | (data[p + 3] << 24)) >>> 0
            : ((data[p] << 24) | (data[p + 1] << 16) | (data[p + 2] << 8) | data[p + 3]) >>> 0;
          const ifd0 = t + u32(t + 4);
          const count = u16(ifd0);
          for (let e = 0; e < count; e++) {
            const entry = ifd0 + 2 + e * 12;
            if (entry + 12 > data.length) break;
            if (u16(entry) === 0x0112) {
              // Orientation 1-8; mirrored variants are approximated (no flip
              // support in pdf-lib drawImage) — rotation part still applied.
              const v = u16(entry + 8);
              return v >= 1 && v <= 8 ? v : 1;
            }
          }
          break;
        }
      }
      i += 2 + len;
    }
  } catch {}
  return 1;
}

// Net CCW rotation (in degrees, multiple of 90) that renders raw pixels
// upright for the given EXIF orientation value.
function exifRotationDeg(orient) {
  switch (orient) {
    case 3:
    case 4: return 180;
    case 5:
    case 6: return 270; // display = raw rotated 90° clockwise
    case 7:
    case 8: return 90;  // display = raw rotated 90° counter-clockwise
    default: return 0;
  }
}

// Display (as viewers show it) landscape flag for an embedded image,
// honoring its EXIF Orientation tag.
function displayLandscape(embedded) {
  // Accepts either the embedded image ({width,height,exifOrientation}) or an
  // info wrapper ({w,h,exif}) — both are used at call sites.
  const orient = embedded.exifOrientation || embedded.exif || 1;
  const rot = exifRotationDeg(orient);
  const w = embedded.width ?? embedded.w;
  const h = embedded.height ?? embedded.h;
  const rawLandscape = w > h;
  return rot % 180 === 90 ? !rawLandscape : rawLandscape;
}

// Draw an image scaled to (rawW, rawH) — pre-rotation pixel box times scale —
// rotated rotDeg CCW (0/90/180/270), centered on (cx, cy).
function drawOriented(page, image, cx, cy, rotDeg, rawW, rawH) {
  const r = ((Math.round(rotDeg) % 360) + 360) % 360;
  const opts = { width: rawW, height: rawH };
  if (r === 90) {
    page.drawImage(image, { ...opts, x: cx + rawH / 2, y: cy - rawW / 2, rotate: degrees(90) });
  } else if (r === 180) {
    page.drawImage(image, { ...opts, x: cx + rawW / 2, y: cy + rawH / 2, rotate: degrees(180) });
  } else if (r === 270) {
    page.drawImage(image, { ...opts, x: cx - rawH / 2, y: cy + rawW / 2, rotate: degrees(270) });
  } else {
    page.drawImage(image, { ...opts, x: cx - rawW / 2, y: cy - rawH / 2 });
  }
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

async function applyNUp(pdfDoc, pages, nUp, paperSize, orientation = 'auto') {
  const newDoc = await PDFDocument.create();
  const srcOrient = sourceOrientation(pdfDoc);
  const dims = paperDims(paperSize || 'A4');

  // --- Layout Partitioning: grid based on sheet orientation ---
  let sheetLandscape;
  if (orientation === 'landscape') {
    sheetLandscape = true;
  } else if (orientation === 'portrait') {
    sheetLandscape = false;
  } else {
    // 'auto': portrait source → landscape sheet, landscape source → portrait sheet
    sheetLandscape = srcOrient === 'portrait';
  }

  let cols, rows;
  if (sheetLandscape) {
    switch (nUp) {
      case 2: cols = 2; rows = 1; break;
      case 4: cols = 2; rows = 2; break;
      case 6: cols = 3; rows = 2; break;
      case 8: cols = 4; rows = 2; break;
      case 9: cols = 3; rows = 3; break;
      case 16: cols = 4; rows = 4; break;
      default: cols = Math.ceil(Math.sqrt(nUp)); rows = Math.ceil(nUp / cols);
    }
  } else {
    switch (nUp) {
      case 2: cols = 1; rows = 2; break;
      case 4: cols = 2; rows = 2; break;
      case 6: cols = 2; rows = 3; break;
      case 8: cols = 2; rows = 4; break;
      case 9: cols = 3; rows = 3; break;
      case 16: cols = 4; rows = 4; break;
      default: cols = Math.ceil(Math.sqrt(nUp)); rows = Math.ceil(nUp / cols);
    }
  }

  const sheetW = sheetLandscape ? dims.h : dims.w;
  const sheetH = sheetLandscape ? dims.w : dims.h;

  const margin = 0;

  for (let i = 0; i < pages.length; i += nUp) {
    const page = newDoc.addPage([sheetW, sheetH]);
    const cellW = sheetW / cols;
    const cellH = sheetH / rows;
    const boxW = cellW - margin * 2;
    const boxH = cellH - margin * 2;

    for (let j = 0; j < nUp && i + j < pages.length; j++) {
      const pageIndex = i + j;
      const col = j % cols;
      const rowFromTop = Math.floor(j / cols);
      const cellCenterX = col * cellW + cellW / 2;
      const cellCenterY = sheetH - (rowFromTop + 1) * cellH + cellH / 2;

      try {
        const [embeddedPage] = await newDoc.embedPdf(pdfDoc, [pageIndex]);
        const geo = pdfPageDisplay(pdfDoc.getPage(pageIndex));

        // Fit the page as it is DISPLAYED (MediaBox + /Rotate) into the cell.
        // No 90° "twist" to fill the cell — Windows and Chrome keep every page
        // upright and leave white space instead.
        const scale = Math.min(
          boxW / geo.displayWidth,
          boxH / geo.displayHeight
        );

        const drawW = geo.width * scale;
        const drawH = geo.height * scale;

        // Undo /Rotate so the page content lands upright in the cell.
        // A /Rotate 90 page is displayed rotated 90° clockwise = 270° CCW.
        const rot = (360 - geo.angle) % 360;

        if (rot === 90) {
          page.drawPage(embeddedPage, {
            x: cellCenterX + drawH / 2,
            y: cellCenterY - drawW / 2,
            width: drawW,
            height: drawH,
            rotate: degrees(90),
          });
        } else if (rot === 180) {
          page.drawPage(embeddedPage, {
            x: cellCenterX + drawW / 2,
            y: cellCenterY + drawH / 2,
            width: drawW,
            height: drawH,
            rotate: degrees(180),
          });
        } else if (rot === 270) {
          page.drawPage(embeddedPage, {
            x: cellCenterX - drawH / 2,
            y: cellCenterY + drawW / 2,
            width: drawW,
            height: drawH,
            rotate: degrees(270),
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
        console.error(`Failed to embed page ${pageIndex}:`, err);
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
