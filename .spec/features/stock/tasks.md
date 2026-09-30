# Tasks: Estoque

> feature: stock

## T-010 — Baixa automática no setStatus do OrderService [concluida]
- Refs: US-009, US-010, AC-034, AC-035, AC-038
- Arquivos: src/services/OrderService.ts, tests/services/orderService.test.ts
- Notas: Em `setStatus`, após `orders.update`, chamar `this.deductStock(orderId)` apenas quando `status === 'producao'`. Nunca estornar. Testes em `orderService.test.ts` cobrem AC-034 (desconta + stockDeducted), AC-035 (segunda chamada não desconta) e AC-038 (voltar para pendente não devolve).

## T-011 — Testes de movimentação e saldo negativo [concluida]
- Refs: US-009, AC-036, AC-037
- Arquivos: tests/services/stockService.test.ts
- Notas: Cobrir `deductForOrder` com receita de dois ingredientes (uma movimentação de saída por ingrediente, AC-036) e saldo insuficiente terminando negativo (AC-037).

## T-012 — Testes de UI da baixa nos pedidos [concluida]
- Refs: US-009, US-011, AC-034, AC-039, AC-040, AC-041
- Arquivos: tests/ui/ordersStockDeduct.test.ts
- Notas: Arquivo novo. Mover card para "Em produção" desconta o estoque (AC-034); botão "Baixar estoque" visível só quando elegível (AC-039); confirmar desconta e esconde o botão (AC-040); cancelar o confirm não altera saldo (AC-041).

## T-013 — Anotar teste do Estoque com AC-042 [concluida]
- Refs: US-012, AC-042
- Arquivos: tests/ui/stockTable.test.ts
- Notas: Annotar o teste existente "updates when ingredients change" com `@spec:AC-042` (provando que ingrediente novo aparece na tabela de estoque).
