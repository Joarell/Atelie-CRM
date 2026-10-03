# Auditoria de Segurança - Ateliê ERP + DeskcommCRM

## Stack Detectada
- **Linguagem/Framework**: TypeScript + Astro 7 (SSR) com adapter `@astrojs/cloudflare`
- **Runtime**: Cloudflare Workers (edge)
- **Banco de Dados**: Cloudflare D1 (SQLite)
- **ORM/Query Builder**: Query builder custom (`src/server/crud.ts`, `src/server/sql.ts`, `src/server/mapping.ts`) - sem ORM externo
- **Autenticação**: Sessões em D1 com tokens Bearer + cookies HttpOnly (PBKDF2-SHA256, 100k iterações)
- **Autorização**: RBAC por papel (`viewer`, `agent`, `manager`, `admin`) validado no servidor em `src/server/authz.ts`
- **Frontend**: DOM imperativo + CSS puro (sem React/Radix/shadcn), Tailwind v4 apenas como compilador CSS
- **Deploy**: Cloudflare Workers + D1, scripts `wrangler.toml`, `.dev.vars`, docker-compose para WAHA local

---

## Resumo dos Achados

Achados de risco (mapeados no PDF, seção 3):

| Severidade | Quantidade | IDs |
|------------|------------|-----|
| Crítica | 2 | F6, F7 |
| Alta | 3 | F1, F8, F11 |
| Média | 4 | F2, F5, F9, F12 |
| Baixa | 3 | F4, F10, F15 |
| Informativa | 2 | F14, F16 |
| **Total** | **14** | |

Os demais itens analisados (F3, F13, F17, F18) foram **verificados como corretos /
não aplicáveis** e aparecem como pontos fortes no relatório (seção 2.1), não como
riscos.

---

## 1. BANCO SEM TRANCA (Isolamento de Inquilino/Dono)

### Mecanismo de Isolamento do Projeto
O projeto é **single-tenant** por design (conforme README). O isolamento é feito por:
- **RBAC por papel** (`viewer`, `agent`, `manager`, `admin`) - verificado no servidor em `src/server/authz.ts`
- **Ownership columns** (`assignedUserId`, `assigneeUserId`) - usadas apenas para atribuição de trabalho, NÃO para autorização de leitura
- **SSE scope filtering** - em `src/pages/api/crm/events.ts` linhas 27-39, usuários não-manager/admin veem apenas conversas atribuídas a eles

### Achados

#### F1. [ALTA] Listagens de API retornam base inteira sem filtro por ownership
**Arquivos**: Todos os handlers `GET` em `src/pages/api/**/index.ts` (ex: `contacts/index.ts`, `conversations/index.ts`, `messages/index.ts`, `deals/index.ts`, `orders/index.ts`, `ingredients/index.ts`, `products/index.ts`, etc.)
**Linhas**: Exemplo `src/pages/api/crm/contacts/index.ts` linha 1-6
**Código**:
```typescript
import { createCollectionRoutes } from '../../../../server/routeFactory';
import { CONTACTS_TABLE, CONTACTS_SHAPE } from '../../../../server/tables';
export const { GET, POST } = createCollectionRoutes(CONTACTS_TABLE, CONTACTS_SHAPE);
```
**Por que é explorável**: Qualquer usuário autenticado (mesmo `viewer`) pode listar TODOS os contatos, conversas, mensagens, deals, pedidos, ingredientes, produtos, clientes do sistema via `GET /api/crm/contacts`, `GET /api/crm/conversations`, etc. Não há filtro por `assignedUserId` nem verificação de papel para leitura além de `viewer` (que todos têm).
**Severidade**: Alta
**Condição**: Qualquer sessão válida

#### F2. [MÉDIA] SSE `/api/crm/events` filtra por ownership apenas para mensagens/conversas, mas não para outros recursos
**Arquivo**: `src/pages/api/crm/events.ts`
**Linhas**: 27-39 (`visibleConversationIds`), 49-103 (`fetchNewMessages`, `fetchNewConversations`, `fetchUpdatedConversations`)
**Código**:
```typescript
async function visibleConversationIds(db: Database, user: User): Promise<string[] | null> {
    if (SEES_ALL.includes(user.role)) return null;
    const assigned = await db.prepare(
        `SELECT c.id FROM conversations c
         JOIN contacts ct ON ct.id = c.contactId
         WHERE ct.assignedUserId = ? OR c.assignedUserId = ?`
    ).bind(user.id, user.id).all<{ id: string }>();
    return (assigned.results ?? []).map((row) => row.id);
}
```
**Por que é explorável**: O filtro funciona apenas para `conversations` e `messages` (via join com conversations). Usuários `agent`/`viewer` ainda recebem via SSE atualizações de TODOS os outros recursos (deals, tasks, contacts, calendar_events, etc.) que o SSE não escuta atualmente, mas se estendido, vazariam dados.
**Severidade**: Média
**Condição**: SSE ativo (padrão no inbox)

---

## 2. PERMISSÃO DEFINIDA NO NAVEGADOR (Frontend esconde UI, Backend não valida)

### Mapeamento Frontend → Backend

| UI Gate (role) | Endpoint | Backend Valida? |
|----------------|----------|-----------------|
| `admin` (Equipe) | `GET/POST /api/users` | ✅ `requireRole(USER_MANAGERS)` |
| `admin` (criar admin) | `POST /api/users` | ✅ `allowedRoles` bloqueia não-admin |
| `admin` (deletar usuário) | `DELETE /api/users/:id` | ✅ `requireRole(ADMINS)` |
| `admin/manager` (settings) | `GET/PUT /api/settings` | ✅ `requireRole(SETTINGS_MANAGERS)` |
| `admin` (WAHA session) | `GET/POST/DELETE /api/whatsapp/session` | ✅ `requireRole(ADMINS)` |
| `agent+` (WAHA send) | `POST /api/whatsapp/send` | ✅ `hasRole(['agent','manager','admin'])` + ownership |
| `agent+` (criar contatos) | `POST /api/crm/contacts` | ✅ `createHandler` com `agent` mínimo |
| `agent+` (editar contatos) | `PUT /api/crm/contacts/:id` | ✅ `guardItemWrite` com ownership check |

### Achados

#### F3. [MÉDIA] Frontend `CrmEquipeView` permite ver lista de usuários mas backend já bloqueia corretamente
**Arquivo**: `src/ui/views/crm/CrmEquipeView.ts` (linha ~40-60 carrega usuários via `ctx.users.getAll()`)
**Backend**: `src/pages/api/users/index.ts` linha 24-28 - `requireRole(context, USER_MANAGERS)` 
**Verificação**: ✅ **CORRETO** - Backend valida papel `manager`/`admin` antes de listar usuários.

#### F4. [BAIXA] Frontend esconde botão "Nova conversa" para contatos sem WhatsApp, mas API `/api/crm/conversations` permite criar para qualquer contato
**Arquivo**: `src/ui/views/crm/CrmContatosView.ts` linha 205-211 (`startChat` usa `contact.phone`)
**Backend**: `src/pages/api/crm/conversations/index.ts` - usa `createCollectionRoutes` com default `create: 'agent'`
**Análise**: Backend valida papel `agent+`, mas não valida se o contato tem telefone/WhatsApp. Isso é regra de negócio, não falha de segurança.

#### F5. [MÉDIA] Frontend `CrmInboxView` mostra botão "Novo pedido" para qualquer conversa com contato, mas backend `/api/orders` permite criar pedido para qualquer `customerId`
**Arquivo**: `src/ui/views/crm/CrmInboxView.ts` linha 492-506 (`startComposer` verifica `current.contact`)
**Backend**: `src/pages/api/orders/index.ts` - `createCollectionRoutes(ORDERS_TABLE, ORDERS_SHAPE)` com default `create: 'agent'`
**Problema**: Um `agent` pode criar pedido vinculado a QUALQUER `customerId` (não apenas o da conversa aberta). O frontend filtra, mas API não.
**Severidade**: Média (elevação de privilégio de negócio)

---

## 3. IDOR (Rotas que buscam/alteram/deletam por ID sem verificar posse)

### Verificação Sistemática de TODOS os Handlers de Item (`PUT/DELETE /:id`)

O projeto usa `createItemRoutes` de `src/server/routeFactory.ts` que inclui `guardItemWrite` com `checkOwnership`.

**OWNERSHIP Map** (linhas 73-84 routeFactory.ts):
```typescript
const OWNERSHIP: Record<string, OwnershipMap> = {
    contacts: { kind: 'column', field: 'assignedUserId' },
    conversations: { kind: 'column', field: 'assignedUserId' },
    deals: { kind: 'column', field: 'assignedUserId' },
    tasks: { kind: 'column', field: 'assigneeUserId' },
    calendar_events: { kind: 'column', field: 'assignedUserId' },
    catalog_products: { kind: 'column', field: 'assignedUserId' },
    crm_lead_activities: { kind: 'column', field: 'assignedUserId' },
    conversation_notes: { kind: 'column', field: 'assignedUserId' },
    messages: { kind: 'via', table: 'conversations', field: 'assignedUserId' },
};
```

### Achados

#### F6. [CRÍTICA] Tabelas ERP (ingredients, components, products, customers, orders, stock_movements) NÃO têm ownership definido
**Arquivo**: `src/server/routeFactory.ts` linhas 73-84 - `OWNERSHIP` map
**Tabelas ausentes**: `ingredients`, `components`, `products`, `customers`, `orders`, `stock_movements`, `settings`, `pipelines`, `stages`, `quick_replies`, `tags`, `appointment_types`, `users`, `sessions`, `waha_sessions`, `webhook_events`, `auth_audit`, `action_logs`, `consents`, `rate_limits`
**Código afetado**: Todos os `createItemRoutes` para essas tabelas (ex: `src/pages/api/ingredients/[id].ts`, `src/pages/api/orders/[id].ts`, etc.)
**Por que é explorável**: Qualquer `agent`/`viewer` pode fazer `PUT/DELETE` em QUALQUER ingrediente, produto, cliente, pedido, componente, movimento de estoque - basta saber o ID. O `guardItemWrite` linha 100 retorna `null` para tabelas sem ownership: `if (!om) return null;`
**Severidade**: Crítica
**Impacto**: Escrita/deleção não autorizada em todo o catálogo ERP

#### F7. [CRÍTICA] `users` table não tem ownership - `PUT/DELETE /api/users/:id` permite manager/admin editar/deletar QUALQUER usuário (incluindo outros admins)
**Arquivo**: `src/pages/api/users/[id].ts` linhas 28-60 (PUT), 49-60 (DELETE)
**Backend**: `requireRole` valida papel, mas **não** verifica se o alvo é "seu" ou de menor privilégio
**Código PUT** (linha 62-65):
```typescript
function allowedRoles(body: PutBody): Role[] {
    const adminOnly = ADMIN_ONLY_FIELDS.some(f => body[f] !== undefined);
    return adminOnly ? ADMINS : USER_MANAGERS;  // manager pode editar QUALQUER usuário
}
```
**Por que é explorável**: Um `manager` pode alterar `role` de outro `manager` para `admin` (escalada), ou deletar outro `manager`. Apenas `DELETE` exige `admin`.
**Severidade**: Crítica (escalada de privilégio vertical)

#### F8. [ALTA] `quick_replies`, `tags`, `appointment_types`, `pipelines`, `stages` - tabelas CRM sem ownership mas com `createItemRoutes`
**Arquivos**: `src/pages/api/crm/quick-replies/[id].ts`, `src/pages/api/crm/tags/[id].ts`, `src/pages/api/crm/appointment-types/[id].ts`, `src/pages/api/crm/pipelines/[id].ts`, `src/pages/api/crm/stages/[id].ts`
**Problema**: Qualquer `agent` pode editar/deletar respostas rápidas, etiquetas, tipos de agenda, funis, estágios de QUALQUER usuário
**Severidade**: Alta

#### F9. [MÉDIA] `messages` ownership via `conversations` - mas `conversationId` vem do body na criação, não validado
**Arquivo**: `src/pages/api/crm/messages/index.ts` usa `createCollectionRoutes(MESSAGES_TABLE, MESSAGES_SHAPE)`
**Criação**: `createHandler` linha 248-255 em routeFactory - deriva owner da sessão se tabela tem coluna owner, mas `messages` usa `kind: 'via'`
**Problema**: Na criação (`POST`), o `conversationId` vem do body do cliente. Um `agent` pode criar mensagem em conversa de outro usuário (se souber o ID). O `checkOwnership` só roda no `PUT/DELETE`.
**Severidade**: Média

#### F10. [BAIXA] `conversation_notes` - ownership por `assignedUserId` mas note criado por `authorUserId` diferente
**Arquivo**: `src/server/tables.ts` linha 216-224 - `CONVERSATION_NOTES_SHAPE` tem `assignedUserId` E `authorUserId`
**routeFactory**: `IMMUTABLE_FIELDS` linha 175 inclui `authorUserId`, mas `assignedUserId` PODE ser alterado no PUT (linha 176 não está em `IMMUTABLE_FIELDS`)
**Problema**: Um `agent` dono da conversa pode reatribuir a nota para outro usuário via PUT
**Severidade**: Baixa

---

## 4. CHAVES EXPOSTAS (Hardcode)

### Achados

#### F11. [ALTA] Placeholder `dev_plaintext_change_me` hardcoded no código fonte como constante
**Arquivos**: 
- `src/domain/whatsapp.ts` linha ~export: `export const WAHA_DEV_PLACEHOLDER_KEY = "dev_plaintext_change_me";`
- `src/server/wahaWebhook.ts` linha 43: `'dev_plaintext_change_me'` no `PLACEHOLDER_SECRETS`
**Por que é explorável**: O placeholder está no código fonte commitado. Se alguém fizer deploy sem sobrescrever `WAHA_API_KEY` em `.dev.vars`/secrets, o sistema trata como "não configurado" (fail-closed em `readWahaConfig`/`usableSecret`). Mas a presença no código viola princípio de não comitar segredos.
**Severidade**: Alta (padrão inseguro no código)
**Mitigação parcial**: `usableSecret` rejeita placeholders conhecidos (linha 51 wahaWebhook.ts)

#### F12. [MÉDIA] `.dev.vars.example` contém `WAHA_HMAC_SECRET=""` vazio - receiver falha fechado (503) mas configuração ausente permite operar sem assinatura se `WAHA_WEBHOOK_ALLOW_UNSIGNED="true"`
**Arquivo**: `.dev.vars.example` linhas 31-45
**Código**: `src/server/wahaWebhook.ts` linhas 86-90 - sem segredo utilizável + `requireSignature=true` + `allowUnsigned=false` → 503 `secret_required`
**Problema**: Documentação/example incentiva deixar vazio. Em dev, operador pode setar `WAHA_WEBHOOK_ALLOW_UNSIGNED="true"` e operar sem HMAC.
**Severidade**: Média

#### F13. [BAIXA] `.dev.vars` (gitignored) pode conter segredos reais - verificar histórico git
**Verificação**: `git log --all --full-history -- .dev.vars` - arquivo está no `.gitignore` ✅
**Arquivo**: `.gitignore` inclui `.dev.vars` ✅

#### F14. [INFORMATIVA] `waha/docker-compose.waha.yml` e `waha/.env` - verificar se contêm segredos
**Verificação**: Arquivos existem mas não foram analisados (fora do escopo src/)

---

## 5. INPUTS SEM TRATAMENTO (XSS)

### Frontend - Sanitização Existente
O projeto usa `escapeText` e `escapeAtrib` de `src/domain/format.ts`:
```typescript
export function escapeText(text: string): string {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}
export function escapeAtrib(text: string): string {
    return escapeText(text).replace(/"/g, '"').replace(/'/g, ''');
}
```
Uso extensivo em todas as views (`escapeText` para conteúdo, `escapeAtrib` para atributos HTML).

### Achados

#### F15. [BAIXA] `innerHTML` usado extensivamente com strings interpoladas - dependência total de `escapeText`/`escapeAtrib`
**Arquivos**: Todas as views em `src/ui/views/**/*.ts` - ex: `CrmInboxView.ts` linha 127 `root.innerHTML = pageHtml(...)`, `OrdersView.ts` linha 46 `root.innerHTML = pageHtml(...)`, etc.
**Análise**: O padrão do projeto é `root.innerHTML = templateString` onde `templateString` usa `escapeText`/`escapeAtrib` em TODOS os dados dinâmicos. Verificado em:
- `CrmInboxView.ts`: `escapeText` em name, preview, message text, etc.
- `CrmContatosView.ts`: `escapeText` em name, phone, email, tags
- `OrdersView.ts`: `escapeText` em customerName, orderItemsText
- `ProductsView.ts`: `escapeText` em product.name, category
- `IngredientsView.ts`: `escapeText` em ingredient.name
- `Modal.ts`: `escapeText` no title
**Verificação**: ✅ **CORRETO** - Todos os pontos de injeção usam escape. Nenhum `innerHTML` direto com dado não escapado encontrado.

#### F16. [INFORMATIVA] `escapeHtml` alias depreciado de `escapeText` - mantido por compatibilidade
**Arquivo**: `src/domain/format.ts` linha 41: `export const escapeHtml = escapeText;`
**Nota**: Não usado no código atual (grep não encontra chamadas), mas exportado.

#### F17. [BAIXA] URLs controladas por usuário em `href`/`src` - não encontrado
**Busca**: `javascript:` em href - nenhum encontrado. `src` dinâmico - não encontrado.

#### F18. [MÉDIA] Backend: Input do usuário em templates de e-mail/HTML - não aplicável
**Verificação**: Projeto não envia e-mails HTML. Não há templates de e-mail no backend.

---

## Pontos Fortes (O que está protegido)

| Item | Evidência |
|------|-----------|
| Autenticação robusta | PBKDF2-SHA256 100k iterações, salt aleatório por usuário, sessões com expiração, rotação de sessão no login (`src/server/auth.ts`) |
| Same-origin guard | `assertSameOrigin` em `/api/auth/login`, `/api/auth/logout`, `/api/auth/change-password` (`src/server/origin.ts`) |
| RBAC no servidor | `requireRole`/`requireRank` em TODOS os endpoints sensíveis (`src/server/authz.ts`, `src/server/routeFactory.ts`) |
| Ownership check em CRM | `checkOwnership` em `routeFactory.ts` para 9 tabelas CRM com coluna `assignedUserId`/`assigneeUserId` |
| Immutável fields protection | `IMMUTABLE_FIELDS` bloqueia alteração de `createdBy`, `createdAt`, `assignedUserId` (conversations) |
| Validação numérica | `numericProblems` rejeita NaN/Infinity em campos numéricos |
| Empty owner rejection | `refuseEmptyOwner` bloqueia `assignedUserId=""` no PUT |
| Auditoria de ações | `action_logs` + `auth_audit` registram todas operações sensíveis |
| SSE scope filtering | `visibleConversationIds` filtra conversas visíveis por ownership no SSE |
| HMAC WAHA webhook | Verificação HMAC-SHA512 constant-time, reject de placeholders, fail-closed |
| Password policy | Mínimo 8 chars, hash forte, `mustChangePassword` flag no seed |
| Rate limiting | Tabela `rate_limits` existe (migração 0017) |
| LGPD endpoints | `/api/me/data`, `/api/me/export`, `/api/me/erase` com auditoria |
| XSS protection frontend | `escapeText`/`escapeAtrib` usados consistentemente em todo `innerHTML` |
| No framework bloat | Sem React/Radix/shadcn - superfície de ataque reduzida |
| CSP-ready | CSP headers podem ser adicionados (não configurado atualmente) |

---

## Tabela de Achados Detalhados

| Severidade | Arquivo:Linha | Categoria | Descrição |
|------------|---------------|-----------|-----------|
| Crítica | routeFactory.ts:73-84 | IDOR | Tabelas ERP sem ownership - qualquer agent/viewer edita/deleta qualquer registro |
| Crítica | users/[id].ts:62-65 | IDOR | Manager pode editar role de qualquer usuário (escalada para admin) |
| Alta | routeFactory.ts:232 (listHandler) | Banco sem tranca | GET /api/* lista toda a base sem filtro por ownership/tenant |
| Alta | crm/quick-replies/[id].ts etc | IDOR | Tabelas CRM sem ownership (quick_replies, tags, appointment_types, pipelines, stages) |
| Alta | domain/whatsapp.ts + wahaWebhook.ts | Chaves expostas | Placeholder `dev_plaintext_change_me` hardcoded no source |
| Média | events.ts:27-39 | Banco sem tranca | SSE filtra apenas conversations/messages, não outros recursos |
| Média | orders/index.ts + InboxView | Permissão no navegador | Agent cria pedido para qualquer customerId (frontend filtra, API não) |
| Média | messages/index.ts (POST) | IDOR | Criação de mensagem permite conversationId arbitrário do body |
| Média | .dev.vars.example | Chaves expostas | WAHA_HMAC_SECRET vazio incentiva config insegura |
| Baixa | conversation_notes ownership | IDOR | assignedUserId mutável no PUT, authorUserId imutável mas diferente |
| Baixa | format.ts:41 | XSS | Alias `escapeHtml` depreciado exportado |
| Baixa | Geral | XSS | Dependência total de escapeText/escapeAtrib - sem defesa em profundidade (CSP) |
| Informativa | events.ts | Banco sem tranca | SSE scope filtering implementado corretamente para conversations |
| Informativa | auth.ts + authz.ts | Pontos fortes | AuthZ completo e auditado em todas rotas sensíveis |