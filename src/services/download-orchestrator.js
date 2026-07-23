/**
 * src/services/download-orchestrator.js
 * Orquestrador: dado um protocolo, baixa o anexo mais recente
 * e organiza em ~/Desktop/Chamados/{protocolo}/.
 *
 * Segue o padrão: Service coordena, Repository persiste.
 */
const AnexoBrowserService = require('./anexo-browser-service');
const FileOrganizerService = require('./file-organizer-service');

class DownloadOrchestrator {
  constructor() {
    this._anexoService = new AnexoBrowserService();
    this._organizer = new FileOrganizerService();
  }

  /**
   * Executa o fluxo completo para um protocolo.
   *
   * @param {number} protocolo
   * @returns {Promise<{status: string, arquivo?: string, message: string}>}
   */
  async execute(protocolo) {
    // 1. Busca anexos via navegador
    const anexos = await this._anexoService.fetchAnexos(protocolo);
    if (anexos.length === 0) {
      return { status: 'sem_anexos', message: `Nenhum anexo encontrado para #${protocolo}` };
    }

    // 2. Seleciona o mais recente
    const latest = this._organizer.getLatest(anexos);
    if (!latest) {
      return { status: 'erro', message: `Não foi possível determinar o anexo mais recente` };
    }

    // 3. Prepara destino
    const destPath = this._organizer.getDestPath({
      protocolo,
      fileName: latest.nome,
    });

    const check = this._organizer.checkExisting(destPath, latest.incluidoEm);

    if (check.exists && !check.shouldReplace) {
      return {
        status: 'atualizado',
        arquivo: destPath,
        message: `Arquivo já está atualizado: ${latest.nome}`,
      };
    }

    // 4. Cria diretório e baixa
    this._organizer.ensureDir(destPath);
    await this._anexoService.downloadFile(latest.downloadUrl, destPath);

    return {
      status: check.exists ? 'substituido' : 'baixado',
      arquivo: destPath,
      message: `${check.exists ? 'Substituído' : 'Baixado'}: ${latest.nome} ` +
               `(${latest.incluidoEm.toLocaleString('pt-BR')})`,
    };
  }
}

module.exports = DownloadOrchestrator;
