/**
 * src/main/main.js
 * Entry point do Electron.
 *
 * Responsabilidade: criar janela, instanciar dependências, iniciar polling.
 * É a "Composition Root" — tudo é conectado aqui.
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const config = require('../config');
const AuthService = require('../services/auth-service');
const ScraperService = require('../services/scraper-service');
const DiffService = require('../services/diff-service');
const StateRepository = require('../repositories/state-repository');
const IpcHandlers = require('./ipc-handlers');

let mainWindow = null;
let ipcHandlers = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: config.window.width,
    height: config.window.height,
    minWidth: config.window.minWidth,
    minHeight: config.window.minHeight,
    title: config.window.title,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });

  // Injetar dependências e registrar handlers
  const authService = new AuthService();
  const scraperService = new ScraperService(authService.http);
  const diffService = new DiffService();
  const stateRepo = new StateRepository();

  ipcHandlers = new IpcHandlers({
    authService,
    scraperService,
    diffService,
    stateRepo,
    mainWindow,
  });
  ipcHandlers.register();

  return mainWindow;
}

app.whenReady().then(() => {
  createWindow();

  // Iniciar polling automaticamente após a janela carregar
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('start-automatic');
  });
});

app.on('window-all-closed', () => {
  if (ipcHandlers) ipcHandlers._stopPoll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
