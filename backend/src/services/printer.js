const { exec } = require('child_process');
const os = require('os');

let discoveredPrinters = [];
let lastDiscovery = 0;
const DISCOVERY_CACHE_MS = 30000;
let bwRouteIndex = 0;
let colorRouteIndex = 0;

async function discoverPrinters() {
  const now = Date.now();
  if (now - lastDiscovery < DISCOVERY_CACHE_MS && discoveredPrinters.length > 0) {
    return discoveredPrinters;
  }

  const platform = os.platform();

  try {
    let printers = [];
    if (platform === 'win32') {
      printers = await discoverWindowsPrinters();
    } else if (platform === 'linux') {
      printers = await discoverLinuxPrinters();
    } else if (platform === 'darwin') {
      printers = await discoverMacPrinters();
    }
    discoveredPrinters = printers;
    lastDiscovery = now;
    return printers;
  } catch (err) {
    console.error('Printer discovery error:', err.message);
    return discoveredPrinters;
  }
}

function execCommand(command, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    exec(command, { encoding: 'utf-8', shell: 'powershell', timeout: timeoutMs }, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

async function discoverWindowsPrinters() {
  try {
    const output = await execCommand('Get-Printer | ConvertTo-Json');
    const printers = JSON.parse(output);
    const printerList = Array.isArray(printers) ? printers : [printers];

    return printerList
      .filter(p => p.Type !== 'Local' || p.Shared)
      .map(p => ({
        name: p.Name,
        ip: p.PortName || '',
        colorSupport: p.ColorSupported || false,
        duplexSupport: true,
        paperSizes: ['A4'],
        status: p.PrinterStatus === 0 ? 'ONLINE' : 'OFFLINE',
      }));
  } catch (err) {
    console.error('Windows printer discovery failed:', err.message);
    return [];
  }
}

async function discoverLinuxPrinters() {
  try {
    const output = await execCommand('lpstat -p 2>/dev/null || echo ""');
    const lines = output.trim().split('\n').filter(l => l.startsWith('printer'));
    return lines.map(line => {
      const match = line.match(/printer (\S+) is/);
      if (!match) return null;
      return {
        name: match[1],
        ip: '',
        colorSupport: false,
        duplexSupport: true,
        paperSizes: ['A4'],
        status: line.includes('idle') ? 'ONLINE' : 'OFFLINE',
      };
    }).filter(Boolean);
  } catch (err) {
    console.error('Linux printer discovery failed:', err.message);
    return [];
  }
}

async function discoverMacPrinters() {
  try {
    const output = await execCommand('lpstat -p 2>/dev/null || echo ""');
    const lines = output.trim().split('\n').filter(l => l.startsWith('printer'));
    return lines.map(line => {
      const match = line.match(/printer (\S+) is/);
      if (!match) return null;
      return {
        name: match[1],
        ip: '',
        colorSupport: false,
        duplexSupport: true,
        paperSizes: ['A4'],
        status: line.includes('idle') ? 'ONLINE' : 'OFFLINE',
      };
    }).filter(Boolean);
  } catch (err) {
    console.error('Mac printer discovery failed:', err.message);
    return [];
  }
}

function routeJob(job, printers, modePrinterCache) {
  if (!printers || printers.length === 0) {
    return { ...job, assignedPrinter: null };
  }

  const mode = job.colorMode === 'color' ? 'color' : 'bw';

  // If this order already picked a printer for this color mode, reuse it
  // so all sections of the same mode print on the same machine (in sequence).
  if (modePrinterCache && modePrinterCache[mode]) {
    return { ...job, assignedPrinter: modePrinterCache[mode] };
  }

  const picked = routeJobForMode(mode, printers);

  if (modePrinterCache) {
    modePrinterCache[mode] = picked;
  }

  return { ...job, assignedPrinter: picked };
}

function routeJobForMode(mode, printers) {
  const isBw = mode === 'bw';
  let candidates = printers.filter(p => (isBw ? !p.colorSupport : p.colorSupport) && p.status === 'ONLINE');

  if (candidates.length === 0) {
    candidates = printers.filter(p => p.status === 'ONLINE');
  }
  if (candidates.length === 0) {
    candidates = printers;
  }

  // Round-robin per color mode across machines so load is balanced,
  // but a single order still uses one machine per mode.
  const idx = isBw ? bwRouteIndex : colorRouteIndex;
  const selectedPrinter = candidates[idx % candidates.length];
  if (isBw) bwRouteIndex++; else colorRouteIndex++;

  return selectedPrinter ? selectedPrinter.name : null;
}

module.exports = { discoverPrinters, routeJob, routeJobForMode };
