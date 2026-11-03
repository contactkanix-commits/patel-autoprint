const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { PDFDocument, degrees, rgb, pushGraphicsState, popGraphicsState, translate, rotateRadians, moveTo, lineTo, closePath, clip, endPath } = require('pdf-lib');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const POLL_INTERVAL = 2000;
const MAX_CONCURRENT_JOBS = 2;
const CONVERT_SCRIPT = path.join(__dirname, 'convert-office-to-pdf.ps1');

// HTTP agents with keep-alive for connection reuse
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });

let print;
try {
  print = require('pdf-to-printer');
} catch (e) {
  print = null;
}

// Sniff the actual file type from magic bytes. The server may serve a PDF for
// contact-sheet jobs even though job.file.fileType says jpeg/png, and it serves
// original office files on Linux. Trusting the bytes avoids mis-extension.
function classifyFile(filePath) {
  const buf = Buffer.alloc(12);
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, buf.length, 0);
  } catch {
    return { type: 'unknown', ext: 'bin' };
  } finally {
    if (fd) { try { fs.closeSync(fd); } catch {} }
  }
  const head = buf.subarray(0, 4).toString('latin1');
  if (head === '%PDF') return { type: 'pdf', ext: 'pdf' };
  if (buf[0] === 0xFF && buf[1] === 0xD8) return { type: 'image', ext: 'jpg' };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return { type: 'image', ext: 'png' };
  if (head === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { type: 'image', ext: 'webp' };
  // OOXML/Office (PK zip) or legacy OLE (D0CF11E0)
  if ((buf[0] === 0x50 && buf[1] === 0x4B) || (buf[0] === 0xD0 && buf[1] === 0xCF)) return { type: 'office', ext: 'doc' };
  return { type: 'unknown', ext: 'bin' };
}

// Convert office files (docx/pptx/xlsx) to PDF using Office COM automation
function convertOfficeToPdf(inputPath, outputPdf) {
  return new Promise((resolve, reject) => {
    const args = [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', CONVERT_SCRIPT,
      '-inputFile', inputPath,
      '-outputPdf', outputPdf
    ];
    const child = spawn('powershell.exe', args, { timeout: 180000, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      if (code === 0 && stdout.trim().startsWith('OK:')) resolve(outputPdf);
      else reject(new Error(`Office-to-PDF conversion failed: ${stderr || stdout}`));
    });
    child.on('error', reject);
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

async function createContactSheet(imageFiles, nUp, paperSize, jobId, orientation = 'auto', photoFit = 'fill') {
  const n = Math.max(1, parseInt(nUp) || 1);
  const newDoc = await PDFDocument.create();
  const baseDims = paperDims(paperSize, 'portrait');

  // ============================================
  // Pre-embed all images once (single pass)
  // ============================================
  const infos = [];
  for (const f of imageFiles) {
    try {
      const embedded = await embedImage(newDoc, f.path);
      infos.push({
        embedded,
        w: embedded.width,
        h: embedded.height,
        landscape: embedded.width > embedded.height,
        exif: embedded.exifOrientation || 1,
      });
    } catch (err) {
      console.error(`Failed to embed image ${f.path}:`, err.message);
    }
  }

  if (infos.length === 0) {
    const page = newDoc.addPage([baseDims.w, baseDims.h]);
    const bytes = await newDoc.save();
    const dir = path.join(path.dirname(imageFiles[0]?.path || __dirname), 'print-ready');
    await fsPromises.mkdir(dir, { recursive: true });
    const outPath = path.join(dir, `${jobId || 'contact'}_contact.pdf`);
    await fsPromises.writeFile(outPath, bytes);
    return outPath;
  }

  // ============================================
  // CASE 1: n === 1 (one image per page)
  // ============================================
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
  }
  // ============================================
  // CASE 2: n >= 2 (n-up grid)
  // ============================================
  else {
    // Sheet orientation from orientation parameter ('auto' uses dominant
    // DISPLAY orientation of the images, EXIF-aware)
    let sheetLandscape;
    if (orientation === 'portrait') {
      sheetLandscape = false;
    } else if (orientation === 'landscape') {
      sheetLandscape = true;
    } else {
      // 'auto': portrait images → landscape sheet (side-by-side), landscape images → portrait sheet (stacked)
      const landCount = infos.filter((i) => displayLandscape(i)).length;
      sheetLandscape = landCount < infos.length - landCount;
    }

    // Grid based on sheet orientation + nUp
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

    // --- Grid Rendering ---
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

        drawOriented(
          page,
          info.embedded,
          cellCenterX,
          cellCenterY,
          totalRot,
          info.w * scale,
          info.h * scale
        );
      }
    }
  }

  const bytes = await newDoc.save();
  const dir = path.join(path.dirname(imageFiles[0].path), 'print-ready');
  await fsPromises.mkdir(dir, { recursive: true });
  const outPath = path.join(dir, `${jobId || 'contact'}_contact.pdf`);
  await fsPromises.writeFile(outPath, bytes);
  return outPath;
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
    // 'auto': portrait source → landscape sheet (side-by-side), landscape source → portrait sheet (stacked)
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

async function extractPages(pdfDoc, pages) {
  const newDoc = await PDFDocument.create();
  const copiedPages = await newDoc.copyPages(pdfDoc, pages);
  copiedPages.forEach((page) => newDoc.addPage(page));
  return newDoc;
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

async function processPDF(filePath, pageRange, settings, jobId) {
  const pagesPerSheet = settings.pagesPerSheet || 1;

  const pdfBuffer = await fsPromises.readFile(filePath);
  const pdfDoc = await PDFDocument.load(pdfBuffer);

  const pages = pageRange || Array.from({ length: pdfDoc.getPageCount() }, (_, i) => i);

  const isAllPages = pages.length === pdfDoc.getPageCount() && pages.every((p, i) => p === i);

  if (isAllPages && pagesPerSheet <= 1) {
    return filePath;
  }

  let processedDoc;

  if (pagesPerSheet > 1) {
    processedDoc = await applyNUp(pdfDoc, pages, pagesPerSheet, settings.paperSize, settings.orientation);
  } else {
    processedDoc = await extractPages(pdfDoc, pages);
  }

  const printReadyBytes = await processedDoc.save();
  const dir = path.join(path.dirname(filePath), 'print-ready');
  await fsPromises.mkdir(dir, { recursive: true });
  const suffix = jobId || path.basename(filePath, path.extname(filePath));
  const printReadyPath = path.join(dir, `${suffix}_printready.pdf`);
  await fsPromises.writeFile(printReadyPath, printReadyBytes);

  return printReadyPath;
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return null;
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function ask(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (data) => {
      process.stdin.pause();
      resolve(data.trim());
    });
  });
}

async function apiRequest(config, method, urlPath, body) {
  const url = new URL(urlPath, config.serverUrl);
  const isHttps = url.protocol === 'https:';

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      agent: isHttps ? httpsAgent : httpAgent,
    };

    if (config.token) {
      options.headers['Authorization'] = `Bearer ${config.token}`;
    }

    const req = (isHttps ? https : http).request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ success: false, message: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function downloadFile(config, urlPath, destPath) {
  const url = new URL(urlPath, config.serverUrl);
  const isHttps = url.protocol === 'https:';

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {},
      agent: isHttps ? httpsAgent : httpAgent,
    };

    if (config.token) {
      options.headers['Authorization'] = `Bearer ${config.token}`;
    }

    const req = (isHttps ? https : http).request(options, (res) => {
      if (res.statusCode !== 200) {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => reject(new Error(`Download failed: ${res.statusCode} ${data}`)));
        return;
      }
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(destPath);
      });
      fileStream.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Download timeout'));
    });
    req.end();
  });
}

async function login(config) {
  console.log(`Connecting to ${config.serverUrl}...`);
  const result = await apiRequest(config, 'POST', '/api/agent/login', {
    email: config.email,
    password: config.password,
  });

  if (!result.success) {
    throw new Error(result.message || 'Login failed');
  }

  config.token = result.data.token;
  config.shopId = result.data.shopId;
  saveConfig(config);
  console.log(`Logged in as ${config.email} (Shop: ${result.data.shopName || config.shopId})`);
  return config;
}

async function pollJobs(config) {
  try {
    const result = await apiRequest(config, 'GET', '/api/agent/jobs');
    if (!result.success) return [];
    return result.data || [];
  } catch (e) {
    console.error('Poll error:', e.message);
    return [];
  }
}

async function processJob(config, job) {
  const printDir = path.join(__dirname, 'print-cache');
  if (!fs.existsSync(printDir)) fs.mkdirSync(printDir, { recursive: true });

  console.log(`\n[${new Date().toLocaleTimeString()}] Processing: ${job.file?.originalName || job.id}`);
  console.log(`  Order #${job.order?.token || 'N/A'} | ${job.pagesPerSheet}-up | ${job.printStyle} | ${job.copies} copy(ies) | Printer: ${job.assignedPrinter || 'default'}`);

  // Determine job type from pages field (contact sheet = array of string file IDs)
  let parsedPages = null;
  try { parsedPages = JSON.parse(job.pages); } catch { parsedPages = null; }
  const isContactSheet = Array.isArray(parsedPages) && parsedPages.length > 0 && typeof parsedPages[0] === 'string';

  let printPath;
  let filePathsToCleanup = [];

  try {
    if (isContactSheet) {
      // CONTACT SHEET: Download all original images and generate locally
      console.log(`  Generating contact sheet (${parsedPages.length} images, ${job.pagesPerSheet}-up)...`);
      
      const imageFiles = [];
      for (const fileId of parsedPages) {
        const destPath = path.join(__dirname, 'print-cache', `${fileId}.download`);
        try {
          await downloadFile(config, `/api/agent/files/${fileId}/original`, destPath);
          // Determine extension from downloaded file
          const { ext } = classifyFile(destPath);
          const finalPath = path.join(__dirname, 'print-cache', `${fileId}.${ext}`);
          if (finalPath !== destPath) {
            try { fs.renameSync(destPath, finalPath); } catch { fs.copyFileSync(destPath, finalPath); fs.unlinkSync(destPath); }
          }
          imageFiles.push({ path: finalPath, id: fileId });
          filePathsToCleanup.push(finalPath);
        } catch (e) {
          console.error(`  Failed to download image ${fileId}:`, e.message);
        }
      }

      if (imageFiles.length === 0) {
        throw new Error('No images downloaded for contact sheet');
      }

      const contactSheetPath = await createContactSheet(
        imageFiles,
        job.pagesPerSheet || 1,
        job.paperSize || 'A4',
        job.id,
          job.orientation || 'auto',
          job.photoFit || 'fit'
        );
      printPath = contactSheetPath;
      filePathsToCleanup.push(contactSheetPath);

    } else {
      // PDF JOB: Download original file and process if needed
      const fileId = job.file?.id;
      if (!fileId) throw new Error('No file ID in job');

      const rawPath = path.join(__dirname, 'print-cache', `${job.id}.download`);
      try {
        await downloadFile(config, `/api/agent/files/${fileId}/original`, rawPath);
        console.log('  Downloaded original file.');
      } catch (e) {
        console.error('  Download failed:', e.message);
        await apiRequest(config, 'PUT', `/api/agent/jobs/${job.id}/status`, { status: 'FAILED', message: e.message });
        return;
      }

      const { type, ext } = classifyFile(rawPath);
      const filePath = path.join(__dirname, 'print-cache', `${job.id}.${ext}`);
      if (filePath !== rawPath) {
        try { fs.renameSync(rawPath, filePath); } catch { fs.copyFileSync(rawPath, filePath); fs.unlinkSync(rawPath); }
      }
      filePathsToCleanup.push(filePath);

      let printPath = filePath;

      // Office files: convert to PDF
      if (type === 'office') {
        try {
          const pdfPath = path.join(__dirname, 'print-cache', `${job.id}.pdf`);
          console.log('  Converting office file to PDF...');
          await convertOfficeToPdf(filePath, pdfPath);
          printPath = pdfPath;
          filePathsToCleanup.push(pdfPath);
          console.log('  Converted to PDF.');
        } catch (e) {
          console.error('  Office conversion failed:', e.message);
          await apiRequest(config, 'PUT', `/api/agent/jobs/${job.id}/status`, { status: 'FAILED', message: e.message });
          return;
        }
      }

      // PDF processing: n-up or page range extraction
      const pagesPerSheet = job.pagesPerSheet || 1;
      let parsedPages = null;
      try { parsedPages = JSON.parse(job.pages); } catch { parsedPages = null; }
      const pageRange = Array.isArray(parsedPages) ? parsedPages : null;

      const needsProcessing = pagesPerSheet > 1 || (pageRange && pageRange.length > 0);
      if (needsProcessing && type === 'pdf') {
        const settings = {
          pagesPerSheet: job.pagesPerSheet || 1,
          paperSize: job.paperSize || 'A4',
          // Must be forwarded: without it applyNUp always falls back to
          // 'auto' and an explicit Portrait/Landscape choice is ignored.
          orientation: job.orientation || 'auto',
        };
        console.log(`  Processing PDF (${pagesPerSheet}-up${pageRange ? ', page range' : ''})...`);
        printPath = await processPDF(filePath, pageRange, settings, job.id);
        filePathsToCleanup.push(printPath);
      }

      // For simple 1-up PDFs, printPath is already the original filePath
    }

    // Print
    if (!print) {
      console.log('  [SIMULATED] Print (pdf-to-printer not available)');
      await apiRequest(config, 'PUT', `/api/agent/jobs/${job.id}/status`, { status: 'COMPLETED' });
      return;
    }

    const options = {
      printer: job.assignedPrinter,
      silent: true,
    };

    if (job.copies && job.copies > 1) options.copies = job.copies;
    if (job.printStyle === 'duplex') {
      options.side = job.flipDirection === 'short-edge' ? 'duplexshort' : 'duplex';
    } else {
      options.side = 'simplex';
    }
    // Do NOT force paperSize — the generated contact-sheet PDF already has
    // the correct page dimensions (landscape A4 for portrait photos, etc.).
    // Let the PDF's native page dimensions drive the printer — no conflicting
    // paper/orientation overrides that Canon and other drivers may ignore.
    if (job.colorMode === 'bw') options.monochrome = true;

    console.log(`  Printer: ${job.assignedPrinter || 'default'}`);
    console.log(`  Settings: ${options.side}, ${options.copies || 1} copy`);

    await print.print(printPath, options);
    console.log('  Print sent successfully!');

    await apiRequest(config, 'PUT', `/api/agent/jobs/${job.id}/status`, { status: 'COMPLETED' });

  } catch (e) {
    console.error('  Job failed:', e.message);
    await apiRequest(config, 'PUT', `/api/agent/jobs/${job.id}/status`, { status: 'FAILED', message: e.message });
  } finally {
    // Cleanup
    for (const p of filePathsToCleanup) {
      try { fs.unlinkSync(p); } catch {}
    }
  }
}

async function setup() {
  console.log('=== Patel AutoPrint Agent Setup ===\n');

  const config = loadConfig() || {};

  config.serverUrl = await ask(`Server URL [${config.serverUrl || 'http://localhost:5000'}]: `) || config.serverUrl || 'http://localhost:5000';
  config.email = await ask(`Email [${config.email || ''}]: `) || config.email;
  config.password = await ask(`Password: `) || config.password;

  saveConfig(config);
  console.log('\nConfig saved. Testing login...');

  try {
    await login(config);
    console.log('\nSetup complete! Run "node index.js" to start the agent.');
  } catch (e) {
    console.error('Setup failed:', e.message);
  }
}

// Simple concurrency limiter
async function runWithConcurrency(tasks, limit) {
  const queue = [...tasks];
  const running = new Set();
  
  while (queue.length > 0 || running.size > 0) {
    while (queue.length > 0 && running.size < limit) {
      const task = queue.shift();
      const promise = task().then(() => running.delete(promise));
      running.add(promise);
    }
    if (running.size > 0) {
      await Promise.race(running);
    }
  }
}

async function main() {
  if (process.argv.includes('--setup')) {
    await setup();
    return;
  }

  const config = loadConfig();
  if (!config || !config.serverUrl || !config.email || !config.password) {
    console.log('No config found. Running setup...\n');
    await setup();
    return;
  }

  console.log('=== Patel AutoPrint Agent ===');
  console.log(`Server: ${config.serverUrl}`);
  console.log(`Email: ${config.email}`);
  console.log(`Polling every ${POLL_INTERVAL / 1000}s (max ${MAX_CONCURRENT_JOBS} concurrent)...\n`);

  // Login
  try {
    await login(config);
  } catch (e) {
    console.error('Login failed:', e.message);
    console.log('Run "node index.js --setup" to reconfigure.');
    return;
  }

  // Poll loop
  console.log('Waiting for print jobs...\n');
  while (true) {
    const jobs = await pollJobs(config);
    if (jobs.length > 0) {
      await runWithConcurrency(
        jobs.map((job) => () => processJob(config, job)),
        MAX_CONCURRENT_JOBS
      );
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
