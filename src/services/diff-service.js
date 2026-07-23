/**
 * src/services/diff-service.js
 * Serviço de comparação entre dois estados de solicitações.
 *
 * Responsabilidade: identificar itens novos, removidos e alterados.
 * Puramente funcional — não tem efeitos colaterais.
 */
const { DiffResult } = require('../models/solicitacao');

class DiffService {
  /**
   * Compara duas listas de Solicitacao.
   *
   * @param {Solicitacao[]} previous - estado anterior
   * @param {Solicitacao[]} current  - estado atual
   * @returns {DiffResult}
   */
  compare(previous, current) {
    const prevMap = new Map(previous.map(s => [s.key, s]));
    const currMap = new Map(current.map(s => [s.key, s]));

    const prevIds = new Set(prevMap.keys());
    const currIds = new Set(currMap.keys());

    // Novas: existem em current mas não em previous
    const novas = [...currIds]
      .filter(id => !prevIds.has(id))
      .map(id => currMap.get(id).toJSON());

    // Removidas: existiam em previous mas não em current
    const removidas = [...prevIds]
      .filter(id => !currIds.has(id))
      .map(id => prevMap.get(id).toJSON());

    // Alteradas: existem em ambos mas com campos diferentes
    const alteradas = [];
    for (const id of currIds) {
      if (!prevIds.has(id)) continue;
      const oldS = prevMap.get(id);
      const newS = currMap.get(id);
      const changes = {};

      for (const field of ['classificacao', 'cliente', 'sistema', 'versao', 'resumo', 'situacao']) {
        if (oldS[field] !== newS[field]) {
          changes[field] = { de: oldS[field], para: newS[field] };
        }
      }

      if (Object.keys(changes).length > 0) {
        alteradas.push({
          protocolo: id,
          url: newS.url,
          alteracoes: changes,
        });
      }
    }

    return new DiffResult({
      novas,
      removidas,
      alteradas,
      totalAnterior: previous.length,
      totalAtual: current.length,
    });
  }
}

module.exports = DiffService;
