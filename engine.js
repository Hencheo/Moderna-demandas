#!/usr/bin/env node
/**
 * SISCON Engine - Motor de autenticação e extração de dados
 * Versão Node.js (sem dependências externas, usa fetch nativo)
 */

const BASE_URL = 'https://siscon.benner.com.br';
const STATE_FILE = require('path').join(__dirname, 'siscon_state.json');

class SISCONClient {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.cookies = new Map();
    this._loggedIn = false;
  }

  getCookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  setCookiesFromResponse(resp) {
    const setCookie = resp.headers.get('set-cookie');
    if (setCookie) {
      setCookie.split(/\n|,/).forEach(c => {
        const [kv] = c.split(';');
        const [k, v] = kv.split('=');
        if (k && v) this.cookies.set(k.trim(), v.trim());
      });
    }
  }

  async request(path, options = {}) {
    const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      ...options.headers,
    };
    if (this.cookies.size > 0) {
      headers['Cookie'] = this.getCookieHeader();
    }
    // Ignorar certificado auto-assinado (ambiente corporativo)
    const resp = await fetch(url, {
      ...options,
      headers,
      redirect: 'manual', // não seguir redirects automaticamente
    });
    this.setCookiesFromResponse(resp);
    return resp;
  }

  async login() {
    // 1. GET login page pra pegar VIEWSTATE + cookie de sessão
    const loginResp = await this.request('/Login');
    const loginHtml = await loginResp.text();

    const vs = this._extractViewstate(loginHtml, '__VIEWSTATE');
    const vg = this._extractViewstate(loginHtml, '__VIEWSTATEGENERATOR');

    // 2. POST credentials
    const params = new URLSearchParams();
    params.append('__VIEWSTATE', vs);
    params.append('__VIEWSTATEGENERATOR', vg);
    params.append('wesLogin$loginWes$UserName', this.username);
    params.append('wesLogin$loginWes$Password', this.password);
    params.append('__EVENTTARGET', 'wesLogin$loginWes$LoginButton');
    params.append('__EVENTARGUMENT', '');

    const postResp = await this.request('/Login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const resultHtml = await postResp.text();
    if (resultHtml.includes('Identifique-se')) {
      throw new Error('Falha no login - página de login retornada');
    }

    this._loggedIn = true;
    console.log('Login OK. Cookies:', Array.from(this.cookies.keys()));
    return true;
  }

  _extractViewstate(html, name) {
    const m = html.match(new RegExp(`${name}.*?value="([^"]*)"`));
    return m ? m[1] : '';
  }

  async fetchSolicitacoes() {
    if (!this._loggedIn) await this.login();

    const resp = await this.request('/siscon/e/Solicitacoes/Consultar.aspx');
    const html = await resp.text();

    // Extrair linhas da grid
    const rowRegex = /<tr[^>]*?class="default"[^>]*?handle="(\d+)"[^>]*?>(.*?)<\/tr>/gs;
    const solicitacoes = [];
    let match;

    while ((match = rowRegex.exec(html)) !== null) {
      const protocolo = match[1];
      const rowHtml = match[2];

      const getField = (fieldName) => {
        const fRegex = new RegExp(`data-field="${fieldName}"[^>]*?>.*?<a[^>]*?>(.*?)</a>`, 's');
        const fm = fRegex.exec(rowHtml);
        if (!fm) return '';
        // Tenta title primeiro, depois texto puro
        const titleM = fm[1].match(/title="([^"]*)"/);
        if (titleM) return this._decodeEntities(titleM[1].trim());
        return this._decodeEntities(fm[1].replace(/<[^>]+>/g, '').trim());
      };

      solicitacoes.push({
        protocolo: parseInt(protocolo),
        classificacao: getField('CLASSIFICACAO'),
        cliente: getField('CLIENTE'),
        sistema: getField('SISTEMA'),
        versao: getField('VERSAO'),
        resumo: getField('RESUMO'),
        situacao: getField('SITUACAOATUAL'),
        url: `${BASE_URL}/siscon/e/solicitacoes/Solicitacao.aspx?key=${protocolo}&p=1`,
      });
    }

    return solicitacoes;
  }

  _decodeEntities(text) {
    const entities = {
      '&#225;': 'á', '&#224;': 'à', '&#226;': 'â', '&#227;': 'ã', '&#228;': 'ä',
      '&#233;': 'é', '&#232;': 'è', '&#234;': 'ê', '&#235;': 'ë',
      '&#237;': 'í', '&#236;': 'ì', '&#238;': 'î', '&#239;': 'ï',
      '&#243;': 'ó', '&#242;': 'ò', '&#244;': 'ô', '&#245;': 'õ', '&#246;': 'ö',
      '&#250;': 'ú', '&#249;': 'ù', '&#251;': 'û', '&#252;': 'ü',
      '&#231;': 'ç', '&#199;': 'Ç',
      '&#209;': 'Ñ', '&#241;': 'ñ',
      '&#186;': 'º', '&#170;': 'ª',
      '&#39;': "'", '&amp;': '&', '&nbsp;': ' ', '&quot;': '"',
      '&gt;': '>', '&lt;': '<',
    };
    // Also handle &#NNN; numeric entities
    return text.replace(/&#(\d+);/g, (m, code) => String.fromCharCode(parseInt(code)))
               .replace(/&[a-z]+;/g, m => entities[m] || m);
  }
}

// --- Comparação entre estados ---
function compare(previous, current) {
  const prevById = new Map(previous.map(s => [s.protocolo, s]));
  const currById = new Map(current.map(s => [s.protocolo, s]));

  const prevIds = new Set(prevById.keys());
  const currIds = new Set(currById.keys());

  const novas = [...currIds].filter(id => !prevIds.has(id)).map(id => currById.get(id));
  const removidas = [...prevIds].filter(id => !currIds.has(id)).map(id => prevById.get(id));

  const alteradas = [];
  for (const id of currIds) {
    if (!prevById.has(id)) continue;
    const old = prevById.get(id);
    const new_ = currById.get(id);
    const changes = {};
    for (const field of ['classificacao', 'cliente', 'sistema', 'versao', 'resumo', 'situacao']) {
      if (old[field] !== new_[field]) {
        changes[field] = { de: old[field], para: new_[field] };
      }
    }
    if (Object.keys(changes).length > 0) {
      alteradas.push({ protocolo: id, url: new_.url, alteracoes: changes });
    }
  }

  return { novas, removidas, alteradas, total_anterior: previous.length, total_atual: current.length };
}

// --- Persistência ---
const fs = require('fs');

function loadPreviousState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return { solicitacoes: [], updated_at: null };
}

function saveState(solicitacoes) {
  fs.writeFileSync(STATE_FILE, JSON.stringify({
    solicitacoes,
    updated_at: new Date().toISOString(),
  }, null, 2), 'utf-8');
}

// --- Modo linha de comando ---
if (require.main === module) {
  const [,, user, pass] = process.argv;
  if (!user || !pass) {
    console.log('Uso: node engine.js <usuario> <senha>');
    process.exit(1);
  }

  (async () => {
    try {
      const client = new SISCONClient(user, pass);
      console.log('Autenticando...');
      await client.login();
      
      console.log('Buscando solicitações...');
      const current = await client.fetchSolicitacoes();
      console.log(`Encontradas ${current.length} solicitações`);

      const prevState = loadPreviousState();
      const prev = prevState.solicitacoes;

      if (prev.length > 0) {
        const result = compare(prev, current);
        console.log(`\n--- Comparação ---`);
        console.log(`Anterior: ${result.total_anterior} | Atual: ${result.total_atual}`);
        console.log(`Novas: ${result.novas.length}`);
        for (const s of result.novas) {
          console.log(`  + #${s.protocolo} - ${s.resumo.slice(0, 60)} [${s.situacao}]`);
        }
        console.log(`Removidas: ${result.removidas.length}`);
        for (const s of result.removidas) {
          console.log(`  - #${s.protocolo} - ${s.resumo.slice(0, 60)}`);
        }
        console.log(`Alteradas: ${result.alteradas.length}`);
        for (const s of result.alteradas) {
          console.log(`  ~ #${s.protocolo}: ${JSON.stringify(s.alteracoes)}`);
        }
      }

      saveState(current);

      console.log(`\n--- Todas as solicitações ---`);
      for (const s of current.sort((a, b) => b.protocolo - a.protocolo)) {
        console.log(`#${String(s.protocolo).padStart(7)} | ${s.classificacao.padEnd(20)} | ${s.cliente.padEnd(15)} | ${s.situacao.padEnd(30)} | ${s.resumo.slice(0, 60)}`);
      }
    } catch (err) {
      console.error('ERRO:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { SISCONClient, compare, loadPreviousState, saveState };
