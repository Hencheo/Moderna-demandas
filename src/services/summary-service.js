/**
 * src/services/summary-service.js
 * Serviço de sumarização de documentos de chamado.
 *
 * Critério inteligente: SHA256 do .docx. Se o hash bater com o último
 * processado, LLM NÃO é chamado (zero tokens desperdiçados).
 *
 * Gatilho manual: force=true ignora o hash e sempre chama o LLM.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const LlmClient = require('../utils/llm-client');

const log = (ctx, msg) =>
  console.log(`[${new Date().toLocaleTimeString('pt-BR')}] [Summary] ${ctx} → ${msg}`);

class SummaryService {
  constructor() {
    this._llm = new LlmClient();
  }

  /**
   * Computa SHA256 de um arquivo.
   * @param {string} filePath
   * @returns {string}
   */
  computeHash(filePath) {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Extrai texto puro de .docx.
   * @param {string} filePath
   * @returns {Promise<string>}
   */
  async extractText(filePath) {
    log('extract', `lendo ${path.basename(filePath)}...`);
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    log('extract', `${result.value.length} caracteres`);
    return result.value;
  }

  /**
   * Atualiza o resumo.md na pasta do chamado.
   *
   * @param {Object} params
   * @param {number} params.protocolo
   * @param {string} params.docxPath
   * @param {string} params.autor
   * @param {string} params.dataISO
   * @param {string|null} params.lastDocHash - Hash do último doc processado (do state)
   * @param {boolean} [params.force] - true = ignora hash, sempre chama LLM
   * @returns {Promise<{atualizou: boolean, hash: string, message: string}>}
   */
  async updateResumo({ protocolo, docxPath, autor, dataISO, lastDocHash, force }) {
    // 1. Hash do documento atual
    const docHash = this.computeHash(docxPath);
    log(`#${protocolo}`, `hash=${docHash.slice(0, 16)}...`);

    // 2. Se não for força e hash bater com o último → skip
    if (!force && lastDocHash && docHash === lastDocHash) {
      log(`#${protocolo}`, `hash igual ao último processado — SKIP (sem LLM)`);
      return { atualizou: false, hash: docHash, message: 'Documento não mudou desde o último resumo' };
    }

    // 3. Lê resumo anterior
    const pasta = path.dirname(docxPath);
    const resumoPath = path.join(pasta, 'resumo.md');
    let resumoAnterior = '';
    if (fs.existsSync(resumoPath)) {
      resumoAnterior = fs.readFileSync(resumoPath, 'utf-8');
      log(`#${protocolo}`, `resumo.md existente (${resumoAnterior.length} chars)`);
    } else {
      log(`#${protocolo}`, 'resumo.md não existe — criando');
    }

    // 4. Extrai texto
    const textoNovo = await this.extractText(docxPath);
    if (!textoNovo.trim()) {
      log(`#${protocolo}`, 'documento vazio — pulando LLM');
      return { atualizou: false, hash: docHash, message: 'Documento vazio' };
    }

    // 5. Chama LLM
    const dataFormatada = new Date(dataISO).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const system = `Você é um assistente que mantém um histórico técnico.
Compare o conteúdo do novo documento com o resumo anterior.
Produza o resumo.md ATUALIZADO seguindo:

1. Mantenha TODAS as entradas anteriores (nunca apague)
2. Adicione APENAS a nova entrada, extraindo o que NÃO está no histórico
3. NUNCA duplique conteúdo
4. Formato: markdown, cada entrada com data, autor e descrição
5. Se for o primeiro, crie o arquivo completo`;

    const prompt = `## RESUMO ANTERIOR
${resumoAnterior || '(vazio)'}

## NOVO DOCUMENTO
Data: ${dataFormatada}
Autor: ${autor}
Arquivo: ${path.basename(docxPath)}

## CONTEÚDO
${textoNovo.slice(0, 15000)}${textoNovo.length > 15000 ? '\n\n... (truncado)' : ''}

## INSTRUÇÃO
Retorne APENAS o resumo.md completo atualizado.`;

    log(`#${protocolo}`, `enviando para LLM (${textoNovo.length} chars)...`);
    const resultado = await this._llm.ask(system, prompt);
    if (!resultado) {
      log(`#${protocolo}`, 'LLM retornou vazio');
      return { atualizou: false, hash: docHash, message: 'LLM retornou vazio' };
    }

    // 6. Salva
    fs.writeFileSync(resumoPath, resultado, 'utf-8');
    log(`#${protocolo}`, `resumo.md atualizado (${resultado.length} chars)`);
    return { atualizou: true, hash: docHash, message: 'Resumo atualizado' };
  }
}

module.exports = SummaryService;
