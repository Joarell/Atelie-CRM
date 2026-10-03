# Design: CMV e CPV

> feature: CMV

## O que já existe (e é reaproveitado)

A maior parte do cálculo **já está no código**. A feature não inventa a
precificação: ela expõe dois números que o app sabe calcular e registra a única
peça que não existe — as compras.

| Peça | Onde está | O que a feature faz |
|---|---|---|
| Custo unitário do ingrediente | `ingredientUnitCost` em `src/domain/pricing.ts:13` = `packagePrice / packageSize` | reaproveita como base do CMV |
| Custo da matéria-prima da receita | `productDirectCost` em `src/domain/pricing.ts:28` (ingredient + componente, um nível) | vira o `directCost` do CMV |
| Custo de mão de obra | `laborCostPerMinute × prepTime` em `calculateProductPricing` (`pricing.ts:93`) | soma no CPV |
| Rendimento do produto | `Product.yieldUnits` (`src/domain/types.ts:63`) | divisor do unitário |
| Preço e saldo do ingrediente | tabela `ingredients` (`migrations/0001_init.sql:6`) | base da avaliação a custo médio |
| Histórico de entrada/saída | `stock_movements` (`migrations/0001_init.sql:59`), `StockService.applyMovement` | reconstitui o estoque no passado |
| Preço de venda das linhas | `OrderLine.unitPrice` (`src/domain/types.ts:92`) | receita do período |
| CRUD genérico | `src/server/crud.ts`, `routeFactory.ts`, `tables.ts` | a tabela nova entra sem SQL novo |

**Não há migration de coluna.** Nenhuma tabela existente muda de forma; só
acrescentamos uma tabela nova.

## O que é novo

### 1. Tabela `purchases` (migration `0024_purchases.sql`)

O "C" da fórmula `CMV = EI + C − EF` (compras) **não tem registro hoje**.
`stock_movements` guarda `type`, `qty`, `note`, `date` — quantidade, sem preço,
sem fornecedor, sem nota. Uma "entrada" atual é ajuste manual de estoque e não
pode ser contada como compra.

Seguindo a convenção do repo (arrays em coluna JSON, como `products.items` e
`orders.lines` — ver o cabeçalho de `migrations/0001_init.sql`):

```sql
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  supplier TEXT NOT NULL DEFAULT '',
  invoice TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,                       -- ISO date (YYYY-MM-DD)
  items TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date);
```

`items` é `PurchaseItem[]`, e cada item guarda **o preço pago naquela compra**,
para o custo histórico não ser reescrito quando o preço do fornecedor mudar:

```ts
export interface PurchaseItem {
  ingredientId: string;
  ingredientName: string;
  qty: number;          // na unidade do ingrediente (g / ml / unidades)
  packageSize: number;  // tamanho do pacote comprado
  packagePrice: number; // preço pago por esse pacote
}
```

O valor monetário do item é `(qty / packageSize) * packagePrice`, calculado na
hora — não guardado, para não divergir do que a tela mostra.

### 2. `src/domain/cmv.ts` — apuração do período (funções puras)

O ponto não-óbvio: **EI e EF saem do histórico, não de um snapshot**.
`StockService.applyMovement` sempre grava a movimentação junto com a mudança de
saldo, então o estoque em qualquer instante é reconstruível:

```
stockAt(instante) = saldoAtual − Σ(movimentações com date >= instante)
```

Com período = mês civil e **fim exclusivo** (primeiro dia do mês seguinte, sem
fração de segundo):

- `EI` = `stockAt(primeiroDiaDoMês)`
- `EF` = `stockAt(primeiroDiaDoMêsSeguinte)`
- `C`  = Σ valor das compras com `date` dentro do mês
- `CMV = EI + C − EF`
- `CPV = CMV + mãoDeObraDoPeríodo`

Decisão: o fim é **exclusivo** porque `movements.date` é ISO datetime e um fim
inclusivo exigiria `23:59:59.999`. Isso elimina uma classe inteira de bug de
borda. Registrado em ASM-408.

### 3. CMV e CPV unitários — extensão de `ProductPricing`

`ProductPricing` (`src/domain/pricing.ts:72`) ganha `cmvUnit` e `cpvUnit`,
calculados dentro de `buildPricingResult`, que já recebe `directCost`,
`laborCost` e `yieldUnits`:

```
cmvUnit = directCost / yieldUnits
cpvUnit = (directCost + laborCost) / yieldUnits
```

Divisão por zero: quando `yieldUnits` é 0, o valor **não** divide — mostra o
custo do lote inteiro, como `buildPricingResult` já faz com `unitPrice`
(`pricing.ts:119`). É o AC-406.

Estender `ProductPricing` (em vez de um helper novo) faz o dado chegar às duas
telas sem novo cálculo: `PricingService.productPricing` já é o que o card e o
formulário chamam.

### 4. `PurchasesService` e `CmvService`

`PurchasesService.register(draft)` faz, em ordem:

1. **valida** — data não futura (AC-413); cada item com `qty > 0`,
   `packagePrice > 0` e `ingredientId` que existe (AC-414). Valida **antes** de
   escrever qualquer coisa, para não deixar entrada de estoque órfã.
2. **salva** a compra;
3. **dá entrada** no estoque de cada item via `StockService.registerMovement(id,
   'entrada', qty, 'Compra de <fornecedor>')` (AC-412, AC-409);
4. **atualiza** `packagePrice`/`packageSize` do ingrediente para o da compra, que
   é como o custo médio se manifesta neste app (ASM-410).

`CmvService.report(monthKey)` monta `{ initialStock, purchases, finalStock, cmv,
laborCost, cpv }`. A mão de obra do período soma `laborCost` do produto × `qty`
das linhas de pedido cuja `deliveryDate` cai no mês (ASM-405 — o app não marca
quando o pedido entrou em produção).

### 5. Telas

Duas telas novas no menu Ateliê, e duas linhas novas nas telas existentes:

- `src/ui/views/ProductsView.ts` — no **card** (`renderCard`, linha 57) e na
  **caixa de cálculo** (`calcBoxHtml`, linha 431): linha `CMV` logo abaixo de
  "Custo total", linha `CPV` logo abaixo de `CMV`, com **apenas a sigla e o
  valor** (AC-401, AC-402, AC-403, AC-408, AC-409).
- `src/ui/views/PurchasesView.ts` — `/atelie/compras`: registra e lista compras
  por mês.
- `src/ui/views/CmvView.ts` — `/atelie/cmv`: relatório do período, com EI, C,
  EF, depois `CMV` e `CPV` (AC-416 a AC-421).

## Restrição do repo que afeta o desenho

O gate de estilo (`npm run check:style`, `scripts/check-style.ts`) exige **corpo
de função ≤ 25 linhas** e **linha ≤ 80 colunas**. Hoje `calcBoxHtml` já tem 26
linhas e `renderCard` tem 22 — as duas que precisam ganhar duas linhas cada.
Acrescentar direto estoura o gate. **As duas funções precisam ser quebradas**
(deixar os `.calc-row` de custo em um array e mapear) como parte da tarefa, e o
gate precisa rodar depois. Isso não é cosmetic: é o que mantém o PR aceito.

## Risco de prova

`tests/domain/pricing.test.ts` **não tem** nenhuma tag `@spec:` — foi verificado.
Ou seja, acrescentar testes de CMV nesse arquivo não invalida a prova de nenhuma
feature anterior. Isso evita exatamente a armadilha registrada em ASM-207
("editar teste de outra feature invalida a prova de todas"). Os testes novos de
CMV vão para arquivos novos sempre que possível.

## Ordem de execução

```
domínio (T-401, T-402)  ─┐
                          ├─→ serviço (T-404, T-406) ─→ telas (T-405, T-406, T-407)
schema (T-403) ──────────┘                                    │
                                                             └→ wiring (T-408) → seed (T-409)
```

`T-408` (AppContext + Sidebar + rotas) só faz sentido depois que os serviços
existem, e `T-409` (seed) depende da tabela de `T-403`.
