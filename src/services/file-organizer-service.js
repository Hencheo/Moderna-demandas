/**
 * src/services/file-organizer-service.js
 * Serviço de organização de arquivos baixados.
 *
 * Responsabilidade: decidir onde salvar, qual arquivo é o mais recente,
 * e se deve substituir o anterior.
 *
 * NÃO contém I/O de arquivo — quem faz isso é o FileRepository.
 */
const config = require('../config');

class FileOrganizerService {
  /**
   * Retorna o caminho onde o arquivo deve ser salvo.
   * Padrão: ~/Desktop/Chamados/{protocolo}/{arquivo}
   *
   * @param {Object} params
   * @param {number} params.protocolo
   * @param {string} params.fileName
   * @returns {string} Caminho absoluto
   */
  getDestPath({ protocolo, fileName }) {
    const path = require('path');
    const baseDir = config.paths.chamadosDir;
    return path.join(baseDir, String(protocolo), fileName);
  }

  /**
   * Seleciona o anexo mais recente da lista.
   * @param {import('../models/anexo')[]} anexos
   * @returns {import('../models/anexo')|null}
   */
  getLatest(anexos) {
    if (!anexos || anexos.length === 0) return null;
    return anexos.reduce((latest, current) =>
      current.incluidoEm > latest.incluidoEm ? current : latest
    );
  }
}

module.exports = FileOrganizerService;
