/**
 * src/utils/docx-generator.js
 * Utilitário para gerar arquivos .docx formatados a partir de texto markdown.
 *
 * Responsabilidade: receber texto markdown e gerar um .docx com formatação
 * limpa (títulos, parágrafos, listas, negrito). Não contém regra de negócio.
 */
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
        BulletList, NumberedList, convertInchesToTwip } = require('docx');

class DocxGenerator {
  /**
   * Gera um Buffer .docx a partir de texto markdown.
   * @param {string} title - Título do documento
   * @param {string} markdown - Conteúdo em markdown simples
   * @returns {Promise<Buffer>}
   */
  async generate(title, markdown) {
    const children = this._parseMarkdown(markdown, title);
    const doc = new Document({
      title,
      description: 'Resumo de chamado',
      styles: { default: { document: { run: { size: 22, font: 'Calibri' } } } },
      sections: [{ children }],
    });
    return Buffer.from(await Packer.toBuffer(doc));
  }

  _parseMarkdown(markdown, title) {
    const paragraphs = [];

    // Título principal
    paragraphs.push(
      new Paragraph({
        text: title,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      })
    );
    paragraphs.push(this._line());

    if (!markdown) {
      paragraphs.push(new Paragraph('(vazio)'));
      return paragraphs;
    }

    const lines = markdown.split('\n');
    let inList = false;
    let listType = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line) {
        if (inList) { inList = false; listType = null; }
        continue;
      }

      // Cabeçalho ## ou ###
      const hMatch = line.match(/^(#{2,3})\s+(.+)/);
      if (hMatch) {
        if (inList) { inList = false; listType = null; }
        const level = hMatch[1].length === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
        paragraphs.push(
          new Paragraph({
            text: hMatch[2],
            heading: level,
            spacing: { before: 300, after: 100 },
          })
        );
        continue;
      }

      // Lista não ordenada (- item ou * item)
      const ulMatch = line.match(/^[-*]\s+(.+)/);
      if (ulMatch) {
        paragraphs.push(
          new Paragraph({
            text: ulMatch[1],
            bullet: { level: 0 },
            spacing: { after: 60 },
          })
        );
        inList = true;
        continue;
      }

      // Lista ordenada (1. item)
      const olMatch = line.match(/^\d+[.)]\s+(.+)/);
      if (olMatch) {
        paragraphs.push(
          new Paragraph({
            text: olMatch[1],
            numbering: { reference: 1, level: 0 },
            spacing: { after: 60 },
          })
        );
        inList = true;
        continue;
      }

      // Negrito **texto** dentro da linha
      if (line.includes('**')) {
        if (inList) { inList = false; listType = null; }
        paragraphs.push(this._parseBoldLine(line));
        continue;
      }

      // Parágrafo normal
      if (inList) { inList = false; listType = null; }
      paragraphs.push(new Paragraph({ text: line, spacing: { after: 120 } }));
    }

    return paragraphs;
  }

  _parseBoldLine(line) {
    const parts = [];
    let remaining = line;
    const regex = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(remaining)) !== null) {
      if (match.index > lastIndex) {
        parts.push(new TextRun({ text: remaining.slice(lastIndex, match.index) }));
      }
      parts.push(new TextRun({ text: match[1], bold: true }));
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < remaining.length) {
      parts.push(new TextRun({ text: remaining.slice(lastIndex) }));
    }

    return new Paragraph({ children: parts, spacing: { after: 120 } });
  }

  _line() {
    return new Paragraph({
      spacing: { after: 200 },
      thematicBreak: true,
    });
  }
}

module.exports = DocxGenerator;
