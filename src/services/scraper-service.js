/**
 * src/services/scraper-service.js
 * Serviço de scraping da grid de solicitações do SISCON.
 *
 * Responsabilidade: extrair dados estruturados do HTML do Consultar.aspx.
 * Não contém lógica de autenticação ou diff.
 */
const config = require('../config');
const { Solicitacao } = require('../models/solicitacao');

class ScraperService {
  /**
   * @param {import('../utils/http-client')} httpClient - instância autenticada do HttpClient
   */
  constructor(httpClient) {
    this._http = httpClient;
  }

  /**
   * Busca a página Consultar.aspx e extrai todas as solicitações.
   * A página é server-rendered (ASP.NET WebForms), os dados estão no HTML.
   *
   * @returns {Promise<Solicitacao[]>}
   */
  async fetchSolicitacoes() {
    const resp = await this._http.get(config.siscon.consultarPath);
    const html = await resp.text();

    const rows = this._parseGridRows(html);
    return rows.map(row => new Solicitacao(row));
  }

  /**
   * Parseia as linhas da grid do HTML.
   * Formato: <tr class="default" rel="N" handle="PROTOCOLO">
   *            <td data-field="SMS" title="situacao">...</td>
   *            <td data-field="CLASSIFICACAO">...</td>
   *            ...
   */
  _parseGridRows(html) {
    const rowRegex = /<tr[^>]*?class="default"[^>]*?handle="(\d+)"[^>]*?>(.*?)<\/tr>/gs;
    const results = [];
    let match;

    while ((match = rowRegex.exec(html)) !== null) {
      const protocolo = match[1];
      const rowHtml = match[2];

      results.push({
        protocolo: parseInt(protocolo, 10),
        classificacao: this._getField(rowHtml, 'CLASSIFICACAO'),
        cliente: this._getField(rowHtml, 'CLIENTE'),
        sistema: this._getField(rowHtml, 'SISTEMA'),
        versao: this._getField(rowHtml, 'VERSAO'),
        resumo: this._getField(rowHtml, 'RESUMO'),
        situacao: this._getField(rowHtml, 'SITUACAOATUAL'),
        url: this._buildUrl(protocolo),
      });
    }

    return results;
  }

  /**
   * Extrai o valor de um campo data-field do HTML de uma linha.
   * Prioriza o atributo `title` (texto real), depois o texto puro sem tags.
   */
  _getField(rowHtml, fieldName) {
    const regex = new RegExp(
      `data-field="${fieldName}"[^>]*?>.*?<a[^>]*?>(.*?)</a>`,
      's'
    );
    const m = regex.exec(rowHtml);
    if (!m) return '';

    const cellContent = m[1];
    const titleM = cellContent.match(/title="([^"]*)"/);
    const raw = titleM ? titleM[1] : cellContent.replace(/<[^>]+>/g, '');

    return this._decodeEntities(raw.trim());
  }

  _buildUrl(protocolo) {
    return `${config.siscon.baseUrl}${config.siscon.solicitacaoPath}?key=${protocolo}&p=1`;
  }

  /** Decodifica entidades HTML (&#XXX; e &amp; etc) */
  _decodeEntities(text) {
    if (!text) return '';
    return text
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<');
  }
}

module.exports = ScraperService;
