const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const POLL_INTERVAL = 5000;
const CONVERT_SCRIPT = path.join(__dirname, 'convert-office-to-pdf.ps1');

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
  const client = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (config.token) {
      options.headers['Authorization'] = `Bearer ${config.token}`;
    }

    const req = client.request(options, (res) => {
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
  const client = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {},
    };

    if (config.token) {
      options.headers['Authorization'] = `Bearer ${config.token}`;
    }

    const req = client.request(options, (res) => {
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

  const rawPath = path.join(printDir, `${job.id}.download`);

  console.log(`\n[${new Date().toLocaleTimeString()}] Processing: ${job.file?.originalName || job.id}`);
  console.log(`  Order #${job.order?.token || 'N/A'} | ${job.pagesPerSheet}-up | ${job.printStyle} | ${job.copies} copy(ies) | Printer: ${job.assignedPrinter || 'default'}`);

  // Download the print-ready file
  try {
    await downloadFile(config, `/api/agent/jobs/${job.id}/file`, rawPath);
    console.log('  Downloaded.');
  } catch (e) {
    console.error('  Download failed:', e.message);
    await apiRequest(config, 'PUT', `/api/agent/jobs/${job.id}/status`, { status: 'FAILED', message: e.message });
    return;
  }

  // Sniff the real file type (a contact-sheet job's fileType is jpeg but the
  // served file is a PDF, and office files come through as originals).
  const { type, ext } = classifyFile(rawPath);
  const filePath = path.join(printDir, `${job.id}.${ext}`);
  if (filePath !== rawPath) {
    try { fs.renameSync(rawPath, filePath); } catch { fs.copyFileSync(rawPath, filePath); fs.unlinkSync(rawPath); }
  }

  // Office files are served as originals (server can't convert on Linux);
  // convert to PDF locally so the print job prints correctly.
  let printPath = filePath;
  if (type === 'office') {
    try {
      const pdfPath = path.join(printDir, `${job.id}.pdf`);
      console.log('  Converting office file to PDF...');
      await convertOfficeToPdf(filePath, pdfPath);
      printPath = pdfPath;
      console.log('  Converted to PDF.');
    } catch (e) {
      console.error('  Office conversion failed:', e.message);
      await apiRequest(config, 'PUT', `/api/agent/jobs/${job.id}/status`, { status: 'FAILED', message: e.message });
      return;
    }
  }

  // Print
  if (!print) {
    console.log('  [SIMULATED] Print (pdf-to-printer not available)');
    await apiRequest(config, 'PUT', `/api/agent/jobs/${job.id}/status`, { status: 'COMPLETED' });
    try { fs.unlinkSync(filePath); } catch {}
    return;
  }

  try {
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

    console.log(`  Printer: ${job.assignedPrinter || 'default'}`);
    console.log(`  Settings: ${options.side}, ${options.copies || 1} copy, ${options.paperSize || 'A4'}`);

    await print.print(printPath, options);
    console.log('  Print sent successfully!');

    await apiRequest(config, 'PUT', `/api/agent/jobs/${job.id}/status`, { status: 'COMPLETED' });
  } catch (e) {
    console.error('  Print failed:', e.message);
    await apiRequest(config, 'PUT', `/api/agent/jobs/${job.id}/status`, { status: 'FAILED', message: e.message });
  }

  // Cleanup
  try { fs.unlinkSync(filePath); } catch {}
  if (printPath !== filePath) {
    try { fs.unlinkSync(printPath); } catch {}
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
  console.log(`Polling every ${POLL_INTERVAL / 1000}s...\n`);

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
    for (const job of jobs) {
      await processJob(config, job);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
