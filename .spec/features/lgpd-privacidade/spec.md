# Spec: Lgpd privacidade

> feature: lgpd-privacidade
> status: rascunho

## Contexto

O Ateliê ERP trata dados pessoais de clientes (nome, telefone, email) e
usuários. A LGPD (Lei 13.709/2018) exige consentimento granular, retenção
com prazo, pseudonimização e direitos do titular. Esta feature implementa
esses quatro pilares: consentimento por finalidade, rate limiting em rotas
sensíveis, políticas de retenção agendadas e pseudonimização de payloads.

## Histórias

### US-001 — Consentimento granular e revogação (Art. 7-9)

Como titular dos dados, quero que meu consentimento seja registrado por
finalidade e possa ser revogado a qualquer momento, para que eu tenha
controle sobre o uso dos meus dados.

#### AC-001 — Registrar consentimento com metadados completos

- **Dado** um usuário ou contato e uma finalidade (ex: "marketing")
- **Quando** o consentimento é concedido
- **Então** o registro é gravado com status `granted`, timestamp `grantedAt`,
  IP, user-agent, versão "1.0" e a finalidade na lista `purposes`

#### AC-002 — Revogar consentimento ativo

- **Dado** um consentimento com status `granted` para uma finalidade
- **Quando** o titular revoga o consentimento
- **Então** o registro passa para status `withdrawn` com `withdrawnAt`
  preenchido

#### AC-003 — Verificar consentimento válido

- **Dado** um consentimento `granted` sem expiração
- **Quando** verifico se há consentimento válido para a finalidade
- **Então** o sistema retorna `true`
- **Dado** um consentimento `withdrawn` ou com `expiresAt` no passado
- **Quando** verifico se há consentimento válido
- **Então** o sistema retorna `false`

#### AC-004 — Nova concessão revoga a anterior

- **Dado** um consentimento `granted` para a finalidade "marketing"
- **Quando** concedo novo consentimento para a mesma finalidade
- **Então** o registro anterior é marcado como `withdrawn` e o novo fica
  `granted`

### US-002 — Rate limiting em rotas sensíveis (Art. 46)

Como operador do sistema, quero que tentativas de login e troca de senha
sejam limitadas por IP, para que ataques de força bruta sejam mitigados.

#### AC-005 — Permitir tentativas dentro do limite

- **Dado** um cliente sem registros anteriores na janela
- **Quando** faz até 5 tentativas de login em 15 minutos
- **Então** todas são permitidas (resposta não é 429)

#### AC-006 — Bloquear com 429 após exceder o limite

- **Dado** um cliente que já fez 5 tentativas na janela
- **Quando** faz a 6ª tentativa
- **Então** recebe resposta 429 com `retryAfter` em segundos

#### AC-007 — Janela expira e libera o cliente

- **Dado** um cliente bloqueado cuja janela de 15 minutos expirou
- **Quando** faz nova tentativa
- **Então** é permitida (nova janela começa)

#### AC-008 — Identificar cliente pelo IP

- **Dado** uma requisição com cabeçalho `cf-connecting-ip`
- **Quando** o middleware calcula a chave de rate limit
- **Então** usa o IP do cabeçalho (não um valor fixo)

### US-003 — Políticas de retenção agendadas (Art. 7, 15-16)

Como operador, quero que dados antigos sejam anonimizados ou deletados
automaticamente, para que não retenho dados pessoais além do necessário.

#### AC-009 — Anonimizar mensagens antigas

- **Dado** mensagens com `createdAt` anterior à janela de retenção (365 dias)
- **Quando** a política de retenção roda
- **Então** o texto é substituído por `[Anonimizado por política de retenção]`
  e `mediaUrl`/`mediaMime` são limpos

#### AC-010 — Anonimizar conversas antigas

- **Dado** conversas com `createdAt` anterior à janela (730 dias) e
  `channelPhone` não vazio
- **Quando** a política de retenção roda
- **Então** o `channelPhone` é substituído por `[Anonimizado]`

#### AC-011 — Deletar eventos de webhook antigos

- **Dado** eventos de webhook com `receivedAt` anterior à janela (90 dias)
- **Quando** a política de retenção roda
- **Então** são deletados da tabela `webhook_events`

#### AC-012 — Deletar logs de auditoria antigos

- **Dado** registros em `auth_audit` e `action_logs` com `createdAt`
  anterior à janela (365 dias)
- **Quando** a política de retenção roda
- **Então** são deletados

#### AC-013 — Deletar consentimentos expirados

- **Dado** consentimentos com status diferente de `granted` e `grantedAt`
  anterior à janela (2555 dias)
- **Quando** a política de retenção roda
- **Então** são deletados

#### AC-014 — Janelas configuráveis via variáveis de ambiente

- **Dado** a variável `RETENTION_MESSAGES_DAYS=30`
- **Quando** a política de retenção lê a configuração
- **Então** usa 30 dias para mensagens (não o padrão 365)

#### AC-015 — Executar via cron agendado

- **Dado** o worker com handler `scheduled`
- **Quando** o cron diário dispara
- **Então** `runRetention` executa as políticas e loga o relatório

### US-004 — Pseudonimização de dados pessoais

Como operador, quero que dados pessoais em payloads do WhatsApp sejam
mascarados antes de logs ou armazenamento, para minimizar exposição.

#### AC-016 — Mascarar telefone

- **Dado** um telefone `+5511999998888`
- **Quando** pseudonimiza
- **Então** retorna `+55XXXXXXXX8888` (código do país + últimos 4 visíveis,
  meio mascarado)

#### AC-017 — Mascarar nome

- **Dado** um nome `Maria Silva`
- **Quando** pseudonimiza
- **Então** retorna `M**** S****` (primeira letra de cada parte + asteriscos)

#### AC-018 — Mascarar email

- **Dado** um email `maria@email.com`
- **Quando** pseudonimiza
- **Então** retorna `m****@email.com` (primeira letra + asteriscos + domínio)

#### AC-019 — Aplicar em payload WAHA com campos aninhados

- **Dado** um payload com campos `phone`, `name`, `email` e objetos aninhados
  em `_data`/`payload`/`data`
- **Quando** pseudonimiza o payload
- **Então** todos os campos conhecidos são mascarados, incluindo nos
  objetos aninhados

### US-005 — Direitos do titular: acesso e exclusão (Art. 18)

Como titular, quero acessar, exportar e apagar meus dados, para exercer
meus direitos LGPD.

#### AC-020 — Exportar dados em JSON

- **Dado** um usuário autenticado
- **Quando** chama `GET /api/me/export`
- **Então** recebe todos os seus dados (contatos, conversas, mensagens,
  deals, tasks, clientes, pedidos, consentimentos) em JSON

#### AC-021 — Apagar dados (anonimizar + deletar conta)

- **Dado** um usuário autenticado com contatos e conversas
- **Quando** chama `DELETE /api/me/erase`
- **Então** seus contatos são anonimizados (nome, telefone, email limpos),
  mensagens recebem placeholder, deals/tasks são anonimizados, sessões e
  consentimentos são deletados e a conta é removida

#### AC-022 — Auditar solicitação de exclusão

- **Dado** uma solicitação de exclusão executada
- **Quando** o processo termina
- **Então** um registro de auditoria `data_erasure_request` é gravado com
  ID do usuário, email e IP

## Fora de escopo

- Freshness/UI stamps de "última atualização" (não é LGPD)
- Autenticação de webhook WAHA (HMAC) — preocupação separada
- Minimização de dados em formulários de cadastro
- Anonimização de clientes/pedidos (tabelas `customers`/`orders` têm
  janela de 2555 dias mas não são anonimizadas — apenas não expiram)

## Suposições

| ID | Suposição | Status | Resolução |
|---|---|---|---|
| ASM-001 | O preset base é suficiente (não preciso do preset lgpd-educacao, que é para produtos educacionais com notas e menores) | confirmada | Verificado: o ERP de ateliê não é produto educacional |
| ASM-002 | O rate limiting vive no middleware Astro, não nas rotas de auth — o middleware intercepta `/api/auth/login` e `/api/auth/change-password` antes da rota | confirmada | Verificado em `src/middleware.ts` |
| ASM-003 | A pseudonimização de payloads WAHA (`pseudonymizeWahaPayload`) existe mas ainda não é chamada em nenhum lugar — o código é órfão | aberta | Precisa decidir onde wire (logs? ingest? storage?) |

## Perguntas em aberto

| ID | Pergunta | Status | Resposta |
|---|---|---|---|
| Q-001 | Onde a pseudonimização de payloads WAHA deve ser aplicada? O código existe mas não é chamado — nos logs do webhook receiver? Na ingestão? | aberta | — |
| Q-002 | As janelas de retenção padrão (365/730/90/2555 dias) são adequadas para o negócio ou precisam de ajuste? | aberta | — |
