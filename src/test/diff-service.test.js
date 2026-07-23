/**
 * Tests — DiffService (puramente funcional, sem dependências externas)
 */
const DiffService = require('../services/diff-service');
const { Solicitacao } = require('../models/solicitacao');

const diffService = new DiffService();

// Helper: cria Solicitacao rápida
const s = (proto, situacao, resumo) => new Solicitacao({
  protocolo: proto,
  classificacao: 'TESTE',
  cliente: 'CLIENTE',
  sistema: 'SIS',
  versao: '1.0',
  resumo: resumo || 'Resumo',
  situacao: situacao || 'Pendente',
  url: `https://url/${proto}`,
});

test('deve detectar novas solicitações', () => {
  const prev = [s(1, 'Testando')];
  const curr = [s(1, 'Testando'), s(2, 'Nova')];
  const result = diffService.compare(prev, curr);

  expect(result.novas).toHaveLength(1);
  expect(result.novas[0].protocolo).toBe(2);
  expect(result.removidas).toHaveLength(0);
  expect(result.alteradas).toHaveLength(0);
  expect(result.totalAnterior).toBe(1);
  expect(result.totalAtual).toBe(2);
});

test('deve detectar solicitações removidas', () => {
  const prev = [s(1, 'Finalizado'), s(2, 'Testando')];
  const curr = [s(1, 'Finalizado')];
  const result = diffService.compare(prev, curr);

  expect(result.removidas).toHaveLength(1);
  expect(result.removidas[0].protocolo).toBe(2);
  expect(result.novas).toHaveLength(0);
});

test('deve detectar alterações de status', () => {
  const prev = [s(1, 'Desenvolvimento')];
  const curr = [s(1, 'Testando')];
  const result = diffService.compare(prev, curr);

  expect(result.alteradas).toHaveLength(1);
  expect(result.alteradas[0].protocolo).toBe(1);
  expect(result.alteradas[0].alteracoes.situacao).toBeDefined();
  expect(result.alteradas[0].alteracoes.situacao.de).toBe('Desenvolvimento');
  expect(result.alteradas[0].alteracoes.situacao.para).toBe('Testando');
});

test('deve retornar vazio quando não há mudanças', () => {
  const prev = [s(1, 'Testando'), s(2, 'Finalizado')];
  const curr = [s(1, 'Testando'), s(2, 'Finalizado')];
  const result = diffService.compare(prev, curr);

  expect(result.novas).toHaveLength(0);
  expect(result.removidas).toHaveLength(0);
  expect(result.alteradas).toHaveLength(0);
});

test('deve detectar múltiplas alterações no mesmo item', () => {
  const prev = [new Solicitacao({
    protocolo: 1, classificacao: 'BUG', cliente: 'A',
    sistema: 'SIS', versao: '1.0', resumo: 'Problema X',
    situacao: 'Aberto', url: 'https://url/1',
  })];
  const curr = [new Solicitacao({
    protocolo: 1, classificacao: 'MELHORIA', cliente: 'B',
    sistema: 'SIS', versao: '2.0', resumo: 'Problema X (atualizado)',
    situacao: 'Resolvido', url: 'https://url/1',
  })];
  const result = diffService.compare(prev, curr);

  expect(result.alteradas).toHaveLength(1);
  const changes = result.alteradas[0].alteracoes;
  expect(Object.keys(changes).length).toBeGreaterThanOrEqual(4);
  expect(changes.classificacao).toBeDefined();
  expect(changes.situacao).toBeDefined();
});

test('DiffResult deve ter timestamp', () => {
  const result = diffService.compare([], [s(1, 'Novo')]);
  expect(result.timestamp).toBeDefined();
  expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
});
