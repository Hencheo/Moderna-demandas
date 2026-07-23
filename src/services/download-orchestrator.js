/**
 * src/services/download-orchestrator.js
 * Orquestrador de download de anexos.
 *
 * Responsabilidade: coordenar a busca, decisão e download de anexos.
 *
 * Regras (aqui, no service):
 * - Timestamp: só baixa se servidor tiver anexo mais novo
 * - Arquivo em disco: se foi deletado, re-baixa
 * - Autor: se último anexo for do próprio usuário, não baixa
 *
 * I/O de arquivo: DELEGA ao FileRepository.
 */
const config = require('../config');
const AnexoBrowserService = require('./anexo-browser-service');
const FileOrganizerService = require('./file-organizer-service');
const FileRepository = require('../repositories/file-repository');
const SummaryService = require('./summary-service');

const log = (ctx, msg) =>
  console.log(`[${new Date().toLocaleTimeString('pt-BR')}] [Download] ${ctx} → ${msg}`);

class DownloadOrchestrator {
  constructor() {
    this._anexoService = new AnexoBrowserService();
    this._organizer = new FileOrganizerService();
    this._fileRepo = new FileRepository();
    this._summary = new SummaryService();
    this._currentUser = (config.siscon.user || '').toUpperCase();
    log('init', `usuário atual = ${this._currentUser}`);
  }

  /**
   * Verifica se há anexo novo e baixa se necessário.
   */
  async checkAndDownload(protocolo, lastTimestampISO) {
    log(`#${protocolo}`, `iniciando (timestamp salvo = ${lastTimestampISO || 'nunca'})`);

    const latest = await this._anexoService.getLatestTimestamp(protocolo);
    if (!latest) {
      log(`#${protocolo}`, 'SEM ANEXOS');
      return { baixou: false, message: `Sem anexos para #${protocolo}` };
    }

    log(`#${protocolo}`, `servidor → "${latest.nome}" | ${latest.timestamp} | por ${latest.incluidoPor}`);

    // 1. Timestamp: verifica servidor vs salvo
    if (lastTimestampISO && latest.timestamp <= lastTimestampISO) {
      const destPath = this._organizer.getDestPath({ protocolo, fileName: latest.nome });
      const arquivoExiste = this._fileRepo.exists(destPath);

      log(`#${protocolo}`, `timestamp igual (${latest.timestamp}) — arquivo: ${arquivoExiste ? 'EXISTE' : 'DELETADO'}`);
      if (arquivoExiste) {
        log(`#${protocolo}`, 'DECISÃO: PULAR');
        return { baixou: false, message: `Anexo já verificado: ${latest.nome}`, timestamp: latest.timestamp, nome: latest.nome };
      }
      log(`#${protocolo}`, 'arquivo deletado — vai re-baixar');
    }

    // 2. Autor
    const autor = (latest.incluidoPor || '').toUpperCase().trim();
    if (autor === this._currentUser) {
      log(`#${protocolo}`, `DECISÃO: PULAR — próprio usuário (${autor})`);
      return { baixou: false, message: `Anexo de ${autor} — próprio usuário`, timestamp: latest.timestamp, nome: latest.nome, incluidoPor: latest.incluidoPor };
    }

    // 3. Download
    log(`#${protocolo}`, 'DECISÃO: BAIXAR');
    const destPath = this._organizer.getDestPath({ protocolo, fileName: latest.nome });

    try {
      const buffer = await this._anexoService.downloadFile(latest.downloadUrl);
      this._fileRepo.writeFile(destPath, buffer);
      this._fileRepo.removePartialDownload(destPath);

      // Gera/atualiza resumo.md via LLM
      try {
        await this._summary.updateResumo({
          protocolo,
          docxPath: destPath,
          autor: latest.incluidoPor,
          dataISO: latest.timestamp,
        });
      } catch (summaryErr) {
        log(`#${protocolo}`, `ERRO no resumo: ${summaryErr.message} (download mantido)`);
      }

      const stat = this._fileRepo.stat(destPath);
      log(`#${protocolo}`, `DOWNLOAD OK — ${stat ? (stat.size / 1024).toFixed(1) : '?'} KB`);
    } catch (err) {
      log(`#${protocolo}`, `ERRO: ${err.message}`);
      throw err;
    }

    return { baixou: true, message: `📎 ${latest.nome} (de ${latest.incluidoPor})`, timestamp: latest.timestamp, nome: latest.nome, incluidoPor: latest.incluidoPor, destPath };
  }

  /**
   * Verifica anexos de uma lista de solicitações (chamado pelo polling).
   * Contém a REGRA de negócio: quais protocolos verificar.
   */
  async checkAllAttachments(solicitacoes, anexosState) {
    const results = [];
    for (const sol of solicitacoes) {
      const proto = sol.protocolo;
      const stored = anexosState[String(proto)];
      const situacao = (sol.situacao || '').toLowerCase();
      const isActive = !['finalizado', 'cancelado', 'recusado', 'aprovado'].includes(situacao);

      // Pula finalizados já verificados
      if (!isActive && stored) {
        log('checkAll', `#${proto} finalizado e já verificado — pulando`);
        continue;
      }

      const result = await this.checkAndDownload(proto, stored?.lastTimestamp || null);
      if (result.baixou || (!stored && result.timestamp)) {
        result.protocolo = proto;
        results.push(result);
      }
    }
    return results;
  }

  /** Força download (ignora regras) */
  async execute(protocolo) {
    log(`#${protocolo}`, 'FORÇADO');
    const latest = await this._anexoService.getLatestTimestamp(protocolo);
    if (!latest) return { baixou: false, message: `Sem anexos para #${protocolo}` };

    const destPath = this._organizer.getDestPath({ protocolo, fileName: latest.nome });
    const buffer = await this._anexoService.downloadFile(latest.downloadUrl);
    this._fileRepo.writeFile(destPath, buffer);
    this._fileRepo.removePartialDownload(destPath);

    try {
      await this._summary.updateResumo({
        protocolo, docxPath: destPath,
        autor: latest.incluidoPor, dataISO: latest.timestamp,
      });
    } catch (summaryErr) {
      log(`#${protocolo}`, `ERRO no resumo: ${summaryErr.message}`);
    }

    const stat = this._fileRepo.stat(destPath);
    log(`#${protocolo}`, `FORÇADO OK — ${stat ? (stat.size / 1024).toFixed(1) : '?'} KB`);
    return { baixou: true, message: `📎 ${latest.nome}`, timestamp: latest.timestamp, nome: latest.nome, destPath };
  }

  async close() {
    await this._anexoService.close();
  }
}

module.exports = DownloadOrchestrator;
