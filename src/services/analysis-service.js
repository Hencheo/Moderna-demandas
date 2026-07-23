/**
 * src/services/analysis-service.js
 * Serviço de análise de chamado — orquestra a geração de diagnóstico.
 *
 * Responsabilidade: coordenar a busca de branches, diff e LLM para gerar
 * um diagnóstico completo do chamado.
 *
 * I/O de arquivo: delega ao FileRepository.
 * Interação com git: delega ao GitService.
 * Interação com ADO: delega ao AdoService.
 */
const path = require('path');
const LlmClient = require('../utils/llm-client');
const DocxGenerator = require('../utils/docx-generator');
const AdoService = require('./ado-service');
const GitService = require('./git-service');
const FileRepository = require('../repositories/file-repository');

const log = (ctx, msg) =>
  console.log(`[${new Date().toLocaleTimeString('pt-BR')}] [Analysis] ${ctx} → ${msg}`);

class AnalysisService {
  constructor() {
    this._llm = new LlmClient();
    this._docx = new DocxGenerator();
    this._ado = new AdoService();
    this._git = new GitService();
    this._fileRepo = new FileRepository();
  }

  async analyze({ protocolo, chamadosDir, docxPath }) {
    const pasta = chamadosDir || path.dirname(docxPath || '');
    const resumoPath = path.join(pasta, 'resumo.md');
    const docx = docxPath || this._findDocx(pasta);

    log(`#${protocolo}`, '--- INÍCIO ---');

    const resumoAtual = this._fileRepo.exists(resumoPath)
      ? this._fileRepo.readFile(resumoPath)
      : '';

    // 1. Busca branches LOCAIS
    const branchesLocais = this._git.listBranches(String(protocolo));
    const branchAtual = this._git.currentBranch();
    let targetBranch = null;
    let diffArquivos = [];
    let diffTexto = '';
    const alerts = [];

    if (branchesLocais.length > 0) {
      targetBranch = branchesLocais.find(b => b.includes('_DEV')) || branchesLocais[0];
      log(`#${protocolo}`, `branch local: ${targetBranch}`);

      if (branchAtual === targetBranch) {
        log(`#${protocolo}`, 'branch atual coincide — diff local');
        const diff = this._git.getDiff('Development...HEAD');
        diffArquivos = diff.files;
        diffTexto = diff.content;
      } else {
        alerts.push(
          `⚠️ **Branch diferente:** você está em \`${branchAtual}\`, ` +
          `mas #${protocolo} está em \`${targetBranch}\`. ` +
          `Para análise completa, faça checkout manual.`
        );
      }

      const outras = branchesLocais.filter(b => b !== targetBranch);
      if (outras.length > 0) alerts.push(`ℹ️ Outras branches: ${outras.join(', ')}`);
    } else {
      alerts.push(`ℹ️ Nenhuma branch local para #${protocolo}.`);
    }

    // 2. ADO como fallback
    let prInfo = null;
    if (!diffArquivos.length) {
      try {
        const remoteBranches = await this._ado.searchBranches(String(protocolo));
        if (remoteBranches.length > 0) {
          const rb = remoteBranches.find(b => b.name.includes('_DEV')) || remoteBranches[0];
          prInfo = await this._ado.findPRByBranch(rb.ref);
        }
      } catch (_) {}
    }

    // 3. Gera diagnóstico via LLM
    const diagnostic = await this._generateDiagnostic({
      protocolo, resumoAtual, docx, diffArquivos, diffTexto,
      branchAtual, targetBranch, branchesLocais, prInfo, alerts,
    });

    // 4. Atualiza resumo.docx
    if (diagnostic) {
      const pasta = chamadosDir || path.dirname(docxPath || '');
      const resumoPath = path.join(pasta, 'resumo.docx');

      // Lê resumo anterior (.docx) se existir
      let textoAnterior = '';
      if (this._fileRepo.exists(resumoPath)) {
        try {
          const buffer = this._fileRepo.readFileBuffer(resumoPath);
          const mammoth = require('mammoth');
          const r = await mammoth.extractRawText({ buffer });
          textoAnterior = r.value;
        } catch (_) {}
      }

      const novoCompleto = textoAnterior
        ? `${textoAnterior}\n\n${diagnostic}`
        : diagnostic;

      const buffer = await this._docx.generate(
        `Diagnóstico - Chamado ${protocolo}`,
        novoCompleto
      );
      this._fileRepo.writeFile(resumoPath, buffer);
      log(`#${protocolo}`, 'resumo.docx atualizado');
    }

    log(`#${protocolo}`, '--- FIM ---');
    return { analisou: !!diagnostic, message: diagnostic ? 'Diagnóstico gerado' : 'Falha', alerts };
  }

  async _generateDiagnostic({ protocolo, resumoAtual, docx, diffArquivos, diffTexto, branchAtual, targetBranch, branchesLocais, prInfo, alerts }) {
    const system = `Você é um analista técnico especializado em C# ASP.NET MVC.
Gere um diagnóstico de chamado seguindo este formato:

## 🔍 Diagnóstico — Chamado #{numero}

### Branch / PR
{status}

### O que o chamado pede
{resumo do problema}

### O que foi alterado
{principais arquivos e mudanças}

### Análise
{cruzar problema com alterações}
{risco de regressão?}
{precisa de verificação em banco?}

### Ação recomendada
{próximos passos}`;

    const branchInfo = targetBranch
      ? `Branch: ${targetBranch}${branchAtual === targetBranch ? ' (atual)' : ` (você está em ${branchAtual})`}`
      : 'Nenhuma branch local';

    const diffSection = diffTexto
      ? `### Diff\n\`\`\`\n${diffTexto.slice(0, 20000)}\n\`\`\``
      : diffArquivos.length > 0
        ? `Arquivos:\n${diffArquivos.join('\n')}`
        : 'Diff não disponível.';

    const docContent = docx && this._fileRepo.exists(docx)
      ? await this._extractDocxText(docx)
      : '';

    const prompt = `## Chamado #${protocolo}
${resumoAtual ? `\n### Resumo\n${resumoAtual}` : ''}
${docContent ? `\n### Documento\n${docContent.slice(0, 10000)}` : ''}

### Branches
${branchInfo}
${branchesLocais.length > 1 ? `\nTodas: ${branchesLocais.join(', ')}` : ''}
${prInfo ? `\nPR remoto: #${prInfo.id} - ${prInfo.title}` : ''}

${diffSection}
${alerts.length ? `\n### Alertas\n${alerts.join('\n')}` : ''}

Gere o diagnóstico completo.`;

    try {
      log(`#${protocolo}`, 'enviando para LLM...');
      return await this._llm.ask(system, prompt);
    } catch (err) {
      log(`#${protocolo}`, `erro LLM: ${err.message}`);
      return null;
    }
  }

  async _extractDocxText(filePath) {
    try {
      const buffer = this._fileRepo.readFileBuffer(filePath);
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value.slice(0, 15000);
    } catch { return ''; }
  }

  _findDocx(pasta) {
    if (!this._fileRepo.exists(pasta)) return null;
    const files = this._fileRepo.readdir(pasta);
    const docx = files.filter(f => f.endsWith('.docx')).sort().reverse();
    return docx.length > 0 ? path.join(pasta, docx[0]) : null;
  }
}

module.exports = AnalysisService;
