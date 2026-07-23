/**
 * Tests — AnalysisService
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const mockGitList = jest.fn().mockReturnValue([]);
const mockGitCurrent = jest.fn().mockReturnValue('main');
const mockGitDiff = jest.fn().mockReturnValue({ files: [], content: '' });
const mockAdoSearch = jest.fn().mockResolvedValue([]);
const mockAdoFindPR = jest.fn().mockResolvedValue(null);

jest.mock('../services/git-service', () => {
  return jest.fn().mockImplementation(() => ({
    listBranches: mockGitList,
    currentBranch: mockGitCurrent,
    getDiff: mockGitDiff,
  }));
});

jest.mock('../services/ado-service', () => {
  return jest.fn().mockImplementation(() => ({
    searchBranches: mockAdoSearch,
    findPRByBranch: mockAdoFindPR,
  }));
});

jest.mock('../utils/llm-client', () => {
  return jest.fn().mockImplementation(() => ({
    ask: jest.fn().mockResolvedValue('## Resumo gerado pelo LLM mock.'),
  }));
});

jest.mock('../utils/docx-generator', () => {
  return jest.fn().mockImplementation(() => ({
    generate: jest.fn().mockResolvedValue(Buffer.from('fake docx')),
  }));
});

const AnalysisService = require('../services/analysis-service');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siscon-test-an-'));

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

test('analyze sem pasta gera resumo.docx', async () => {
  const pasta = path.join(tmpDir, '99999');
  fs.mkdirSync(pasta, { recursive: true });
  const svc = new AnalysisService();
  const r = await svc.analyze({ protocolo: 99999, chamadosDir: pasta });
  expect(r.analisou).toBe(true);
  expect(fs.existsSync(path.join(pasta, 'resumo.docx'))).toBe(true);
});

test('analyze com resumo anterior mantem historico', async () => {
  const pasta = path.join(tmpDir, '99998');
  fs.mkdirSync(pasta, { recursive: true });
  const docxPath = path.join(pasta, 'resumo.docx');
  fs.writeFileSync(docxPath, 'conteudo anterior');
  const svc = new AnalysisService();
  const r = await svc.analyze({ protocolo: 99998, chamadosDir: pasta });
  expect(r.analisou).toBe(true);
  expect(fs.existsSync(docxPath)).toBe(true);
});

test('analyze na branch correta usa diff', async () => {
  mockGitList.mockReturnValue(['Develop/Rafael/99996_DEV']);
  mockGitCurrent.mockReturnValue('Develop/Rafael/99996_DEV');
  mockGitDiff.mockReturnValue({ files: ['Controller.cs'], content: 'diff content' });

  const pasta = path.join(tmpDir, '99996');
  fs.mkdirSync(pasta, { recursive: true });
  const svc = new AnalysisService();
  const r = await svc.analyze({ protocolo: 99996, chamadosDir: pasta });
  expect(r.analisou).toBe(true);
  expect(fs.existsSync(path.join(pasta, 'resumo.docx'))).toBe(true);
});

test('analyze na branch errada gera resumo parcial', async () => {
  mockGitList.mockReturnValue(['Develop/Rafael/99995_DEV']);
  mockGitCurrent.mockReturnValue('Develop/Rafael/outro_chamado');

  const pasta = path.join(tmpDir, '99995');
  fs.mkdirSync(pasta, { recursive: true });
  const svc = new AnalysisService();
  const r = await svc.analyze({ protocolo: 99995, chamadosDir: pasta });
  expect(r.analisou).toBe(true);
  expect(fs.existsSync(path.join(pasta, 'resumo.docx'))).toBe(true);
});
