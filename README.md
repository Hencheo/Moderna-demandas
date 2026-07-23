# SISCON Monitor

Monitor visual de solicitações do SISCON — polling automático, detecção de mudanças, notificações nativas.

## Quick start

```bash
# 1. Configurar credenciais
echo "SISCON_USER=seu.usuario" > .env
echo "SISCON_PASS=sua.senha" >> .env

# 2. Instalar dependências
npm install

# 3. Rodar
npm start
```

## Uso CLI

```bash
node src/index.js <usuario> <senha>
```

## Estrutura

```
src/
├── main/               → Electron (thin controller)
├── services/           → Regras de negócio
├── repositories/       → Persistência
├── models/             → Entidades de domínio
├── renderer/           → View (HTML/CSS/JS)
├── config/             → Config centralizada
├── test/               → Testes unitários (Jest)
└── index.js            → Facade CLI
```

📖 Leia [`ARCHITECTURE.md`](ARCHITECTURE.md) para a documentação completa de arquitetura.

## Testes

```bash
npm test          # Jest
npx jest --watch  # Modo watch
```
