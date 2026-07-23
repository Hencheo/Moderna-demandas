/**
 * src/services/summary-service.js
 * Serviço de sumarização de documentos de chamado.
 *
 * Critério inteligente: SHA256 do .docx. Se o hash bater com o último
 * processado, LLM NÃO é chamado (zero tokens desperdiçados).
 *
 * Gatilho manual: force=true ignora o hash e sempre chama o LLM.
 *
 * Resumo gerado em .docx formatado (abre nativamente no OnlyOffice).
 */
const crypto = require('crypto');
const path = require('path');
const mammoth = require('mammoth');
const LlmClient = require('../utils/llm-client');
const DocxGenerator = require('../utils/docx-generator');
const FileRepository = require('../repositories/file-repository');

const log = (ctx, msg) =>
  console.log(`[${new Date().toLocaleTimeString('pt-BR')}] [Summary] ${ctx} → ${msg}`);

class SummaryService {
  constructor() {
    this._llm = new LlmClient();
    this._docx = new DocxGenerator();
    this._fileRepo = new FileRepository();
  }

  computeHash(filePath) {
    const buffer = this._fileRepo.readFileBuffer(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  async extractText(filePath) {
    log('extract', `lendo ${path.basename(filePath)}...`);
    const buffer = this._fileRepo.readFileBuffer(filePath);
    const result = await mammoth.extractRawText({ buffer });
    log('extract', `${result.value.length} caracteres`);
    return result.value;
  }

  async updateResumo({ protocolo, docxPath, autor, dataISO, lastDocHash, force }) {
    const docHash = this.computeHash(docxPath);
    log(`#${protocolo}`, `hash=${docHash.slice(0, 16)}...`);

    if (!force && lastDocHash && docHash === lastDocHash) {
      log(`#${protocolo}`, `hash igual ao último — SKIP (sem LLM)`);
      return { atualizou: false, hash: docHash, message: 'Documento não mudou' };
    }

    const pasta = path.dirname(docxPath);
    const resumoPath = path.join(pasta, 'resumo.docx');

    // Lê resumo anterior (se existir)
    let resumoAnterior = '';
    if (this._fileRepo.exists(resumoPath)) {
      // Extrai texto do .docx anterior para contexto
      try {
        const buffer = this._fileRepo.readFileBuffer(resumoPath);
        const result = await mammoth.extractRawText({ buffer });
        resumoAnterior = result.value;
        log(`#${protocolo}`, `resumo.docx existente (${resumoAnterior.length} chars)`);
      } catch (_) {
        log(`#${protocolo}`, 'resumo.docx existente mas não foi possível ler');
      }
    } else {
      log(`#${protocolo}`, 'resumo.docx não existe — criando');
    }

    // Extrai texto do documento novo
    const textoNovo = await this.extractText(docxPath);
    if (!textoNovo.trim()) {
      log(`#${protocolo}`, 'documento vazio');
      return { atualizou: false, hash: docHash, message: 'Documento vazio' };
    }

    // Chama LLM
    const dataFormatada = new Date(dataISO).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const system = `Você é um assistente que mantém um histórico técnico.
Compare o conteúdo do novo documento com o resumo anterior.
Produza o resumo ATUALIZADO seguindo:

1. Mantenha TODAS as entradas anteriores
2. Adicione APENAS a nova entrada, extraindo o que NÃO está no histórico
3. NUNCA duplique conteúdo
4. Formato: cada entrada com data, autor e descrição concisa
5. Se for o primeiro, crie o conteúdo completo`;

    const prompt = `## RESUMO ANTERIOR
${resumoAnterior || '(vazio)'}

## NOVO DOCUMENTO
Data: ${dataFormatada}
Autor: ${autor}
Arquivo: ${path.basename(docxPath)}

## CONTEÚDO
${textoNovo.slice(0, 15000)}${textoNovo.length > 15000 ? '\n\n...(truncado)' : ''}

Retorne APENAS o resumo completo atualizado.`;

    log(`#${protocolo}`, `enviando para LLM (${textoNovo.length} chars)...`);
    const resultado = await this._llm.ask(system, prompt);
    if (!resultado) {
      log(`#${protocolo}`, 'LLM retornou vazio');
      return { atualizou: false, hash: docHash, message: 'LLM vazio' };
    }

    // Gera .docx formatado
    const titulo = `Histórico - Chamado ${protocolo}`;
    const buffer = await this._docx.generate(titulo, resultado);
    this._fileRepo.writeFile(resumoPath, buffer);

    log(`#${protocolo}`, `resumo.docx atualizado (${resultado.length} chars)`);
    return { atualizou: true, hash: docHash, message: 'Resumo atualizado' };
  }
}

module.exports = SummaryService;
