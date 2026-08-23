const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pa5Desktop', {
  fetchOfficial: url => ipcRenderer.invoke('official-fetch', String(url || '')),
  copyText: text => ipcRenderer.invoke('copy-text', String(text || '')),
  saveProject: (contents, suggestedName) => ipcRenderer.invoke('save-project', String(contents || ''), String(suggestedName || '')),
  onMenuAction: callback => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('menu-action', (_event, action) => callback(String(action || '')));
  }
});
