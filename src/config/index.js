/**
 * src/config/index.js
 * Configuração centralizada — ambiente, constantes, URLs.
 * Nenhuma camada deve hardcodar URLs ou credenciais.
 */
const path = require('path');
const fs = require('fs');

// Carrega .env
const envPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  }
}

const config = {
  // SISCON
  siscon: {
    baseUrl: process.env.SISCON_URL || 'https://siscon.benner.com.br',
    loginPath: '/Login',
    consultarPath: '/siscon/e/Solicitacoes/Consultar.aspx',
    solicitacaoPath: '/siscon/e/solicitacoes/Solicitacao.aspx',
    user: process.env.SISCON_USER || '',
    pass: process.env.SISCON_PASS || '',
  },

  // Monitoramento
  polling: {
    intervalMs: parseInt(process.env.POLL_INTERVAL_MS || '300000', 10), // 5 min
  },

  // Persistência
  state: {
    filePath: path.join(__dirname, '..', '..', 'siscon_state.json'),
  },

  // Janela
  window: {
    width: parseInt(process.env.WINDOW_WIDTH || '1280', 10),
    height: parseInt(process.env.WINDOW_HEIGHT || '800', 10),
    minWidth: 900,
    minHeight: 600,
    title: 'SISCON Monitor',
  },

  // Caminhos
  paths: {
    downloadTemp: path.join(__dirname, '..', '..', 'tmp'),
    chamadosDir: path.join(
      process.env.USERPROFILE || process.env.HOME || 'C:/Users/rafael.coelho',
      'Desktop', 'Chamados'
    ),
    modernaRepo: 'C:/Users/rafael.coelho/Moderna.Net',
  },

  // LLM (Nous Research / OpenAI-compatible)
  llm: {
    baseUrl: process.env.LLM_BASE_URL || 'https://inference-api.nousresearch.com/v1',
    apiKey: process.env.NOUS_API_KEY || process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'deepseek/deepseek-v4-flash',
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4096', 10),
  },

  // Azure DevOps
  ado: {
    org: process.env.ADO_ORG || 'modernasistemas',
    project: process.env.ADO_PROJECT || 'Moderna.Net',
    repo: process.env.ADO_REPO || 'Moderna.Net',
  },
};

module.exports = config;
