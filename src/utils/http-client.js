/**
 * src/utils/http-client.js
 * Cliente HTTP reutilizável com suporte a cookies e certificado auto-assinado.
 * Usado por AuthService e ScraperService.
 *
 * Padrão: não contém regra de negócio — só transporte.
 */
const config = require('../config');

class HttpClient {
  constructor() {
    this._cookies = new Map();
  }

  get cookieHeader() {
    return Array.from(this._cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  _parseSetCookie(setCookieHeader) {
    if (!setCookieHeader) return;
    setCookieHeader.split(/\n|,/).forEach(c => {
      const [kv] = c.split(';');
      const [k, v] = kv.split('=');
      if (k && v) {
        this._cookies.set(k.trim(), v.trim());
      }
    });
  }

  /**
   * Faz requisição HTTP.
   * @param {string} url - URL absoluta
   * @param {Object} options - fetch options
   * @returns {Promise<Response>}
   */
  async request(url, options = {}) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      ...options.headers,
    };

    if (this._cookies.size > 0) {
      headers['Cookie'] = this.cookieHeader;
    }

    const resp = await fetch(url, {
      ...options,
      headers,
      redirect: 'manual',
    });

    const setCookie = resp.headers.get('set-cookie');
    this._parseSetCookie(setCookie);

    return resp;
  }

  /**
   * GET.
   * @param {string} path - caminho relativo ao baseUrl ou URL absoluta
   */
  async get(path) {
    const url = path.startsWith('http') ? path : `${config.siscon.baseUrl}${path}`;
    return this.request(url, { method: 'GET' });
  }

  /**
   * POST com form-urlencoded.
   * @param {string} path
   * @param {Object} body - pares chave/valor
   */
  async postForm(path, body) {
    const url = path.startsWith('http') ? path : `${config.siscon.baseUrl}${path}`;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      params.append(k, String(v));
    }
    return this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
  }

  /** Lista de nomes de cookies ativos (para debug) */
  get cookieNames() {
    return Array.from(this._cookies.keys());
  }
}

module.exports = HttpClient;
