# Spec: Estoque

> feature: stock
> status: pronta

## Contexto

O estoque de cada produto deve se atualizar por eventos: quando um pedido entra em "Em produção", os
materiais necessários (fichas técnicas dos produtos do menu "Produtos") são baixados automaticamente;
quando o usuário cadastra um novo item no menu "Ingredientes", ele aparece na tela "Estoque". Cada
operação resulta em atualização das tabelas do back-end e o front-end mostra o saldo de cada item.

## Histórias

### US-009 — Baixa automática ao entrar em produção

Como usuário do Ateliê, quero que, ao mover um pedido para "Em produção", o estoque dos ingredientes
da receita seja baixado automaticamente, para não precisar lançar a baixa manualmente.

#### AC-034 — Desconta o estoque ao mover para Em produção

- **Dado** um pedido do produto que usa "Farinha 1000g" com saldo de 1000g
- **Quando** o pedido é movido para "Em produção"
- **Então** o saldo de "Farinha 1000g" cai para 700g e o pedido fica marcado com estoque baixado

#### AC-035 — Baixa acontece uma única vez por pedido

- **Dado** um pedido cujo estoque já foi baixado
- **Quando** o status do pedido muda de novo para "Em produção"
- **Então** nenhum saldo de ingrediente é descontado novamente

#### AC-036 — Registra uma movimentação de saída por ingrediente

- **Dado** um pedido em produção com receita que usa dois ingredientes
- **Quando** a baixa automática acontece
- **Então** cada um dos dois ingredientes recebe uma movimentação de saída

#### AC-037 — Permite saldo negativo

- **Dado** um ingrediente com saldo menor que a quantidade necessária
- **Quando** a baixa automática acontece
- **Então** o saldo é descontado mesmo ficando negativo

### US-010 — Sair de produção não devolve estoque

Como usuário do Ateliê, quero que voltar um pedido de "Em produção" para "Pendente" não devolva os
materiais, para que o histórico de produção não seja alterado retroativamente.

#### AC-038 — Reverter status não altera saldo

- **Dado** um pedido cujo estoque já foi baixado
- **Quando** o pedido volta de "Em produção" para "Pendente"
- **Então** nenhum saldo de ingrediente é devolvido

### US-011 — Baixa manual como fallback

Como usuário do Ateliê, quero manter o botão "Baixar estoque" no card do pedido, para poder lançar a
baixa manualmente quando necessário.

#### AC-039 — Mostra o botão de baixa manual

- **Dado** um pedido sem estoque baixado e que não está "Pendente" nem "Cancelado"
- **Quando** o quadro de pedidos é renderizado
- **Então** o botão "Baixar estoque" aparece no card do pedido

#### AC-040 — Baixa manual desconta e some com o botão

- **Dado** um pedido elegível para baixa manual
- **Quando** o usuário confirma a baixa
- **Então** o estoque é descontado e o botão "Baixar estoque" deixa de aparecer

#### AC-041 — Cancelar a confirmação não altera nada

- **Dado** um pedido elegível para baixa manual
- **Quando** o usuário cancela a confirmação da baixa
- **Então** nenhum saldo de ingrediente é alterado

### US-012 — Ingrediente novo aparece no Estoque

Como usuário do Ateliê, quero que um item cadastrado no menu "Ingredientes" apareça automaticamente na
tela "Estoque", para acompanhar o saldo desde o cadastro.

#### AC-042 — Novo ingrediente aparece na tabela de estoque

- **Dado** um ingrediente recém-cadastrado
- **Quando** a tela "Estoque" é renderizada
- **Então** o ingrediente aparece na tabela com seu saldo inicial

## Fora de escopo

- Devolução automática de estoque ao sair de produção (decisão Q-006)
- Bloqueio de saldo negativo (decisão Q-008)
- Validação de saldo mínimo antes da baixa
- Movimentações manuais de entrada pela tela de Estoque (já existe)

## Suposições

| ID | Suposição | Status | Resolução |
|---|---|---|---|
| ASM-007 | A expansão de receita (pedido → ingredientes) já existe em domain/stock.ts | confirmada | Código existente: expandOrderUsage |
| ASM-008 | A baixa automática acontece somente ao entrar em "Em produção" | confirmada | Decisão registrada em Q-007 |
| ASM-009 | A tela Estoque já reage a mudanças de ingredientes | confirmada | Código existente: StockView |

## Perguntas em aberto

| ID | Pergunta | Status | Resposta |
|---|---|---|---|
| Q-006 | Deve haver estorno/devolução automática de estoque? | respondida | Não — nenhuma devolução; sair de produção não devolve (US-010) |
| Q-007 | Quando a baixa automática acontece? | respondida | Somente ao mudar o status para "Em produção" (OrderService.setStatus) |
| Q-008 | E se o saldo ficar negativo? | respondida | Permitir — saldo negativo é aceito, sem bloqueio (AC-037) |
