import { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage, nativeTheme, shell, systemPreferences } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

const isDev = process.env.NODE_ENV === 'development';
const isMac = process.platform === 'darwin';

let mainWindow: Electron.BrowserWindow | null = null;
let tray: Electron.Tray | null = null;
let isQuitting = false;

const ICON_PATH = isDev 
  ? path.join(__dirname, '../../icon.png')
  : path.join(process.resourcesPath, 'icon.png');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    icon: ICON_PATH,
    title: 'Patel AutoPrint',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (isDev) mainWindow?.webContents.openDevTools({ mode: 'detach' });
  });

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
  const icon = nativeImage.createFromPath(ICON_PATH);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Patel AutoPrint', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Start Agent', click: () => sendToRenderer('agent:start') },
    { label: 'Stop Agent', click: () => sendToRenderer('agent:stop') },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]);
  
  tray.setToolTip('Patel AutoPrint - Running');
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => mainWindow?.show());
}

function sendToRenderer(channel: string, data?: any) {
  mainWindow?.webContents.send(channel, data);
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  
  autoUpdater.checkForUpdatesAndNotify();
  
  if (isMac) {
    app.dock.setMenu(Menu.buildFromTemplate([
      { label: 'Patel AutoPrint', role: 'appMenu' },
    ]));
  }
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
});

// ==================== IPC HANDLERS ====================

// App info
ipcMain.handle('app:getInfo', () => ({
  version: app.getVersion(),
  platform: process.platform,
  isDev,
}));

// Agent communication
ipcMain.handle('agent:start', async () => {
  // Start the print agent
  return { success: true };
});

ipcMain.handle('agent:stop', async () => {
  return { success: true };
});

// Settings
ipcMain.handle('settings:get', async () => {
  // Load from local config file
  return loadSettings();
});

ipcMain.handle('settings:save', async (_e, settings: any) => {
  saveSettings(settings);
  return { success: true };
});

// Printer operations
ipcMain.handle('printer:list', async () => {
  // Return system printers
  return getSystemPrinters();
});

ipcMain.handle('printer:testPrint', async (_e, printerName: string) => {
  // Send test page
  return testPrint(printerName);
});

// File operations
ipcMain.handle('file:open', async (_e, path: string) => {
  shell.openPath(path);
  return { success: true };
});

ipcMain.handle('file:showInFolder', async (_e, path: string) => {
  shell.showItemInFolder(path);
  return { success: true };
});

// System
ipcMain.handle('system:openExternal', async (_e, url: string) => {
  shell.openExternal(url);
  return { success: true };
});

// Print file
ipcMain.handle('print:file', async (_e, filePath: string, options: any) => {
  return printFile(filePath, options);
});

// ==================== HELPER FUNCTIONS ====================

function loadSettings(): any {
  const configPath = path.join(app.getPath('userData'), 'settings.json');
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {}
  return {
    apiUrl: 'https://patel-autoprint.onrender.com',
    apiKey: '',
    machineName: 'COUNTER-1',
    autoStart: true,
    autoPrint: false,
    defaultPrinter: '',
    theme: 'light',
    language: 'en',
  };
}

function saveSettings(settings: any) {
  const configPath = path.join(app.getPath('userData'), 'settings.json');
  fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
}

function getSystemPrinters(): string[] {
  // Return list of system printers
  // This would use a native module or wmic on Windows
  return ['Canon iR-ADV 6575', 'Konica Bizhub C450i', 'Microsoft Print to PDF'];
}

async function testPrint(printerName: string): Promise<{ success: boolean; message?: string }> {
  try {
    // Send test page to printer
    // Uses native printing or PDF to printer
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

async function printFile(filePath: string, options: any): Promise<{ success: boolean; message?: string }> {
  try {
    // Use pdf-to-printer or native printing
    // options: printer, copies, duplex, paperSize, etc.
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}