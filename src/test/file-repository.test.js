/**
 * Tests — FileRepository (I/O de arquivo)
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const FileRepository = require('../repositories/file-repository');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siscon-test-fr-'));
const repo = new FileRepository();

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

test('exists retorna false para arquivo inexistente', () => {
  expect(repo.exists(path.join(tmpDir, 'nao-existe.txt'))).toBe(false);
});

test('writeFile cria diretórios e escreve', () => {
  const filePath = path.join(tmpDir, 'sub', 'teste.txt');
  repo.writeFile(filePath, Buffer.from('hello'));
  expect(fs.existsSync(filePath)).toBe(true);
  expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello');
});

test('exists retorna true após writeFile', () => {
  expect(repo.exists(path.join(tmpDir, 'sub', 'teste.txt'))).toBe(true);
});

test('stat retorna dados corretos', () => {
  const filePath = path.join(tmpDir, 'stat-test.txt');
  repo.writeFile(filePath, Buffer.from('data'));
  const s = repo.stat(filePath);
  expect(s).not.toBeNull();
  expect(s.size).toBe(4);
  expect(typeof s.mtime).toBe('object');
});

test('stat retorna null para arquivo inexistente', () => {
  expect(repo.stat(path.join(tmpDir, 'fake.txt'))).toBeNull();
});

test('removePartialDownload não lança se .crdownload não existe', () => {
  expect(() => repo.removePartialDownload(path.join(tmpDir, 'no-crdownload.txt'))).not.toThrow();
});

test('removePartialDownload remove .crdownload existente', () => {
  const base = path.join(tmpDir, 'doc.docx');
  fs.writeFileSync(base + '.crdownload', 'partial');
  repo.removePartialDownload(base);
  expect(fs.existsSync(base + '.crdownload')).toBe(false);
});
