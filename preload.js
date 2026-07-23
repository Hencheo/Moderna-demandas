const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('siscon', {
  pollNow: () => ipcRenderer.invoke('poll-now'),
  startPolling: () => ipcRenderer.invoke('start-polling'),
  stopPolling: () => ipcRenderer.invoke('stop-polling'),
  onPollResult: (callback) => {
    ipcRenderer.on('poll-result', (event, data) => callback(data));
  },
  onPollError: (callback) => {
    ipcRenderer.on('poll-error', (event, msg) => callback(msg));
  },
  onStartAutomatic: (callback) => {
    ipcRenderer.on('start-automatic', () => callback());
  },
});
