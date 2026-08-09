const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('patelApp', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  agent: {
    setCredentials: (apiUrl, token) => ipcRenderer.invoke('agent:set-credentials', { apiUrl, token }),
    clearCredentials: () => ipcRenderer.invoke('agent:clear-credentials'),
    start: () => ipcRenderer.invoke('agent:start'),
    stop: () => ipcRenderer.invoke('agent:stop'),
    getStatus: () => ipcRenderer.invoke('agent:get-status'),
    getCredentials: () => ipcRenderer.invoke('agent:get-credentials'),
    onStatus: (callback) => {
      const listener = (_e, data) => callback(data);
      ipcRenderer.on('agent:status', listener);
      return () => ipcRenderer.removeListener('agent:status', listener);
    },
    onAuthExpired: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('agent:auth-expired', listener);
      return () => ipcRenderer.removeListener('agent:auth-expired', listener);
    },
  },
  printers: {
    listSystem: () => ipcRenderer.invoke('printers:list-system'),
  },
});
