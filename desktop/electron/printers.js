const { execFile } = require('child_process');

function listSystemPrinters() {
  return new Promise((resolve) => {
    const script =
      'Get-CimInstance Win32_Printer | Select-Object Name, DriverName, PortName, PrinterStatus, Default | ConvertTo-Json -Compress';

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 20000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error || !stdout) {
          resolve([]);
          return;
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          const list = Array.isArray(parsed) ? parsed : [parsed];
          resolve(
            list
              .map(normalizePrinter)
              .filter((p) => p && !p.virtual)
          );
        } catch {
          resolve([]);
        }
      }
    );
  });
}

function normalizePrinter(p) {
  const name = String(p.Name || '');
  const driver = String(p.DriverName || '');
  const port = String(p.PortName || '');
  const statusRaw = Number(p.PrinterStatus);

  let status = 'UNKNOWN';
  if (statusRaw === 3) status = 'ONLINE';
  else if (statusRaw === 4) status = 'PRINTING';
  else if (statusRaw === 7) status = 'OFFLINE';

  return {
    name,
    driverName: driver,
    portName: port,
    status,
    isDefault: !!p.Default,
    virtual: isVirtualPrinter(name, driver, port),
  };
}

function isVirtualPrinter(name, driver, port) {
  const combined = `${name} ${driver} ${port}`.toLowerCase();
  const virtualPatterns = [
    'onenote',
    'fax',
    'adobe pdf',
    'print to pdf',
    'xps document writer',
  ];
  if (virtualPatterns.some((v) => combined.includes(v))) return true;
  if (port.toLowerCase() === 'portprompt:') return true;
  if (port.toLowerCase() === 'shrfax:') return true;
  if (port.toLowerCase() === 'nul:') return true;
  return false;
}

module.exports = { listSystemPrinters };
