# Tasks: Security audit fixes v2

> feature: security-audit-fixes-v2

<!--
  Como ler este arquivo (o formato é verificado por `onp-spec audit`):
  - T-xxx = tarefa (código de rastreio, único no projeto inteiro).
  - Toda tarefa referencia em `Refs:` pelo menos uma história de usuário
    (US-xxx) ou critério de aceite (AC-xxx).
  - Toda tarefa lista os arquivos que cria/altera em `Arquivos:` — capriche:
    é o que decide o que `onp-spec plano` roda em PARALELO (arquivos
    disjuntos) e o que roda em sequência.
  - Campos opcionais por tarefa, usados pelo plano de execução:
    `- Modelo: claude-sonnet-5` e `- Esforço: alto` (baixo|medio|alto|xalto|max).
  - Uma tarefa só pode virar [concluida] quando os critérios de aceite dela
    tiverem prova PASS registrada por `onp-spec verify`.
  Status: pendente | em-andamento | concluida
    (atalho: `onp-spec tarefa <feature> <T-xxx> <status>`)
-->

## T-301 — LGPD: filtrar messages, customers, orders no recorte do titular [concluida]
- Refs: US-301, AC-301, AC-302, AC-303
- Arquivos: src/pages/api/me/data.ts, src/pages/api/me/export.ts
- Notas: Modificar `selectUserRows` em ambos os arquivos para filtrar messages pelas conversas do titular, e derivar customers/orders dos contatos filtrados. Adicionar testes unitários.

## T-302 — SSE: filtro por conversas do usuário + cookie HttpOnly [concluida]
- Refs: US-302, AC-304, AC-305
- Arquivos: src/pages/api/crm/events.ts, src/middleware.ts, src/repositories/ApiAuthRepository.ts
- Notas: 1) Filtrar mensagens no SSE por conversas do usuário logado. 2) Migrar token para cookie HttpOnly; remover `?token=` do SSE; remover ACAO:*. Exige Q-201 (EventSource envia cookies).

## T-303 — Teste: listEntities devolve tabela inteira (invariante) [concluida]
- Refs: US-303, AC-306
- Arquivos: tests/spec-v2/b-lgpd-sse.test.ts
- Notas: Testar que `listEntities` devolve todas as linhas sem filtro. Documentar decisão de single-tenant.

## T-304 — POST /api/users: bloquear escalada manager→admin [concluida]
- Refs: US-304, AC-307, AC-308, AC-309
- Arquivos: src/pages/api/users/index.ts
- Notas: Aplicar `allowedRoles(body)` no POST (reuso do PUT). Testes: manager→admin = 403; manager→manager/agent/viewer = 201.

## T-305 — Autorização: viewer somente leitura em todas as entidades [concluida]
- Refs: US-305, AC-310, AC-311, AC-316
- Arquivos: src/server/routeFactory.ts
- Notas: Adicionar parâmetro `allowedRoles` em `createCollectionRoutes`/`createItemRoutes` com matriz: leitura=todos; escrita=agent+; exclusão=manager+. Validar com `requireRole` antes de tocar D1.

## T-306 — UI/Server sync: botão Excluir só para admin [concluida]
- Refs: US-306, AC-317
- Arquivos: src/ui/views/crm/CrmEquipeView.ts
- Notas: Condicionar botão Excluir ao papel `admin` (igual ao endpoint DELETE /api/users/:id).

## T-307 — UI: botão "Novo usuário" só para papéis autorizados [concluida]
- Refs: US-307, AC-318
- Arquivos: src/ui/views/crm/CrmEquipeView.ts
- Notas: Condicionar renderização do botão "+ Novo usuário" aos papéis que podem criar (admin/manager).

## T-308 — ROLE_RANK: usar ou remover [concluida]
- Refs: US-308, AC-319
- Arquivos: src/server/authz.ts, src/domain/crm.ts
- Notas: Opção A: usar `ROLE_RANK[user.role] >= ROLE_RANK[required]` em `requireRole`. Opção B: remover constante e menção a hierarquia. Decidir e implementar.

## T-309 — IDOR: posse em item routes (contatos, pedidos, etc.) [concluida]
- Refs: US-309, AC-320, AC-321, AC-322, AC-323
- Arquivos: src/server/routeFactory.ts
- Notas: Em `createItemRoutes`, antes do write: resolver registro e exigir posse (`registro.<dono> === user.id` ou role manager/admin). Aplicar a todas entidades com coluna de dono (contacts, tasks, deals, orders, etc.).

## T-310 — WhatsApp send: exigir posse da conversa + role agent+ [concluida]
- Refs: US-310, AC-324, AC-325
- Arquivos: src/pages/api/whatsapp/send.ts, src/server/wahaSend.ts
- Notas: Em `loadWahaConversation`: exigir `assignedUserId === user.id || role in (manager,admin)`. Na rota: `requireRole(['agent','manager','admin'])`.

## T-311 — Settings: GET não escreve + PUT valida schema [concluida]
- Refs: US-311, AC-326, AC-327, AC-328
- Arquivos: src/pages/api/settings.ts, src/server/mapping.ts
- Notas: 1) Mover default para migration/seed; GET puramente leitura. 2) Adicionar `shape.columns` explícito a settings. 3) Validar patch com schema (zod).

## T-312 — Teste: rota pública sem userFromToken falha [concluida]
- Refs: US-312, AC-329
- Arquivos: tests/spec-v2/c-settings-secrets.test.ts
- Notas: Teste que falha se rota em PUBLIC_PATHS não chama `userFromToken`.

## T-313 — Seed admin: sem senha padrão reproduzível [concluida]
- Refs: US-313, AC-330, AC-331, AC-332, AC-333
- Arquivos: migrations/0004_crm_seed.sql, src/server/auth.ts, src/server/seedCredential.ts, scripts/bootstrap-admin.ts
- Notas: 1) Remover senha fixa do seed; 2) Bootstrap no primeiro boot gera senha aleatória (ou env ADMIN_INITIAL_PASSWORD) em `scripts/bootstrap-admin.ts`, sem migration nova — a senha jamais entra no git; 3) `assertNoLegacySeedHash` em `seedCredential.ts` aborta o boot se o hash do seed existir; 4) `verifyPassword` sem sal default.

## T-314 — Secrets: .dev.vars fora do git + HMAC placeholder rejeitado [concluida]
- Refs: US-314, AC-334, AC-335, AC-336, AC-337
- Arquivos: .dev.vars, .dev.vars.example, src/server/wahaWebhook.ts
- Notas: 1) Confirmar .dev.vars no .gitignore (já está). 2) Em `readWahaWebhookConfig`: rejeitar placeholder e segredos < 32 bytes. 3) .dev.vars.example com WAHA_HMAC_SECRET vazio.
- ⚠️ AC-335 parcial: a prova cobre só a árvore de trabalho (`git ls-files` + leitura de cada arquivo). A credencial real permanece no **histórico** git — `git log --all -S'<prefixo>'` retorna `e5cd231` (`docs/security-audit/dados_auditoria.py`, já redigido na árvore). Pendente, e não coberto por teste: 1) **rotacionar a WAHA_API_KEY** no engine (a atual deve ser tratada como queimada); 2) reescrever o histórico para remover `e5cd231` (requer force-push — destrutivo, precisa de decisão explícita). Até lá, AC-335 NÃO deve ser lida como "chave nunca commitada".
- Correção do guard de AC-335: a primeira versão do teste **embutia o prefixo comprometido** em `COMPROMISED_PREFIX`, e o critério citava `git log -S'<prefixo>'` — o próprio teste e o spec viravam vetor de vazamento (detectado só depois que o spec entrou no índice). Ambos foram redigidos. O guard agora deriva a chave real de `.dev.vars` (não rastreado) e faz uma varredura genérica de `WAHA_API_KEY="..."` em todo arquivo rastreado, descartando placeholders — mais forte que uma string fixa, e validado por mutação (chave plantada em `leak-probe.md` faz o teste falhar; probe removido depois).

## T-315 — Remover DeskcommCRM do repositório [concluida]
- Refs: US-315, AC-338
- Arquivos: DeskcommCRM-RecipeCosting/, .gitignore
- Notas: `git rm -r --cached DeskcommCRM-RecipeCosting/` + adicionar ao .gitignore. Verificar se não quebra builds.

## T-316 — openModal: escapar title + callers [concluida]
- Refs: US-316, AC-340, AC-341
- Arquivos: src/ui/Modal.ts, src/ui/views/crm/CrmContatosView.ts, src/ui/views/StockView.ts
- Notas: 1) Em Modal.ts: `<h3>${escapeHtml(options.title)}</h3>`. 2) Callers: escapar `contact.name` e `ingredient.name` com `escapeHtml`.

## T-317 — DashboardView: escapar i.name/i.unit [concluida]
- Refs: US-317, AC-342
- Arquivos: src/ui/views/DashboardView.ts
- Notas: Em `lowStockRow`: usar `escapeHtml(i.name)` e `escapeHtml(i.unit)`.

## T-318 — LoginView: escapar me.name/me.email [concluida]
- Refs: US-318, AC-343
- Arquivos: src/ui/views/LoginView.ts
- Notas: Linhas 44-45: usar `escapeHtml(me.name)` e `escapeHtml(me.email)`.

## T-319 — Escape de atributo: unificar helpers + aplicar [concluida]
- Refs: US-319, AC-344, AC-345, AC-346, AC-347
- Arquivos: src/domain/format.ts, src/ui/dom.ts, src/ui/views/crm/CrmEtiquetasView.ts, src/ui/views/ProductsView.ts, src/ui/views/crm/CrmWhatsAppView.ts
- Notas: 1) Unificar `escapeAtrib` e `escapeAttr` em um só (manter o mais completo). 2) Aplicar helper de atributo em: CrmEtiquetasView class, ProductsView value, CrmWhatsAppView src.

## T-320 — numberField: escapar value + validar tipo no servidor [concluida]
- Refs: US-320, AC-348, AC-349
- Arquivos: src/ui/views/crm/crmUi.ts, src/ui/views/ProductsView.ts, src/ui/views/IngredientsView.ts, src/ui/views/ComponentsView.ts, src/ui/views/SettingsView.ts, src/server/mapping.ts
- Notas: 1) Em 5 numberFields: `value="${escapeAtrib(String(value))}"`. 2) Validação de tipo no servidor para campos numéricos (mapping.ts/entityToRow).

## T-321 — rowButton: escapar atributo data-* [concluida]
- Refs: US-321, AC-350
- Arquivos: src/ui/views/crm/crmUi.ts
- Notas: Em `rowButton`: `data-${dataset}="${escapeAtrib(value)}"`.

## T-322 — Sessão: migrar para cookie HttpOnly + SSE sem token [concluida]
- Refs: US-322, AC-351, AC-352, AC-353
- Arquivos: src/repositories/ApiAuthRepository.ts, src/middleware.ts, src/pages/api/crm/events.ts
- Notas: 1) Migrar token para cookie HttpOnly; Secure; SameSite=Strict. 2) Remover `?token=` do SSE. 3) Remover ACAO:* do SSE. Exige Q-201 (EventSource envia cookies).

(End of file)