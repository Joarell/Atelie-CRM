# Spec: Security audit fixes v3

> feature: security-audit-fixes-v3
> status: rascunho

## Contexto

Esta feature fecha os **11 achados residuais** da **reauditoria de segurança**
(`docs/security-audit/relatorio-auditoria-seguranca.pdf`, rodada 2). Os outros 8
achados do relatório são **verificações positivas** (C1-01, C1-02, C2-01, C2-02,
C2-03, C2-04, C2-05, C5-02) — controles já corretos que viraram evidência do
gate, e que esta feature **não pode regredir**.

Os 11 defeitos são: **IDOR em 15 das 19 rotas de item** (C3-01), **falha aberta
quando o registro não tem dono** (C3-02), **PUT aceita campos de autoria e
atribuição** (C3-03), **segredo real em arquivo versionado** (C4-01),
**credencial real na árvore de trabalho** (C4-02), **hash de credencial no
histórico** (C4-03), **webhook nasce com assinatura desligada** (C4-04),
**fail-open na exigência de assinatura** (C4-05), **`npm audit` sem gate**
(C4-06), **nenhuma validação no startup** (C4-07) e **`escapeHtml` disponível
para o contexto errado** (C5-01).

A stack é **Astro 7 SSR + Cloudflare Workers + D1 (SQLite, SQL cru)**. Frontend
**framework-free** (DOM imperativo + CSS). Auth por **sessão em D1 com cookie
HttpOnly**. Não há Supabase, RLS nem multi-tenant: `assignedUserId` é metadado
de atribuição usado no recorte LGPD **e agora também como âncora de posse**.

As decisões do dono do produto desta rodada (modelo híbrido de posse, falha
fechada com backfill, runbook de rotação sem reescrever histórico, webhook
seguro por padrão com escape explícito, gate de `npm audit` com lista de
exceção) estão registradas como **ASM** confirmadas.

## Histórias

### US-323 — Agente não mexe em registro de terceiro

Como **operador agent**, quero **não conseguir alterar nem excluir registro que
não é meu**, para que conhecer o id não baste para escrever em dado alheio.

#### AC-354 — Tabela sem dono exige manager para escrever

- **Dado** uma sessão `agent` autenticada e uma tabela sem coluna de dono, como `tags`
- **Quando** faz PUT ou DELETE em `/api/crm/tags/:id`
- **Então** a resposta é 403 `papel_insuficiente` e o registro não muda

#### AC-355 — Tabela de trabalho ganha coluna de dono

- **Dado** as tabelas de trabalho do CRM: `calendar_events`, `catalog_products`, `crm_lead_activities` e `conversation_notes`
- **Quando** o esquema documentado é montado pelas migrations
- **Então** cada uma tem a coluna `assignedUserId` com índice, e a tabela entra no mapa de posse

#### AC-356 — Mensagem herda a posse da conversa

- **Dado** uma mensagem de uma conversa atribuída a outro `agent`
- **Quando** ele faz PUT em `/api/crm/messages/:id`
- **Então** a resposta é 403 e o texto, a autoria e o carimbo da mensagem permanecem intactos

#### AC-357 — Manager e admin continuam passando

- **Dado** uma sessão `manager` ou `admin`
- **Quando** faz PUT ou DELETE em qualquer registro de qualquer tabela
- **Então** a operação é concluída, porque a posse não é exigida de quem administra

#### AC-358 — A verificação continua centralizada na fábrica

- **Dado** `createItemRoutes` em `src/server/routeFactory.ts`
- **Quando** uma rota de item é gerada
- **Então** a resolução de posse, por coluna própria ou por posse herdada da conversa, ocorre na fábrica e não replicada nos 24 arquivos de rota

---

### US-324 — Registro sem dono falha fechado

Como **operador agent**, quero **não conseguir editar registro que não tem
responsável definido**, para que a proteção exista no código e também no dado.

#### AC-359 — Registro sem dono barra o agent

- **Dado** um registro cuja coluna de dono está vazia
- **Quando** um `agent` faz PUT ou DELETE nele
- **Então** a resposta é 403 `nao_autorizado`, em vez de sucesso silencioso

#### AC-360 — Migration de backfill preenche os donos derivados

- **Dado** um banco migrado com linhas antigas de dono vazio
- **Quando** roda a migration de backfill
- **Então** `calendar_events` herda `createdBy`, `crm_lead_activities` herda `actorUserId`, `conversation_notes` herda `authorUserId` e `catalog_products` cai no responsável de fallback documentado

#### AC-361 — Criação deriva o dono da sessão

- **Dado** um `agent` criando registro em tabela com coluna de dono
- **Quando** o corpo da criação não informa responsável
- **Então** o registro é persistido com o dono preenchido, sem nascer órfão

#### AC-362 — Migration de backfill é idempotente

- **Dado** um banco já submetido à migration de backfill
- **Quando** a mesma lógica roda de novo
- **Então** nenhum dono já preenchido é alterado e a operação termina sem erro

---

### US-325 — Autoria e atribuição não são forjáveis

Como **operador agent**, quero **não conseguir reescrever a autoria de um
registro nem esvaziar o responsável pelo corpo da requisição**, para que o
histórico e a responsabilidade reflitam o que aconteceu.

#### AC-363 — Campos de autoria são imutáveis no PUT

- **Dado** um registro com `createdBy`, `authorUserId` ou `actorUserId` preenchido
- **Quando** um `agent` faz PUT informando outro valor nesses campos
- **Então** o valor persistido não muda

#### AC-364 — Mensagem não pode ser reescrita

- **Dado** uma mensagem já entregue
- **Quando** um `agent` faz PUT com `text`, `fromMe`, `direction` ou `conversationId` diferentes
- **Então** a requisição é recusada e nenhum desses campos muda

#### AC-365 — Responsável não pode ficar vazio

- **Dado** um `agent` que é o dono do registro
- **Quando** faz PUT esvaziando a coluna de responsável
- **Então** a requisição é rejeitada e o registro continua com dono

#### AC-366 — Viewer segue sem escrita

- **Dado** uma sessão `viewer`
- **Quando** faz PUT ou DELETE em rota de item
- **Então** a resposta é 403 `papel_insuficiente`, e a matriz da rodada anterior não regride

---

### US-326 — Webhook do WhatsApp nasce fechado

Como **operador da integração**, quero que **o webhook só aceite payload
assinado quando existe segredo configurado**, para que ninguém forje evento de
mensagem sem ser o motor.

#### AC-367 — Segredo utilizável liga a exigência por padrão

- **Dado** um segredo HMAC válido e forte configurado
- **Quando** a configuração da integração é lida sem flag explícita
- **Então** a exigência de assinatura fica ligada

#### AC-368 — Modo estrito sem segredo utilizável recusa

- **Dado** a exigência de assinatura ligada e um segredo ausente, curto ou placeholder
- **Quando** chega payload sem header de assinatura
- **Então** a verificação falha, em vez de aceitar

#### AC-369 — Escape explícito documentado

- **Dado** o ambiente local de desenvolvimento
- **Quando** o operador define `WAHA_WEBHOOK_ALLOW_UNSIGNED="true"`
- **Então** o payload sem assinatura é aceito, e essa é a única forma de desligar a exigência

#### AC-370 — Template de ambiente entrega o estado seguro

- **Dado** um clone novo do repositório
- **Quando** o operador copia `.dev.vars.example`
- **Então** a exigência de assinatura vem ligada e o segredo vem como placeholder recusado, com o motivo do placeholder explicado no arquivo

#### AC-371 — Assinatura presente e errada continua recusada

- **Dado** um payload assinado com HMAC errado
- **Quando** chega ao webhook
- **Então** a resposta é recusada, em qualquer modo

---

### US-327 — Segredo fora do versionado e rotação documentada

Como **responsável pelo repositório**, quero que **nenhum arquivo versionado
carregue segredo e que a rotação esteja documentada**, para que exposição de
credencial tenha procedimento e não palpite.

#### AC-372 — Arquivos de credencial estão ignorados

- **Dado** `.dev.vars` e `waha/.env` presentes na árvore de trabalho
- **Quando** se consulta o git sobre eles
- **Então** ambos são reportados como ignorados e nenhum é rastreado

#### AC-373 — Nenhum arquivo rastreado carrega segredo real

- **Dado** todo o conteúdo versionado do repositório
- **Quando** o teste-guarda varre os arquivos
- **Então** ele falha se encontrar uma chave WAHA real ou seu hash, e passa com o relatório redigido

#### AC-374 — Runbook de rotação existe e é executável

- **Dado** um incidente de credencial vazada
- **Quando** o operador abre o documento de rotação
- **Então** ele lista o procedimento de rotação da credencial, o de purga do histórico em clone limpo e o aviso de que revogar a credencial é o que encerra o acesso

---

### US-328 — Configuração é validada no boot

Como **operador que deploya**, quero que **a aplicação recuse subir com
credencial de seed reproduzível**, para que o controle exista no boot e não só
num script avulso.

#### AC-375 — Boot recusa credencial legada

- **Dado** um banco que ainda contém o hash de seed reproduzível
- **Quando** a aplicação inicializa
- **Então** a inicialização falha e o serviço não atende requisições

#### AC-376 — Boot passa com banco limpo

- **Dado** um banco sem a credencial legada
- **Quando** a aplicação inicializa
- **Então** a inicialização conclui sem erro e o serviço atende

#### AC-377 — A verificação está no boot, não só no script

- **Dado** o entrypoint do Worker
- **Quando** ele é lido
- **Então** ele invoca a asserção de credencial, e não apenas o `bootstrap-admin`

---

### US-329 — Auditoria de dependência é gate de verdade

Como **responsável pela entrega**, quero que **a auditoria de dependências
reprove a entrega quando houver vulnerabilidade nova**, para que o controle
controle.

#### AC-378 — O passo de auditoria não tolera falha

- **Dado** o workflow de integração contínua
- **Quando** se lê o passo de auditoria de dependências
- **Então** ele não está marcado como tolerante a erro e reprova a entrega

#### AC-379 — Existe uma lista de exceção versionada e justificada

- **Dado** a vulnerabilidade high conhecida, transitiva de `wrangler` e `miniflare` e fora do bundle do Worker
- **Quando** a lista de exceção é lida
- **Então** ela nomeia o advisory, o pacote e o motivo, e está versionada no repositório

#### AC-380 — Vulnerabilidade fora da lista reprova

- **Dado** um advisory que não está na lista de exceção
- **Quando** o portão de auditoria roda
- **Então** ele sai com código diferente de zero

---

### US-330 — O nome do escape declara o contexto

Como **desenvolvedor de UI**, quero que **o helper de texto tenha nome que não
convide ao uso em atributo**, para que a quebra de atributo não se repita.

#### AC-381 — O helper de texto se chama pelo contexto

- **Dado** o módulo de formatação
- **Quando** o helper de escape de texto é importado
- **Então** ele se chama `escapeText` e declara no comentário que não é seguro em atributo

#### AC-382 — Nenhum atributo é preenchido com o helper de texto

- **Dado** todos os arquivos de interface do repositório
- **Quando** o teste-guarda varre as interpolações de atributo
- **Então** ele falha se encontrar o helper de texto, ou o alias antigo, dentro de um atributo, e exige `escapeAtrib` nesse lugar

## Fora de escopo

- **Reescrever o histórico do git** para apagar `waha/.env` e o blob antigo do relatório: exige clone limpo e é procedimento operacional, não alteração de código. O runbook entrega o comando.
- **Revogar ou rotacionar a credencial WAHA vazada**: depende do motor WAHA em execução.
- **Atualizar major de `wrangler` e `@astrojs/cloudflare`** para eliminar o advisory de `undici`: o advisory fica na lista de exceção, com justificativa.
- **Adicionar coluna de dono a `messages`**: herda a posse da conversa, então coluna própria seria redundante.
- **Isolamento multi-tenant ou RLS**: o app é single-tenant por decisão documentada; esta feature endurece a posse dentro desse modelo.
- **Mover `pipelines`, `stages`, `tags` e `quick-replies` para posse individual**: são configuração compartilhada, então o piso `manager` é a resposta correta.

## Suposições

| ID | Suposição | Status | Resolução |
|---|---|---|---|
| ASM-205 | Tabelas de configuração compartilhada (`tags`, `stages`, `pipelines`, `quick-replies`, `appointment_types`) e de produção (`orders`, `products`, `components`, `ingredients`, `customers`) recebem **piso `manager`** em vez de coluna de dono, porque "dono" não faz sentido para registro que a empresa inteira consulta. | confirmada | Dono do produto escolheu o modelo híbrido: coluna onde posse faz sentido e piso `manager` no resto |
| ASM-206 | `catalog_products` recebe coluna de dono por decisão do dono do produto; linhas existentes sem autor caem num responsável de fallback, o admin mais antigo, e as novas nascem com o dono igual a quem criou. | confirmada | Dono do produto escolheu incluir `catalog-products` no grupo com coluna de dono |
| ASM-207 | O `escapeHtml` antigo permanece exportado como alias para não invalidar a prova de `AC-133`, que pertence a feature anterior; a migração dos call sites para `escapeText` é mecânica e verificada pelo compilador. | confirmada | Lição L-001 do projeto: editar teste de outra feature invalida a prova de todas |
| ASM-208 | Configuração inválida no boot responde 503 com mensagem explícita, em vez de derrubar o isolate, para que o operador veja a causa em vez de uma falha genérica. | confirmada | — |

## Perguntas em aberto

| ID | Pergunta | Status | Resposta |
|---|---|---|---|
| Q-205 | A rotação efetiva da credencial WAHA e a purga do histórico dependem de operação com o motor em execução e de clone limpo: quem executa e em que prazo? | aberta | Pendente do responsável pelo ambiente; o runbook de AC-374 entrega o procedimento |