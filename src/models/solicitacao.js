/**
 * src/models/solicitacao.js
 * Entidade de domínio — representa uma solicitação (SMS) do SISCON.
 *
 * Padrão: model imutável (só getters), dados carregados via constructor.
 */
class Solicitacao {
  /**
   * @param {Object} data
   * @param {number} data.protocolo
   * @param {string} data.classificacao
   * @param {string} data.cliente
   * @param {string} data.sistema
   * @param {string} data.versao
   * @param {string} data.resumo
   * @param {string} data.situacao
   * @param {string} data.url
   */
  constructor(data) {
    if (!data || !data.protocolo) {
      throw new Error('Solicitacao: protocolo é obrigatório');
    }
    this._protocolo = Number(data.protocolo);
    this._classificacao = String(data.classificacao || '');
    this._cliente = String(data.cliente || '');
    this._sistema = String(data.sistema || '');
    this._versao = String(data.versao || '');
    this._resumo = String(data.resumo || '');
    this._situacao = String(data.situacao || '');
    this._url = String(data.url || '');
  }

  get protocolo() { return this._protocolo; }
  get classificacao() { return this._classificacao; }
  get cliente() { return this._cliente; }
  get sistema() { return this._sistema; }
  get versao() { return this._versao; }
  get resumo() { return this._resumo; }
  get situacao() { return this._situacao; }
  get url() { return this._url; }

  /** Retorna os dados serializáveis para persistência */
  toJSON() {
    return {
      protocolo: this._protocolo,
      classificacao: this._classificacao,
      cliente: this._cliente,
      sistema: this._sistema,
      versao: this._versao,
      resumo: this._resumo,
      situacao: this._situacao,
      url: this._url,
    };
  }

  /** Cria uma instância a partir de JSON salvo */
  static fromJSON(json) {
    return new Solicitacao(json);
  }

  /** Chave única para mapas de comparação */
  get key() {
    return this._protocolo;
  }
}

/**
 * Resultado da comparação entre dois estados.
 */
class DiffResult {
  constructor({ novas, removidas, alteradas, totalAnterior, totalAtual }) {
    this.novas = novas || [];
    this.removidas = removidas || [];
    this.alteradas = alteradas || [];
    this.totalAnterior = totalAnterior || 0;
    this.totalAtual = totalAtual || 0;
    this.timestamp = new Date().toISOString();
  }
}

module.exports = { Solicitacao, DiffResult };
