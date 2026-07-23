/**
 * Tests — SummaryService (hash + decisão de chamar LLM + .docx)
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

jest.mock('mammoth', () => ({
  extractRawText: jest.fn().mockResolvedValue({ value: 'conteudo extraido', messages: [] }),
}));
jest.mock('../utils/llm-client', () => {
  return jest.fn().mockImplementation(() => ({
    ask: jest.fn().mockResolvedValue('# Resumo\n\n- entrada de teste'),
  }));
});
jest.mock('../utils/docx-generator', () => {
  return jest.fn().mockImplementation(() => ({
    generate: jest.fn().mockResolvedValue(Buffer.from('fake docx content')),
  }));
});

const SummaryService = require('../services/summary-service');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siscon-test-ss-'));
const summary = new SummaryService();

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

const dummyFile = (content) => {
  const p = path.join(tmpDir, `test-${Date.now()}.bin`);
  fs.writeFileSync(p, content);
  return p;
};

test('computeHash', () => {
  expect(summary.computeHash(dummyFile('x'))).toMatch(/^[a-f0-9]{64}$/);
});

test('hash deterministico', () => {
  expect(summary.computeHash(dummyFile('A'))).toBe(summary.computeHash(dummyFile('A')));
});

test('hash muda com conteudo', () => {
  expect(summary.computeHash(dummyFile('A'))).not.toBe(summary.computeHash(dummyFile('B')));
});

test('hash igual = SKIP', async () => {
  const fp = dummyFile('x');
  const r = await summary.updateResumo({
    protocolo: 1, docxPath: fp, autor: 'T', dataISO: '2026-01-01',
    lastDocHash: summary.computeHash(fp), force: false,
  });
  expect(r.atualizou).toBe(false);
});

test('force=true chama LLM', async () => {
  const fp = dummyFile('x');
  const r = await summary.updateResumo({
    protocolo: 2, docxPath: fp, autor: 'T', dataISO: '2026-01-01',
    lastDocHash: summary.computeHash(fp), force: true,
  });
  expect(r.atualizou).toBe(true);
});

test('sem hash chama LLM', async () => {
  const r = await summary.updateResumo({
    protocolo: 3, docxPath: dummyFile('x'), autor: 'T', dataISO: '2026-01-01',
    lastDocHash: null,
  });
  expect(r.atualizou).toBe(true);
});

test('salva como .docx', async () => {
  const fp = dummyFile('teste');
  const pasta = path.dirname(fp);
  const docxPath = path.join(pasta, 'resumo.docx');
  try { fs.unlinkSync(docxPath); } catch (_) {}

  await summary.updateResumo({
    protocolo: 4, docxPath: fp, autor: 'T', dataISO: '2026-01-01',
    lastDocHash: null, force: true,
  });

  expect(fs.existsSync(docxPath)).toBe(true);
  expect(fs.existsSync(path.join(pasta, 'resumo.md'))).toBe(false);
});
