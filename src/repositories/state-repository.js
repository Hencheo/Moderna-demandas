/**
 * src/repositories/state-repository.js
 * Repositório de estado — persiste e recupera o snapshot de solicitações.
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
          updatedAt: raw.updated_at || null,
        };
      }
    } catch (err) {
      console.error('StateRepository.load: erro ao ler estado anterior', err.message);
    }
    return { solicitacoes: [], updatedAt: null };
  }

  /**
   * Salva o estado atual.
   * @param {Solicitacao[]} solicitacoes
   */
  save(solicitacoes) {
    const dir = path.dirname(config.state.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = {
      solicitacoes: solicitacoes.map(s => s.toJSON()),
      updated_at: new Date().toISOString(),
    };
    fs.writeFileSync(config.state.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

module.exports = StateRepository;
