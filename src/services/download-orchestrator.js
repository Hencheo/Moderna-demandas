/**
 * src/services/download-orchestrator.js
 * Orquestrador: dado um protocolo, baixa o anexo mais recente
 * e organiza em ~/Desktop/Chamados/{protocolo}/.
 *
 * Agora com verificação inteligente: compara timestamp do servidor
 * com o último timestamp conhecido para evitar downloads desnecessários.
 */
const AnexoBrowserService = require('./anexo-browser-service');
const FileOrganizerService = require('./file-organizer-service');

class DownloadOrchestrator {
  constructor() {
    this._anexoService = new AnexoBrowserService();
    this._organizer = new FileOrganizerService();
  }

  /**
   * Verifica se há anexo novo e baixa se necessário.
   *
   * @param {number} protocolo
   * @param {string|null} lastTimestampISO - Último timestamp conhecido (do state)
   * @returns {Promise<{baixou: boolean, message: string, timestamp?: string, nome?: string, destPath?: string}>}
   */
  async checkAndDownload(protocolo, lastTimestampISO) {
    // 1. Busca APENAS o timestamp do anexo mais recente (leve)
    const latest = await this._anexoService.getLatestTimestamp(protocolo);
    if (!latest) {
      return { baixou: false, message: `Sem anexos para #${protocolo}` };
    }

    // 2. Compara timestamps
    if (lastTimestampISO && latest.timestamp <= lastTimestampISO) {
      return {
        baixou: false,
        message: `Anexo já atualizado: ${latest.nome}`,
        timestamp: latest.timestamp,
        nome: latest.nome,
      };
    }

    // 3. Novidade! Baixa e organiza
    const destPath = this._organizer.getDestPath({
      protocolo,
      fileName: latest.nome,
    });
    this._organizer.ensureDir(destPath);
    await this._anexoService.downloadFile(latest.downloadUrl, destPath);

    return {
      baixou: true,
      message: `📎 ${latest.nome}`,
      timestamp: latest.timestamp,
      nome: latest.nome,
      destPath,
    };
  }

  /**
   * Executa o fluxo completo (ignora timestamp, força download).
   * Útil para primeira execução ou força manual.
   */
  async execute(protocolo) {
    return this.checkAndDownload(protocolo, null);
  }

  async close() {
    await this._anexoService.close();
  }
}

module.exports = DownloadOrchestrator;
