/**
 * Tests — SummaryService (hash + decisão de chamar LLM)
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

// Mock mammoth e LlmClient para testes que chamam updateResumo
jest.mock('mammoth', () => ({
  extractRawText: jest.fn().mockResolvedValue({ value: 'conteudo extraido do doc', messages: [] }),
}));
jest.mock('../utils/llm-client', () => {
  return jest.fn().mockImplementation(() => ({
    ask: jest.fn().mockResolvedValue('# Resumo gerado\n\n- entrada de teste'),
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

test('computeHash retorna string hexadecimal de 64 chars', () => {
  const h = summary.computeHash(dummyFile('qualquer coisa'));
  expect(h).toMatch(/^[a-f0-9]{64}$/);
});

test('computeHash deterministico (mesmo conteudo = mesmo hash)', () => {
  const h1 = summary.computeHash(dummyFile('ABC'));
  const h2 = summary.computeHash(dummyFile('ABC'));
  expect(h1).toBe(h2);
});

test('computeHash muda se conteudo muda', () => {
  const h1 = summary.computeHash(dummyFile('A'));
  const h2 = summary.computeHash(dummyFile('B'));
  expect(h1).not.toBe(h2);
});

test('updateResumo com mesmo hash + force=false retorna SKIP (sem LLM)', async () => {
  const fp = dummyFile('relatorio');
  const hash = summary.computeHash(fp);

  const r = await summary.updateResumo({
    protocolo: 99999, docxPath: fp,
    autor: 'TESTE', dataISO: '2026-07-23T12:00:00.000Z',
    lastDocHash: hash, force: false,
  });

  expect(r.atualizou).toBe(false);
  expect(r.message).toContain('não mudou');
});

test('updateResumo com force=true chama LLM (ignora hash)', async () => {
  const fp = dummyFile('forcar');
  const hash = summary.computeHash(fp);

  const r = await summary.updateResumo({
    protocolo: 99998, docxPath: fp,
    autor: 'TESTE', dataISO: '2026-07-23T12:00:00.000Z',
    lastDocHash: hash, force: true,
  });

  expect(r.message).not.toContain('não mudou');
  expect(r.hash).toBe(hash);
});

test('updateResumo sem hash anterior chama LLM', async () => {
  const fp = dummyFile('primeiro documento');
  const pasta = path.dirname(fp);
  const rp = path.join(pasta, 'resumo.md');
  try { fs.unlinkSync(rp); } catch (_) {}

  const r = await summary.updateResumo({
    protocolo: 99997, docxPath: fp,
    autor: 'TESTE', dataISO: '2026-07-23T12:00:00.000Z',
    lastDocHash: null, force: false,
  });

  expect(r.message).not.toContain('não mudou');
  expect(r.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(r.atualizou).toBe(true);
});

test('updateResumo com hash diferente chama LLM', async () => {
  const fp = dummyFile('conteudo novo');
  const hashAntigo = 'a'.repeat(64);

  const r = await summary.updateResumo({
    protocolo: 99996, docxPath: fp,
    autor: 'TESTE', dataISO: '2026-07-23T12:00:00.000Z',
    lastDocHash: hashAntigo, force: false,
  });

  expect(r.message).not.toContain('não mudou');
  expect(r.atualizou).toBe(true);
});
