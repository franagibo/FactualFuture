const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppPath: () => ipcRenderer.invoke('getAppPath'),
  readSave: (filePath) => ipcRenderer.invoke('readSave', filePath),
  writeSave: (filePath, data) => ipcRenderer.invoke('writeSave', filePath, data),
  isSteamRunning: () => ipcRenderer.invoke('isSteamRunning'),
  getSteamId: () => ipcRenderer.invoke('getSteamId'),
  setWindowSize: (width, height) => ipcRenderer.invoke('setWindowSize', width, height),
  getSettings: () => ipcRenderer.invoke('getSettings'),
  setFullScreen: (fullscreen) => ipcRenderer.invoke('setFullScreen', fullscreen),
  quit: () => ipcRenderer.invoke('quit'),
  onSteamWarning: (callback) => {
    ipcRenderer.on('steam-warning', (_, message) => callback(message));
  },
});
