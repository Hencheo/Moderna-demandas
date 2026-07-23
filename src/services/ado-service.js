/**
 * src/services/ado-service.js
 * Serviço de integração com Azure DevOps API.
 *
 * Responsabilidade: buscar branch, PR, diff — tudo via API REST.
 * NUNCA faz checkout ou modifica o repositório local.
 * NUNCA contém regra de negócio de análise.
 */
const { execSync } = require('child_process');
const config = require('../config');

const log = (ctx, msg) =>
  console.log(`[${new Date().toLocaleTimeString('pt-BR')}] [ADO] ${ctx} → ${msg}`);

const ORG = config.ado.org || 'modernasistemas';
const PROJECT = config.ado.project || 'Moderna.Net';
const REPO = config.ado.repo || 'Moderna.Net';
const API_BASE = `https://dev.azure.com/${ORG}/${PROJECT}/_apis/git/repositories/${REPO}`;

class AdoService {
  constructor() {
    this._pat = null;
  }

  /** Recupera PAT do Git Credential Manager */
  _getPat() {
    if (this._pat) return this._pat;
    try {
      const cmd = `git credential-manager get <<< "protocol=https
host=dev.azure.com
path=/${ORG}/${PROJECT}/_git/${REPO}" 2>/dev/null`;
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000, shell: 'bash' });
      const match = output.match(/^password=(.+)$/m);
      if (match) {
        this._pat = match[1].trim();
        log('auth', 'PAT recuperado do Git Credential Manager');
        return this._pat;
      }
    } catch (_) {}
    // Fallback: env var
    this._pat = process.env.ADO_PAT || '';
    if (!this._pat) log('auth', 'PAT não encontrado — usar env ADO_PAT');
    return this._pat;
  }

  async _request(path) {
    const pat = this._getPat();
    if (!pat) throw new Error('ADO: PAT não disponível');

    const url = `${API_BASE}/${path}${path.includes('?') ? '&' : '?'}api-version=7.1`;
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`:${pat}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`ADO API error ${resp.status}: ${text.slice(0, 200)}`);
    }
    return resp.json();
  }

  /**
   * Busca branches no ADO que contêm o termo.
   * @param {string} term - Ex: "2580974"
   * @returns {Promise<{name: string, ref: string}[]>}
   */
  async searchBranches(term) {
    log('searchBranches', `buscando refs contendo "${term}"...`);
    const data = await this._request(`refs?filterContains=${term}`);
    const refs = (data.value || []).map(r => ({
      name: r.name.replace('refs/heads/', ''),
      ref: r.name,
    }));
    log('searchBranches', `${refs.length} branch(es) encontrada(s)`);
    return refs;
  }

  /**
   * Busca PRs abertos para uma branch.
   * @param {string} branchName - Ex: "refs/heads/Develop/Rafael/2580974_DEV"
   * @returns {Promise<Object|null>}
   */
  async findPRByBranch(branchName) {
    log('findPRByBranch', `buscando PR para ${branchName}...`);
    const data = await this._request(
      `pullRequests?searchCriteria.sourceRefName=${encodeURIComponent(branchName)}` +
      `&searchCriteria.status=active`
    );
    const prs = data.value || [];
    if (prs.length === 0) {
      log('findPRByBranch', 'nenhum PR aberto encontrado');
      return null;
    }
    const pr = prs[0];
    log('findPRByBranch', `PR #${pr.pullRequestId} encontrado: "${pr.title}"`);
    return {
      id: pr.pullRequestId,
      title: pr.title,
      url: pr.url,
      sourceBranch: pr.sourceRefName,
      targetBranch: pr.targetRefName,
      status: pr.status,
      creationDate: pr.creationDate,
      sourceRefCommit: {
        commitId: pr.lastMergeSourceCommit?.commitId,
      },
      targetRefCommit: {
        commitId: pr.lastMergeTargetCommit?.commitId,
      },
    };
  }

  /**
   * Obtém diff de commits via API (sem checkout local).
   * @param {string} baseCommit - commonRefCommit.commitId
   * @param {string} targetCommit - sourceRefCommit.commitId
   * @returns {Promise<{files: string[], diffText: string}>}
   */
  async getDiff(baseCommit, targetCommit) {
    log('getDiff', `buscando diff ${baseCommit.slice(0, 8)}..${targetCommit.slice(0, 8)}...`);
    const data = await this._request(
      `diffs/commits?baseVersion=${baseCommit}&targetVersion=${targetCommit}` +
      `&baseVersionType=commit&targetVersionType=commit`
    );

    const changes = data.changes || data.changeEntries || [];
    const files = changes
      .filter(c => c.item && !c.item.isFolder)
      .map(c => c.item.path);

    log('getDiff', `${files.length} arquivo(s) alterado(s)`);
    return { files, diffData: data };
  }

  /**
   * Busca o conteúdo de um arquivo em um commit específico.
   * @param {string} path - Caminho no repo (ex: "/ModernaMVCApp/Controllers/...")
   * @param {string} commitId
   * @returns {Promise<string|null>}
   */
  async getFileContent(path, commitId) {
    try {
      const encoded = encodeURIComponent(path);
      const data = await this._request(
        `items?path=${encoded}&versionDescriptor.version=${commitId}` +
        `&versionDescriptor.versionType=commit`
      );
      // Items API retorna o conteúdo bruto para arquivos texto
      return typeof data === 'string' ? data : JSON.stringify(data);
    } catch (err) {
      log('getFileContent', `erro ao buscar ${path}: ${err.message}`);
      return null;
    }
  }
}

module.exports = AdoService;
