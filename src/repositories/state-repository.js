/**
 * src/repositories/state-repository.js
 * Repositório de estado — persiste e recupera snapshots.
 *
 * Responsabilidade: acesso a dados (leitura/escrita do JSON).
 * Hoje usa arquivo local; amanhã pode ser SQLite sem mudar quem consome.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { Solicitacao } = require('../models/solicitacao');

class StateRepository {
  /** Carrega o estado anterior do arquivo. */
  load() {
    try {
      if (fs.existsSync(config.state.filePath)) {
        const raw = JSON.parse(fs.readFileSync(config.state.filePath, 'utf-8'));
        return {
          solicitacoes: (raw.solicitacoes || []).map(s => Solicitacao.fromJSON(s)),
          anexos: raw.anexos || {}, // { "protocolo": { lastTimestamp, lastFileName } }
          updatedAt: raw.updated_at || null,
        };
      }
    } catch (err) {
      console.error('StateRepository.load:', err.message);
    }
    return { solicitacoes: [], anexos: {}, updatedAt: null };
  }

  /**
   * Salva o estado atual.
   * @param {Solicitacao[]} solicitacoes
   * @param {Object} [anexos] - Timestamps dos anexos por protocolo
   */
  save(solicitacoes, anexos) {
    const dir = path.dirname(config.state.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = {
      solicitacoes: solicitacoes.map(s => s.toJSON()),
      anexos: anexos || {},
      updated_at: new Date().toISOString(),
    };
    fs.writeFileSync(config.state.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Atualiza apenas o timestamp de um anexo (sem reescrever solicitações).
   * @param {number} protocolo
   * @param {string} timestampISO - ISO string do incluidoEm
   * @param {string} fileName
   */
  updateAnexoTimestamp(protocolo, timestampISO, fileName) {
    const state = this.load();
    state.anexos = state.anexos || {};
    state.anexos[String(protocolo)] = {
      lastTimestamp: timestampISO,
      lastFileName: fileName,
    };
    const data = {
      solicitacoes: state.solicitacoes.map(s => s.toJSON()),
      anexos: state.anexos,
      updated_at: new Date().toISOString(),
    };
    fs.writeFileSync(config.state.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

module.exports = StateRepository;
