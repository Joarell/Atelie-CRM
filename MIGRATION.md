# Migração DeskcommCRM → atelie-erp

Este documento registra o que foi portado do app de referência
(`DeskcommCRM-RecipeCosting`) para este repositório, o que ficou de fora, e as
decisões tomadas no caminho. Para as regras práticas de como continuar portando,
veja `.opencode/skills/migration-conventions/SKILL.md`.

## Resultado

O app agora é um único shell com dois módulos:

- **CRM** (navegação padrão): painel, contatos, inbox, funil, atividades,
  tarefas, agenda, catálogo, respostas rápidas, etiquetas e equipe.
- **Ateliê ERP** (submenu `/atelie/*`): o ERP original, intacto, agora atrás do
  mesmo shell e do mesmo D1.

Rotas antigas sem prefixo redirecionam para `/atelie/*`. A rota padrão é `/`.

## Decisões de arquitetura

| Tema | Referência (DeskcommCRM) | Aqui |
| --- | --- | --- |
| Framework | Next.js 16 (App Router) | Astro 7 SSR (`output: 'server'`) |
| Deploy | Vercel / Docker | Cloudflare Worker (`@astrojs/cloudflare`) |
| Banco | Supabase (Postgres) | Cloudflare D1 (SQLite) |
| Auth | OAuth / multi-tenant | Sessões em D1 + login local |
| UI | React + Tailwind + shadcn | DOM imperativo + CSS puro |
| Testes | vitest + harness de banco próprio | vitest unificado (`tests/**`) |

## O que foi portado

- **Domínio:** tipos do CRM (`src/domain/crm.ts`) e helpers puros
  (`src/domain/crmMath.ts`), com dinheiro em centavos.
- **Servidor:** todas as tabelas do CRM em `src/server/tables.ts`, helpers de
  senha/sessão em `src/server/auth.ts` e rotas em `src/pages/api/crm/**`,
  `src/pages/api/auth/**` e `src/pages/api/users/**`.
- **Persistência:** migrations `0003_crm.sql` (schema) e `0004_crm_seed.sql`
  (admin padrão, funil, contatos, conversas, agenda…), mais `0005_crm_features.sql`
  (atividades de lead, notas de conversa, etiquetas, tipos de agenda + colunas
  `nextActionAt`/`snoozedUntil`/`remindBeforeMin`) e `0006_crm_seed_features.sql`
  (etiquetas quente/casamento/vip e tipos de agenda Reunião/Degustação/Entrega/Outro).
- **Cliente:** `ApiAuthRepository`, `CrmService`, repos do CRM no `AppContext` e
  as views em `src/ui/views/crm/`, com CSS em `src/styles/global.css`.
- **Shell:** navegação em grupos (`Sidebar.ts`), mapa de rotas (`main.ts`) e
  remap de legado.
- **Testes:** helpers reaproveitados (`InMemoryRepository`, `FakeD1`) e cobertura
  nova em `tests/domain`, `tests/services`, `tests/repositories` e `tests/server`.
- **WhatsApp:** teste de conexão do WAHA (`src/server/waha.ts`,
  `src/domain/whatsapp.ts`, `GET /api/whatsapp/health`) **e** agora o runtime em
  tempo real: receiver de webhook com HMAC (`src/server/wahaWebhook.ts`,
  `src/pages/api/whatsapp/webhook.ts`), ingestão inbound em D1 com dedup/ack/edit/
  revoke (`src/server/wahaIngest.ts`, `src/domain/wahaWebhook.ts`), envio de
  mensagem com reply-to (`src/pages/api/whatsapp/send.ts`) e start/stop de sessão
  (`src/pages/api/whatsapp/session.ts`), com UI em
  `src/ui/views/crm/CrmWhatsAppView.ts` e envio a partir do inbox do CRM.
- **Ponte Ateliê ↔ CRM no inbox:** o painel "Pedidos" do inbox mostra o
  histórico LIFO do contato aberto (filtrado por `customerName`,
  `src/domain/orderHistory.ts`) e o botão "+ Novo pedido" abre um compositor
  que carrega os produtos do menu Produtos, empilha os itens (LIFO, nome +
  valor) com subtotal absoluto no rodapé e grava o pedido com
  `createdFrom='inbox'` (`migrations/0009_inbox_orders.sql` para a coluna e
  `0010_inbox_orders_seed.sql` para os produtos + um pedido via inbox).
- **Gráficos do inbox (2):** acima da "Caixa de entrada", lado a lado em um
  grid de 2 colunas — (1) "Pedidos por período" do contato aberto com menu
  Semana/Mês/Ano (`src/domain/inboxChartPeriod.ts` +
  `src/ui/views/crm/inboxPeriodChart.ts`) e (2) "Pedidos do mês" com seletor
  de mês (`src/domain/inboxMonthChart.ts` + `src/ui/views/crm/inboxMonthChart.ts`).
  A antiga "Curva ABC" (`src/ui/views/crm/inboxChart.ts`) foi removida; o
  classificador `clientAbcClass` (badge "Cliente A/B/C") permanece em
  `src/domain/abcCurve.ts`.

## Fora de escopo (por decisão)

Não foram portados: motor de IA, voz, Google OAuth, multi-tenant
(`organization_id`), Sentry e Redis. O alvo é single-tenant, D1-only, com login
local.

## Correções feitas durante o port

- `tasksDueBy` compara apenas a data (`YYYY-MM-DD`), para que tarefas com
  timestamp no fim do dia entrem no "hoje".
- `sessions` tem PK `token`, não `id`. `getEntity`/`deleteEntity`
  (`src/server/crud.ts`) ganharam o parâmetro opcional `idColumn`, e o
  `FakeD1` passou a entender `WHERE <coluna> = ?` — sem isso, a resolução de
  sessão falharia tanto nos testes quanto no D1 real.

## Remoção do React

O port nunca dependeu de ilhas React: as views são DOM imperativo. Mesmo assim
`package.json` carregava a stack React do app de origem. Foram removidos:

- `@astrojs/react` (import + `integrations` do `astro.config.ts`);
- `react`, `react-dom`, `@types/react`, `@types/react-dom`;
- todo o resto do ecossistema: `@radix-ui/*`, `@phosphor-icons/react`,
  `class-variance-authority`, `clsx`, `tailwind-merge`;
- o `"jsx": "preserve"` explícito do `tsconfig.json` (o base do Astro já cobre
  os arquivos `.astro`) e o `@source "../components"` órfão do `global.css`
  (não existe `src/components`).

`date-fns` também estava sem uso e saiu. O `bun.lock` foi reescrito com
`bun install` (24 pacotes removidos). `tests/dependencies.test.ts` impede que
qualquer um desses volte: checa `package.json`, `astro.config.ts` e a ausência
de arquivos `.tsx`/`.jsx` em `src/`.

## Verificação

- `npm run check` limpo.
- `npm run check:tests` limpo (`tests/**` em `tsconfig.tests.json`).
- `npm test` verde (34 arquivos, 341 testes), incluindo a trava
  `tests/dependencies.test.ts`, os testes do WAHA (conexão **e** runtime:
  health, webhook/HMAC, ingestão, envio, sessão) e os testes
  das features do CRM.
- `npm run build` conclui.

## Tipagem dos testes e do D1

`tests/**` tem o seu próprio projeto de tipos (`tsconfig.tests.json`, com
`types: ["node"]`), separado de `src/**`, e roda em `npm run check:tests`. Para
isso foi preciso parar de tipar as funções do servidor como `D1Database` (que o
`FakeD1` não implementa por completo) e passar a depender de `Database`
(`src/server/db.ts`), a interface mínima realmente usada: só `prepare()`.
`getDb()` devolve `Database` e o binding real do D1 é atribuível a ela.
