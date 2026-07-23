/**
 * src/services/auth-service.js
 * Serviço de autenticação no SISCON (ASP.NET Forms Auth).
 *
 * Responsabilidade: login no SISCON e obtenção de sessão autenticada.
 * Não contém regras de scraping ou diff.
 */
const config = require('../config');
const HttpClient = require('../utils/http-client');

class AuthService {
  constructor() {
    this._http = new HttpClient();
    this._loggedIn = false;
  }

  /** Cliente HTTP autenticado (compartilhado com ScraperService) */
  get http() { return this._http; }

  get isLoggedIn() { return this._loggedIn; }

  /**
   * Autentica no SISCON com ASP.NET Forms Auth.
   * Fluxo:
   *   1. GET /Login → extrai __VIEWSTATE + __VIEWSTATEGENERATOR + cookie de sessão
   *   2. POST /Login com credenciais + viewstate
   *   3. Verifica se o login foi bem-sucedido (não retornou página de login)
   *
   * @returns {Promise<boolean>}
   * @throws {Error} se falhar
   */
  async login() {
    const user = config.siscon.user;
    const pass = config.siscon.pass;

    if (!user || !pass) {
      throw new Error('AuthService: SISCON_USER e SISCON_PASS devem estar definidos no .env');
    }

    // 1. GET login page
    const loginResp = await this._http.get(config.siscon.loginPath);
    const loginHtml = await loginResp.text();

    const vs = this._extractViewstate(loginHtml, '__VIEWSTATE');
    const vg = this._extractViewstate(loginHtml, '__VIEWSTATEGENERATOR');

    // 2. POST credentials
    const postResp = await this._http.postForm(config.siscon.loginPath, {
      __VIEWSTATE: vs,
      __VIEWSTATEGENERATOR: vg,
      'wesLogin$loginWes$UserName': user,
      'wesLogin$loginWes$Password': pass,
      __EVENTTARGET: 'wesLogin$loginWes$LoginButton',
      __EVENTARGUMENT: '',
    });

    const resultHtml = await postResp.text();

    // 3. Valida
    if (resultHtml.includes('Identifique-se')) {
      throw new Error('AuthService: falha no login — página de login retornada');
    }

    this._loggedIn = true;
    return true;
  }

  _extractViewstate(html, name) {
    const m = html.match(new RegExp(`${name}.*?value="([^"]*)"`));
    return m ? m[1] : '';
  }
}

module.exports = AuthService;
