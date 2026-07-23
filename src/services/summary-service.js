/**
 * src/services/summary-service.js
 * Serviço de sumarização de documentos de chamado.
 *
 * Responsabilidade: dado um .docx baixado, extrai o texto, chama o LLM
 * para comparar com o resumo anterior (se existir) e atualiza o
 * resumo.md na pasta do chamado — sem duplicar mensagens.
 *
 * Depende de: LlmClient (transporte), FileRepository (I/O).
 */
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
   * Extrai o texto puro de um arquivo .docx.
   * @param {string} filePath
   * @returns {Promise<string>}
   */
  async extractText(filePath) {
    log('extract', `lendo ${path.basename(filePath)}...`);
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;
    log('extract', `${text.length} caracteres extraídos`);
    if (result.messages.length > 0) {
      log('extract', `warnings: ${result.messages.length}`);
    }
    return text;
  }

  /**
   * Atualiza o resumo.md na pasta do chamado.
   *
   * @param {Object} params
   * @param {number} params.protocolo
   * @param {string} params.docxPath - Caminho do .docx baixado
   * @param {string} params.autor - Quem postou o anexo
   * @param {string} params.dataISO - Data de postagem (ISO)
   */
  async updateResumo({ protocolo, docxPath, autor, dataISO }) {
    const pasta = path.dirname(docxPath);
    const resumoPath = path.join(pasta, 'resumo.md');

    // 1. Lê resumo anterior (se existir)
    let resumoAnterior = '';
    if (fs.existsSync(resumoPath)) {
      resumoAnterior = fs.readFileSync(resumoPath, 'utf-8');
      log('update', `resumo.md existente (${resumoAnterior.length} chars)`);
    } else {
      log('update', 'resumo.md não existe — será criado');
    }

    // 2. Extrai texto do .docx novo
    const textoNovo = await this.extractText(docxPath);
    if (!textoNovo.trim()) {
      log('update', 'documento vazio — pulando LLM');
      return false;
    }

    // 3. Prepara prompt e chama LLM
    const dataFormatada = new Date(dataISO).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const system = `Você é um assistente que mantém um histórico de atualizações de chamados técnicos.
Sua função é comparar o conteúdo de um novo documento com o resumo anterior (se houver)
e produzir um resumo.md ATUALIZADO, seguindo estas regras:

1. Mantenha TODAS as entradas anteriores do histórico (nunca apague)
2. Adicione APENAS a nova entrada do documento atual, extraindo as informações
   que não estavam presentes no resumo anterior
3. NUNCA duplique conteúdo — se algo já está no histórico, não repita
4. Formato: markdown, cada entrada com data, autor e descrição concisa
5. Se for o primeiro resumo (não há anterior), crie o arquivo completo`;

    const prompt = `## RESUMO ANTERIOR (resumo.md)
${resumoAnterior || '(vazio — primeiro documento)'}

## NOVO DOCUMENTO
Data: ${dataFormatada}
Autor: ${autor}
Arquivo: ${path.basename(docxPath)}

## CONTEÚDO DO NOVO DOCUMENTO
${textoNovo.slice(0, 15000)}${textoNovo.length > 15000 ? '\n\n... (conteúdo truncado)' : ''}

## INSTRUÇÃO
Atualize o resumo.md com a nova entrada baseada no documento acima.
NÃO duplique informações já presentes no resumo anterior.
Retorne APENAS o conteúdo completo do resumo.md atualizado.`;

    log('update', `enviando para LLM (${textoNovo.length} chars no doc)...`);

    const resultado = await this._llm.ask(system, prompt);
    if (!resultado) {
      log('update', 'LLM retornou vazio — mantendo resumo anterior');
      return false;
    }

    // 4. Salva resumo atualizado
    fs.writeFileSync(resumoPath, resultado, 'utf-8');
    log('update', `resumo.md atualizado (${resultado.length} chars)`);
    return true;
  }
}

module.exports = SummaryService;
