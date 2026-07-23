# 🏗️ SISCON Monitor — Arquitetura & Padrões

Este documento é a **referência oficial** de arquitetura do projeto.  
Sempre que adicionar uma feature, consulte este guia para manter a consistência.

---

## 1. Filosofia (copiada da Moderna)

> **Controller é THIN, Service tem a REGRA, Repository isola o DADO.**

Cada camada tem **uma única responsabilidade** e nunca invade a camada vizinha.

```
┌─────────────────────────────────────────────────────┐
│                    src/main/                         │
│   main.js · ipc-handlers.js · preload.js            │
│   (Controller / Entry Point — fina, só roteia)       │
├─────────────────────────────────────────────────────┤
│                    src/services/                      │
│   auth-service.js · scraper-service.js · diff-service │
│   (Regras de negócio — testáveis, sem I/O direto)    │
├─────────────────────────────────────────────────────┤
│                   src/repositories/                   │
│   state-repository.js                                 │
│   (Acesso a dados — isola persistência)               │
├─────────────────────────────────────────────────────┤
│                    src/models/                         │
│   solicitacao.js · anexo.js                          │
│   (Entidades de domínio — dados + validação)          │
├─────────────────────────────────────────────────────┤
│                    src/renderer/                       │
│   index.html · app.js · style.css                    │
│   (View — só apresentação, sem regra de negócio)      │
├─────────────────────────────────────────────────────┤
│                    src/config/                         │
│   index.js                                           │
│   (Config centralizada — URLs, intervalos, .env)      │
└─────────────────────────────────────────────────────┘
```

---

## 2. Camadas em detalhe

### 2.1 `src/main/` — Controller / Entry Point

| Arquivo | Papel | Análogo Moderna |
|---|---|---|
| `main.js` | Startup do Electron, composition root | `Global.asax` |
| `ipc-handlers.js` | Handlers de IPC — recebe chamada do renderer, chama service | `Controller` |
| `preload.js` | Bridge segura renderer ↔ main | — |

**Regras:**
- ❌ **NUNCA** contém regra de negócio (scraping, diff, auth)
- ❌ **NUNCA** acessa dados diretamente (quem acessa é o repository)
- ✅ Só roteia: `IPC → Service → resposta`
- ✅ Só gerencia: janela, ciclo de vida, notificações nativas

**Exemplo correto (ipc-handlers.js):**
```js
// ✅ THIN: só chama o service e retorna
ipcMain.handle('poll-now', async () => {
  return this._executePoll();
});
```

### 2.2 `src/services/` — Regras de Negócio

| Serviço | Responsabilidade | Dependências |
|---|---|---|
| `auth-service.js` | Login no SISCON (ASP.NET Forms Auth) | `HttpClient`, `config` |
| `ScraperService` | Parse do HTML da grid de listagem (Consultar.aspx) | `HttpClient` (autenticado), `Solicitacao` |
| `AnexoBrowserService` | Extração de anexos via Puppeteer (grid ASP.NET AJAX) | Puppeteer, `Anexo` |
| `FileOrganizerService` | Organização de arquivos baixados em pastas | `Anexo`, `config` |
| `DownloadOrchestrator` | Orquestra: busca anexo mais recente → baixa → salva | `AnexoBrowserService`, `FileOrganizerService` |
| `diff-service.js` | Comparação entre estados | `Solicitacao`, `DiffResult` |

**Regras:**
- ✅ Service **pode** depender de outros services e models
- ✅ Service **pode** usar HttpClient (transporte)
- ❌ **NUNCA** dependem de Electron (`ipcMain`, `BrowserWindow`)
- ✅ Testáveis isoladamente com Jest (sem Electron, sem I/O real)

### 2.3 `src/repositories/` — Acesso a Dados

| Repositório | Responsabilidade |
|---|---|
| `state-repository.js` | Persistência do snapshot em JSON |

**Regras:**
- ✅ Isola **como** os dados são armazenados (hoje JSON file, amanhã SQLite)
- ✅ A camada de service **nunca** sabe se é arquivo, banco ou API
- ❌ **NUNCA** contém regra de negócio

### 2.4 `src/models/` — Entidades de Domínio

| Model | Campos |
|---|---|
| `Solicitacao` | protocolo, classificacao, cliente, sistema, versao, resumo, situacao, url |
| `DiffResult` | novas, removidas, alteradas, totalAnterior, totalAtual, timestamp |

**Regras:**
- ✅ Modelos imutáveis (getters, sem setters públicos)
- ✅ `toJSON()` para serialização
- ✅ `fromJSON()` para hidratação
- ✅ Validação no constructor

### 2.5 `src/renderer/` — View

- HTML semântico, CSS com tema escuro, JS vanilla (sem framework)
- Comunica com o main via `window.siscon.*` (exposto pelo preload)
- ❌ **NUNCA** faz scraping, diff ou acesso a dados
- ✅ Só apresenta dados e emite comandos

### 2.6 `src/config/` — Configuração

- Carrega `.env` automaticamente
- Contém URLs, intervalos, constantes
- Nenhuma camada hardcoda URL ou credencial

---

## 3. Download de Anexos (caso especial)

O grid de anexos (Anexos > Arquivos) **não** está disponível no HTML inicial.  
Ele carrega via **ASP.NET AJAX UpdatePanel** — o conteúdo só aparece após JavaScript executar.

### Solução: Puppeteer (headless Chrome)

Usamos `puppeteer-core` (aproveita o Chrome já instalado, sem baixar Chromium):

```
AnexoBrowserService
  └── Puppeteer (headless)
        ├── Login (preenche form, clica Acessar)
        ├── Navega para Solicitacao.aspx?key=N
        ├── Clica aba Anexos → aguarda UpdatePanel
        └── Extrai dados do grid renderizado
              └── downloadUrl = /DownloadFile.ashx?prms=<hash>
```

### Download URL pattern

O download real usa o handler:
```
https://siscon.benner.com.br/DownloadFile.ashx?prms=<base64>
```

Requer cookies de sessão (`WesAuth_SISCON`). O `AnexoBrowserService` usa
o `HttpClient` autenticado para fazer o download via stream.

### Organização em pastas

```
~/Desktop/Chamados/
  └── 2580974/
      └── 2580974+_Erro_fech_conta_obs_Silicone_Retorno_QA_2307.docx
```

O `FileOrganizerService` decide:
1. Qual anexo é o mais recente (por `incluidoEm`)
2. Se já existe localmente, compara data vs mtime
3. Só baixa se o servidor tiver versão mais nova

### Fluxo integrado ao polling

A cada 5 minutos, o polling agora também verifica anexos:

```
poll()
  ├── auth.login()
  ├── scraper.fetchSolicitacoes()
  ├── diffService.compare()
  ├── for each solicitação ativa:
  │     anexoService.getLatestTimestamp(protocolo)
  │     if timestamp > stored.lastTimestamp:
  │       download → ~/Desktop/Chamados/{protocolo}/
  │       atualiza stored.lastTimestamp
  ├── stateRepo.save(solicitacoes, anexosTimestamps)
  └── notifica renderer + sistema
```

**Browser persistente**: o Chrome headless é aberto uma única vez e
reutilizado entre polls. O `_login()` detecta se a sessão ainda está
válida e só faz login completo quando necessário (~3s na primeira vez,
~0.5s nas subsequentes).

**Timestamps**: o `incluidoEm` do SISCON é armazenado no `state.json`
como `anexos["protocolo"].lastTimestamp`. Na próxima verificação,
compara-se esse valor — se o timestamp do servidor for igual ou anterior,
o download é pulado.

---

## 3. Fluxo de Dados (exemplo: polling)

```
Renderer                     Main Process                     SISCON
   │                            │                                │
   │── startPolling() ──────►   │                                │
   │                       ipc-handlers.js                       │
   │                            │                                │
   │                            ├── auth-service.login() ──────► │
   │                            │◄─────── cookies ────────────── │
   │                            │                                │
   │                            ├── scraper-service.fetch() ────►│
   │                            │◄─── Solicitacao[] ──────────── │
   │                            │                                │
   │                            ├── state-repository.load()      │
   │                            ├── diff-service.compare()       │
   │                            ├── state-repository.save()      │
   │                            │                                │
   │◄────── poll-result ─────── │                                │
   │                            │                                │
   │ renderiza tabela           │                                │
   │ mostra notificação         │                                │
```

---

## 4. Convenções de Código

### 4.1 Nomenclatura

| Tipo | Padrão | Exemplo |
|---|---|---|
| Arquivos | kebab-case | `auth-service.js` |
| Classes | PascalCase | `AuthService`, `Solicitacao` |
| Métodos | camelCase | `fetchSolicitacoes()` |
| Constantes | UPPER_SNAKE | `POLL_INTERVAL_MS` |
| Pastas | kebab-case | `src/services/` |

### 4.2 Imports

```js
// Sempre use caminhos relativos com require
const AuthService = require('../services/auth-service');
const { Solicitacao } = require('../models/solicitacao');
```

### 4.3 Comentários de arquivo

Todo arquivo deve ter um header JSDoc:
```js
/**
 * src/services/x-service.js
 * Descrição curta do que faz.
 * Responsabilidade: X. Não contém Y.
 */
```

### 4.4 Testes

- Um arquivo de teste por service/repository
- Nome: `nome-do-arquivo.test.js`
- Local: junto ao fonte em `src/test/`
- Rodar: `npm test` ou `npx jest --verbose`

### 4.5 Tratamento de erros

- Service lança `Error` com mensagem descritiva
- IPC handler captura e envia `poll-error` pro renderer
- Renderer exibe notificação visual

---

## 5. Limites e Responsabilidades (checklist para PR)

Antes de adicionar código novo, responda:

1. **Onde essa lógica pertence?**
   - Regra de negócio → `src/services/`
   - Acesso a dados → `src/repositories/`
   - Apresentação → `src/renderer/`
   - Roteamento → `src/main/ipc-handlers.js`
   - Config → `src/config/`

2. **É testável sem Electron?**  
   Se não for, está na camada errada.

3. **Tem side effect fora da sua camada?**  
   Service não salva arquivo. Repository não faz scraping.

4. **Alguma URL ou credencial está hardcoded?**  
   Tudo em `src/config/` ou `.env`.

---

## 6. Evolução futura (provável)

| Hoje | Amanhã possível | Mudança |
|---|---|---|
| StateRepository (JSON) | SQLite / PostgreSQL | Só troca o repository |
| Scraping HTML | API JSON oficial | Só troca o scraper-service |
| Vanilla JS no renderer | React/Vue | Só troca o renderer/ |
| CLI simples | Comandos mais ricos | Só mexe em src/index.js |

> A arquitetura em camadas existe pra que cada mudança dessas seja **local e previsível**.

---

*Documento mantido junto ao código. Atualize sempre que a arquitetura evoluir.*
