/**
 * src/main/ipc-handlers.js
 * Camada Controller — handlers de IPC do Electron.
 *
 * Princípio: CONTROLLER É THIN (não contém regra de negócio).
 * - Cada handler recebe a requisição, chama o service adequado, retorna resultado.
 * - Nunca acessa dados diretamente (quem acessa é o repository).
 * - Nunca contém lógica de scraping, diff, ou autenticação.
 */
const { ipcMain, Notification } = require('electron');
const path = require('path');
const config = require('../config');

class IpcHandlers {
  /**
   * @param {Object} deps
   * @param {import('../services/auth-service')} deps.authService
   * @param {import('../services/scraper-service')} deps.scraperService
   * @param {import('../services/diff-service')} deps.diffService
   * @param {import('../repositories/state-repository')} deps.stateRepo
   * @param {import('electron').BrowserWindow} deps.mainWindow
   */
  constructor(deps) {
    this._auth = deps.authService;
    this._scraper = deps.scraperService;
    this._diff = deps.diffService;
    this._repo = deps.stateRepo;
    this._window = deps.mainWindow;
    this._pollInterval = null;
  }

  /** Registra todos os handlers IPC */
  register() {
    ipcMain.handle('poll-now', async () => {
      return this._executePoll();
    });

    ipcMain.handle('start-polling', async () => {
      this._stopPoll();
      await this._executePoll();
      this._pollInterval = setInterval(
        () => this._executePoll(),
        config.polling.intervalMs
      );
      return true;
    });

    ipcMain.handle('stop-polling', async () => {
      this._stopPoll();
      return true;
    });
  }

  async _executePoll() {
    try {
      // 1. Garante autenticação
      if (!this._auth.isLoggedIn) {
        await this._auth.login();
      }

      // 2. Busca dados atuais
      const current = await this._scraper.fetchSolicitacoes();

      // 3. Carrega estado anterior e compara
      const prevState = this._repo.load();
      let diff = this._diff.compare(prevState.solicitacoes, current);

      // 4. Persiste novo estado
      this._repo.save(current);

      // 5. Notifica o renderer
      this._sendToRenderer('poll-result', {
        solicitacoes: current.map(s => s.toJSON()),
        diff,
      });

      // 6. Notificação do sistema se houver mudanças
      this._notifyIfChanged(diff);

      return { solicitacoes: current.map(s => s.toJSON()), diff };
    } catch (err) {
      console.error('Poll error:', err.message);
      // Se falhou na autenticação, tenta novamente na próxima
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

    const body = diff.novas
      .map(s => `🆕 #${s.protocolo} - ${s.situacao}`)
      .concat(diff.alteradas.map(s => `🔄 #${s.protocolo}`))
      .join('\n');

    if (Notification.isSupported()) {
      const notif = new Notification({
        title: `SISCON - ${total} atualização(ões)`,
        body: body.slice(0, 200),
      });
      notif.show();
    }
  }

  _stopPoll() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }
}

module.exports = IpcHandlers;
