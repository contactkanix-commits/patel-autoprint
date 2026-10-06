const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { PDFDocument } = require('pdf-lib');

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

}
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
  const sharp = require('sharp');
  const ext = path.extname(filePath).toLowerCase();
  const data = await fsPromises.readFile(filePath);
  if (ext === '.jpg' || ext === '.jpeg') return doc.embedJpg(data);
  if (ext === '.png') return doc.embedPng(data);
  if (ext === '.webp') {
    const png = await sharp(data).png().toBuffer();
    return doc.embedPng(png);
  }
  throw new Error(`Unsupported image type: ${ext}`);
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

function sourceOrientation(pdfDoc) {
  const first = pdfDoc.getPage(0);
  return first.getWidth() > first.getHeight() ? 'landscape' : 'portrait';
}

async function createContactSheet(imageFiles, nUp, paperSize, jobId, orientation = 'auto') {
  const n = nUp || 1;
  const newDoc = await PDFDocument.create();
  const baseDims = paperDims(paperSize, 'portrait');
  const margin = 6;

  if (n === 1) {
    for (const f of imageFiles) {
      let embedded = null;
      try {
        embedded = await embedImage(newDoc, f.path);
      } catch (err) {
        console.error(`Failed to embed image ${f.path}:`, err.message);
      }
      const ew = embedded?.width || baseDims.w;
      const eh = embedded?.height || baseDims.h;
      const landscapeImg = ew > eh;
      const pageW = landscapeImg ? baseDims.h : baseDims.w;
      const pageH = landscapeImg ? baseDims.w : baseDims.h;
      const page = newDoc.addPage([pageW, pageH]);
      if (embedded) {
        const scale = Math.min((pageW - margin * 2) / embedded.width, (pageH - margin * 2) / embedded.height);
        const drawW = embedded.width * scale;
        const drawH = embedded.height * scale;
        page.drawImage(embedded, { x: (pageW - drawW) / 2, y: (pageH - drawH) / 2, width: drawW, height: drawH });
      }
    }
  } else {
    const { cols, rows } = imageGrid(n);
    const dims = paperDims(paperSize, orientation);
    for (let i = 0; i < imageFiles.length; i += n) {
      const chunk = imageFiles.slice(i, i + n);
      const page = newDoc.addPage([dims.w, dims.h]);
      const cellW = dims.w / cols;
      const cellH = dims.h / rows;

      for (let j = 0; j < chunk.length; j++) {
        const col = j % cols;
        const rowFromTop = Math.floor(j / cols);
        try {
          const embedded = await embedImage(newDoc, chunk[j].path);
          const imgW = embedded.width || cellW;
          const imgH = embedded.height || cellH;
          const scale = Math.min((cellW - margin * 2) / imgW, (cellH - margin * 2) / imgH);
          const drawW = imgW * scale;
          const drawH = imgH * scale;
          const x = col * cellW + (cellW - drawW) / 2;
          const y = dims.h - (rowFromTop + 1) * cellH + (cellH - drawH) / 2;
          page.drawImage(embedded, { x, y, width: drawW, height: drawH });
        } catch (err) {
          console.error(`Failed to embed image ${chunk[j].path}:`, err.message);
        }
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

function sourceOrientation(pdfDoc) {
  const first = pdfDoc.getPage(0);
  return first.getWidth() > first.getHeight() ? 'landscape' : 'portrait';
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
  const pages = pageRange || null;

  const pdfBuffer = await fsPromises.readFile(filePath);
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();

  const pages = pageRange || Array.from({ length: pdfDoc.getPageCount() }, (_, i) => i);

  const isAllPages = pages.length === pdfDoc.getPageCount() && pages.every((p, i) => p === i);

  if (isAllPages && pagesPerSheet <= 1) {
    return filePath;
  }

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
        job.orientation || 'auto'
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
    if (job.paperSize) options.paperSize = job.paperSize;
    if (job.orientation && job.orientation !== 'auto') options.orientation = job.orientation;
    if (job.colorMode === 'bw') options.monochrome = true;

    console.log(`  Printer: ${job.assignedPrinter || 'default'}`);
    console.log(`  Settings: ${options.side}, ${options.copies || 1} copy, ${options.paperSize || 'A4'}, ${options.orientation || 'auto'}`);

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
