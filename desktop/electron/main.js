const { app, BrowserWindow, shell, session, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { PrintAgent } = require('./agent');

const isDev = !app.isPackaged;

let mainWindow = null;
let tray = null;
let isQuitting = false;

const agent = new PrintAgent();

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
    show: false,
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
  const icon = nativeImage.createFromPath(path.join(__dirname, '../resources/tray.png'));
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
}

function broadcastAgentStatus() {
  const win = mainWindow;
  if (win && !win.isDestroyed()) {
    win.webContents.send('agent:status', agent.snapshot());
  }
}

function registerIpc() {
  ipcMain.handle('agent:set-credentials', (_e, { apiUrl, token }) => {
    if (!apiUrl || !token) return { success: false, message: 'Missing credentials' };
    agent.configure(apiUrl, token);
    saveCredentials(apiUrl, token);
    agent.start();
    return { success: true };
  });

  ipcMain.handle('agent:clear-credentials', () => {
    agent.stop();
    agent.configure(null, null);
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

  agent.on('status', broadcastAgentStatus);
  agent.on('auth-expired', () => {
    agent.stop();
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
