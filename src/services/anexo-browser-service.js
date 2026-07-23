/**
 * src/services/anexo-browser-service.js
 * Serviço de extração de anexos usando navegação real (Puppeteer).
 *
 * O grid de anexos do SISCON carrega via ASP.NET AJAX UpdatePanel —
 * o HTML inicial não contém os dados. Usamos Chrome headless.
 *
 * Download URL: /DownloadFile.ashx?prms=<base64>
 *
 * Performance: mantém browser persistente entre chamadas.
 * I/O de arquivo: DELEGA ao FileRepository (não escreve em disco).
 */
const config = require('../config');
const Anexo = require('../models/anexo');

const log = (ctx, msg) =>
  console.log(`[${new Date().toLocaleTimeString('pt-BR')}] [Browser] ${ctx} → ${msg}`);

class AnexoBrowserService {
  constructor() {
    this._browser = null;
    this._page = null;
    this._loggedIn = false;
  }

  async _ensureBrowser() {
    if (!this._browser) {
      log('browser', 'lançando Chrome...');
      const { default: puppeteer } = await import('puppeteer-core');
      this._browser = await puppeteer.launch({
        executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      log('browser', 'Chrome iniciado');
    }
    return this._browser;
  }

  async _ensurePage() {
    const browser = await this._ensureBrowser();
    if (!this._page || this._page.isClosed()) {
      this._page = await browser.newPage();
      await this._page.setViewport({ width: 1280, height: 800 });
    }
    return this._page;
  }

  async _login() {
    if (this._loggedIn) {
      log('login', 'já logado, skip');
      return;
    }
    const page = await this._ensurePage();

    log('login', 'verificando sessão em Consultar.aspx...');
    await page.goto(
      `${config.siscon.baseUrl}/siscon/e/Solicitacoes/Consultar.aspx`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    const text = await page.evaluate(() => document.body?.innerText?.substring(0, 200) || '');
    if (text.includes('SMSs') || text.includes('Protocolo')) {
      this._loggedIn = true;
      log('login', 'sessão OK');
      return;
    }

    log('login', 'sessão expirada, fazendo login completo...');
    await page.goto(`${config.siscon.baseUrl}${config.siscon.loginPath}`, {
      waitUntil: 'networkidle0',
    });
    await page.type('input[name="wesLogin$loginWes$UserName"]', config.siscon.user);
    await page.type('input[name="wesLogin$loginWes$Password"]', config.siscon.pass);

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
      page.click('#LoginButton'),
    ]);
    this._loggedIn = true;
    log('login', 'login concluído');
  }

  async getLatestTimestamp(protocolo) {
    const page = await this._ensurePage();
    await this._login();

    try {
      const solUrl = `${config.siscon.baseUrl}/siscon/e/solicitacoes/Solicitacao.aspx?key=${protocolo}&p=1`;
      log(`#${protocolo}`, `navegando para ${solUrl}`);
      await page.goto(solUrl, { waitUntil: 'networkidle0', timeout: 30000 });

      log(`#${protocolo}`, 'clicando aba Anexos...');
      await page.evaluate(() => {
        const tab = document.querySelector('a[data-widget-id="WIDGETID_ANEXOS"]');
        if (tab) tab.click();
      });
      await new Promise(r => setTimeout(r, 3000));
      log(`#${protocolo}`, 'extraindo dados do grid...');

      const result = await page.evaluate(() => {
        const tbody = document.querySelector(
          '#ctl00_Main_ucSolicitacao_WIDGETID_ANEXOS_SimpleGrid tbody'
        );
        if (!tbody) return null;

        const rows = tbody.querySelectorAll('tr[rel]');
        if (rows.length === 0) return null;
        const firstRow = rows[0];

        const link = firstRow.querySelector('td[data-field="ARQUIVO"] a');
        if (!link) return null;

        return {
          nome: link.textContent.trim(),
          downloadUrl: link.getAttribute('href'),
          incluidoPor: firstRow.querySelector('td[data-field="INCLUIDOPOR"]')?.textContent?.trim() || '',
          incluidoEm: firstRow.querySelector('td[data-field="INCLUSAO"]')?.textContent?.trim() || '',
        };
      });

      if (!result || !result.incluidoEm) {
        log(`#${protocolo}`, 'grid vazio ou sem dados');
        return null;
      }

      log(`#${protocolo}`, `extraído: "${result.nome}" | ${result.incluidoEm} | por ${result.incluidoPor}`);
      return {
        timestamp: this._parseDate(result.incluidoEm).toISOString(),
        nome: result.nome,
        downloadUrl: result.downloadUrl.startsWith('http')
          ? result.downloadUrl
          : `${config.siscon.baseUrl}${result.downloadUrl}`,
        incluidoPor: result.incluidoPor,
      };
    } catch (err) {
      log(`#${protocolo}`, `ERRO: ${err.message}`);
      this._page = null;
      return null;
    }
  }

  async fetchAnexos(protocolo) {
    const page = await this._ensurePage();
    await this._login();

    try {
      const solUrl = `${config.siscon.baseUrl}/siscon/e/solicitacoes/Solicitacao.aspx?key=${protocolo}&p=1`;
      await page.goto(solUrl, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.evaluate(() => {
        const tab = document.querySelector('a[data-widget-id="WIDGETID_ANEXOS"]');
        if (tab) tab.click();
      });
      await new Promise(r => setTimeout(r, 3000));

      const rawAnexos = await page.evaluate(() => {
        const rows = [];
        const tbody = document.querySelector(
          '#ctl00_Main_ucSolicitacao_WIDGETID_ANEXOS_SimpleGrid tbody'
        );
        if (!tbody) return rows;

        tbody.querySelectorAll('tr').forEach(tr => {
          const link = tr.querySelector('td[data-field="ARQUIVO"] a');
          if (!link) return;
          rows.push({
            nome: link.textContent.trim(),
            downloadUrl: link.getAttribute('href'),
            incluidoPor: tr.querySelector('td[data-field="INCLUIDOPOR"]')?.textContent?.trim() || '',
            incluidoEm: tr.querySelector('td[data-field="INCLUSAO"]')?.textContent?.trim() || '',
            publico: !!tr.querySelector('td[data-field="PUBLICO"] input:checked'),
            tipo: tr.querySelector('td[data-field="TIPO"]')?.textContent?.trim() || '',
          });
        });
        return rows;
      });

      return rawAnexos.map(a => new Anexo({
        nome: a.nome,
        downloadUrl: a.downloadUrl.startsWith('http')
          ? a.downloadUrl
          : `${config.siscon.baseUrl}${a.downloadUrl}`,
        incluidoPor: a.incluidoPor,
        incluidoEm: this._parseDate(a.incluidoEm),
        tipo: a.tipo,
        publico: a.publico,
        protocolo,
      }));
    } catch (err) {
      this._page = null;
      throw err;
    }
  }

  /**
   * Download de arquivo — retorna Buffer.
   * Não escreve em disco (quem faz é o FileRepository).
   *
   * @param {string} url
   * @returns {Promise<Buffer>}
   */
  async downloadFile(url) {
    log('download', `iniciando download de ${url.substring(0, 80)}...`);
    const HttpClient = require('../utils/http-client');
    const http = new HttpClient();

    log('download', 'autenticando para download...');
    await http.postForm(config.siscon.loginPath, {
      __VIEWSTATE: (await (await http.get(config.siscon.loginPath)).text())
        .match(/__VIEWSTATE.*?value="([^"]*)"/)?.[1] || '',
      __VIEWSTATEGENERATOR: (await (await http.get(config.siscon.loginPath)).text())
        .match(/__VIEWSTATEGENERATOR.*?value="([^"]*)"/)?.[1] || '',
      'wesLogin$loginWes$UserName': config.siscon.user,
      'wesLogin$loginWes$Password': config.siscon.pass,
      __EVENTTARGET: 'wesLogin$loginWes$LoginButton',
      __EVENTARGUMENT: '',
    });

    const resp = await http.request(url, { method: 'GET' });
    const buffer = Buffer.from(await resp.arrayBuffer());
    log('download', `OK — ${(buffer.length / 1024).toFixed(1)} KB`);
    return buffer;
  }

  _parseDate(dateStr) {
    if (!dateStr) return new Date(0);
    const parts = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}):(\d{2})/);
    if (parts) {
      return new Date(parts[3], parts[2] - 1, parts[1], parts[4], parts[5]);
    }
    return new Date(dateStr);
  }

  async close() {
    if (this._page && !this._page.isClosed()) {
      await this._page.close();
      this._page = null;
    }
    if (this._browser) {
      await this._browser.close();
      this._browser = null;
    }
  }
}

module.exports = AnexoBrowserService;
