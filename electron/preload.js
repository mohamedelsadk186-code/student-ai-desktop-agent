const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadAppState: () => ipcRenderer.invoke('load-app-state'),
  saveAppState: (state) => ipcRenderer.invoke('save-app-state', state),
  selectVaultPath: (kind) => ipcRenderer.invoke('select-vault-path', kind),
  openVaultPath: (path) => ipcRenderer.invoke('open-vault-path', path),
});
