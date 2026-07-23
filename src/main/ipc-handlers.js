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
const config = require('../config');

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

  /** Registra todos os handlers IPC */
  register() {
    ipcMain.handle('poll-now', async () => this._executePoll());
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
    ipcMain.handle('download-latest', async (_event, protocolo) => {
      return this._getOrchestrator().execute(protocolo);
    });
  }

  _getOrchestrator() {
    if (!this._orchestrator) {
      const DownloadOrchestrator = require('../services/download-orchestrator');
      this._orchestrator = new DownloadOrchestrator();
    }
    return this._orchestrator;
  }

  async _executePoll() {
    try {
      // 1. Autenticação
      if (!this._auth.isLoggedIn) {
        await this._auth.login();
      }

      // 2. Busca solicitações
      const current = await this._scraper.fetchSolicitacoes();

      // 3. Carrega estado anterior e compara
      const prevState = this._repo.load();
      const diff = this._diff.compare(prevState.solicitacoes, current);

      // 4. (NOVO) Verifica anexos das solicitações ativas
      const downloads = [];
      if (current.length > 0) {
        try {
          const results = await this._checkAttachments(current, prevState.anexos || {});
          downloads.push(...results);
        } catch (anexoErr) {
          console.error('Anexo check error:', anexoErr.message);
          // Não quebra o polling se anexos falharem
        }
      }

      // 5. Persiste novo estado (incluindo timestamps de anexos)
      const anexosState = { ...(prevState.anexos || {}) };
      for (const d of downloads) {
        if (d.timestamp) {
          anexosState[String(d.protocolo)] = {
            lastTimestamp: d.timestamp,
            lastFileName: d.nome,
          };
        }
      }
      this._repo.save(current, anexosState);

      // 6. Notifica o renderer
      this._sendToRenderer('poll-result', {
        solicitacoes: current.map(s => s.toJSON()),
        diff,
        downloads: downloads.filter(d => d.baixou),
      });

      // 7. Notificações
      this._notifyIfChanged(diff);
      this._notifyDownloads(downloads);

      return {
        solicitacoes: current.map(s => s.toJSON()),
        diff,
        downloads: downloads.filter(d => d.baixou),
      };
    } catch (err) {
      console.error('Poll error:', err.message);
      this._sendToRenderer('poll-error', err.message);
      return null;
    }
  }

  /**
   * Verifica anexos de cada solicitação ativa.
   * Só consulta via Puppeteer se o timestamp armazenado for antigo
   * ou não existir (primeira vez).
   */
  async _checkAttachments(solicitacoes, anexosState) {
    const results = [];
    const orchestrator = this._getOrchestrator();

    for (const sol of solicitacoes) {
      const proto = sol.protocolo;
      const stored = anexosState[String(proto)];

      // Só verifica se: nunca verificou OU solicitação tem status ativo
      const situacao = (sol.situacao || '').toLowerCase();
      const isActive = !['finalizado', 'cancelado', 'recusado', 'aprovado'].includes(situacao);
      if (!isActive && stored) continue; // Já verificamos e está finalizada

      const result = await orchestrator.checkAndDownload(proto, stored?.lastTimestamp || null);
      if (result.baixou) {
        result.protocolo = proto;
        results.push(result);
      } else {
        // Mesmo sem download, atualiza timestamp se for o primeiro contato
        if (!stored && result.timestamp) {
          result.protocolo = proto;
          results.push(result);
        }
      }
    }

    return results;
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
      new Notification({
        title: `SISCON - ${total} atualização(ões)`,
        body: body.slice(0, 200),
      }).show();
    }
  }

  _notifyDownloads(downloads) {
    const novos = downloads.filter(d => d.baixou);
    if (novos.length === 0) return;

    const body = novos.map(d => `📎 #${d.protocolo || ''} ${d.message}`).join('\n');

    if (Notification.isSupported()) {
      new Notification({
        title: `SISCON - ${novos.length} novo(s) anexo(s)`,
        body: body.slice(0, 200),
      }).show();
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
