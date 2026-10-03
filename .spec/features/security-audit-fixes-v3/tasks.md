# Tasks: Security audit fixes v3

> feature: security-audit-fixes-v3

## T-323 — Migration: coluna de dono nas tabelas de trabalho + backfill [pendente]

- Refs: US-324, AC-355, AC-360, AC-362
- Arquivos: migrations/0023_owner_columns.sql, package.json
- Modelo: claude-sonnet-5
- Esforço: medio
- Notas: `ALTER TABLE ADD COLUMN` one-shot (sem `IF NOT EXISTS` em SQLite,
  convenção de 0018) para `calendar_events`, `catalog_products`,
  `crm_lead_activities` e `conversation_notes`, cada uma com índice. Backfill em
  `UPDATE ... WHERE assignedUserId = ''` separado e idempotente: herda
  `createdBy`, `actorUserId`, `authorUserId`; `catalog_products` cai no admin mais
  antigo (ASM-206). **Precisa** acrescentar o arquivo nos scripts
  `db:migrate:local` e `db:migrate:remote` ao final da cadeia, senão
  `migrationParity.test.ts` falha e o banco documentado não tem a coluna.

## T-324 — Fábrica de rotas: posse por coluna e por herança, falha fechada [pendente]

- Refs: US-323, US-324, AC-354, AC-356, AC-357, AC-358, AC-359, AC-361
- Arquivos: src/server/routeFactory.ts, src/server/tables.ts, src/pages/api/crm/tags/[id].ts, src/pages/api/crm/stages/[id].ts, src/pages/api/crm/pipelines/[id].ts, src/pages/api/crm/quick-replies/[id].ts, src/pages/api/crm/appointment-types/[id].ts, src/pages/api/orders/[id].ts, src/pages/api/products/[id].ts, src/pages/api/components/[id].ts, src/pages/api/ingredients/[id].ts, src/pages/api/customers/[id].ts, tests/server/ownership.test.ts
- Modelo: claude-sonnet-5
- Esforço: alto
- Notas: `Ownership` discriminado (`column` | `via`) cobre `messages` por
  `conversationId` → `conversations.assignedUserId` (AC-356). Dono vazio vira 403
  `nao_autorizado` para não-administrador (AC-359). `createHandler` deriva o dono
  da sessão (AC-361). As 10 rotas sem dono recebem `RoleConfig` explícito com
  `update`/`delete: 'manager'` (ASM-205). Manager/admin seguem passando (AC-357).
  `tables.ts` ganha `assignedUserId` nos quatro shapes.

## T-325 — Superfície de escrita: campos imutáveis e dono não esvaziável [pendente]

- Refs: US-325, AC-363, AC-364, AC-365, AC-366
- Arquivos: src/server/routeFactory.ts, src/server/crud.ts, tests/server/routeFactory.test.ts
- Modelo: claude-sonnet-5
- Esforço: alto
- Notas: `IMMUTABLE_FIELDS` por tabela (`createdBy`, `authorUserId`,
  `actorUserId`, `createdAt`; em `messages` também `text`, `fromMe`, `direction`,
  `conversationId`) checado **antes** do merge de `crud.ts:59`. Recusa é **400**
  com a lista de campos, no mesmo formato de `campo_numerico_invalido`. Chave
  vazia no campo de dono é rejeitada (AC-365). Viewer continua 403 (AC-366, não
  regride AC-311).

## T-326 — Webhook WAHA: seguro por padrão e fail-closed [pendente]

- Refs: US-326, AC-367, AC-368, AC-369, AC-371
- Arquivos: src/server/wahaWebhook.ts, .dev.vars.example, tests/server/wahaWebhook.test.ts
- Modelo: claude-sonnet-5
- Esforço: medio
- Notas: tira a conjunção `requireSignature && hmacSecret` do caminho de recusa
  (AC-368). Segredo utilizável presente **liga** a exigência por padrão (AC-367);
  desligar exige `WAHA_WEBHOOK_ALLOW_UNSIGNED="true"` (AC-369). `usableSecret`
  (32 bytes + placeholders) é reaproveitado sem mudança. Assinatura errada segue
  recusada em qualquer modo (AC-371). `.dev.vars.example` para de entregar
  segredo e flag vazios como neutros.

## T-327 — Guardas de segredo: check-ignore, hash no versionado e runbook [pendente]

- Refs: US-327, AC-372, AC-373, AC-374
- Arquivos: tests/spec-v2/c-settings-secrets.test.ts, docs/security-audit/ROTAÇÃO-CREDENCIAIS.md
- Modelo: claude-sonnet-5
- Esforço: medio
- Notas: AC-372 usa `git check-ignore` real, não leitura de `.gitignore`. AC-373
  estende o guarda de AC-335 para o **hash** SHA-512 de `waha/.env` (C4-03), que
  era a lacuna. O runbook entrega rotação, purga de histórico em clone limpo e,
  em ordem, o aviso de que revogar a credencial é o que encerra o acesso. Não
  reescreve histórico neste clone (Q-205).

## T-328 — Boot valida configuração e CI ganha gate de auditoria [pendente]

- Refs: US-328, US-329, AC-375, AC-376, AC-377, AC-378, AC-379, AC-380
- Arquivos: src/worker.ts, src/server/boot.ts, .github/workflows/ci.yml, docs/security-audit/EXCECOES-AUDIT-DEPENDENCIAS.md, tests/server/boot.test.ts
- Modelo: claude-sonnet-5
- Esforço: medio
- Notas: `assertNoSeedCredential` memoizada por isolate, resposta **503** com
  causa explícita (ASM-208). Tirar `continue-on-error: true` do passo de
  auditoria (AC-378) e versionar a lista de exceção nomeando advisory, pacote e
  motivo (AC-379); advisory fora da lista reprova (AC-380). `undici` é
  transitiva de `miniflare`/`wrangler`, fora do bundle do Worker, e
  `--omit=dev` **não** isola porque `@astrojs/cloudflare` é de produção.

## T-329 — Escape com nome que declara o contexto [pendente]

- Refs: US-330, AC-381, AC-382
- Arquivos: src/domain/format.ts, tests/domain/format.test.ts, tests/ui/escapeContext.test.ts
- Modelo: claude-sonnet-5
- Esforço: medio
- Notas: helper passa a se chamar `escapeText` com comentário que proíbe uso em
  atributo; `escapeHtml` fica como alias para não invalidar a prova de `AC-133`
  (ASM-207). O guarda varre `src/ui` e falha se achar `escapeText` ou `escapeHtml`
  dentro de interpolação de atributo. Não muda o comportamento de escape, para
  não regredir `AC-131` a `AC-134`. Os 118 call sites existentes passam a
  `escapeText` (mecânico, verificado pelo compilador).