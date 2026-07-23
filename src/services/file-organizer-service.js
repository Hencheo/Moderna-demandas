/**
 * src/services/file-organizer-service.js
 * Serviço de organização de arquivos baixados.
 *
 * Responsabilidade: decidir onde salvar, qual arquivo é o mais recente,
 * e se deve substituir o anterior.
 */
const path = require('path');
const fs = require('fs');
const config = require('../config');
const Anexo = require('../models/anexo');

class FileOrganizerService {
  /**
   * Retorna o caminho onde o arquivo deve ser salvo.
   * Padrão: ~/Desktop/Chamados/{protocolo}/{arquivo}
   *
   * @param {Object} params
   * @param {number} params.protocolo
   * @param {string} params.fileName - Nome original do arquivo
   * @returns {string} Caminho absoluto
   */
  getDestPath({ protocolo, fileName }) {
    const baseDir = config.paths.chamadosDir;
    const protocolDir = path.join(baseDir, String(protocolo));
    return path.join(protocolDir, fileName);
  }

  /**
   * Garante que o diretório de destino existe.
   * @param {string} destPath
   */
  ensureDir(destPath) {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Verifica se o arquivo de destino já existe e se é mais recente.
   * @param {string} destPath
   * @param {Date} newFileDate - Data do novo arquivo
   * @returns {{ exists: boolean, shouldReplace: boolean }}
   */
  checkExisting(destPath, newFileDate) {
    if (!fs.existsSync(destPath)) {
      return { exists: false, shouldReplace: true };
    }

    const stat = fs.statSync(destPath);
    const existingDate = stat.mtime;

    return {
      exists: true,
      shouldReplace: newFileDate > existingDate,
      existingDate,
    };
  }

  /**
   * Seleciona o anexo mais recente da lista.
   * @param {Anexo[]} anexos
   * @returns {Anexo|null}
   */
  getLatest(anexos) {
    if (!anexos || anexos.length === 0) return null;
    return anexos.reduce((latest, current) =>
      current.incluidoEm > latest.incluidoEm ? current : latest
    );
  }

  /**
   * Remove a extensão . download de arquivos parcialmente baixados
   * @param {string} filePath
   */
  _cleanupPartialDownload(filePath) {
    const crdownload = filePath + '.crdownload';
    if (fs.existsSync(crdownload)) {
      fs.unlinkSync(crdownload);
    }
  }
}

module.exports = FileOrganizerService;
