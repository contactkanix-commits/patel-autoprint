const { app, BrowserWindow, shell, session, ipcMain, Tray, Menu, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { PrintAgent } = require('./agent');
const { WhatsAppClient } = require('./whatsapp');
const { listSystemPrinters } = require('./printers');

const isDev = !app.isPackaged;

// Only one instance may run at a time. Without this, closing the window hides
// to tray and launching the app again spawns another process. Multiple live
// processes break the auto-updater, because NSIS refuses to install while any
// Patel AutoPrint Admin process is still running ("cannot be closed").
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

let mainWindow = null;
let tray = null;
let isQuitting = false;

const agent = new PrintAgent();
const whatsapp = new WhatsAppClient();

let lastUpdateStatus = null;

function sendUpdateStatus(status) {
  lastUpdateStatus = status;
  const win = mainWindow;
  if (win && !win.isDestroyed()) {
    win.webContents.send('app:update-status', status);
  }
}

function setupAutoUpdater() {
  if (isDev) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => sendUpdateStatus({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => sendUpdateStatus({ state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => sendUpdateStatus({ state: 'up-to-date' }));
  autoUpdater.on('download-progress', (p) => sendUpdateStatus({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => sendUpdateStatus({ state: 'downloaded', version: info.version }));
  autoUpdater.on('error', (err) => {
    console.error('[auto-update]', err?.message || err);
    sendUpdateStatus({ state: 'error', message: err?.message || 'Update check failed' });
  });

  // Check shortly after launch, then periodically while the app runs.
  setTimeout(() => autoUpdater.checkForUpdates(), 15000);
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);
}

function credsFile() {
  return path.join(app.getPath('userData'), 'agent-credentials.json');
}

function loadCredentials() {
  try {
    const p = credsFile();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {}
  return null;
}

function saveCredentials(apiUrl, token) {
  try {
    fs.writeFileSync(credsFile(), JSON.stringify({ apiUrl, token }, null, 2));
  } catch {}
}

function clearCredentials() {
  try {
    if (fs.existsSync(credsFile())) fs.unlinkSync(credsFile());
  } catch {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: true,
    title: 'Patel AutoPrint Admin',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Close to tray: keep the agent running in the background.
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, '../resources/tray.png');
    let icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      // Fall back to the app's own executable icon so the tray still works
      // even if tray.png is missing from the build.
      icon = nativeImage.createFromPath(process.execPath);
    }
    if (icon.isEmpty()) return; // No usable icon — skip tray, window still works
    tray = new Tray(icon.resize({ width: 16, height: 16 }));

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show Patel AutoPrint Admin', click: () => mainWindow?.show() },
      {
        label: 'Agent: ' + (agent.running ? 'Running' : 'Stopped'),
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Start Agent',
        click: () => agent.start(),
      },
      {
        label: 'Stop Agent',
        click: () => agent.stop(),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setToolTip('Patel AutoPrint Admin');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => mainWindow?.show());

    agent.on('status', () => {
      tray?.setToolTip(`Patel AutoPrint Admin - Agent ${agent.running ? 'Running' : 'Stopped'}`);
    });
  } catch (err) {
    console.error('[tray] failed to create:', err?.message || err);
  }
}

function broadcastAgentStatus() {
  const win = mainWindow;
  if (win && !win.isDestroyed()) {
    win.webContents.send('agent:status', agent.snapshot());
  }
}

function broadcastWhatsAppStatus() {
  const win = mainWindow;
  if (win && !win.isDestroyed()) {
    win.webContents.send('whatsapp:status', whatsapp.getStatus());
  }
}

function startWhatsAppWithCreds() {
  const creds = loadCredentials();
  if (creds && creds.apiUrl && creds.token) {
    whatsapp.start({ apiUrl: creds.apiUrl, token: creds.token }).catch((err) => {
      console.error('[whatsapp] start failed:', err?.message || err);
    });
  }
}

function registerIpc() {
  ipcMain.handle('agent:set-credentials', (_e, { apiUrl, token }) => {
    if (!apiUrl || !token) return { success: false, message: 'Missing credentials' };
    agent.configure(apiUrl, token);
    saveCredentials(apiUrl, token);
    agent.start();
    startWhatsAppWithCreds();
    return { success: true };
  });

  ipcMain.handle('agent:clear-credentials', () => {
    agent.stop();
    agent.configure(null, null);
    whatsapp.stop();
    clearCredentials();
    return { success: true };
  });

  ipcMain.handle('agent:start', () => {
    agent.start();
    return { success: true };
  });

  ipcMain.handle('agent:stop', () => {
    agent.stop();
    return { success: true };
  });

  ipcMain.handle('agent:get-status', () => agent.snapshot());

  ipcMain.handle('agent:get-credentials', () => {
    const creds = loadCredentials();
    return creds ? { apiUrl: creds.apiUrl, token: creds.token } : null;
  });

  ipcMain.handle('printers:list-system', () => listSystemPrinters());

  ipcMain.handle('whatsapp:get-status', () => whatsapp.getStatus());

  ipcMain.handle('whatsapp:start', () => {
    const creds = loadCredentials();
    if (!creds || !creds.apiUrl || !creds.token) {
      return { success: false, message: 'Not logged in to Patel AutoPrint yet.' };
    }
    return whatsapp.start({ apiUrl: creds.apiUrl, token: creds.token });
  });

  ipcMain.handle('whatsapp:logout', () => whatsapp.logout());

  ipcMain.handle('app:check-for-updates', async () => {
    if (isDev) return { available: false, version: null, downloaded: false };
    try {
      const result = await autoUpdater.checkForUpdates();
      if (!result) return { available: false, version: null, downloaded: false };
      const { updateInfo } = result;
      return {
        available: !!updateInfo,
        version: updateInfo?.version || null,
        downloaded: false,
      };
    } catch (err) {
      if (err?.message?.includes('No updates available') || err?.message?.includes('latest')) {
        return { available: false, version: null, downloaded: false };
      }
      throw err;
    }
  });

  ipcMain.handle('app:get-update-status', () => lastUpdateStatus);

  ipcMain.handle('app:install-update', () => {
    if (isDev) return;
    isQuitting = true;
    // Spawn the detached installer first, then hard-exit so no Patel AutoPrint
    // Admin process is left running — otherwise the NSIS installer shows
    // "cannot be closed, please close it manually and click retry".
    autoUpdater.quitAndInstall(true, true);
    setTimeout(() => app.exit(0), 250);
  });
}

app.whenReady().then(() => {
  // The desktop app talks to the remote Patel AutoPrint backend from a
  // file:// origin. Chromium's CORS checks would block those requests, so we
  // inject permissive CORS headers into every backend response. webSecurity
  // stays enabled.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Access-Control-Allow-Origin': ['*'],
        'Access-Control-Allow-Methods': ['GET, POST, PUT, DELETE, PATCH, OPTIONS'],
        'Access-Control-Allow-Headers': ['Content-Type, Authorization'],
      },
    });
  });

  registerIpc();
  setupAutoUpdater();

  agent.on('status', broadcastAgentStatus);
  whatsapp.on('status', broadcastWhatsAppStatus);
  agent.on('auth-expired', () => {
    agent.stop();
    whatsapp.stop();
    clearCredentials();
    agent.configure(null, null);
    const win = mainWindow;
    if (win && !win.isDestroyed()) {
      win.webContents.send('agent:auth-expired');
    }
  });

  createWindow();
  createTray();

  // Restore last session so the agent auto-starts without re-login.
  const creds = loadCredentials();
  if (creds && creds.apiUrl && creds.token) {
    agent.configure(creds.apiUrl, creds.token);
    agent.start();
    startWhatsAppWithCreds();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
});
