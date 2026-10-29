const { EventEmitter } = require('events');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { app } = require('electron');
const { PDFDocument, pushGraphicsState, popGraphicsState, translate, rotateRadians, moveTo, lineTo, closePath, clip, endPath } = require('pdf-lib');

const POLL_INTERVAL = 2000;
const MAX_CONCURRENT_JOBS = 2;
const MAX_LOG = 300;

// HTTP agents with keep-alive for connection reuse
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });

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
  if ((buf[0] === 0x50 && buf[1] === 0x4B) || (buf[0] === 0xD0 && buf[1] === 0xCF)) return { type: 'office', ext: 'doc' };
  return { type: 'unknown', ext: 'bin' };
}

// The conversion script ships inside app.asar where PowerShell can't read it,
// so in packaged builds we extract it once to a real path under userData.
let CONVERT_SCRIPT = path.join(__dirname, 'convert-office-to-pdf.ps1');

function ensureConverterScript() {
  if (!app.isPackaged || fs.existsSync(CONVERT_SCRIPT)) return CONVERT_SCRIPT;
  try {
    const destDir = app.getPath('userData');
    const dest = path.join(destDir, 'convert-office-to-pdf.ps1');
    const src = path.join(__dirname, 'convert-office-to-pdf.ps1');
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      CONVERT_SCRIPT = dest;
    }
  } catch (err) {
    console.error('[agent] Failed to extract conversion script:', err.message);
  }
  return CONVERT_SCRIPT;
}

// Convert office files (docx/pptx/xlsx) to PDF using Office COM automation
function convertOfficeToPdf(inputPath, outputPdf) {
  return new Promise((resolve, reject) => {
    const args = [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', ensureConverterScript(),
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

function paperDims(paperSize, orientation = 'auto') {
  const dims = (() => {
    switch (paperSize) {
      case 'A3': return { w: 841.89, h: 1190.55 };
      case 'Letter': return { w: 612, h: 792 };
      case 'Legal': return { w: 612, h: 1008 };
      default: return { w: 595.28, h: 841.89 };
    }
  })();
  if (orientation === 'landscape') return { w: dims.h, h: dims.w };
  return dims;
}

function sourceOrientation(pdfDoc) {
  const first = pdfDoc.getPage(0);
  return first.getWidth() > first.getHeight() ? 'landscape' : 'portrait';
}

async function embedImage(doc, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const data = await fsPromises.readFile(filePath);
  if (ext === '.jpg' || ext === '.jpeg') return doc.embedJpg(data);
  if (ext === '.png') return doc.embedPng(data);
  throw new Error(`Unsupported image type: ${ext} (webp is converted to png server-side)`);
}

async function createContactSheet(imageFiles, nUp, paperSize, jobId, orientation = 'auto', photoFit = 'fit') {
  const n = nUp || 1;
  const newDoc = await PDFDocument.create();
  const baseDims = paperDims(paperSize, 'portrait');
  const margin = 2;

  if (n === 1) {
    for (const f of imageFiles) {
      let embedded = null;
      try { embedded = await embedImage(newDoc, f.path); } catch (err) {
        console.error(`Failed to embed image ${f.path}:`, err.message);
      }
      const ew = embedded?.width || baseDims.w;
      const eh = embedded?.height || baseDims.h;
      const landscapeImg = ew > eh;
      const pageW = landscapeImg ? baseDims.h : baseDims.w;
      const pageH = landscapeImg ? baseDims.w : baseDims.h;
      const page = newDoc.addPage([pageW, pageH]);
      if (embedded) {
        // Strict No-Crop Scaling: Math.min only — no cropping, no stretching
        const scale = Math.min((pageW - margin * 2) / embedded.width, (pageH - margin * 2) / embedded.height);
        const drawW = embedded.width * scale;
        const drawH = embedded.height * scale;
        page.drawImage(embedded, { x: (pageW - drawW) / 2, y: (pageH - drawH) / 2, width: drawW, height: drawH });
      }
    }
  } else {
    // ============================================
    // 1. LAYOUT PARTITIONING (Chrome Style)
    // Grid dimensions determined by FIRST image aspect ratio
    // ============================================
    const baseDims = paperDims(paperSize, 'portrait');

    // Embed first image to determine its aspect ratio for partitioning
    let firstEmbedded = null;
    try {
      firstEmbedded = await embedImage(newDoc, imageFiles[0].path);
    } catch (err) {
      console.error(`Failed to embed first image ${imageFiles[0].path}:`, err.message);
    }
    const firstIsLandscape = firstEmbedded ? firstEmbedded.width > firstEmbedded.height : false;

    let cols, rows;
    if (n === 2) {
      if (firstIsLandscape) {
        // Landscape first image: partition vertically — 1 column, 2 rows (stacked above/below)
        cols = 1; rows = 2;
      } else {
        // Portrait first image: partition horizontally — 2 columns, 1 row (side by side)
        cols = 2; rows = 1;
      }
    } else if (n === 3 || n === 4) {
      // Balanced geometric grid matrix: 2x2
      cols = 2; rows = 2;
    } else {
      // Fallback for other nUp values
      cols = Math.ceil(Math.sqrt(n));
      rows = Math.ceil(n / cols);
    }

    // Sheet orientation follows grid shape (more columns = landscape sheet)
    const sheetLandscape = cols > rows;
    const sheetW = sheetLandscape ? baseDims.h : baseDims.w;
    const sheetH = sheetLandscape ? baseDims.w : baseDims.h;

    const margin = 0;

    // ============================================
    // N-UP GRID RENDERING (separated from grid math)
    // ============================================
    for (let i = 0; i < imageFiles.length; i += n) {
      const chunk = imageFiles.slice(i, i + n);
      const page = newDoc.addPage([sheetW, sheetH]);
      const cellW = sheetW / cols;
      const cellH = sheetH / rows;
      const boxW = cellW - margin * 2;
      const boxH = cellH - margin * 2;

      for (let j = 0; j < chunk.length; j++) {
        const col = j % cols;
        const rowFromTop = Math.floor(j / cols);
        const cellCenterX = col * cellW + cellW / 2;
        const cellCenterY = sheetH - (rowFromTop + 1) * cellH + cellH / 2;

        let embedded = null;
        try {
          embedded = await embedImage(newDoc, chunk[j].path);
        } catch (err) {
          console.error(`Failed to embed image ${chunk[j].path}:`, err.message);
        }
        if (!embedded) continue;

        let imgW = embedded.width;
        let imgH = embedded.height;

        // Grid slot orientation
        const slotIsLandscape = boxW > boxH;
        const imgIsLandscape = imgW > imgH;

        let rotateRad = 0;

        // Automated Smart Rotation:
        // If image orientation doesn't match grid slot orientation,
        // rotate 90° internally so it utilizes the slot perfectly without truncation.
        if (slotIsLandscape !== imgIsLandscape) {
          rotateRad = Math.PI / 2;
          // Swap width/height variables immediately after rotation
          const temp = imgW;
          imgW = imgH;
          imgH = temp;
        }

        // Strict No-Crop Scaling: Math.min only — forbidden to use Math.max or stretch
        const scaleW = boxW / imgW;
        const scaleH = boxH / imgH;
        const scale = Math.min(scaleW, scaleH);

        const drawW = imgW * scale;
        const drawH = imgH * scale;

        // Clean canvas coordinate manipulation: translate + rotate around center
        page.pushOperators(pushGraphicsState());
        if (rotateRad !== 0) {
          page.pushOperators(
            translate(cellCenterX, cellCenterY),
            rotateRadians(rotateRad),
            translate(-drawW / 2, -drawH / 2)
          );
          page.drawImage(embedded, { x: 0, y: 0, width: drawW, height: drawH });
        } else {
          page.drawImage(embedded, {
            x: cellCenterX - drawW / 2,
            y: cellCenterY - drawH / 2,
            width: drawW,
            height: drawH,
          });
        }
        page.pushOperators(popGraphicsState());
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

async function applyNUp(pdfDoc, pages, nUp, paperSize) {
  const newDoc = await PDFDocument.create();
  const srcOrient = sourceOrientation(pdfDoc);
  const dims = paperDims(paperSize || 'A4');

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
      for (let i = start; i <= Math.min(end, totalPages); i++) pages.push(i - 1);
    } else {
      const pageNum = parseInt(trimmed);
      if (pageNum >= 1 && pageNum <= totalPages) pages.push(pageNum - 1);
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
  if (isAllPages && pagesPerSheet <= 1) return filePath;

  let processedDoc;
  if (pagesPerSheet > 1) {
    processedDoc = await applyNUp(pdfDoc, pages, pagesPerSheet, settings.paperSize);
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

class PrintAgent extends EventEmitter {
  constructor() {
    super();
    this.running = false;
    this.polling = false;
    this.pollTimer = null;
    this.credentials = null;
    this.cacheDir = null;
    this.print = null;
    try {
      this.print = require('pdf-to-printer');
    } catch {
      this.print = null;
    }
    this.state = {
      status: 'stopped',
      lastPoll: null,
      lastError: null,
      processed: 0,
      completed: 0,
      failed: 0,
      current: null,
    };
    this.logEntries = [];
  }

  log(level, msg) {
    const entry = { ts: Date.now(), level, msg };
    this.logEntries.push(entry);
    if (this.logEntries.length > MAX_LOG) {
      this.logEntries.splice(0, this.logEntries.length - MAX_LOG);
    }
    this.emit('status', this.snapshot());
  }

  snapshot() {
    return { ...this.state, log: this.logEntries.slice(-100) };
  }

  configure(apiUrl, token) {
    if (apiUrl) {
      this.credentials = { apiUrl: String(apiUrl).replace(/\/+$/, ''), token };
    } else {
      this.credentials = null;
    }
  }

  ensureCacheDir() {
    if (!this.cacheDir) {
      this.cacheDir = path.join(app.getPath('userData'), 'print-cache');
    }
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }
apiRequest(method, urlPath, body, { binary = false } = {}) {
    const url = new URL(urlPath, this.credentials.apiUrl);
    const isHttps = url.protocol === 'https:';

    return new Promise((resolve, reject) => {
      const headers = { 'Content-Type': 'application/json' };
      if (this.credentials.token) {
        headers.Authorization = `Bearer ${this.credentials.token}`;
      }

      const req = (isHttps ? https : http).request(
        {
          method,
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          headers,
          agent: isHttps ? httpsAgent : httpAgent,
        },
        (res) => {
          if (binary) {
            if (res.statusCode !== 200) {
              let data = '';
              res.on('data', (c) => (data += c));
              res.on('end', () =>
                reject(new Error(`Download failed (${res.statusCode}) ${data}`))
              );
              return;
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            return;
          }

          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            let parsed;
            try {
              parsed = JSON.parse(data);
            } catch {
              parsed = { success: false, message: data };
            }

            if (res.statusCode >= 400) {
              const err = new Error(parsed.message || `HTTP ${res.statusCode}`);
              err.status = res.statusCode;
              reject(err);
              return;
            }
            resolve(parsed);
          });
        }
      );

      req.on('error', reject);
      req.setTimeout(60000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async downloadFile(jobId, destPath) {
    const buffer = await this.apiRequest('GET', `/api/agent/jobs/${jobId}/file`, null, {
      binary: true,
    });
    fs.writeFileSync(destPath, buffer);
  }

  async downloadOriginalFile(fileId, destPath) {
    const buffer = await this.apiRequest('GET', `/api/agent/files/${fileId}/original`, null, {
      binary: true,
    });
    fs.writeFileSync(destPath, buffer);
  }

  async reportStatus(jobId, status, message) {
    try {
      await this.apiRequest('PUT', `/api/agent/jobs/${jobId}/status`, { status, message });
    } catch (e) {
      this.log('error', `Failed to report job status: ${e.message}`);
    }
  }

  // Simple concurrency limiter
  async runWithConcurrency(tasks, limit) {
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

  async pollOnce() {
    if (!this.credentials) return;
    if (this.polling) return;
    this.polling = true;

    try {
      const result = await this.apiRequest('GET', '/api/agent/jobs');
      this.state.lastPoll = new Date().toISOString();
      if (!result.success) throw new Error(result.message || 'Poll failed');

      const jobs = result.data || [];
      if (jobs.length > 0) {
        await this.runWithConcurrency(
          jobs.map((job) => () => this.processJob(job)),
          MAX_CONCURRENT_JOBS
        );
      }
    } catch (e) {
      this.state.lastError = e.message;
      this.log('error', `Poll error: ${e.message}`);
      if (e.status === 401) {
        this.emit('auth-expired');
      }
    } finally {
      this.polling = false;
      this.emit('status', this.snapshot());
    }
  }

  async processJob(job) {
    this.state.current = job.id;
    this.state.processed += 1;
    this.log(
      'info',
      `Processing job ${job.id} (Order #${job.order?.token || 'N/A'} | ${job.pagesPerSheet || 1}-up | ${job.copies || 1} copy | printer ${job.assignedPrinter || 'default'})`
    );
    this.emit('status', this.snapshot());

    this.ensureCacheDir();
    const cleanupPaths = [];

    try {
      // Detect contact sheet jobs: pages is a JSON array of string file IDs
      let parsedPages = null;
      try { parsedPages = JSON.parse(job.pages); } catch { parsedPages = null; }
      const isContactSheet = Array.isArray(parsedPages) && parsedPages.length > 0 && typeof parsedPages[0] === 'string';

      let printPath;

      if (isContactSheet) {
        // CONTACT SHEET: Download all original images and generate locally
        this.log('info', `Generating contact sheet (${parsedPages.length} images, ${job.pagesPerSheet || 1}-up)...`);
        const imageFiles = [];
        for (const fileId of parsedPages) {
          const destPath = path.join(this.cacheDir, `${fileId}.download`);
          try {
            await this.downloadOriginalFile(fileId, destPath);
            const { ext } = classifyFile(destPath);
            const finalPath = path.join(this.cacheDir, `${fileId}.${ext}`);
            if (finalPath !== destPath) {
              try { fs.renameSync(destPath, finalPath); } catch { fs.copyFileSync(destPath, finalPath); fs.unlinkSync(destPath); }
            }
            imageFiles.push({ path: finalPath, id: fileId });
            cleanupPaths.push(finalPath);
          } catch (e) {
            this.log('error', `Failed to download image ${fileId}: ${e.message}`);
          }
        }

        if (imageFiles.length === 0) throw new Error('No images downloaded for contact sheet');

        const contactSheetPath = await createContactSheet(
          imageFiles,
          job.pagesPerSheet || 1,
          job.paperSize || 'A4',
          job.id,
          job.orientation || 'auto',
          job.photoFit || 'fit'
        );
        printPath = contactSheetPath;
        cleanupPaths.push(contactSheetPath);
        this.log('info', `Contact sheet generated: ${path.basename(contactSheetPath)}`);

      } else {
        // PDF/office JOB: Download original file
        const fileId = job.file?.id;
        if (!fileId) throw new Error('No file ID in job');

        const rawPath = path.join(this.cacheDir, `${job.id}.download`);
        try {
          await this.downloadOriginalFile(fileId, rawPath);
          this.log('info', `Downloaded original file for job ${job.id}`);
        } catch (e) {
          // Fallback: try print-ready endpoint
          this.log('warn', `Original download failed, trying print-ready: ${e.message}`);
          await this.downloadFile(job.id, rawPath);
        }

        const { type, ext } = classifyFile(rawPath);
        const filePath = path.join(this.cacheDir, `${job.id}.${ext}`);
        if (filePath !== rawPath) {
          try { fs.renameSync(rawPath, filePath); } catch { fs.copyFileSync(rawPath, filePath); fs.unlinkSync(rawPath); }
        }
        cleanupPaths.push(filePath);
        printPath = filePath;

        // Office files: convert to PDF
        if (type === 'office') {
          const pdfPath = path.join(this.cacheDir, `${job.id}.pdf`);
          this.log('info', `Converting office file to PDF for job ${job.id}`);
          await convertOfficeToPdf(filePath, pdfPath);
          printPath = pdfPath;
          cleanupPaths.push(pdfPath);
          this.log('info', `Converted to PDF for job ${job.id}`);
        }

        // PDF processing: n-up or page range extraction
        const pagesPerSheet = job.pagesPerSheet || 1;
        let pdfPageRange = null;
        try { pdfPageRange = JSON.parse(job.pages); } catch { pdfPageRange = null; }
        const pageRange = Array.isArray(pdfPageRange) && pdfPageRange.length > 0 && typeof pdfPageRange[0] === 'number' ? pdfPageRange : null;

        const needsProcessing = pagesPerSheet > 1 || (pageRange && pageRange.length > 0);
        if (needsProcessing && type === 'pdf') {
          const settings = {
            pagesPerSheet: job.pagesPerSheet || 1,
            paperSize: job.paperSize || 'A4',
          };
          this.log('info', `Processing PDF (${pagesPerSheet}-up${pageRange ? ', page range' : ''})...`);
          printPath = await processPDF(filePath, pageRange, settings, job.id);
          cleanupPaths.push(printPath);
        }
      }

      if (!this.print) {
        this.log('warn', `[SIMULATED] Printing job ${job.id} (pdf-to-printer unavailable)`);
        await this.reportStatus(job.id, 'COMPLETED');
        this.state.completed += 1;
        this.state.current = null;
        this.emit('status', this.snapshot());
        return;
      }

      const options = { printer: job.assignedPrinter, silent: true };
      if (job.copies && job.copies > 1) options.copies = job.copies;
      if (job.printStyle === 'duplex') {
        options.side = job.flipDirection === 'short-edge' ? 'duplexshort' : 'duplex';
      } else {
        options.side = 'simplex';
      }
      if (job.paperSize) options.paperSize = job.paperSize;
      // Always announce the generated PDF's orientation to the printer: with
      // "auto" the driver otherwise prints landscape sheets rotated/shrunk
      // onto portrait paper (looks portrait with cut-off images).
      try {
        const pdoc = await PDFDocument.load(await fsPromises.readFile(printPath));
        const pg = pdoc.getPage(0);
        options.orientation = pg.getWidth() > pg.getHeight() ? 'landscape' : 'portrait';
      } catch {
        if (job.orientation && job.orientation !== 'auto') options.orientation = job.orientation;
      }
      if (job.colorMode === 'bw') options.monochrome = true;

      this.log(
        'info',
        `Sending to printer (${options.side}, ${options.copies || 1} copy, ${options.paperSize || 'A4'}, ${options.orientation || 'auto'})`
      );
      await this.print.print(printPath, options);
      this.log('info', `Print sent for job ${job.id}`);
      await this.reportStatus(job.id, 'COMPLETED');
      this.state.completed += 1;
    } catch (e) {
      this.state.failed += 1;
      this.log('error', `Job ${job.id} failed: ${e.message}`);
      await this.reportStatus(job.id, 'FAILED', e.message);
    } finally {
      this.state.current = null;
      for (const p of cleanupPaths) {
        try { fs.unlinkSync(p); } catch {}
      }
      this.emit('status', this.snapshot());
    }
  }

  start() {
    if (!this.credentials) {
      this.log('warn', 'Cannot start agent: not configured');
      return;
    }
    if (this.running) return;
    this.running = true;
    this.state.status = 'running';
    this.log('info', `Agent started (polling every ${POLL_INTERVAL / 1000}s, max ${MAX_CONCURRENT_JOBS} concurrent)`);
    this.pollOnce();
    this.pollTimer = setInterval(() => this.pollOnce(), POLL_INTERVAL);
    this.emit('status', this.snapshot());
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.state.status = 'stopped';
    this.log('info', 'Agent stopped');
    this.emit('status', this.snapshot());
  }
}

module.exports = { PrintAgent, POLL_INTERVAL, MAX_CONCURRENT_JOBS };
