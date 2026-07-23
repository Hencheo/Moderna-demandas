/**
 * src/main/ipc-handlers.js
 * Camada Controller — handlers de IPC do Electron.
 *
 * Princípio: CONTROLLER É THIN.
 * - Cada handler recebe a requisição, chama o service adequado, retorna resultado.
 * - NUNCA contém regra de negócio.
 * - NUNCA acessa dados diretamente.
 */
const { ipcMain, Notification } = require('electron');
const config = require('../config');

const log = (ctx, msg) =>
  console.log(`[${new Date().toLocaleTimeString('pt-BR')}] [Poll] ${ctx} → ${msg}`);

class IpcHandlers {
  constructor(deps) {
    this._auth = deps.authService;
    this._scraper = deps.scraperService;
    this._diff = deps.diffService;
    this._repo = deps.stateRepo;
    this._window = deps.mainWindow;
    this._pollInterval = null;
    /** @type {import('../services/download-orchestrator')} */
    this._orchestrator = null;
  }

  _getOrchestrator() {
    if (!this._orchestrator) {
      const DownloadOrchestrator = require('../services/download-orchestrator');
      this._orchestrator = new DownloadOrchestrator();
    }
    return this._orchestrator;
  }

  register() {
    ipcMain.handle('poll-now', async () => this._executePoll());
    ipcMain.handle('start-polling', async () => {
      this._stopPoll();
      await this._executePoll();
      this._pollInterval = setInterval(() => this._executePoll(), config.polling.intervalMs);
      return true;
    });
    ipcMain.handle('stop-polling', async () => { this._stopPoll(); return true; });
    ipcMain.handle('download-latest', async (_event, protocolo) => {
      return this._getOrchestrator().execute(protocolo);
    });
    ipcMain.handle('generate-resumo', async (_event, protocolo) => {
      return this._getOrchestrator().forceResumo(protocolo);
    });
  }

  async _executePoll() {
    log('poll', '--- INÍCIO ---');
    try {
      if (!this._auth.isLoggedIn) {
        log('poll', 'autenticando...');
        await this._auth.login();
      }

      log('poll', 'buscando solicitações...');
      const current = await this._scraper.fetchSolicitacoes();
      current.forEach(s => log('poll', `  #${s.protocolo} — ${s.situacao}`));

      const prevState = this._repo.load();
      const diff = this._diff.compare(prevState.solicitacoes, current);
      log('poll', `diff → ${diff.novas.length} nova(s), ${diff.alteradas.length} alterada(s)`);

      // Delega verificação de anexos ao orchestrator (service)
      const downloads = current.length > 0
        ? await this._getOrchestrator().checkAllAttachments(current, prevState.anexos || {})
        : [];

      // Atualiza estado dos timestamps de anexos
      const anexosState = { ...(prevState.anexos || {}) };
      for (const d of downloads) {
        if (d.timestamp) {
          anexosState[String(d.protocolo)] = { lastTimestamp: d.timestamp, lastFileName: d.nome, ...(d.docHash ? { lastDocHash: d.docHash } : {}) };
        }
      }
      this._repo.save(current, anexosState);

      // Notifica renderer + sistema
      const baixados = downloads.filter(d => d.baixou);
      this._sendToRenderer('poll-result', {
        solicitacoes: current.map(s => s.toJSON()),
        diff,
        downloads: baixados,
      });
      this._notifyIfChanged(diff);
      if (baixados.length > 0) this._notifyDownloads(baixados);

      log('poll', `--- FIM (${baixados.length} download(s)) ---`);
      return { solicitacoes: current.map(s => s.toJSON()), diff, downloads: baixados };
    } catch (err) {
      log('poll', `ERRO: ${err.message}`);
      this._sendToRenderer('poll-error', err.message);
      return null;
    }
  }

  _sendToRenderer(channel, data) {
    if (this._window && !this._window.isDestroyed()) {
      this._window.webContents.send(channel, data);
    }
  }

  _notifyIfChanged(diff) {
    const total = diff.novas.length + diff.alteradas.length;
    if (total === 0) return;
    const body = diff.novas.map(s => `🆕 #${s.protocolo} - ${s.situacao}`)
      .concat(diff.alteradas.map(s => `🔄 #${s.protocolo}`))
      .join('\n');
    if (Notification.isSupported()) {
      new Notification({ title: `SISCON - ${total} atualização(ões)`, body: body.slice(0, 200) }).show();
    }
  }

  _notifyDownloads(downloads) {
    const body = downloads.map(d => `📎 #${d.protocolo || ''} ${d.message}`).join('\n');
    if (Notification.isSupported()) {
      new Notification({ title: `SISCON - ${downloads.length} novo(s) anexo(s)`, body: body.slice(0, 200) }).show();
    }
  }

  _stopPoll() {
    if (this._pollInterval) { clearInterval(this._pollInterval); this._pollInterval = null; }
  }
}

module.exports = IpcHandlers;
