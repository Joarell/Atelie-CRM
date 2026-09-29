# Tasks: Lgpd privacidade

> feature: lgpd-privacidade

## T-001 — Fundação: tipos e exports faltantes [concluida]

- Refs: US-001, US-002, AC-001, AC-005
- Arquivos: src/domain/crm.ts, src/server/tables.ts, src/server/consent.ts, src/server/rateLimit.ts, src/server/retention.ts, src/server/retentionCron.ts, src/middleware.ts, src/worker.ts, src/domain/pseudonymize.ts, src/domain/dataFreshness.ts, src/ui/freshness.ts
- Notas: O código LGPD referencia `ConsentRecord`, `CONSENT_TABLE`, `CONSENT_SHAPE`, `RATE_LIMIT_TABLE`, `RATE_LIMIT_SHAPE` e `assignedUserId` em Contact/Deal — nenhum existe ainda. Esta tarefa é pré-requisito de todas as outras.

## T-002 — Testes de consentimento (AC-001 a AC-004) [pendente]

- Refs: US-001, AC-001, AC-002, AC-003, AC-004
- Arquivos: tests/server/consent.test.ts
- Notas: Testa `recordConsent`, `withdrawConsent`, `hasValidConsent` e `grantConsent` (revogação da anterior). Cada teste anota `@spec:AC-xxx` no título.

## T-003 — Anotar testes de rate limit existentes (AC-005 a AC-008) [pendente]

- Refs: US-002, AC-005, AC-006, AC-007, AC-008
- Arquivos: tests/server/rateLimitWiring.test.ts
- Notas: Os testes já existem e passam — falta anotar cada `it()` com `@spec:AC-xxx` no título.

## T-004 — Anotar testes de retenção existentes (AC-009 a AC-015) [pendente]

- Refs: US-003, AC-009, AC-010, AC-011, AC-012, AC-013, AC-014, AC-015
- Arquivos: tests/server/retention.test.ts, tests/server/retentionCron.test.ts
- Notas: Os testes já existem e passam — falta anotar cada `it()` com `@spec:AC-xxx` no título.

## T-005 — Testes de pseudonimização (AC-016 a AC-019) [pendente]

- Refs: US-004, AC-016, AC-017, AC-018, AC-019
- Arquivos: tests/domain/pseudonymize.test.ts
- Notas: Testa `pseudonymizePhone`, `pseudonymizeName`, `pseudonymizeEmail` e `pseudonymizeWahaPayload` (campos aninhados). Cada teste anota `@spec:AC-xxx`.

## T-006 — Testes de direitos do titular (AC-020 a AC-022) [pendente]

- Refs: US-005, AC-020, AC-021, AC-022
- Arquivos: tests/server/lgpdRights.test.ts
- Notas: Testa `GET /api/me/export`, `DELETE /api/me/erase` e a auditoria da exclusão. Cada teste anota `@spec:AC-xxx`.

## T-007 — Testes de princípios LGPD (P-004, P-005, P-006) [pendente]

- Refs: US-001, US-003, US-005, AC-001, AC-014, AC-021
- Arquivos: tests/domain/lgpdPrinciples.test.ts
- Notas: Testa que consentimento é granular (P-004), que retenção tem prazo configurável (P-005) e que direitos do titular funcionam (P-006). Cada teste anota `@principle:P-xxx`.
