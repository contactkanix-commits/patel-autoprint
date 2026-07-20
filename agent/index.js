const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const POLL_INTERVAL = 5000;

let print;
try {
  print = require('pdf-to-printer');
} catch (e) {
  print = null;
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

  const ext = job.file?.fileType === 'pdf' ? '.pdf' : '.pdf';
  const filePath = path.join(printDir, `${job.id}${ext}`);

  console.log(`\n[${new Date().toLocaleTimeString()}] Processing: ${job.file?.originalName || job.id}`);
  console.log(`  Order #${job.order?.token || 'N/A'} | ${job.pagesPerSheet}-up | ${job.printStyle} | ${job.copies} copy(ies) | Printer: ${job.assignedPrinter || 'default'}`);

  // Download the print-ready file
  try {
    await downloadFile(config, `/api/agent/jobs/${job.id}/file`, filePath);
    console.log('  Downloaded.');
  } catch (e) {
    console.error('  Download failed:', e.message);
    await apiRequest(config, 'PUT', `/api/agent/jobs/${job.id}/status`, { status: 'FAILED', message: e.message });
    return;
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

    await print.print(filePath, options);
    console.log('  Print sent successfully!');

    await apiRequest(config, 'PUT', `/api/agent/jobs/${job.id}/status`, { status: 'COMPLETED' });
  } catch (e) {
    console.error('  Print failed:', e.message);
    await apiRequest(config, 'PUT', `/api/agent/jobs/${job.id}/status`, { status: 'FAILED', message: e.message });
  }

  // Cleanup
  try { fs.unlinkSync(filePath); } catch {}
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
