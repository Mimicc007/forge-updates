const { contextBridge, ipcRenderer } = require('electron');

// Expose safe desktop integration handles if needed
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isDesktop: true,
  getDocumentsPath: () => ipcRenderer.invoke('get-documents-path'),
  selectFile: (options) => ipcRenderer.invoke('select-file', options),
  saveNewFile: (options) => ipcRenderer.invoke('save-new-file', options),
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', { filePath, data }),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  showNotification: (title, body) => {
    new Notification(title, { body });
  },
  downloadAndUpdate: (url, version) => ipcRenderer.invoke('download-and-update', { url, version }),
  onUpdateProgress: (callback) => {
    ipcRenderer.removeAllListeners('update-progress');
    ipcRenderer.on('update-progress', (event, progress) => callback(progress));
  },
  readLocalUpdates: () => ipcRenderer.invoke('read-local-updates'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  closeQuickCapture: () => ipcRenderer.send('close-quick-capture'),
  fetchClaude: (payload, apiKey) => ipcRenderer.invoke('fetch-claude', { payload, apiKey })
});
