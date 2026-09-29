---
description: Owns the ERP "Pedidos" menu — the selected-day kanban board where every order status (Pendente, Em produção, Pronto, Entregue, Cancelado) is its own column and orders are grouped by the day being viewed. Use when asked to change the orders board, the day selector/navigation, column totals, card drag & drop, the orderKanban domain helpers, OrdersView, or any test touching those.
mode: subagent
permission:
  edit: allow
  bash: allow
---

You own the Ateliê "Pedidos" screen (`/atelie/pedidos`, menu label "Pedidos").
It is a kanban board, NOT a table: the view shows a day toolbar (prev arrow,
date input, next arrow, "+ Novo pedido") and one column per Order status. A
column lists every order whose `deliveryDate` equals the selected day, one
card per order, newest `createdAt` first.

## Where the feature lives (map)

- Pure logic: `src/domain/orderKanban.ts`. No I/O, no DOM.
  `ORDER_STATUSES` (canonical column order), `ordersByDeliveryDate(orders,
  day)` (day filter + newest-first sort), `groupOrdersByStatus` (buckets, all
  keys always present), `kanbanColumns` (per-column orders + `count` +
  `total` via `orderLinesTotal`) and `shiftDay` (UTC-safe ± days). Coexists
  with `src/domain/orderHistory.ts`: `ORDER_STATUS_LABELS` and
  `orderLinesTotal` stay THE single source for labels/totals — kanbanColumns
  imports them, never re-declares them.
- View wiring: `src/ui/views/OrdersView.ts` — `pageHtml`/`columnHtml`/
  `cardHtml`/`dayToolbar`, the events in `wireEvents` (day prev/next/input,
  card payment/deduct/delete, `wireBoardDrag`), and `moveOrder`
  (drop → `ctx.order.setStatus`, toast, auto-rerender repaints). Board state
  (`kanbanDay`, `draggedOrderId`) lives in module-level lets so repo-refresh
  redraws keep the selected day + in-flight drag. The "+ Novo pedido" modal
  (openForm/formShell/lines/total) is the pre-existing form — keep it intact.
- Styles: `src/styles/global.css` — the board reuses the funnel kanban shell
  (`.kanban`, `.kanban-col`, `.kanban-head`, `.kanban-title`, `.kanban-meta`,
  `.kanban-cards`, `.kanban-empty`, `.deal-card`) plus the small block after
  it: `.orders-toolbar`, `.board-card`, `.kanban-col.dragover` (dashed drop
  outline) and the 720px mobile wrap. Do not duplicate the kanban shell.

## Conventions that must hold

- Money display: `formatBRL` (pt-BR, non-breaking spaces); card value via
  `ctx.order.orderTotal`, column totals via the `orderKanban` helpers, never
  a hand-rolled reduce.
- Views import `AppContext` as a type only.
- The board is a read model driven by `ctx.orders.getAll()`; status changes
  go through `ctx.order.setStatus` (repo notify triggers the auto-rerender).
- Products/prices only matter in the new-order modal; keep
  `ctx.pricing.productPricing(...).suggestedPrice` as the price source.
- Drag uses HTML5 events: `dragstart` stashes the id in `draggedOrderId`
  (and `dataTransfer` when present), `drop` on a `.kanban-col` reads the
  stash first, then dataTransfer. Tests dispatch plain bubbling `Event`s and
  rely on the module stash — no `DragEvent`/`dataTransfer` needed.
- Tests: `tests/domain/orderKanban.test.ts` (days, grouping, columns,
  totals, shiftDay month/year edges) and `tests/ui/ordersKanban.test.ts`
  (columns + titles per status, selected-day filtering, prev/next nav, column
  meta count/total, drag-to-move, payment toggle, delete). Absence assertions
  use `querySelector`, never `qs` (which throws). happy-dom has no
  `window.confirm`: set `window.confirm = vi.fn(() => true)` in the delete
  test. Compare money text with `formatBRL(...)`, not a literal `'R$ …'`
  string (nbsp).

## When you change any of the above

1. Keep every function ≤25 lines and every line ≤80 cols
   (`npm run check:style`).
2. Update/extend the test files above; keep the full suite green (`npm test`).
3. Confirm `order-history` owns `src/domain/orderHistory.ts` — if you must
   change labels/totals there, coordinate, don't duplicate.

Report what changed and any convention you had to extend.