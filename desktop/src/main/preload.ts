import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  
  // Agent
  startAgent: () => ipcRenderer.invoke('agent:start'),
  stopAgent: () => ipcRenderer.invoke('agent:stop'),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: any) => ipcRenderer.invoke('settings:save', settings),
  
  // Printers
  getPrinters: () => ipcRenderer.invoke('printer:list'),
  testPrint: (printer: string) => ipcRenderer.invoke('printer:testPrint', printer),
  
  // File operations
  openFile: (path: string) => ipcRenderer.invoke('file:open', path),
  showInFolder: (path: string) => ipcRenderer.invoke('file:showInFolder', path),
  
  // System
  openExternal: (url: string) => ipcRenderer.invoke('system:openExternal', url),
  
  // Printing
  printFile: (filePath: string, options: any) => ipcRenderer.invoke('print:file', filePath, options),
  
  // Event listeners
  onAgentStatus: (callback: (status: any) => void) => {
    ipcRenderer.on('agent:status', (_e, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('agent:status');
  },
  
  onOrderUpdate: (callback: (order: any) => void) => {
    ipcRenderer.on('order:update', (_e, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('order:update');
  },
  
  onLog: (callback: (log: any) => void) => {
    ipcRenderer.on('log', (_e, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('log');
  },
});

declare global {
  interface Window {
    electronAPI: {
      getAppInfo: () => Promise<any>;
      startAgent: () => Promise<any>;
      stopAgent: () => Promise<any>;
      getSettings: () => Promise<any>;
      saveSettings: (settings: any) => Promise<any>;
      getPrinters: () => Promise<string[]>;
      testPrint: (printer: string) => Promise<any>;
      openFile: (path: string) => Promise<any>;
      showInFolder: (path: string) => Promise<any>;
      openExternal: (url: string) => Promise<any>;
      printFile: (path: string, options: any) => Promise<any>;
      onAgentStatus: (cb: (s: any) => void) => () => void;
      onOrderUpdate: (cb: (o: any) => void) => () => void;
      onLog: (cb: (l: any) => void) => () => void;
    };
  }
}