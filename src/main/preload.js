/**
 * src/main/preload.js
 * Ponte segura entre o processo main (Node) e o renderer (navegador).
 * Expõe apenas as APIs que o renderer precisa — contextIsolation = true.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('siscon', {
  /** Dispara uma busca manual */
  pollNow: () => ipcRenderer.invoke('poll-now'),

  /** Inicia polling automático (intervalo definido no config) */
  startPolling: () => ipcRenderer.invoke('start-polling'),

  /** Para o polling */
  stopPolling: () => ipcRenderer.invoke('stop-polling'),

  /** Escuta resultado de polling */
  onPollResult: (callback) => {
    ipcRenderer.on('poll-result', (_event, data) => callback(data));
  },

  /** Escuta erros de polling */
  onPollError: (callback) => {
    ipcRenderer.on('poll-error', (_event, msg) => callback(msg));
  },

  /** Escuta sinal para iniciar automaticamente */
  onStartAutomatic: (callback) => {
    ipcRenderer.on('start-automatic', () => callback());
  },
});
