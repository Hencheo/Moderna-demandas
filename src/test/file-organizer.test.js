/**
 * Tests — FileOrganizerService
 */
const fs = require('fs');
const os = require('os');
const FileOrganizerService = require('../services/file-organizer-service');

// Usar jest.mock com require dentro do callback pra evitar hoisting issue
jest.mock('../config', () => {
  const p = require('path');
  return {
    paths: {
      chamadosDir: p.join(require('os').tmpdir(), 'siscon-test-chamados'),
    },
  };
});

const organizer = new FileOrganizerService();

afterAll(() => {
  try {
    fs.rmSync(require('path').join(os.tmpdir(), 'siscon-test-chamados'), { recursive: true, force: true });
  } catch (_) {}
});

test('getDestPath deve montar caminho correto', () => {
  const dest = organizer.getDestPath({ protocolo: 12345, fileName: 'teste.docx' });
  expect(dest).toContain('siscon-test-chamados');
  expect(dest).toContain('12345');
  expect(dest).toContain('teste.docx');
});

test('ensureDir deve criar diretório', () => {
  const { join } = require('path');
  const testDir = join(os.tmpdir(), 'siscon-test-ensure-' + Date.now());
  organizer.ensureDir(join(testDir, 'subdir', 'arquivo.txt'));
  expect(fs.existsSync(testDir)).toBe(true);
  expect(fs.existsSync(join(testDir, 'subdir'))).toBe(true);
  fs.rmSync(testDir, { recursive: true, force: true });
});

test('checkExisting deve retornar exists=false quando arquivo não existe', () => {
  const result = organizer.checkExisting('/tmp/nao-existe-' + Date.now() + '.txt', new Date());
  expect(result.exists).toBe(false);
  expect(result.shouldReplace).toBe(true);
});

test('checkExisting deve retornar shouldReplace=true quando novo é mais recente', () => {
  const { join } = require('path');
  const filePath = join(os.tmpdir(), 'siscon-test-old-' + Date.now() + '.txt');
  fs.writeFileSync(filePath, 'old');
  const past = new Date(Date.now() - 86400000);
  fs.utimesSync(filePath, past, past);

  const result = organizer.checkExisting(filePath, new Date());
  expect(result.exists).toBe(true);
  expect(result.shouldReplace).toBe(true);

  fs.unlinkSync(filePath);
});

test('getLatest deve retornar o anexo mais recente', () => {
  const { Solicitacao } = require('../models/solicitacao');
  const Anexo = require('../models/anexo');

  const anexos = [
    new Anexo({ nome: 'antigo.docx', incluidoEm: '2026-01-01T00:00:00', downloadUrl: '/url/1' }),
    new Anexo({ nome: 'recente.docx', incluidoEm: '2026-06-15T00:00:00', downloadUrl: '/url/2' }),
    new Anexo({ nome: 'medio.docx', incluidoEm: '2026-03-15T00:00:00', downloadUrl: '/url/3' }),
  ];

  const latest = organizer.getLatest(anexos);
  expect(latest.nome).toBe('recente.docx');
});

test('getLatest deve retornar null para lista vazia', () => {
  expect(organizer.getLatest([])).toBeNull();
  expect(organizer.getLatest(null)).toBeNull();
});
