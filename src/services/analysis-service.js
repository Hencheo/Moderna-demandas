/**
 * src/services/analysis-service.js
 * Serviço de análise de chamado.
 *
 * Responsabilidade: gerar um resumo completo e estruturado que outro LLM
 * vai consumir depois para verificar o código.
 *
 * Regras:
 * - NUNCA faz checkout de branch (só verifica)
 * - Se branch atual == branch do chamado → análise completa com diff
 * - Se branch atual != branch do chamado → análise parcial + aviso no final
 * - O resumo conta a história da última atualização e faz as perguntas certas
 * - Imagens do .docx serão analisadas (futuro)
 *
 * I/O → FileRepository | git → GitService | ADO → AdoService
 */
const path = require('path');
const LlmClient = require('../utils/llm-client');
const DocxGenerator = require('../utils/docx-generator');
const AdoService = require('./ado-service');
const GitService = require('./git-service');
const FileRepository = require('../repositories/file-repository');

const log = (ctx, msg) =>
  console.log(`[${new Date().toLocaleTimeString('pt-BR')}] [Analysis] ${ctx} → ${msg}`);

const STATUS_FINALIZADOS = ['finalizado', 'cancelado', 'recusado', 'aprovado'];

class AnalysisService {
  constructor() {
    this._llm = new LlmClient();
    this._docx = new DocxGenerator();
    this._ado = new AdoService();
    this._git = new GitService();
    this._fileRepo = new FileRepository();
  }

  async analyze({ protocolo, chamadosDir, docxPath, situacao }) {
    const pasta = chamadosDir || path.dirname(docxPath || '');
    const resumoPath = path.join(pasta, 'resumo.docx');
    const docx = docxPath || this._findDocx(pasta);

    if (situacao && STATUS_FINALIZADOS.includes(situacao.toLowerCase())) {
      log(`#${protocolo}`, `situação "${situacao}" — análise pulada`);
      if (this._fileRepo.exists(resumoPath))
        return { analisou: false, message: 'Chamado finalizado', alerts: [] };
    }

    log(`#${protocolo}`, '--- INÍCIO ---');

    // Carrega resumo anterior (.docx → texto via mammoth)
    let textoAnterior = '';
    if (this._fileRepo.exists(resumoPath)) {
      try {
        const buf = this._fileRepo.readFileBuffer(resumoPath);
        const mammoth = require('mammoth');
        const r = await mammoth.extractRawText({ buf });
        textoAnterior = r.value;
      } catch (_) {}
    }

    // Verifica branch (NUNCA checkout)
    const branchAtual = this._git.currentBranch();
    const branchesLocais = this._git.listBranches(String(protocolo));
    const targetBranch = branchesLocais.find(b => b.includes('_DEV')) || branchesLocais[0] || null;
    const naBranchCorreta = targetBranch && branchAtual === targetBranch;

    let diffArquivos = [];
    let diffTexto = '';
    let prInfo = null;

    if (naBranchCorreta) {
      log(`#${protocolo}`, `branch correta: ${branchAtual}`);
      const diff = this._git.getDiff('Development...HEAD');
      diffArquivos = diff.files;
      diffTexto = diff.content;
    } else {
      log(`#${protocolo}`, `branch atual: ${branchAtual} | alvo: ${targetBranch || 'nenhuma'}`);
    }

    // ADO complementar (PR info)
    try {
      const remote = await this._ado.searchBranches(String(protocolo));
      if (remote.length > 0) {
        const rb = remote.find(b => b.name.includes('_DEV')) || remote[0];
        prInfo = await this._ado.findPRByBranch(rb.ref);
      }
    } catch (_) {}

    // Gera diagnóstico
    const diagnostic = await this._generateDiagnostic({
      protocolo,
      textoAnterior,
      docx,
      diffArquivos,
      diffTexto,
      branchAtual,
      targetBranch,
      naBranchCorreta,
      prInfo,
    });

    // Salva resumo.docx
    if (diagnostic) {
      const texto = textoAnterior
        ? `${textoAnterior}\n\n---\n\n${diagnostic}`
        : diagnostic;
      const buffer = await this._docx.generate(
        `Chamado ${protocolo} - Resumo`,
        texto
      );
      this._fileRepo.writeFile(resumoPath, buffer);
      log(`#${protocolo}`, 'resumo.docx salvo');
    }

    log(`#${protocolo}`, '--- FIM ---');
    return {
      analisou: !!diagnostic,
      message: diagnostic ? 'Resumo gerado' : 'Falha',
      alerts: [],
    };
  }

  async _generateDiagnostic({
    protocolo, textoAnterior, docx,
    diffArquivos, diffTexto,
    branchAtual, targetBranch, naBranchCorreta, prInfo,
  }) {
    const docContent = docx && this._fileRepo.exists(docx)
      ? await this._extractDocxText(docx)
      : '';

    if (naBranchCorreta && diffTexto) {
      // === MODO COMPLETO: na branch certa com diff ===
      const system = `Você é um analista técnico especializado em C# ASP.NET MVC.

Produza um relatório ESTRUTURADO de análise de chamado seguindo este formato.
Cada seção será lida e processada por outra inteligência artificial.

## Chamado #{numero}

### Problema Reportado
{descrição objetiva do problema}

### Histórico de Atualizações
{cronologia: quem fez o quê e quando, extraído do documento}

### Branch Analisada
{nome da branch}

### Resumo das Alterações
{principais arquivos alterados e o que mudou em cada um}

### Análise Técnica

1. **Causa Raiz:** As alterações explicam o erro reportado? Justifique.
2. **Risco de Regressão:** Qual a probabilidade de quebrar outras funcionalidades?
3. **Impacto em Banco:** Há scripts de banco ou procedures? Estão corretos?
4. **Padrões de Código:** As alterações seguem os padrões do projeto (camadas, DbUp, resources)?
5. **Perguntas Pendentes:** O que ainda precisa ser verificado no código para confirmar o diagnóstico?

### Conclusão
{recomendação final}`;

      const prompt = `## Chamado #${protocolo}
${textoAnterior ? `\n### Análise Anterior\n${textoAnterior.slice(0, 5000)}` : ''}
${docContent ? `\n### Conteúdo do Documento\n${docContent.slice(0, 10000)}` : ''}

### Branch
${branchAtual}
${prInfo ? `\nPR #${prInfo.id}: ${prInfo.title}` : ''}

### Diff (${diffArquivos.length} arquivos)
${diffTexto.slice(0, 25000)}

Gere o relatório estruturado.`;

      try {
        log(`#${protocolo}`, 'LLM — modo completo com diff...');
        return await this._llm.ask(system, prompt);
      } catch (err) {
        log(`#${protocolo}`, `erro LLM: ${err.message}`);
        return null;
      }
    }

    // === MODO PARCIAL: sem diff (branch errada ou sem branch) ===
    const system = `Você é um analista técnico.

Produza um relatório ESTRUTURADO seguindo este formato.

## Chamado #{numero}

### Problema Reportado
{descrição objetiva do problema extraída do documento}

### Histórico de Atualizações
{cronologia: quem fez o quê e quando}

### Branch Atual
{nome da branch atual — não é a branch do chamado}

### Conteúdo Disponível para Análise
{o que foi possível extrair do documento}

### Perguntas para Verificação
{liste perguntas objetivas que outro desenvolvedor/LLM precisa responder ao analisar o código:
- O erro descrito foi causado por alterações recentes?
- Qual arquivo/controller/model foi alterado?
- Há procedure ou script de banco envolvido?
- O que precisa ser verificado no diff?
}

**Nota:** Para análise completa (diff do código, verificação de alterações, risco de regressão), faça checkout para a branch \`${targetBranch || 'do chamado'}\` e execute a análise novamente.`;

    const branchInfo = targetBranch
      ? `Branch atual: ${branchAtual}\nBranch do chamado: ${targetBranch} (diferente — análise parcial)`
      : `Branch atual: ${branchAtual}\nNenhuma branch local encontrada para #${protocolo}.`;

    const prompt = `## Chamado #${protocolo}
${textoAnterior ? `\n### Análise Anterior\n${textoAnterior.slice(0, 5000)}` : ''}
${docContent ? `\n### Conteúdo do Documento\n${docContent.slice(0, 15000)}` : ''}

### Branches
${branchInfo}
${prInfo ? `\nPR remoto: #${prInfo.id} - ${prInfo.title}` : ''}

Gere o relatório parcial.`;

    try {
      log(`#${protocolo}`, `LLM — modo parcial (branch: ${branchAtual})...`);
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
    const docx = files.filter(f => f.endsWith('.docx') && f !== 'resumo.docx').sort().reverse();
    return docx.length > 0 ? path.join(pasta, docx[0]) : null;
  }
}

module.exports = AnalysisService;
