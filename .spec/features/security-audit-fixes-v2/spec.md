# Spec: Security audit fixes v2

> feature: security-audit-fixes-v2
> status: rascunho

<!--
  Como ler este arquivo (o formato é verificado por `onp-spec audit`):
  - US-xxx = história de usuário · AC-xxx = critério de aceite
    ASM-xxx = suposição · Q-xxx = pergunta em aberto
  - São códigos de rastreio: ligam a especificação às tarefas e aos testes.
  - Toda história de usuário precisa de pelo menos um critério de aceite.
  - Todo critério de aceite precisa de Dado/Quando/Então completos.
  - Os códigos são únicos no projeto inteiro (nunca reutilize um número).
  - Suposições e Perguntas em aberto são OBRIGATÓRIAS: se não há nenhuma,
    escreva "Nenhuma." — mas desconfie: quase toda feature esconde uma.
-->

## Contexto

Esta feature fecha os 23 achados residuais da **segunda auditoria de segurança** (relatório `docs/security-audit/relatorio-auditoria-seguranca.pdf`). A primeira auditoria (`security-audit-fixes`) já fechou 42 critérios (autorização básica, mustChangePassword, allowlist de colunas, etc.). Esta segunda rodada encontrou falhas residuais: recorte LGPD incompleto, escalada de privilégio no POST /api/users, ausência de gates nas rotas geradas, IDOR em item routes e WhatsApp, seed admin reproduzível, injeções de HTML em Modal/Dashboard/LoginView, escape de atributo inconsistente, e token em localStorage.

A stack é **Astro 7 SSR + Cloudflare Workers + D1 (SQLite, SQL cru)**. Frontend **framework-free** (DOM imperativo + CSS). Auth por **sessão em D1 com token Bearer**. Não há Supabase, RLS, nem multi-tenant — `assignedUserId`/`assigneeUserId` são metadado de atribuição, usado só no recorte LGPD.

## Histórias

### US-301 — Recorte LGPD devolve apenas dados do titular

Como **titular de dados**, quero que **/api/me/data e /api/me/export devolvam apenas minhas mensagens, clientes e pedidos**, para que eu exerça meu direito de acesso sem vazar dados de terceiros.

#### AC-301 — Exportação filtra mensagens pelas conversas do titular

- **Dado** um usuário autenticado com contatos atribuídos
- **Quando** ele chama GET /api/me/export
- **Então** o campo `messages` contém apenas mensagens das conversas dos seus contatos (e não todas as mensagens do sistema)

#### AC-302 — Exportação filtra customers e orders pelos contatos do titular

- **Dado** um usuário autenticado com contatos atribuídos
- **Quando** ele chama GET /api/me/export
- **Então** os campos `customers` e `orders` contêm apenas registros relacionados aos seus contatos (e não a base inteira)

#### AC-303 — Recorte data e export comportam-se idênticos

- **Dado** um usuário com contatos atribuídos
- **Quando** ele chama GET /api/me/data e GET /api/me/export
- **Então** ambos retornam o mesmo recorte filtrado (messages, customers, orders consistentes)

---

### US-302 — SSE não faz broadcast de dados de outros usuários

Como **operador autenticado**, quero que **o stream /api/crm/events entregue apenas eventos das minhas conversas**, para que eu não veja mensagens e telefones de clientes alheios.

#### AC-304 — SSE filtra mensagens pelas conversas do usuário logado

- **Dado** um usuário autenticado abrindo o SSE /api/crm/events
- **Quando** novas mensagens chegam ao sistema
- **Então** o stream emite apenas mensagens das conversas atribuídas a esse usuário (não todas)

#### AC-305 — SSE não expõe token em query string com ACAO:*

- **Dado** um navegador conectando ao SSE /api/crm/events
- **Quando** a conexão é estabelecida
- **Então** a autenticação ocorre via cookie HttpOnly (não `?token=`) e o header `Access-Control-Allow-Origin` não é `*`

---

### US-303 — Isolamento de tenant documentado como decisão explícita

Como **desenvolvedor**, quero que **a ausência de isolamento por linha seja uma invariante testada**, para que futuras rotas não assumam isolamento que não existe.

#### AC-306 — listEntities devolve tabela inteira e isso é testado

- **Dado** uma base com dados de múltiplos usuários
- **Quando** `listEntities` é chamado para qualquer entidade
- **Então** o resultado contém todas as linhas (teste falha se um filtro for adicionado sem querer)

---

### US-304 — POST /api/users não permite escalada de privilégio

Como **administrador**, quero que **um manager NÃO consiga criar conta admin via POST /api/users**, para que a hierarquia de privilégios seja respeitada.

#### AC-307 — Manager criando admin via POST retorna 403

- **Dado** uma sessão com papel `manager`
- **Quando** faz POST /api/users com `role: "admin"`
- **Então** a resposta é 403 `papel_insuficiente` e nenhuma conta admin é criada

#### AC-308 — Manager criando manager/agent/viewer continua funcionando

- **Dado** uma sessão com papel `manager`
- **Quando** faz POST /api/users com `role: "manager"` ou `"agent"` ou `"viewer"`
- **Então** a resposta é 201 e a conta é criada

#### AC-309 — POST e PUT usam a mesma regra de validação

- **Dado** as rotas POST /api/users e PUT /api/users/:id
- **Quando** um manager tenta criar/alterar papel para admin
- **Então** ambas rejeitam com a mesma regra (reuso de `allowedRoles`)

---

### US-305 — Papel viewer é somente leitura em todas as entidades

Como **operador com papel viewer**, quero que **tentativas de escrita em qualquer entidade retornem 403**, para que o rótulo "Visualização" corresponda à realidade.

#### AC-310 — POST em rotas de entidade por viewer retorna 403

- **Dado** uma sessão com papel `viewer`
- **Quando** faz POST /api/crm/pipelines (ou qualquer entidade CRM/ERP)
- **Então** a resposta é 403 `papel_insuficiente`

#### AC-311 — PUT/DELETE em rotas de entidade por viewer retorna 403

- **Dado** uma sessão com papel `viewer`
- **Quando** faz PUT/DELETE /api/crm/contacts/:id (ou qualquer entidade)
- **Então** a resposta é 403 `papel_insuficiente`

#### AC-316 — Matriz de permissões por operação é centralizada

- **Dado** as fábricas `createCollectionRoutes` e `createItemRoutes`
- **Quando** uma rota é gerada
- **Então** ela recebe uma lista de papéis permitidos por operação (leitura: todos; escrita: agent+; exclusão: manager+) e valida com `requireRole`

---

### US-306 — UI e servidor concordam sobre quem pode excluir usuário

Como **operador manager**, quero que **o botão Excluir só apareça quando o servidor aceitar a ação**, para não receber 403 inesperados.

#### AC-317 — Botão Excluir só aparece para admin

- **Dado** um usuário `manager` na tela /equipe
- **Quando** a lista de usuários é renderizada
- **Então** o botão Excluir NÃO aparece (só admin vê)

---

### US-307 — Botão "Novo usuário" respeita o papel do operador

Como **operador viewer**, quero **não ver o botão "+ Novo usuário"**, para não clicar e receber 403.

#### AC-318 — Botão só renderiza para papéis que podem criar

- **Dado** um usuário `viewer` na tela /equipe
- **Quando** a página carrega
- **Então** o botão "+ Novo usuário" não é renderizado

---

### US-308 — ROLE_RANK é usada ou removida

Como **desenvolvedor**, quero que **a hierarquia de papéis tenha efeito real ou seja removida**, para evitar confusão.

#### AC-319 — requireRole usa ROLE_RANK ou a constante é removida

- **Dado** a constante `ROLE_RANK` em `src/domain/crm.ts`
- **Quando** `requireRole` é chamado
- **Então** a verificação usa `ROLE_RANK[user.role] >= ROLE_RANK[required]` **ou** a constante e a menção a hierarquia são removidas

---

### US-309 — PUT/DELETE por ID exige posse do registro

Como **operador agent**, quero **não conseguir alterar/excluir contatos, negócios ou pedidos de outros usuários**, para que a posse do registro seja respeitada.

#### AC-320 — PUT em contato de outro agente retorna 403

- **Dado** um usuário `agent` autenticado
- **Quando** faz PUT /api/crm/contacts/:id de um contato atribuído a outro agente
- **Então** a resposta é 403 e o registro não é alterado

#### AC-321 — DELETE em pedido de outro usuário retorna 403

- **Dado** um usuário `agent` autenticado
- **Quando** faz DELETE /api/orders/:id de um pedido de outro usuário
- **Então** a resposta é 403 e o registro não é excluído

#### AC-322 — Manager/Admin conseguem alterar qualquer registro

- **Dado** um usuário `manager` ou `admin`
- **Quando** faz PUT/DELETE em registro de outro usuário
- **Então** a operação succeeds (papel manager/admin ignora posse)

#### AC-323 — Verificação está centralizada na fábrica de rotas

- **Dado** `createItemRoutes` em `src/server/routeFactory.ts`
- **Quando** uma rota de item é gerada
- **Então** a verificação de posse (`registro.<dono> === user.id || role in (manager,admin)`) ocorre na fábrica (não replicada em 24 arquivos)

---

### US-310 — Envio de WhatsApp exige posse da conversa

Como **operador**, quero **só poder enviar WhatsApp para conversas que me pertencem**, para não abusar do canal comercial.

#### AC-324 — Envio para conversa de outro agente retorna 403

- **Dado** um usuário `agent` autenticado
- **Quando** faz POST /api/whatsapp/send com `conversationId` de conversa atribuída a outro agente
- **Então** a resposta é 403 `papel_insuficiente` ou `conversa_nao_encontrada`

#### AC-325 — Rota exige papel agent/manager/admin

- **Dado** uma sessão `viewer`
- **Quando** faz POST /api/whatsapp/send
- **Então** a resposta é 403 `papel_insuficiente`

---

### US-311 — GET /api/settings não escreve e valida patch

Como **operador**, quero que **GET /api/settings seja puramente de leitura e PUT valide colunas**, para evitar escrita acidental e colunas arbitrárias.

#### AC-326 — GET /api/settings não executa escrita

- **Dado** um banco sem registro `settings`
- **Quando** GET /api/settings é chamado
- **Então** nenhuma instrução INSERT/UPDATE é executada (apenas leitura)

#### AC-327 — PUT valida colunas contra schema explícito

- **Dado** `settings` com `shape.columns` explícito
- **Quando** PUT /api/settings recebe chave desconhecida no corpo
- **Então** a chave é descartada e não altera a linha persistida

#### AC-328 — Schema de validação existe para o patch

- **Dado** o patch de settings
- **Quando** o corpo contém campo inválido
- **Então** um schema (zod ou equivalente) valida e rejeita antes do merge

---

### US-312 — Rotas públicas se auto-autenticam (cobertura verificada)

Como **desenvolvedor**, quero **teste que garanta que toda rota em PUBLIC_PATHS valida token**, para evitar regressão.

#### AC-329 — Teste falha se rota pública não chama userFromToken

- **Dado** uma rota adicionada a `PUBLIC_PATHS` no middleware
- **Quando** a rota não chama `userFromToken`
- **Então** um teste automatizado falha

---

### US-313 — Credencial admin de seed não é reproduzível

Como **administrador de deploy**, quero **não existir senha padrão `admin123` reproduzível no repositório**, para que um ambiente novo não comece com credencial conhecida.

#### AC-330 — Nenhuma migration contém senha em texto plano

- **Dado** o arquivo `migrations/0004_crm_seed.sql`
- **Quando** ele é inspecionado
- **Então** não há senha `admin123` em texto plano

#### AC-331 — Admin nasce com senha aleatória no primeiro boot

- **Dado** um banco novo sem usuário admin
- **Quando** a aplicação inicia pela primeira vez
- **Então** um admin é criado com senha aleatória exibida uma vez (ou `ADMIN_INITIAL_PASSWORD` do env)

#### AC-332 — Asserção de startup rejeita hash de seed

- **Dado** um banco semeado
- **Quando** a aplicação inicia
- **Então** uma asserção de startup falha se `users.passwordHash` do `seed-user-admin` ainda estiver presente

#### AC-333 — verifyPassword não tem sal fixo como default

- **Dado** `verifyPassword` em `src/server/auth.ts`
- **Quando** chamado sem `passwordSalt`
- **Então** o parâmetro `salt` não tem default `deskcomm-seed-v1` (ou o default é explicitamente rejeitado)

---

### US-314 — Segredos de desenvolvimento fora do repositório

Como **desenvolvedor**, quero **chaves WAHA e HMAC fora do git**, para não vazar segredos em backups.

#### AC-334 — .dev.vars não é rastreado por git

- **Dado** o arquivo `.dev.vars`
- **Quando** `git ls-files --error-unmatch .dev.vars` é executado
- **Então** o comando falha (arquivo não rastreado)

#### AC-335 — WAHA_API_KEY real nunca foi commitada

- **Dado** o histórico git
- **Quando** `git log --all -S'<prefixo da WAHA_API_KEY>'` é executado
- **Então** nenhum commit é retornado

#### AC-336 — WAHA_HMAC_SECRET rejeita placeholder

- **Dado** `readWahaWebhookConfig` em `src/server/wahaWebhook.ts`
- **Quando** `WAHA_HMAC_SECRET` é o placeholder `gere-um-segredo-...` ou tem < 32 bytes
- **Então** a função devolve `null` (ou o chamador recusa)

#### AC-337 — .dev.vars.example força geração de segredo

- **Dado** o arquivo `.dev.vars.example`
- **Quando** ele é inspecionado
- **Então** o campo `WAHA_HMAC_SECRET` está vazio (não habilita assinatura por acidente)

---

### US-315 — DeskcommCRM removido do repositório

Como **responsável pelo repositório**, quero **não ter 4807 arquivos de outro app no git**, para eliminar superfície de segredo e ruído de scanner.

#### AC-338 — DeskcommCRM não está mais no repositório

- **Dado** o caminho `DeskcommCRM-RecipeCosting/`
- **Quando** `git ls-files DeskcommCRM-RecipeCosting/` é executado
- **Então** nenhum arquivo é retornado (e o caminho está no .gitignore)

---

### US-316 — openModal escapa title e callers passam dado seguro

Como **operador**, quero **abrir modais com nomes de contato/ingrediente sem injetar HTML**, para evitar XSS armazenado.

#### AC-340 — Modal.ts escapa o title

- **Dado** `src/ui/Modal.ts:31`
- **Quando** `options.title` é interpolado
- **Então** o template usa `escapeHtml(options.title)`

#### AC-341 — Callers escapam ingredient.name e contact.name

- **Dado** `CrmContatosView.ts:302` e `StockView.ts:169-170`
- **Quando** o title é montado
- **Então** usam `escapeHtml(contact?.name)` / `escapeHtml(ingredient.name)`

---

### US-317 — DashboardView escapa nome do ingrediente

Como **operador**, quero **ver o Dashboard sem injetar HTML via nome de ingrediente**, para evitar XSS armazenado na home.

#### AC-342 — lowStockRow escapa i.name e i.unit

- **Dado** `DashboardView.ts:87`
- **Quando** o nome do ingrediente é interpolado
- **Então** usa `escapeHtml(i.name)` e `escapeHtml(i.unit)`

---

### US-318 — LoginView escapa me.name/me.email (previne cross-user XSS)

Como **operador**, quero **entrar no app sem injetar HTML via nome/e-mail**, para evitar cross-user XSS via PUT /api/users.

#### AC-343 — LoginView escapa me.name e me.email

- **Dado** `LoginView.ts:44-45`
- **Quando** o perfil é renderizado
- **Então** usa `escapeHtml(me.name)` e `escapeHtml(me.email)`

---

### US-319 — escapeHtml não é usado em contexto de atributo

Como **desenvolvedor**, quero **helpers de escape de atributo unificados e aplicados**, para evitar quebra de atributo.

#### AC-344 — CrmEtiquetasView usa escape de atributo em class

- **Dado** `CrmEtiquetasView.ts:91`
- **Quando** `tag.color` é interpolado em `class="chip chip-..."`
- **Então** usa helper de atributo (escapeAtrib/escapeAttr), não `escapeHtml`

#### AC-345 — ProductsView usa helper de atributo no value do input

- **Dado** `ProductsView.ts:508-510`
- **Quando** o value do input é interpolado
- **Então** usa helper de atributo (o `crmUi.textField` já usa `escapeAtrib`)

#### AC-346 — CrmWhatsAppView usa helper de atributo no src do QR

- **Dado** `CrmWhatsAppView.ts:308-310`
- **Quando** o QR é renderizado
- **Então** o `src` usa helper de atributo

#### AC-347 — Helpers de atributo unificados em um só

- **Dado** `escapeAtrib` (format.ts:39) e `escapeAttr` (dom.ts:65)
- **Quando** o código é inspecionado
- **Então** existe exatamente um helper de escape de atributo (os dois fundidos)

---

### US-320 — numberField escapa value

Como **desenvolvedor**, quero **campos numéricos com value escapado**, para evitar injeção via PUT malicioso.

#### AC-348 — numberField usa escapeAtrib/String(value) no value

- **Dado** `crmUi.ts:69`, `ProductsView.ts:521`, `IngredientsView.ts:195`, `ComponentsView.ts:316`, `SettingsView.ts:97`
- **Quando** o value do input number é interpolado
- **Então** usa `value="${escapeAtrib(String(value))}"`

#### AC-349 — Validação de tipo no servidor para campos numéricos

- **Dado** PUT em campo numérico com string maliciosa
- **Quando** o servidor recebe o patch
- **Então** validação de tipo rejeita valor não-numérico antes de persistir

---

### US-321 — rowButton escapa atributo data-*

Como **desenvolvedor**, quero **botões de linha com atributos data-* seguros**, para manter contrato do helper.

#### AC-350 — rowButton escapa valor do data-*

- **Dado** `crmUi.ts:129`
- **Quando** o atributo `data-${dataset}` é montado
- **Então** usa `data-${dataset}="${escapeAtrib(value)}"`

---

### US-322 — Sessão em cookie HttpOnly elimina amplificador de XSS

Como **operador**, quero **o token de sessão inacessível a scripts**, para que injeção de HTML não vire sequestro de conta.

#### AC-351 — Token não está em localStorage

- **Dado** `ApiAuthRepository.ts`
- **Quando** a sessão é criada/obtida
- **Então** o token vive em cookie `HttpOnly; Secure; SameSite=Strict` (não `localStorage`)

#### AC-352 — /api/crm/events não aceita token por query string

- **Dado** `/api/crm/events`
- **Quando** a rota é chamada
- **Então** não aceita `?token=` (cookie HttpOnly é enviado automaticamente pelo EventSource)

#### AC-353 — /api/crm/events não envia ACAO:*

- **Dado** resposta do SSE
- **Quando** inspecionada
- **Então** não há `Access-Control-Allow-Origin: *`

---

## Fora de escopo

- Implementar RLS no D1 (o projeto é single-tenant por decisão arquitetural)
- Adicionar biblioteca de sanitização externa (DOMPurify) — os helpers existentes são suficientes se aplicados consistentemente
- Multi-tenancy / organização / workspace — fora do escopo do produto

## Suposições

| ID | Suposição | Status | Resolução |
|---|---|---|---|
| ASM-201 | O frontend usa `innerHTML` + helpers de escape existentes; não migraremos para DOMPurify nem template engine | confirmada | — |
| ASM-202 | `assignedUserId`/`assigneeUserId` continuam sendo o único conceito de "dono" para fins de autorização em rotas de item | confirmada | — |
| ASM-203 | A migração do token para cookie HttpOnly não quebra o frontend SPA (EventSource envia cookies automaticamente) | aberta | — |
| ASM-204 | `requireRole` pode ser estendido para receber lista de papéis permitidos por operação sem quebrar rotas existentes | aberta | — |

## Perguntas em aberto

| ID | Pergunta | Status | Resposta |
|---|---|---|---|
| Q-201 | Para AC-305 (SSE com cookie): o `EventSource` no navegador envia cookies `HttpOnly` automaticamente em requisições same-origin? | aberta | — |
| Q-202 | Para AC-347 (unificar escapeAtrib/escapeAttr): qual helper mantemos? `escapeAtrib` (mais completo, escapa aspas simples e duplas) ou `escapeAttr` (mais simples)? | aberta | — |
| Q-203 | Para AC-331 (admin nasce com senha aleatória): preferimos `ADMIN_INITIAL_PASSWORD` no env ou geração aleatória exibida no log de boot? | aberta | — |
| Q-204 | Para AC-338 (remover DeskcommCRM): podemos simplesmente `git rm -r --cached` + `.gitignore` ou precisa de submodule? | aberta | — |

---

## Fora de escopo

- Implementar RLS no D1 (o projeto é single-tenant por decisão arquitetural)
- Adicionar biblioteca de sanitização externa (DOMPurify) — os helpers existentes são suficientes se aplicados consistentemente
- Multi-tenancy / organização / workspace — fora do escopo do produto