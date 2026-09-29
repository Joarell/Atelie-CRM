# Spec: Contatos

> feature: contatos
> status: rascunho

## Contexto

A agenda de contatos permite listar, criar e gerenciar contatos do CRM. Os contatos podem ser criados manualmente pelo usuário ou automaticamente quando uma mensagem do WhatsApp chega.

## Histórias

### US-007 — Listar contatos

Como usuário do CRM, quero ver todos os contatos salvos em uma tabela ordenada por nome, para que eu possa encontrar rapidamente um contato.

#### AC-028 — Mostra linha para cada contato

- **Dado** múltiplos contatos salvos no repositório
- **Quando** a view de Contatos é renderizada
- **Então** cada contato aparece como uma linha na tabela

#### AC-029 — Renderiza nome, telefone e e-mail

- **Dado** um contato com nome, telefone e e-mail
- **Quando** a view de Contatos é renderizada
- **Então** a linha mostra o nome, telefone e e-mail do contato

#### AC-030 — Ordena por nome

- **Dado** contatos com nomes diferentes
- **Quando** a view de Contatos é renderizada
- **Então** as linhas aparecem ordenadas alfabeticamente por nome

#### AC-031 — Mostra estado vazio

- **Dado** nenhum contato salvo
- **Quando** a view de Contatos é renderizada
- **Então** aparece "Nenhum contato ainda"

### US-008 — Criar contato

Como usuário do CRM, quero criar um novo contato com nome, telefone, e-mail, notas e tags, para que eu possa contatá-lo depois.

#### AC-032 — Persiste e mostra novo contato

- **Dado** o formulário de novo contato preenchido
- **Quando** o usuário salva
- **Então** o contato é persistido e aparece na tabela

#### AC-033 — Fecha modal após salvar

- **Dado** o formulário de novo contato preenchido
- **Quando** o usuário salva
- **Então** o modal fecha e o contato fica visível

## Fora de escopo

- Editar contato (já existe mas não está nesta spec)
- Excluir contato (já existe mas não está nesta spec)
- Mesclar duplicados (já existe mas não está nesta spec)

## Suposições

| ID | Suposição | Status | Resolução |
|---|---|---|---|
| ASM-006 | A tabela de contatos já está implementada e funcionando | confirmada | Código existente em CrmContatosView.ts |

## Perguntas em aberto

| ID | Pergunta | Status | Resposta |
|---|---|---|---|
| Q-005 | Nenhuma. | respondida | — |
