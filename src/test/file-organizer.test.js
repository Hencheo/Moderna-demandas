/**
 * Tests — FileOrganizerService (agora sem I/O)
 */
const os = require('os');
const FileOrganizerService = require('../services/file-organizer-service');

jest.mock('../config', () => {
  const p = require('path');
  return {
    paths: { chamadosDir: p.join(require('os').tmpdir(), 'siscon-test-chamados') },
  };
});

const organizer = new FileOrganizerService();

test('getDestPath deve montar caminho correto', () => {
  const dest = organizer.getDestPath({ protocolo: 12345, fileName: 'teste.docx' });
  expect(dest).toContain('siscon-test-chamados');
  expect(dest).toContain('12345');
  expect(dest).toContain('teste.docx');
});

test('getLatest deve retornar o anexo mais recente', () => {
  const Anexo = require('../models/anexo');
  const anexos = [
    new Anexo({ nome: 'antigo.docx', incluidoEm: '2026-01-01T00:00:00', downloadUrl: '/url/1' }),
    new Anexo({ nome: 'recente.docx', incluidoEm: '2026-06-15T00:00:00', downloadUrl: '/url/2' }),
    new Anexo({ nome: 'medio.docx', incluidoEm: '2026-03-15T00:00:00', downloadUrl: '/url/3' }),
  ];
  expect(organizer.getLatest(anexos).nome).toBe('recente.docx');
});

test('getLatest deve retornar null para lista vazia', () => {
  expect(organizer.getLatest([])).toBeNull();
  expect(organizer.getLatest(null)).toBeNull();
});
