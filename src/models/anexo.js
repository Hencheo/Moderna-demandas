/**
 * src/models/anexo.js
 * Entidade de domínio — representa um anexo/arquivo do SISCON.
 */
class Anexo {
  constructor(data) {
    if (!data || !data.nome) {
      throw new Error('Anexo: nome é obrigatório');
    }
    this._nome = String(data.nome);
    this._incluidoPor = String(data.incluidoPor || '');
    this._incluidoEm = new Date(data.incluidoEm || Date.now());
    this._tipo = String(data.tipo || '');
    this._publico = Boolean(data.publico);
    this._downloadUrl = String(data.downloadUrl || '');
    this._protocolo = Number(data.protocolo || 0);
  }

  get nome() { return this._nome; }
  get incluidoPor() { return this._incluidoPor; }
  get incluidoEm() { return this._incluidoEm; }
  get tipo() { return this._tipo; }
  get publico() { return this._publico; }
  get downloadUrl() { return this._downloadUrl; }
  get protocolo() { return this._protocolo; }

  /** Chave única para mapas de comparação */
  get key() { return this._protocolo; }

  toJSON() {
    return {
      nome: this._nome,
      incluidoPor: this._incluidoPor,
      incluidoEm: this._incluidoEm.toISOString(),
      tipo: this._tipo,
      publico: this._publico,
      downloadUrl: this._downloadUrl,
      protocolo: this._protocolo,
    };
  }

  static fromJSON(json) {
    return new Anexo(json);
  }
}

module.exports = Anexo;
