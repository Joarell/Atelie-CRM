# Ateliê ERP + DeskcommCRM

Astro + TypeScript, rodando como **Cloudflare Worker** (adapter `@astrojs/cloudflare`),
com todos os dados persistidos em **Cloudflare D1**. Segue SOLID e nenhuma
função/método passa de 25 linhas. O front-end é **framework-free**: as views são
DOM imperativo + CSS puro (sem React, Radix ou shadcn); o Tailwind v4 entra só
como compilador de CSS.

O app é a fusão de dois produtos em um só shell:

- **CRM** (portado do DeskcommCRM) — painel, contatos, inbox, funil, atividades,
  tarefas, agenda, catálogo, respostas rápidas, etiquetas e equipe. É a
  navegação padrão.
- **Ateliê ERP** — o ERP original de tortas, agora acessível pelo submenu
  **Ateliê** (`/atelie/*`).

## Por que mudou

Antes disso o app era 100% estático com `localStorage` (por navegador). Agora:

- `output: 'server'` + adapter Cloudflare → `src/pages/api/**` viram **rotas de
  Worker de verdade**, executando no edge.
- Toda leitura/escrita do front-end passa por `fetch('/api/...')` e cai no D1.
- O CRM trouxe autenticação por sessão em D1 (sem OAuth, sem multi-tenant, sem
  Supabase) e reutiliza a mesma infraestrutura de tabelas/rotas do ERP.

## Rotas

| Área | Rotas |
| --- | --- |
| CRM | `/` (painel), `/contatos`, `/inbox`, `/funil`, `/atividades`, `/tarefas`, `/agenda`, `/catalogo`, `/respostas`, `/etiquetas`, `/equipe` |
| Ateliê | `/atelie/painel`, `/atelie/ingredientes`, `/atelie/componentes`, `/atelie/produtos`, `/atelie/estoque`, `/atelie/pedidos`, `/atelie/clientes`, `/atelie/configuracoes` |

Rotas antigas sem prefixo (`/dashboard`, `/ingredientes`, …) são redirecionadas
para o equivalente em `/atelie/*` via `LEGACY_TO_ATELIE` (`src/ui/main.ts`).

## Autenticação

Login local simples (sem Google/OAuth). A sessão é uma linha na tabela
`sessions` do D1, com token Bearer guardado no `localStorage` do navegador.

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- Usuários: `GET/POST /api/users`, `PUT/DELETE /api/users/:id`
- Senhas: PBKDF2-SHA256, 100k iterações, salt `deskcomm-seed-v1`
  (`src/server/auth.ts`), o mesmo esquema do seed.

## Modelo de acesso

O app é **single-tenant** e o acesso é global, por papel.

- **As listagens devolvem a base inteira.** Não existe isolamento por linha:
  quem tem sessão válida vê todos os contatos, conversas, pedidos, clientes e
  tarefas do D1. Não há filtro por dono em nenhuma listagem.
- **`assignedUserId` e `assigneeUserId` são metadados de atribuição**, não
  autorização. Marcam a quem um registro foi atribuído para efeito de
  distribuição de trabalho e são usados **apenas no escopo LGPD**
  (`/api/me/data`, `/api/me/export`, `/api/me/erase`) para montar o recorte de
  dados do titular.
- **Autorização é sempre por papel** (`admin`, `manager`, `agent`), decidida no
  servidor em `src/server/authz.ts`. Rótulo comercial ("vENDEDor", "atendente")
  nunca é fronteira de segurança.

Regra prática: se uma tela precisa esconder um registro, isso é ordenado por
papel no servidor — nunca por `assignedUserId` no cliente.

## Passo a passo para rodar

```bash
bun install

# 1. Crie o banco D1 (uma vez só)
npx wrangler d1 create atelie_erp_db
# copie o "database_id" que aparecer e cole em wrangler.toml

# 2. Rode as migrations (schema + dados de exemplo) localmente
npm run db:migrate:local
npm run db:seed:local

# 3. Suba em desenvolvimento (usa o binding do D1 local via Miniflare)
npm run dev          # http://localhost:4321

# 4. Build + deploy de verdade
npm run build
npm run db:migrate:remote   # uma vez, no D1 de produção
npm run db:seed:remote      # opcional
npm run deploy
```

> O projeto usa **bun** como gerenciador de pacotes (`bun.lock`, `mise.toml`).
> Os scripts continuam acessíveis via `npm run <script>`.

> Login padrão do CRM (criado pelo seed): `admin@deskcomm.local` / `admin123`.
> Troque a senha pela tela **Equipe** após o primeiro acesso.

`npm run check` roda o `tsc --noEmit` só de `src/**`; `npm run check:tests`
estende o typecheck a `tests/**` (`tsconfig.tests.json`, com os tipos de Node).
`npm test` roda a suíte vitest. Os comandos de agente/atalho do opencode
(`/build`, `/test`, `/preflight`, `/audit`) estão em `.opencode/`.

## Validação

O que roda e passa offline nesta máquina:

- `npm run check` — zero erros de tipo (`src/**`, modo `strict`).
- `npm run check:tests` — zero erros de tipo também nos testes (`tests/**`).
- `npm test` — 26 arquivos, 264 testes verdes (`tests/**`).
- `npm run build` — `astro build` conclui.

O que só pode ser confirmado contra a sua conta Cloudflare: que o binding do D1
resolve em runtime e que as migrations rodam sem erro de SQL contra um D1 real.

## O que mudou por dentro

```
migrations/
  0001_init.sql      Schema do D1 — núcleo ERP (uma tabela por entidade)
  0002_seed.sql       Dados de exemplo do ERP (ingredientes + configurações padrão)
  0003_crm.sql       Schema do D1 — CRM (users, sessions, contacts, pipelines,
                      stages, deals, tasks, quick replies, calendar events,
                      conversations, messages, catalog products)
  0004_crm_seed.sql   Seed do CRM (admin padrão, funil, contatos, conversas, agenda…)
  0005_crm_features.sql            Schema do D1 — rolls de features do CRM (atividades
                                   de lead, notas de conversa, etiquetas, tipos de
                                   agenda + colunas novas de deals, conversations e
                                   calendar_events)
  0006_crm_seed_features.sql       Seed do CRM — etiquetas (quente, casamento, vip) e
                                   tipos de agenda (Reunião, Degustação, Entrega, Outro)
0007_waha.sql           Schema do D1 — sessão WAHA/WhatsApp e fila de webhooks
  0008_order_history_seed.sql      Seed do painel "Pedidos" da caixa de entrada —
                                    pedidos que casam com os contatos do CRM (por nome)
                                    para exercitar a fila LIFO de histórico
  0009_inbox_orders.sql             Schema do D1 — coluna orders.createdFrom
                                    ("inbox" quando criado pelo compositor de
                                    pedidos da caixa de entrada)
0010_inbox_orders_seed.sql        Seed do "Novo pedido" — produtos ERP que o
                                    compositor carrega do menu Produtos + um
                                    pedido criado via inbox (createdFrom='inbox')
  0011_inbox_orders_chart_seed.sql  Seed multi-ano do gráfico "Pedidos por
                                    período" (primeiro/segundo gráfico do inbox)
  0012_inbox_month_chart_seed.sql   Seed de datas RELATIVAS (mês atual, hoje,
                                    mês anterior, mesmo mês no ano passado) para
                                    o gráfico "Pedidos do mês"
 wrangler.toml          Binding do D1 ("DB") usado pelo Worker
astro.config.ts         output: 'server' + adapter cloudflare (platformProxy
                         ligado, para o binding funcionar também em `astro dev`)

src/server/             Código que só roda no Worker (nunca é enviado ao navegador)
  context.ts             pega o binding D1 do contexto da rota
  db.ts                   interface mínima do D1 usada pela app (prepare) —
                           mantém a camada testável com o FakeD1
  mapping.ts              converte JSON/boolean <-> colunas TEXT/INTEGER do D1
  sql.ts                   monta INSERT/UPDATE parametrizados dinamicamente
  crud.ts                  list/get/insert/update/delete genéricos (uma
                            implementação para todas as tabelas)
  tables.ts                nome da tabela + quais colunas são JSON/boolean,
                            por entidade — única fonte de verdade
  routeFactory.ts           gera os handlers GET/POST/PUT/DELETE; cada rota em
                            src/pages/api/**/*.ts só passa a tabela certa
  auth.ts                   hash/verify de senha + sessões em D1
  waha.ts                   cliente REST do WAHA (teste de conexão): teto de
                             relógio em toda chamada e erro que nunca carrega o
                             corpo da resposta (só o status HTTP)

src/pages/api/            Rotas do ERP (uma pasta por entidade) + settings.ts
  whatsapp/health.ts        teste de conexão do WhatsApp (WAHA), com sessão
  crm/**                   Rotas do CRM (contacts, conversations, messages,
                            pipelines, stages, deals, tasks, quick-replies,
                            calendar-events, catalog-products, activities,
                            conversation-notes, tags, appointment-types)
  auth/**                  login / logout / me
  users/**                 CRUD de usuários (equipe)

src/domain/crm.ts          Tipos do CRM (dinheiro sempre em centavos)
src/domain/crmMath.ts      Helpers puros (funil, inbox, agenda, tarefas, atividades,
                            etiquetas, duplicatas de contato)
src/domain/whatsapp.ts     Fatos do servidor WAHA + classificação do health
                            (puro, sem rede, testável)
src/domain/theme.ts        Decisão pura claro/escuro (sem DOM, testável)
src/ui/theme.ts            Aplica `data-theme`, lê/grava localStorage, botão
src/services/CrmService.ts Orquestração do CRM para as views
src/repositories/
  IRepository.ts           assíncrono nas mutações (rede), síncrono nas
                            leituras (cache local hidratado por load())
  ApiRepository.ts          implementação HTTP genérica de IRepository<T>
  ApiSettingsRepository.ts   idem, para o registro único de configurações
  ApiAuthRepository.ts       login/logout/me + token no localStorage
src/ui/views/crm/          Views do CRM (crmUi.ts + uma por tela)
src/ui/{Sidebar,Router,main}.ts  Nav em grupos, rotas e remap de legado
src/styles/global.css       Tokens + CSS dos componentes (SPA, sem Tailwind)
.opencode/                  Agentes, comandos e skill de convenções da migração
```

`LocalStorageRepository`, `SettingsRepository` (versão localStorage) e
`state/seedData.ts` foram removidos — o seed agora vive em
`migrations/0002_seed.sql`.

### Dependências enxutas

O port do CRM não usa React: o pacote `@astrojs/react` e todas as dependências
React/Radix/shadcn (`react`, `react-dom`, `@radix-ui/*`, `@phosphor-icons/react`,
`class-variance-authority`, `clsx`, `tailwind-merge`, `@types/react*`) foram
removidas de `package.json` e do `bun.lock`. `tests/dependencies.test.ts` é a
trava de regressão que garante que nada disso volte (sem `.tsx`/`.jsx`, sem
`@astrojs/react` no `astro.config.ts`).

### SOLID, na prática desta mudança

- **Dependency Inversion** é o motivo desta migração ter sido tranquila:
  `services/*` sempre dependeram de `IRepository<T>` (interface), nunca de
  `LocalStorageRepository`. Trocar a implementação por `ApiRepository` não
  exigiu tocar em `PricingService`, `StockService`, `OrderService` ou
  `CustomerService` além de tornar os métodos que gravam dados em `async`.
- **Open/Closed** nas rotas: `routeFactory.ts` + `tables.ts` significam que
  adicionar uma entidade nova no futuro é configurar uma tabela, não escrever
  SQL novo. O CRM inteiro entrou novo seguindo exatamente esse caminho.
- **Single Responsibility** nas camadas do servidor: `mapping.ts` só sabe
  converter JSON/boolean; `sql.ts` só monta texto SQL; `crud.ts` só orquestra
  as duas coisas contra o D1; `auth.ts` só cuida de senha e sessão.

### Views agora são assíncronas nas mutações

Toda ação que grava dado faz `await` na chamada ao repositório/serviço antes de
fechar o modal — porque agora isso é uma chamada de rede para o D1, não mais uma
escrita instantânea em memória. As telas continuam lendo de forma síncrona
(`getAll()`/`getById()`) a partir do cache que é atualizado a cada resposta do
servidor.

## Convenções de migração

As regras de como portar features do DeskcommCRM (camadas, profundidade de
import nas rotas, PK de `sessions` ser `token`, shapes JSON/boolean, testes)
estão em `.opencode/skills/migration-conventions/SKILL.md`, e o status do port
em `MIGRATION.md`.

## Responsividade

Sidebar fixa no desktop, vira menu hambúrguer até 880px; formulários e itens de
linha colapsam para coluna única em telas pequenas.

## Tema claro/escuro

O modo é o atributo `data-theme` no `<html>`; os tokens de `global.css` têm
blocos `[data-theme="light"]` e `[data-theme="dark"]` desenhados separados. O
script inline de `BaseLayout.astro` aplica o tema antes da primeira pintura
(sem flash), seguindo o sistema quando ainda não há escolha salva
(`deskcomm-theme` no `localStorage`). O botão ☀/☾ na topbar alterna e persiste a
escolha (`src/ui/theme.ts`, lógica pura em `src/domain/theme.ts`).

## WhatsApp (WAHA)

Teste de conexão do WhatsApp via [WAHA](https://waha.devlike.pro/), sem o
realtime completo: cliente REST mínimo (`src/server/waha.ts`) + rota
`GET /api/whatsapp/health` (exige Bearer de sessão). Ela responde com um
relatório estável (`src/domain/whatsapp.ts`):

- `200` quando o servidor responde, a chave é aceita e a sessão está `WORKING`;
- `502` quando está configurado mas inutilizável — `detail` diz o porquê
  (`credencial_recusada_pelo_transporte`, `waha_inacessivel`,
  `sessao_inexistente`, `sessao_sem_conexao: <status>`);
- `503` com `waha_nao_configurado` quando falta env.

Config em `.dev.vars` (copie de `.dev.vars.example`): `WAHA_API_BASE_URL`,
`WAHA_API_KEY` (secret em produção: `wrangler secret put`) e
`WAHA_SESSION_NAME` (padrão `default`). Toda chamada tem teto de relógio (15s) e
a exceção nunca carrega o corpo devolvido pelo WAHA — só o status HTTP.

### Como subir e testar

`npm run waha:up` sobe um WAHA local (`docker-compose.waha.yml`, engine NOWEB) —
precisa de Docker rodando, porta `3000` livre. Depois: `npm run waha:smoke` roda o
teste de conexão ao vivo (sai `0` com a chave aceita, sessão pareada ou em
`SCAN_QR_CODE`). Pareamento do QR e operação: ver procedimento completo em
`docs/whatsapp-waha.md`.

## Módulos

**CRM:** Painel, Contatos, Inbox (conversas + respostas rápidas), Funil
(kanban de deals), Atividades (registro de ações por lead), Tarefas, Agenda,
Catálogo, Respostas rápidas, Etiquetas e Equipe (usuários + login). Tudo em
Cloudflare D1.

**Ateliê:** Painel, Ingredientes, Componentes (bases/recheios/coberturas),
Produtos (receita + mão de obra + despesas fixas + margens, tudo editável por
produto), Estoque, Pedidos (status, pagamento, baixa de estoque), Clientes e
Configurações — todos persistidos em Cloudflare D1.
