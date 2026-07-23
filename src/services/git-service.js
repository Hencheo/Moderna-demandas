/**
 * src/services/git-service.js
 * Serviço de interação com git local.
 *
 * Responsabilidade: consultar branch atual, verificar existência de branches,
 * obter diff de alterações. NUNCA faz checkout.
 * NUNCA contém regra de negócio de chamados ou PRs.
 */
const { execSync } = require('child_process');
const config = require('../config');

const log = (ctx, msg) =>
  console.log(`[${new Date().toLocaleTimeString('pt-BR')}] [Git] ${ctx} → ${msg}`);

class GitService {
  constructor() {
    this._repoPath = config.paths.modernaRepo;
  }

  _git(args) {
    try {
      return execSync(`git ${args}`, {
        cwd: this._repoPath, encoding: 'utf-8', timeout: 30000,
        maxBuffer: 10 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch (err) {
      log('git', `erro: ${err.message}`);
      return null;
    }
  }

  currentBranch() {
    const b = this._git('rev-parse --abbrev-ref HEAD');
    log('currentBranch', b || 'falhou');
    return b;
  }

  listBranches(term) {
    const out = this._git(`branch --list "*${term}*"`);
    if (!out) return [];
    return out.split('\n').map(b => b.replace('*', '').trim()).filter(Boolean);
  }

  branchExists(name) {
    return !!this._git(`branch --list "${name}"`);
  }

  /**
   * Retorna diff entre dois pontos no git.
   * @param {string} range - Ex: "Development...HEAD"
   * @returns {{ files: string[], content: string }}
   */
  getDiff(range) {
    const filesOut = this._git(`diff ${range} --name-only`);
    const files = filesOut ? filesOut.split('\n').filter(Boolean) : [];

    const contentOut = this._git(`diff ${range} --`);
    const content = contentOut || '';

    log('getDiff', `${files.length} arquivo(s)`);
    return { files, content: content.slice(0, 50000) };
  }
}

module.exports = GitService;
