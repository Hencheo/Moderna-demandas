/**
 * src/utils/docx-generator.js
 * Utilitário para gerar .docx formatados a partir de texto markdown.
 */
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');

class DocxGenerator {
  async generate(title, markdown) {
    const children = this._parseMarkdown(markdown, title);
    const doc = new Document({
      title,
      styles: { default: { document: { run: { size: 22, font: 'Calibri' } } } },
      sections: [{ children }],
    });
    return Buffer.from(await Packer.toBuffer(doc));
  }

  _parseMarkdown(markdown, title) {
    const p = [];

    p.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 300 } }));
    p.push(new Paragraph({ spacing: { after: 200 }, thematicBreak: true }));

    if (!markdown) { p.push(new Paragraph('(vazio)')); return p; }

    const lines = markdown.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // ## ou ### heading
      const h = line.match(/^(#{2,3})\s+(.+)/);
      if (h) {
        const lvl = h[1].length === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
        p.push(new Paragraph({ text: h[2], heading: lvl, spacing: { before: 300, after: 100 } }));
        continue;
      }

      // Lista não ordenada
      const ul = line.match(/^[-*]\s+(.+)/);
      if (ul) {
        p.push(new Paragraph({ text: ul[1], bullet: { level: 0 }, spacing: { after: 60 } }));
        continue;
      }

      // Lista ordenada — com suporte a **negrito** no conteúdo
      const ol = line.match(/^(\d+[.)])\s+(.+)/);
      if (ol) {
        const text = ol[2];
        if (text.includes('**')) {
          p.push(this._parseBoldLine(text));
        } else {
          p.push(new Paragraph({ text, spacing: { after: 60 } }));
        }
        continue;
      }

      // Linha com **negrito** (parágrafo normal)
      if (line.includes('**')) {
        p.push(this._parseBoldLine(line));
        continue;
      }

      // Parágrafo normal
      p.push(new Paragraph({ text: line, spacing: { after: 120 } }));
    }

    return p;
  }

  _parseBoldLine(line) {
    const parts = [];
    const regex = /\*\*(.+?)\*\*/g;
    let last = 0, m;
    while ((m = regex.exec(line)) !== null) {
      if (m.index > last) parts.push(new TextRun({ text: line.slice(last, m.index) }));
      parts.push(new TextRun({ text: m[1], bold: true }));
      last = m.index + m[0].length;
    }
    if (last < line.length) parts.push(new TextRun({ text: line.slice(last) }));
    return new Paragraph({ children: parts, spacing: { after: 120 } });
  }
}

module.exports = DocxGenerator;
