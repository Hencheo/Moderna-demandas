/**
 * Tests — AnalysisService (regras de negócio de análise de chamado)
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

// Mock padrão: retorna lista vazia de branches
const mockGitList = jest.fn().mockReturnValue([]);
const mockGitCurrent = jest.fn().mockReturnValue('main');
const mockGitDiff = jest.fn().mockReturnValue({ files: [], content: '' });

jest.mock('../services/git-service', () => {
  return jest.fn().mockImplementation(() => ({
    listBranches: mockGitList,
    currentBranch: mockGitCurrent,
    getDiff: mockGitDiff,
  }));
});

jest.mock('../services/ado-service', () => {
  return jest.fn().mockImplementation(() => ({
    searchBranches: jest.fn().mockResolvedValue([]),
    findPRByBranch: jest.fn().mockResolvedValue(null),
  }));
});

jest.mock('../utils/llm-client', () => {
  return jest.fn().mockImplementation(() => ({
    ask: jest.fn().mockResolvedValue('## 🔍 Diagnóstico — Chamado #99999\n\nDiagnóstico gerado pelo LLM mock.'),
  }));
});

const AnalysisService = require('../services/analysis-service');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siscon-test-an-'));

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

test('analyze com pasta vazia retorna analisou=true', async () => {
  const pasta = path.join(tmpDir, '99999');
  fs.mkdirSync(pasta, { recursive: true });
  const svc = new AnalysisService();
  const r = await svc.analyze({ protocolo: 99999, chamadosDir: pasta });
  expect(r.analisou).toBe(true);
  expect(fs.existsSync(path.join(pasta, 'resumo.md'))).toBe(true);
});

test('analyze com resumo.md existente mantém conteúdo anterior', async () => {
  const pasta = path.join(tmpDir, '99998');
  fs.mkdirSync(pasta, { recursive: true });
  const resumoPath = path.join(pasta, 'resumo.md');
  fs.writeFileSync(resumoPath, '# Resumo anterior do chamado', 'utf-8');

  const svc = new AnalysisService();
  const r = await svc.analyze({ protocolo: 99998, chamadosDir: pasta });
  expect(r.analisou).toBe(true);

  const conteudo = fs.readFileSync(resumoPath, 'utf-8');
  expect(conteudo).toContain('Resumo anterior');
});

test('analyze com docx encontra arquivo e processa', async () => {
  const pasta = path.join(tmpDir, '99997');
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, '99997_test.docx'), 'fake docx');

  const svc = new AnalysisService();
  const r = await svc.analyze({ protocolo: 99997, chamadosDir: pasta });
  expect(r.analisou).toBe(true);
  expect(fs.existsSync(path.join(pasta, 'resumo.md'))).toBe(true);
});

test('analyze com branch local e branch atual iguais usa git diff', async () => {
  mockGitList.mockReturnValue(['Develop/Rafael/99996_DEV']);
  mockGitCurrent.mockReturnValue('Develop/Rafael/99996_DEV');

  const pasta = path.join(tmpDir, '99996');
  fs.mkdirSync(pasta, { recursive: true });
  const svc = new AnalysisService();
  const r = await svc.analyze({ protocolo: 99996, chamadosDir: pasta });
  expect(r.analisou).toBe(true);
});

test('analyze com branch diferente de atual gera alerta', async () => {
  mockGitList.mockReturnValue(['Develop/Rafael/99995_DEV']);
  mockGitCurrent.mockReturnValue('Develop/Rafael/outro_chamado');

  const pasta = path.join(tmpDir, '99995');
  fs.mkdirSync(pasta, { recursive: true });
  const svc = new AnalysisService();
  const r = await svc.analyze({ protocolo: 99995, chamadosDir: pasta });
  expect(r.analisou).toBe(true);
  expect(r.alerts.some(a => a.includes('diferente'))).toBe(true);
});
