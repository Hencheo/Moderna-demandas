/**
 * src/services/download-orchestrator.js
 * Orquestrador: dado um protocolo, baixa o anexo mais recente
 * e organiza em ~/Desktop/Chamados/{protocolo}/.
 *
 * Regras:
 * - Timestamp: só baixa se o servidor tiver anexo mais novo
 * - Autor: se o último anexo for do próprio usuário (RAFAEL.COELHO),
 *   não baixa (você já tem o arquivo)
 */
const config = require('../config');
const fs = require('fs');
const AnexoBrowserService = require('./anexo-browser-service');
const FileOrganizerService = require('./file-organizer-service');

class DownloadOrchestrator {
  constructor() {
    this._anexoService = new AnexoBrowserService();
    this._organizer = new FileOrganizerService();
    // Nome do usuário no SISCON (vem em MAIÚSCULO na grid)
    this._currentUser = (config.siscon.user || '').toUpperCase();
  }

  /**
   * Verifica se há anexo novo e baixa se necessário.
   *
   * @param {number} protocolo
   * @param {string|null} lastTimestampISO
   * @returns {Promise<{baixou: boolean, message: string, timestamp?: string, nome?: string, destPath?: string}>}
   */
  async checkAndDownload(protocolo, lastTimestampISO) {
    const latest = await this._anexoService.getLatestTimestamp(protocolo);
    if (!latest) {
      return { baixou: false, message: `Sem anexos para #${protocolo}` };
    }

    // 1. Se o timestamp não mudou, verifica se o arquivo ainda existe no disco
    if (lastTimestampISO && latest.timestamp <= lastTimestampISO) {
      const destPath = this._organizer.getDestPath({
        protocolo,
        fileName: latest.nome,
      });
      if (fs.existsSync(destPath)) {
        return {
          baixou: false,
          message: `Anexo já verificado: ${latest.nome}`,
          timestamp: latest.timestamp,
          nome: latest.nome,
        };
      }
      // Arquivo foi deletado do disco — continua para baixar de novo
    }

    // 2. Se o último anexo é do próprio usuário, não baixa
    const autor = (latest.incluidoPor || '').toUpperCase().trim();
    if (autor === this._currentUser) {
      return {
        baixou: false,
        message: `Anexo de ${autor} — próprio usuário, download ignorado`,
        timestamp: latest.timestamp,
        nome: latest.nome,
        incluidoPor: latest.incluidoPor,
      };
    }

    // 3. Novidade de outro usuário! Baixa e organiza
    const destPath = this._organizer.getDestPath({
      protocolo,
      fileName: latest.nome,
    });
    this._organizer.ensureDir(destPath);
    await this._anexoService.downloadFile(latest.downloadUrl, destPath);

    return {
      baixou: true,
      message: `📎 ${latest.nome} (de ${latest.incluidoPor})`,
      timestamp: latest.timestamp,
      nome: latest.nome,
      incluidoPor: latest.incluidoPor,
      destPath,
    };
  }

  /** Força download (ignora timestamp e autor) */
  async execute(protocolo) {
    const latest = await this._anexoService.getLatestTimestamp(protocolo);
    if (!latest) {
      return { baixou: false, message: `Sem anexos para #${protocolo}` };
    }
    const destPath = this._organizer.getDestPath({ protocolo, fileName: latest.nome });
    this._organizer.ensureDir(destPath);
    await this._anexoService.downloadFile(latest.downloadUrl, destPath);
    return {
      baixou: true, message: `📎 ${latest.nome}`,
      timestamp: latest.timestamp, nome: latest.nome, destPath,
    };
  }

  async close() {
    await this._anexoService.close();
  }
}

module.exports = DownloadOrchestrator;
