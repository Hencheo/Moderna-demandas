/**
 * src/index.js
 * Facade da aplicação — entry point para modo CLI e exports para o Electron.
 *
 * Uso (CLI):
 *   node src/index.js <usuario> <senha>
 *
 * Uso (programático):
 *   const { AuthService, ScraperService, DiffService, StateRepository } = require('./src');
 */
const config = require('./config');
const AuthService = require('./services/auth-service');
const ScraperService = require('./services/scraper-service');
const DiffService = require('./services/diff-service');
const StateRepository = require('./repositories/state-repository');
const { Solicitacao, DiffResult } = require('./models/solicitacao');

// Serviço orquestrador para uso standalone
class SisconEngine {
  constructor() {
    this._auth = new AuthService();
    this._scraper = new ScraperService(this._auth.http);
    this._diff = new DiffService();
    this._repo = new StateRepository();
  }

  async execute() {
    if (this._auth.isLoggedIn) {
      // Se já logou, tenta primeiro sem logar de novo
      try {
        return await this._scrapeAndDiff();
      } catch (_) {
        // Falhou, faz login completo
      }
    }
    await this._auth.login();
    return this._scrapeAndDiff();
  }

  async _scrapeAndDiff() {
    const current = await this._scraper.fetchSolicitacoes();
    const prevState = this._repo.load();
    const diff = this._diff.compare(prevState.solicitacoes, current);
    this._repo.save(current);
    return { solicitacoes: current, diff };
  }
}

// --- Modo CLI ---
if (require.main === module) {
  const [,, user, pass] = process.argv;
  if (!user || !pass) {
    console.log('Uso: node src/index.js <usuario> <senha>');
    process.exit(1);
  }
  // Seta credenciais via env para o config
  process.env.SISCON_USER = user;
  process.env.SISCON_PASS = pass;

  (async () => {
    try {
      const engine = new SisconEngine();
      console.log('Autenticando...');
      const result = await engine.execute();
      console.log(`OK — ${result.solicitacoes.length} solicitações`);

      console.log('\n--- Todas as solicitações ---');
      for (const s of result.solicitacoes.sort((a, b) => b.protocolo - a.protocolo)) {
        console.log(
          `#${String(s.protocolo).padStart(7)} | ` +
          `${(s.classificacao || '').padEnd(20)} | ` +
          `${(s.cliente || '').padEnd(15)} | ` +
          `${(s.situacao || '').padEnd(30)} | ` +
          `${(s.resumo || '').slice(0, 60)}`
        );
      }

      if (result.diff) {
        console.log(`\n--- Diff ---`);
        console.log(`Novas: ${result.diff.novas.length}`);
        console.log(`Alteradas: ${result.diff.alteradas.length}`);
        console.log(`Removidas: ${result.diff.removidas.length}`);
      }
    } catch (err) {
      console.error('ERRO:', err.message);
      process.exit(1);
    }
  })();
}
module.exports = {
  SisconEngine,
  AuthService,
  ScraperService,
  DiffService,
  StateRepository,
  Solicitacao,
  DiffResult,
  config,
};
