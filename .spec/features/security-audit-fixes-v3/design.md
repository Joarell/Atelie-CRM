# Design: Security audit fixes v3

Decisões de arquitetura que os critérios de aceite não revelam sozinhos. Cada
escolha aqui é ou uma **suposição** (ASM-xxx, na spec) ou fica registrada como
pergunta em aberto (Q-xxx).

## 1. Modelo de posse (C3-01, C3-02)

### 1.1 Duas formas de posse, uma só fábrica

`OWNER_FIELDS` hoje é `Record<table, field>`, o que só expressa "esta tabela tem
coluna de dono". Falta o segundo caso: `messages` não tem dono próprio, mas sua
posse é a da conversa. Introduzimos um tipo discriminado:

```ts
type Ownership =
  | { kind: 'column'; field: string }
  | { kind: 'via'; table: string; field: string };
```

`OWNERSHIP: Record<string, Ownership>` decide o caso. `messages` vira
`{ kind: 'via', table: 'conversations', field: 'conversationId' }` — a resolução
lê a mensagem, pega `conversationId`, carrega a conversa e compara
`conversations.assignedUserId` com o usuário. Uma coluna extra em `messages`
seria redundante: a posse já está a um salto.

O resto do desenho não muda: `checkOwnership` continua na fábrica (AC-358), e as
24 rotas de item não mudam.

### 1.2 Tabela sem dono é decisão, não acidente

Duas respostas possíveis para uma tabela sem dono, e elas **não** são a mesma
coisa:

- **piso `manager`** — para configuração compartilhada e dados de produção. Não
  existe "dono" de uma etiqueta ou de um_stage do funil: quem pode mudar é quem
  administra. Implementado como `RoleConfig` explícito na rota, porque o padrão
  `update: 'agent'` da `DEFAULT_ROLES` é justamente o que abre o IDOR.
- **coluna de dono** — para registro que um agente acompanha (atividade, nota de
  conversa, evento de agenda, produto de catálogo).

A lista de rotas que passa a exigir `manager` está em ASM-205. `messages` fica de
fora: tem posse por herança.

### 1.3 Falha fechada e o problema do `DEFAULT ''`

`if (!ownerId) return null` é a linha que faz a proteção existir no código e não
disparar no dado. Fechar é simples:

```
dono vazio + agent  -> 403 nao_autorizado
dono vazio + manager -> passa (administração)
```

Mas fechar **sem** preencher o dado transforma toda linha legada em registro
intocável pelo time de vendas, que é a operação real. Por isso a migration de
backfill é parte do mesmo corte, não um detalhe: `calendar_events` herda
`createdBy`, `crm_lead_activities` herda `actorUserId`, `conversation_notes`
herda `authorUserId`, todos campos de autoria que já existem na tabela. Só
`catalog_products` não tem campo de autor, e cai no fallback de ASM-206.

O缺口 que fecha o ciclo é a **criação**: um registro novo nasce com o dono
derivado da sessão (AC-361), senão todo registro criado por agente voltaria a ser
órfão no mesmo dia. Por isso o `createHandler` também passa a derivar o dono.

### 1.4 Idempotência do backfill

O backfill roda em SQL, e `UPDATE ... WHERE coluna = ''` é naturalmente
idempotente. O risco é a **migration** ser re-executada: `ALTER TABLE ADD COLUMN`
não tem `IF NOT EXISTS` em SQLite e falha na segunda vez. Mesma convenção de
`0018`: a coluna nova entra no `ALTER TABLE` (one-shot) e o backfill é um
`UPDATE` separado, guardando `WHERE assignedUserId = ''`, que pode rodar sempre
(AC-362).

## 2. Superfície de escrita (C3-03)

O merge em `crud.ts:59` é `{ ...existing, ...patch }`: qualquer coluna que
exista no `shape` é gravável. Duas listas fecham isso, ambas checadas **antes**
do merge:

- **`IMMUTABLE_FIELDS` por tabela** — `createdBy`, `authorUserId`, `actorUserId`
  e `createdAt` são preenchidos na criação e nunca editados. Para `messages`,
  entram também `text`, `fromMe`, `direction` e `conversationId`: são o
  conteúdo e a autoria da mensagem (AC-364).
- **chave vazia no campo de dono é rejeitada** (AC-365). Sem isso, um agente
 |esvazia o próprio dono e a linha deixa de ter responsável — o oposto do que a
  falha fechada quer.

A recusa é **400**, não 403: o pedido está bem formado, o campo é que não pode
mudar. Isso mantém a distinção de `campo_numerico_invalido`, que já devolve 400
com a lista de campos.

`fromMe` só muda por caminho de sistema (ingest do webhook), que escreve direto
no D1 e não passa por esta fábrica.

## 3. Webhook fail-closed (C4-04, C4-05)

O bug de C4-05 tem uma forma só:

```ts
if (config.requireSignature && config.hmacSecret) return missing;
return { ok: true };            // <- strict sem segredo cai aqui
```

A correção remove a conjunção do caminho de recusa: **estrito é estrito**. Se a
exigência está ligada e não há segredo utilizável, o payload é recusado — porque
esse estado é configuração inválida, não permissão implícita.

Para C4-04, o default muda: segredo utilizável presente **liga** a exigência, e
desligar exige `WAHA_WEBHOOK_ALLOW_UNSIGNED="true"` explícito (AC-369). O
`usableSecret` atual (32 bytes, placeholders recusados) é o que já existe e é
reaproveitado sem mudança.

`.dev.vars.example` para de entregar `WAHA_HMAC_SECRET=""` e
`WAHA_WEBHOOK_REQUIRE_SIGNATURE=""` como se fossem neutros: passa a vir ligado,
com o motivo do placeholder escrito no arquivo (AC-370).

## 4. Segredos: código e operação (C4-01, C4-02, C4-03)

O repositório já ignora `.dev.vars` e `.env`. O que falta é a prova mecânica e o
procedimento:

- **AC-372** usa `git check-ignore` de verdade, não leitura de `.gitignore` —
  prova o comportamento do git, não a intenção do arquivo.
- **AC-373** é o teste-guarda que já existe (`AC-335`) estendido para o hash de
  `waha/.env` (`C4-03`), que era a lacuna: o teste olhava chave, não hash.
- **AC-374** é um documento, não código. Ele entrega os três comandos que só o
  operador pode rodar (rotacionar no motor, `git filter-repo` em clone limpo,
  invalidar a credencial) e diz, em ordem, que **revogar a credencial é o que
  encerra o acesso** — reescrever histórico sem revogar não muda nada para quem
  já leu o segredo.

## 5. Boot (C4-07)

`assertNoSeedCredential` existe e é fail-closed, mas só `bootstrap-admin` a
chama. No boot ela roda uma vez por isolate, memoizada: uma consulta por isolate
não é um custo, e o estado é o mesmo para todas as requisições. Falha de
configuração responde **503 com causa explícita** (ASM-208), não derruba o
isolate — o operador vê o motivo em vez de um 500 genérico.

## 6. Gate de dependências (C4-06)

`npm audit --audit-level=high` **hoje sai com código 1**: a high é `undici`,
transitiva de `miniflare`/`wrangler`. Só remover `continue-on-error` quebraria a
CI sem fechar o achado.

A solução escolhida é **gate bloqueante com lista de exceção versionada**:
`.github/workflows/ci.yml` passa a falhar, e um advisory fora da lista reprova
(AC-380). O advisory de `undici` entra na lista com pacote e motivo (é
ferramenta de build local, fora do bundle do Worker) — o que a lista proíbe é o
silêncio, não o registro. `@astrojs/cloudflare` é dependência de produção e
arrasta `wrangler`, então `--omit=dev` não isola: a lista é o mecanismo certo.

## 7. Nome do escape (C5-01)

`escapeHtml` escapa `&`, `<`, `>` via `textContent`→`innerHTML` e **não** escapa
aspas — o que está correto para contexto de texto e é exatamente o que quebra em
atributo. O risco é latente: nenhum sink de atributo usa o helper base hoje.

O corte é **fechar a classe de falha**, não mexer no comportamento:

- o helper passa a se chamar `escapeText`, nome que declara o contexto;
- `escapeHtml` permanece como alias para não invalidar a prova de `AC-133`
  (ASM-207), que é de feature anterior;
- um teste varre `src/ui` e falha se achar `escapeText` (ou o alias) dentro de
  atributo — é esse teste que impede a regressão, não o nome.

## 8. Estratégia de testes

O padrão existente é `tests/server/routeFactory.test.ts`: `FakeD1` + um
`locals(role)` sintético + o handler chamado direto. As rotas de item não mudam
de assinatura, então a cobertura nova entra nesse mesmo arquivo e em um arquivo
por tema (webhook, boot, escape, segredo, CI).

Toda a prova é por comportamento observável (status e linha persistida), nunca
por formato de código. `migrationParity.test.ts` garante que a migration nova
entra nos dois scripts `db:migrate:*` — sem isso, o banco documentado não tem a
coluna e o POST falha em coluna desconhecida, que foi exatamente o bug que aquele
teste nasceu para pegar.