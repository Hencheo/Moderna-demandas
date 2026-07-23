const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');
const { SISCONClient, compare, loadPreviousState, saveState } = require('./engine.js');

// Credenciais - via .env ou variável de ambiente
const fs = require('fs');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  }
}
const USER = process.env.SISCON_USER || 'rafael.coelho';
const PASS = process.env.SISCON_PASS || '';

let mainWindow = null;
let pollInterval = null;
let client = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'SISCON Monitor',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function doPoll() {
  try {
    if (!client) {
      client = new SISCONClient(USER, PASS);
      await client.login();
    }

    const current = await client.fetchSolicitacoes();
    const prevState = loadPreviousState();
    const prev = prevState.solicitacoes;

    let diff = { novas: [], removidas: [], alteradas: [], total_anterior: prev.length, total_atual: current.length };
    if (prev.length > 0) {
      diff = compare(prev, current);
    }

    saveState(current);

    // Enviar dados pro renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('poll-result', { solicitacoes: current, diff });
    }

    // Notificação do sistema se houver novidades
    if (diff.novas.length > 0 || diff.alteradas.length > 0) {
      const total = diff.novas.length + diff.alteradas.length;
      const body = diff.novas.map(s => `🆕 #${s.protocolo} - ${s.situacao}`).concat(
        diff.alteradas.map(s => `🔄 #${s.protocolo}`)
      ).join('\n');

      if (Notification.isSupported()) {
        const notif = new Notification({
          title: `SISCON - ${total} atualização(ões)`,
          body: body.slice(0, 200),
          icon: path.join(__dirname, 'icon.png'),
        });
        notif.show();
      }
    }

    return { solicitacoes: current, diff };
  } catch (err) {
    console.error('Poll error:', err.message);
    // Se falhou, tenta recriar o client na próxima
    client = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('poll-error', err.message);
    }
    return null;
  }
}

// IPC handlers
ipcMain.handle('poll-now', async () => {
  return await doPoll();
});

ipcMain.handle('start-polling', async () => {
  if (pollInterval) clearInterval(pollInterval);
  // Primeiro poll imediato
  await doPoll();
  pollInterval = setInterval(doPoll, 5 * 60 * 1000); // 5 min
  return true;
});

ipcMain.handle('stop-polling', async () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  return true;
});

app.whenReady().then(() => {
  createWindow();
  // Iniciar polling automaticamente
  setTimeout(() => {
    if (mainWindow) {
      mainWindow.webContents.send('start-automatic');
    }
  }, 500);
});

app.on('window-all-closed', () => {
  if (pollInterval) clearInterval(pollInterval);
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
