# Tasks: Security audit fixes

> feature: security-audit-fixes

Regras que valem para todas as tarefas: `npm run check:style` exige função/
método com no máximo 25 linhas e linha com no máximo 80 colunas; `npm run
check` e `npm run check:tests` precisam sair limpos; todo `it()` que cobre um
critério de aceite carrega `@spec:AC-xxx` no título.

## T-101 — Núcleo de autorização: requireRole [concluida]

- Refs: US-100, AC-108
- Arquivos: src/server/authz.ts, tests/server/authz.test.ts
- Esforço: medio
- Notas: `src/server/authz.ts` existe com 0 bytes. Implementar `requireRole`
  que lê `locals.user`, compara com a lista de papéis permitidos e devolve
  `403` com corpo `{"error":"papel_insuficiente"}`, registrando em `auth_audit`
  o papel exigido e o de quem chamou. Nenhum handler pode importar este arquivo
  ainda — esta tarefa entrega só a função e seu teste unitário.

## T-102 — Allowlist de colunas vira a fonte de verdade [concluida]

- Refs: US-101, AC-109, AC-110, AC-111, AC-112, AC-113, AC-114
- Arquivos: src/server/tables.ts, src/server/mapping.ts, src/server/sql.ts, tests/server/tableColumns.test.ts, tests/server/mapping.test.ts, tests/server/sql.test.ts
- Esforço: alto
- Notas: `TableShape` ganha `columns?: string[]`. `entityToRow` descarta toda
  chave fora de `columns` — é o ponto único por onde passam `insertEntity` e
  `updateEntity`, então o filtro vale para as duas. `buildInsert`/`buildUpdate`
  recebem a lista permitida como defense in depth. `tests/server/tableColumns.test.ts`
  é o guard de drift: compara cada `*_SHAPE` com o schema derivado de
  `migrations/` via `schemaFromMigrations` de `tests/helpers/fakeD1.ts`.
  Cuidado: `crud.ts` faz `{ ...existing, ...patch }`, e `existing` vem de
  `SELECT *`; a chave injetada em `patch` precisa morrer no `entityToRow`.

## T-103 — Segredo da WAHA fora do controle de versão [concluida]

- Refs: US-103, AC-120, AC-121, AC-122, AC-123
- Arquivos: .gitignore, waha/docker-compose.waha.yml, waha/.env.example, tests/server/wahaComposeSecurity.test.ts
- Esforço: baixo
- Notas: `git rm --cached waha/.env` (o arquivo continua em disco para o
  compose local). `.gitignore` ganha regra `.env`. No compose, a credencial
  passa a vir de variável de ambiente, sem hash SHA-512 literal. O `.example`
  fica sem verificador real. O teste cobre os quatro critérios lendo os
  arquivos e chamando `git ls-files`.

## T-104 — Escape correto em atributo HTML [concluida]

- Refs: US-105, AC-131, AC-132, AC-133, AC-134
- Arquivos: src/domain/format.ts, src/ui/views/crm/crmUi.ts, src/ui/views/CustomersView.ts, src/ui/views/crm/CrmInboxView.ts, tests/domain/format.test.ts
- Esforço: medio
- Notas: `escapeHtml` continua como está, para contexto de texto. Novo
  `escapeAtrib` escapa também `"` e `'`. Migrar os sinks de atributo citados
  na auditoria: `crmUi.ts` (value/title), `CustomersView.ts:117`,
  `CrmInboxView.ts:710`. `waStatus` deve ser lido por property em vez de
  interpolado.

## T-105 — Recorte LGPD sem trabalho duplicado [concluida]

- Refs: US-106, AC-135, AC-136
- Arquivos: src/pages/api/me/data.ts, src/pages/api/me/export.ts, tests/server/lgpdRights.test.ts
- Esforço: baixo
- Notas: `contacts` é filtrado duas vezes em `me/data.ts`; filtrar uma vez em
  variável e reaproveitar. Preservar o recorte exatamente — o teste de direitos
  do titular já existe e é a trava.

## T-106 — Modelo de acesso documentado [concluida]

- Refs: US-107, AC-137, AC-138, AC-139
- Arquivos: README.md, tests/server/accessModelDoc.test.ts
- Esforço: baixo
- Notas: secao nova no README dizendo que as listagens devolvem a base
  inteira, que nao ha filtro por dono, e que `assignedUserId`/`assigneeUserId`
  sao metadado de atribuicao usado so no escopo LGPD. O teste le o README e
  varre `src/` procurando uso desses campos como decisao de acesso.

## T-107 — Rotas de usuario e settings exigem papel [concluida]

- Refs: US-100, AC-100, AC-101, AC-102, AC-103, AC-104, AC-105, AC-106, AC-107
- Arquivos: src/pages/api/users/index.ts, src/pages/api/users/[id].ts, src/pages/api/settings.ts, tests/server/usersAuthz.test.ts, tests/server/settings.test.ts
- Esforço: alto
- Depende de: T-101
- Notas: `GET`/`POST /api/users` exigem admin ou manager; `PUT` exige manager
  para `name`/`email` e admin para `role` e `password`; `DELETE` exige admin;
  `/api/settings` exige admin ou manager. `PUT` decide por campo, nao por
  rota: um corpo so com `role` nao pode passar so porque o papel base allows.
  O gate de UI em `CrmEquipeView.ts:102-104` nao conta como controle.

## T-108 — Middleware: sessao WhatsApp e bloqueio de troca [concluida]

- Refs: US-102, AC-115, AC-116, AC-117, AC-118, AC-119, AC-127
- Arquivos: src/middleware.ts, src/pages/api/whatsapp/session.ts, tests/server/middleware.test.ts, tests/server/whatsappSessionRoute.test.ts
- Esforço: alto
- Depende de: T-101
- Notas: duas mudanças no mesmo arquivo, por isso uma tarefa so. (a) Tirar
  `/api/whatsapp/session` de `PUBLIC_PATHS` e remover o comentario que
  justificava a exposicao; o handler passa a exigir admin. (b) Quando o
  usuario tem `mustChangePassword`, devolver `403` com
  `troca_de_senha_obrigatoria` em toda `/api/*`, exceto a allowlist de troca
  (`/api/auth/me`, `/api/auth/change-password`, `/api/auth/logout`).

## T-109 — Troca obrigatoria da senha do seed [concluida]

- Refs: US-104, AC-124, AC-125, AC-126, AC-128, AC-129, AC-130
- Arquivos: migrations/0020_users_must_change_password.sql, migrations/0021_seed_admin_flag.sql, package.json, src/domain/crm.ts, src/server/auth.ts, src/pages/api/auth/login.ts, src/pages/api/auth/change-password.ts, scripts/generate-admin-seed.ts, tests/server/mustChangePassword.test.ts
- Esforço: alto
- Notas: 0020 e 0021 existem com 0 bytes. 0020 adiciona
  `mustChangePassword INTEGER NOT NULL DEFAULT 0` em `users`; 0021 liga a flag
  do `seed-user-admin`. Ambos precisam entrar em `db:migrate:local` e
  `db:migrate:remote`, em ordem crescente, ou `tests/server/migrationParity.test.ts`
  falha. `publicUser` passa a expor `mustChangePassword`. O login responde a
  flag; `change-password` limpa. O README perde a senha do seed. O
  `db:seed:remote` passa por `scripts/generate-admin-seed.ts`, que aborta sem
  `--allow-seed-admin`.

## T-110 — Contrato das rotas por id [concluida]

- Refs: US-108, AC-140, AC-141
- Arquivos: tests/server/idRoutesContract.test.ts
- Esforço: baixo
- Notas: o teste lista os 20 `src/pages/api/**/[[]id[]].ts`, compara com o
  inventario esperado e falha se uma rota nova aparecer sem ser registrada.
  Verifica tambem que nenhuma delas esta em `PUBLIC_PATHS` e que
  `users/[id]` tem cobertura de papel em `tests/server/usersAuthz.test.ts`.