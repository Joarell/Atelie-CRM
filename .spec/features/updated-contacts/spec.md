# Spec: Updated contacts

> feature: updated-contacts
> status: rascunho

## Contexto

Contatos do CRM são criados automaticamente quando uma mensagem do WhatsApp chega (via webhook), usando o nome reportado pelo WhatsApp (`notifyName`) na primeira mensagem. Se o cliente muda o nome no WhatsApp depois, o CRM nunca atualiza — a agenda fica desatualizada. Esta feature faz o CRM manter o nome do contato sincronizado com o que o WhatsApp reporta.

## Histórias

### US-006 — Atualização automática de nome via WhatsApp

Como usuário do CRM, quero que o nome do contato seja atualizado automaticamente quando o WhatsApp reportar um nome diferente, para que a agenda fique sempre correta sem eu precisar editar manualmente.

#### AC-023 — Atualiza nome quando notifyName difere

- **Dado** um contato existente com nome "João Silva" e telefone "5511999999999"
- **Quando** uma mensagem inbound chega desse telefone com `notifyName` = "João Santos"
- **Então** o contato passa a ter nome "João Santos"

#### AC-024 — Não altera nome quando notifyName é igual

- **Dado** um contato existente com nome "João Silva" e telefone "5511999999999"
- **Quando** uma mensagem inbound chega desse telefone com `notifyName` = "João Silva"
- **Então** o nome do contato permanece "João Silva" (sem alteração)

#### AC-025 — Cria contato com notifyName quando número é novo

- **Dado** nenhum contato com telefone "5511888888888"
- **Quando** uma mensagem inbound chega desse telefone com `notifyName` = "Maria Souza"
- **Então** um novo contato é criado com nome "Maria Souza" e telefone "5511888888888"

#### AC-026 — Não sobrescreve nome quando notifyName está vazio

- **Dado** um contato existente com nome "João Silva"
- **Quando** uma mensagem inbound chega sem `notifyName` (campo ausente ou vazio)
- **Então** o nome do contato permanece "João Silva"

#### AC-027 — Não sobrescreve nome definido pelo usuário

- **Dado** um contato existente com nome "João Silva" (nome real, não-telefone) e telefone "5511999999999"
- **Quando** uma mensagem inbound chega desse telefone com `notifyName` = "João Santos"
- **Então** o nome do contato permanece "João Silva" (edição manual protegida)

## Fora de escopo

- Sincronizar foto de perfil do WhatsApp
- Sincronizar contatos do WhatsApp Business API (sem webhook)
- Botão de "sincronizar agora" na UI
- Atualizar e-mail ou outras informações além do nome

## Suposições

| ID | Suposição | Status | Resolução |
|---|---|---|---|
| ASM-004 | O campo `notifyName` do WAHA é a fonte confiável do nome do contato no WhatsApp | aberta | — |
| ASM-005 | A atualização de nome deve ocorrer no momento da ingestão da mensagem (webhook), não em lote | aberta | — |

## Perguntas em aberto

| ID | Pergunta | Status | Resposta |
|---|---|---|---|
| Q-003 | Se o usuário editou o nome manualmente no CRM, a sincronização automática deve sobrescrever? | respondida | Sobrescrever só se o nome atual for o telefone (padrão de criação). Nomes definidos pelo usuário são protegidos. |
| Q-004 | Deve haver um campo `updatedAt` no Contact para rastrear a última sincronização? | aberta | — |
