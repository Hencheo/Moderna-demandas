/**
 * Tests — StateRepository (persistência em arquivo)
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const StateRepository = require('../repositories/state-repository');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siscon-test-'));

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

function makeRepo(testName) {
  // Cria um mock de config na hora, com caminho isolado por teste
  const filePath = path.join(tmpDir, `${testName}.json`);
  jest.resetModules();
  jest.doMock('../config', () => {
    const actual = jest.requireActual('../config');
    return { ...actual, state: { filePath } };
  });
  return new (require('../repositories/state-repository'))();
}

test('deve salvar e carregar solicitações', () => {
  const { Solicitacao } = require('../models/solicitacao');
  const repo = makeRepo('save-load');

  const sols = [
    new Solicitacao({
      protocolo: 1, classificacao: 'BUG', cliente: 'X',
      sistema: 'SIS', versao: '1.0', resumo: 'Bug report',
      situacao: 'Aberto', url: 'https://url/1',
    }),
    new Solicitacao({
      protocolo: 2, classificacao: 'MELHORIA', cliente: 'Y',
      sistema: 'SIS', versao: '2.0', resumo: 'Feature request',
      situacao: 'Testando', url: 'https://url/2',
    }),
  ];

  repo.save(sols);

  const loaded = repo.load();
  expect(loaded.solicitacoes).toHaveLength(2);
  expect(loaded.solicitacoes[0].protocolo).toBe(1);
  expect(loaded.solicitacoes[1].protocolo).toBe(2);
  expect(loaded.solicitacoes[0].situacao).toBe('Aberto');
  expect(loaded.updatedAt).toBeTruthy();
});

test('deve carregar lista vazia quando arquivo não existe', () => {
  const repo = makeRepo('empty-load');
  const result = repo.load();
  expect(result.solicitacoes).toEqual([]);
  expect(result.updatedAt).toBeNull();
});

test('deve sobrescrever estado anterior ao salvar', () => {
  const { Solicitacao } = require('../models/solicitacao');
  const repo = makeRepo('overwrite');

  repo.save([new Solicitacao({
    protocolo: 1, classificacao: 'A', cliente: 'X',
    sistema: 'SIS', versao: '1.0', resumo: 'R1',
    situacao: 'Aberto', url: 'https://url/1',
  })]);

  repo.save([new Solicitacao({
    protocolo: 2, classificacao: 'B', cliente: 'Y',
    sistema: 'SIS', versao: '2.0', resumo: 'R2',
    situacao: 'Ok', url: 'https://url/2',
  })]);

  const loaded = repo.load();
  expect(loaded.solicitacoes).toHaveLength(1);
  expect(loaded.solicitacoes[0].protocolo).toBe(2);
});
