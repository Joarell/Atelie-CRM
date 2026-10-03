# Tasks: CMV e CPV

> feature: CMV

Todas as tarefas começam em `[pendente]`. Marcar `[concluida]` só depois que
`npm run check:style`, `npm run check` e `npm run check:tests` passarem e o
teste anotado com `@spec:AC-xxx` estiver verde.

**Ordem obrigatória de execução:** T-401, T-402, T-403 → T-404, T-405, T-406,
T-407 → T-408 → T-409. As tarefas de domínio e de schema não tocam os mesmos
arquivos e podem correr em paralelo; T-408 depende dos serviços e T-409 depende
da tabela.

## T-401 — CMV e CPV unitários no modelo de precificação [pendente]
- Refs: US-401, AC-401, AC-402, AC-404, AC-405, AC-406, AC-407
- Arquivos: src/domain/pricing.ts, tests/domain/pricing.test.ts
- Modelo: claude-sonnet-5
- Esforço: baixo
- Notas: Acrescentar `cmvUnit` e `cpvUnit` a `ProductPricing`
  (`src/domain/pricing.ts:72`), calculados em `buildPricingResult`, que já recebe
  `directCost`, `laborCost` e `yieldUnits`. Fórmulas: `cmvUnit =
  directCost / yieldUnits` e `cpvUnit = (directCost + laborCost) / yieldUnits`.
  Quando `yieldUnits` for 0, **não** dividir — devolver o custo do lote, como
  `buildPricingResult` já faz com `unitPrice` na linha 119 (AC-406). Cobrir em
  `tests/domain/pricing.test.ts`: receita só de ingrediente (AC-401), receita com
  componente somando o custo dos ingredientes dele (AC-404), receita vazia
  zerando sem `NaN`/`Infinity` (AC-405), rendimento zero (AC-406) e efeito de
  mudança do preço do ingrediente (AC-407). Anotar cada `it(...)` com
  `@spec:AC-xxx`. O arquivo **não** tem tag `@spec:` de outra feature — verificado
  — então estender aqui não invalida prova alheia.

## T-402 — Matemática do período em src/domain/cmv.ts [pendente]
- Refs: US-404, AC-416, AC-417, AC-418
- Arquivos: src/domain/cmv.ts, tests/domain/cmv.test.ts
- Modelo: claude-sonnet-5
- Esforço: medio
- Notas: Arquivo novo, só funções puras, seguindo o estilo de `src/domain/stock.ts`
  (dados lisos dentro, números lisos fora; nada de lookup ou efeito colateral).
  Entregar: `monthKey(date)` → `YYYY-MM`; `monthStart(key)`; `nextMonthStart(key)`;
  `stockAt(ingredient, movements, instante)` calculado como `saldoAtual −
  Σ(movimentações com date >= instante)`; `stockValueAt(...)`; `purchasesTotal(purchases,
  key)`; `cmvOfPeriod(ei, c, ef)`; `cpvOfPeriod(cmv, maoDeObra)`. **O fim do período
  é exclusivo** (primeiro dia do mês seguinte) — ver design.md, para não usar
  `23:59:59.999`. Testes com valores fechados para a fórmula `EI + C − EF`
  (AC-416), saída no meio do mês provando que o estoque inicial conta a quantidade
  anterior (AC-417) e compra de outro mês fora da conta (AC-418).

## T-403 — Tabela de compras, rota e registro no CRUD [pendente]
- Refs: US-403, AC-410
- Arquivos: migrations/0024_purchases.sql, src/server/tables.ts, src/pages/api/purchases/index.ts, src/pages/api/purchases/[id].ts
- Modelo: claude-sonnet-5
- Esforço: baixo
- Notas: Criar `migrations/0024_purchases.sql` com `purchases` (id, supplier,
  invoice, date, items JSON, notes) e o índice `idx_purchases_date` — o SQL exato
  está no design.md. Itens em coluna JSON, como `products.items` e `orders.lines`.
  Registrar a tabela em `src/server/tables.ts` com `jsonFields: ['items']` e
  `date` em `columns`, seguindo o formato das tabelas vizinhas. As duas rotas são
  de 5 linhas, espelhando `src/pages/api/ingredients/index.ts` e `[id].ts`:
  `createCollectionRoutes` em `index.ts` e `createItemRoutes` com
  `{ update: 'manager', delete: 'manager' }` em `[id].ts`. Criar a pasta
  `src/pages/api/purchases/`. Não migrar `products`, `ingredients` nem
  `stock_movements`.

## T-404 — Serviço de compras com validação e entrada de estoque [pendente]
- Refs: US-403, AC-410, AC-411, AC-412, AC-413, AC-414
- Arquivos: src/domain/types.ts, src/services/PurchasesService.ts, tests/services/purchasesService.test.ts
- Modelo: claude-sonnet-5
- Esforço: medio
- Notas: Acrescentar `PurchaseItem` e `Purchase` a `src/domain/types.ts`. Criar
  `PurchasesService` no formato de `StockService` (recebe `IRepository<T>` no
  construtor, sem depender de concreto). `register(draft)` valida **antes** de
  escrever qualquer coisa: data não futura (AC-413) e cada item com `qty > 0`,
  `packagePrice > 0` e `ingredientId` existente (AC-414) — validação tardia deixaria
  entrada de estoque órfã. Depois salva a compra, dá entrada via
  `StockService.registerMovement(id, 'entrada', qty, 'Compra de <fornecedor>')`
  (AC-412) e atualiza `packagePrice`/`packageSize` do ingrediente para o da compra
  (ASM-410). O valor do item é `(qty / packageSize) * packagePrice`, calculado na
  hora; a compra exibe a soma dos itens (AC-411). **Não** editar
  `tests/services/stockService.test.ts` — ele carrega `@spec:AC-036` e
  `@spec:AC-037` da feature `stock` e editá-lo invalidaria a prova dela. Os testes
  vão no arquivo novo.

## T-405 — Linhas de CMV e CPV nas telas de Produtos [pendente]
- Refs: US-401, US-402, AC-401, AC-402, AC-403, AC-408, AC-409
- Arquivos: src/ui/views/ProductsView.ts, tests/ui/productsCmv.test.ts
- Modelo: claude-sonnet-5
- Esforço: medio
- Notas: Em `renderCard` (linha 57) e em `calcBoxHtml` (linha 431), inserir linha
  `CMV` logo abaixo de "Custo total" e linha `CPV` logo abaixo de `CMV`, cada uma
  mostrando **apenas a sigla e o valor** em reais, sem texto explicativo
  (AC-403). No card, os valores vêm de `pricing.cmvUnit` e `pricing.cpvUnit`; na
  caixa de cálculo, dos mesmos campos, que o `refreshCalcBox` já recalcula a cada
  `input` (AC-409). **Obrigatório:** `calcBoxHtml` já tem 26 linhas e `renderCard`
  tem 22, e o gate `npm run check:style` exige corpo de função ≤ 25 linhas — as
  duas precisam ser quebradas (extrair os `.calc-row` para uma lista mapeada)
  como parte desta tarefa, e o gate precisa rodar depois. Arquivo de teste novo,
  `tests/ui/productsCmv.test.ts`, seguindo o padrão happy-dom de
  `tests/ui/stockTable.test.ts`.

## T-406 — Relatório de CMV e CPV do período [pendente]
- Refs: US-404, AC-416, AC-417, AC-418, AC-419, AC-420
- Arquivos: src/services/CmvService.ts, src/ui/views/CmvView.ts, tests/services/cmvService.test.ts, tests/ui/cmvReport.test.ts
- Modelo: claude-sonnet-5
- Esforço: alto
- Notas: `CmvService.report(monthKey)` monta `{ initialStock, purchases,
  finalStock, cmv, laborCost, cpv }` a partir das funções puras de `src/domain/cmv.ts`
  (T-402) — a tela **não** calcula nada, só formata (AC-419). Ordem de exibição:
  estoque inicial, compras, estoque final, depois `CMV` e `CPV`, este último logo
  abaixo do primeiro. A mão de obra do período soma `laborCost` do produto × `qty`
  das linhas de pedido cuja `deliveryDate` cai no mês (ASM-405). `CmvView` escolhe o
  mês e mostra `CMV` e `CPV` com sigla e valor total. Incluir o teste de sanidade
  de AC-420: o CMV do período não é maior que a soma dos CMV unitários × unidades
  produzidas. Os dois arquivos de teste são novos.

## T-407 — Tela de registro de compras [pendente]
- Refs: US-403, AC-410, AC-411, AC-413, AC-414, AC-415
- Arquivos: src/ui/views/PurchasesView.ts, tests/ui/purchasesView.test.ts
- Modelo: claude-sonnet-5
- Esforço: medio
- Notas: Arquivo de view novo, seguindo `src/ui/views/IngredientsView.ts` (uma
  pasta por entidade, `openModal` para o formulário, `showToast` para o aviso).
  Formulário com fornecedor, data e linhas de item (ingrediente, quantidade,
  tamanho do pacote, preço pago). Antes de enviar, o aviso de data futura
  (AC-413) e de item inválido (AC-414) aparece para o usuário; a validação de
  verdade é a de `PurchasesService` (T-404). Filtro por mês lista só as compras do
  mês, da mais antiga para a mais recente (AC-415). Arquivo de teste novo.

## T-408 — Wiring: contexto, navegação e rotas [pendente]
- Refs: US-404, AC-421
- Arquivos: src/state/AppContext.ts, src/ui/Sidebar.ts, src/main.ts, src/ui/icons.ts, tests/ui/sidebar.test.ts
- Modelo: claude-sonnet-5
- Esforço: baixo
- Notas: Em `src/state/AppContext.ts`, adicionar `purchases: IRepository<Purchase>`
  com `new ApiRepository<Purchase>('/api/purchases', token)` em `buildErpRepos`, e
  expor `purchases` e `cmv` em `buildServices`/no bloco `readonly`, no mesmo
  formato de `stock`/`pricing`. Em `src/ui/Sidebar.ts`, acrescentar a
  `{ path: '/atelie/compras', label: 'Compras', icon: 'compras' }` e
  `{ path: '/atelie/cmv', label: 'CMV', icon: 'cmv' }` em `ATELIE_GROUP`. Em
  `src/main.ts`, registrar as duas rotas em `VIEW_BY_PATH` e os redirecionamentos
  em `LEGACY_TO_ATELIE` (`/compras` e `/cmv`). Em `src/ui/icons.ts`, adicionar os
  dois ícones. O teste em `tests/ui/sidebar.test.ts` prova que o item "CMV"
  aparece no grupo Ateliê (AC-421); esse arquivo **não** tem tag `@spec:` de outra
  feature — verificado.

## T-409 — Seed de compras [pendente]
- Refs: US-403, US-404
- Arquivos: migrations/0025_purchases_seed.sql
- Modelo: claude-sonnet-5
- Esforço: baixo
- Notas: Rodar **depois** de T-403 (a tabela) e de T-404 (o serviço), porque as
  compras do seed também dão entrada no estoque e precisam deixar o saldo dos
  ingredientes coerente. Usar **datas relativas** como os seeds 0011 e 0012 já
  fazem: compras no mês atual, no mês anterior e no mesmo mês do ano passado, para
  o relatório de CMV ter o que mostrar em qualquer dia em que for rodado. Respeitar
  as compras já existentes em `migrations/0002_seed.sql`: os saldos finais dos
  ingredientes precisam bater com o estoque inicial declarado nos seeds, senão o
  CMV do mês corrente sai negativo e o AC-416 fica sem significado.
