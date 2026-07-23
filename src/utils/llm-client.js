/**
 * src/utils/llm-client.js
 * Cliente para API de LLM (OpenAI-compatible).
 *
 * Usa o mesmo endpoint + chave do Hermes (Nous Research).
 * Zero regra de negócio — só transporte.
 */
const config = require('../config');

class LlmClient {
  /**
   * Envia prompt e retorna resposta de texto.
   *
   * @param {string} system - Instrução de sistema
   * @param {string} prompt - Conteúdo do usuário
   * @param {Object} [options]
   * @param {string} [options.model]
   * @param {number} [options.maxTokens]
   * @returns {Promise<string>}
   */
  async ask(system, prompt, options = {}) {
    const model = options.model || config.llm.model;
    const maxTokens = options.maxTokens || config.llm.maxTokens;

    const body = {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
    };

    const resp = await fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.llm.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      throw new Error(`LLM API error ${resp.status}: ${err.slice(0, 200)}`);
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }
}

module.exports = LlmClient;
