# Tasks: Updated contacts

> feature: updated-contacts

## T-008 — Atualizar nome do contato na ingestão [pendente]

- Refs: US-006, AC-023, AC-024, AC-025, AC-026
- Arquivos: src/server/wahaContact.ts
- Notas: Modificar `ensureWahaContact` para atualizar o nome do contato existente quando `notifyName` difere do nome atual. Não sobrescrever quando notifyName está vazio.

## T-009 — Testes da sincronização de contatos [pendente]

- Refs: US-006, AC-023, AC-024, AC-025, AC-026
- Arquivos: tests/server/wahaContact.test.ts
- Notas: Testes unitários para `ensureWahaContact` cobrindo os 4 critérios de aceite.
