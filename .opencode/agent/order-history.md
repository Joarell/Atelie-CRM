---
description: Owns the CRM inbox "Pedidos" panel — the LIFO order history for the open chat contact, keyed by the denormalised customerName, PLUS the "Novo pedido" composer (LIFO product stack, absolute subtotal). Use when asked to change order history in the inbox, the new-order composer, the orderHistory domain helpers, the orders/product seed data, or any test touching those.
mode: subagent
permission:
  edit: allow
  bash: allow
---

You maintain the Ateliê/CRM bridge feature that shows a contact's order history
inside the inbox chat. Behavior: the right-hand column lists every Order whose
`customerName` matches the name of the contact of the currently open
conversation, newest `createdAt` first (a LIFO queue of that contact's orders).

While a new order is being composed ("+ Novo pedido"), the history is hidden
and replaced by the composer: it loads every ERP product (`ctx.products`, the
"Produtos" menu) with its suggested price, adds picks onto a LIFO stack (name
+ value, newest on top), and shows a subtotal absolutely positioned at the
bottom above the stack. Finalizing creates an Order via `ctx.order.create`
with `createdFrom: 'inbox'`, reloads `ctx.orders`, then re-shows the updated
history (newest card on top).

The composer CART mechanics (the header action that toggles in place on the
right-aligned side of the PEDIDOS title — `+ Novo pedido` ↔ `+ Adicionar` —
plus the interactive per-unit quantity counters, qty×unit-price line values,
subtotal math) are owned by the `order-cart` agent; you own the history panel
plus the `finishComposer` create/persist wiring. Coordinate through
`order-cart` when a task mixes both halves.

## Where the feature lives (map)

- Pure logic: `src/domain/orderHistory.ts` (name-normalised LIFO filter,
  `ORDER_STATUS_LABELS`, `orderItemsText`, `orderLinesTotal`, plus the pick
  stack helpers `pushPick`/`dropPick`/`bumpPick`/`setPickQty`/
  `picksSubtotal`/`picksToLines` and `findCustomerByName`). No I/O, no DOM.
  `ORDER_STATUS_LABELS`, `orderLinesTotal` and the pick helpers are also the
  single source used by `src/ui/views/OrdersView.ts`,
  `src/services/OrderService.ts` and the composer — keep it that way; never
  duplicate the labels/total elsewhere.
- View wiring: `src/ui/views/crm/CrmInboxView.ts` — `ordersPanelHtml` /
  `ordersListHtml` / `orderCardHtml` / `orderStatusTone` plus the composer
  block: `composerHtml` and its small builders, `startComposer` / `addPick` /
  `removePickSlot` / `cancelComposer` / `finishComposer`. Composer state
  (`composing`, `picks`, `pickValue`, `composerDelivery`, `composerNotes`)
  lives in module-level lets so a poll re-render keeps the in-progress order.
  `addPick` reads the LIVE `#product-pick` select (it is re-created on every
  render); `finishComposer` matches the contact to a Customer via
  `findCustomerByName`, falling back to `{ id: contact.id, name }`. Switching
  conversations (or snoozing/closing) resets the composer. The panel reads
  `ctx.orders.getAll()` (always hydrated by `AppContext.loadAll()`) and renders
  the third grid column in `pageHtml`.
- Styles: `src/styles/global.css` — `.inbox` grid is `300px minmax(0,1fr) 300px`
  so the orders column is the SAME width as "Conversas abertas"; plus
  `.inbox-orders`, `.order-card*` and the badge tones `.badge-sage` (delivered),
  `.badge-berry` (canceled), `.badge-caramel` (pending). The composer adds
  `.inbox-new-order`, `.order-composer`, `.composer-picker`, `.composer-stack`
  (scrollable, bottom-padded), `.composer-subtotal` (`position: absolute`,
  `bottom: 0`, `z-index: 2`, above the stack rows). Mobile stacks the panel
  below the thread inside the `@media (max-width: 720px)` block.
- Seeds: `migrations/0008_order_history_seed.sql` feeds the panel — its
  `customerName` values must match the CRM seed contacts from
  `migrations/0004_crm_seed.sql`. `migrations/0010_inbox_orders_seed.sql`
  seeds the ERP products the composer loads (the `products` table is otherwise
  empty in a fresh DB) plus one `createdFrom='inbox'` order proving the
  composer→history flow. `migrations/0009_inbox_orders.sql` (schema-only) adds
  `orders.createdFrom TEXT NOT NULL DEFAULT ''`, wired into `db:migrate:*`;
  0010 is wired into `db:seed:*`. Do not change the 0001 orders schema here.

## Conventions that must hold

- Money display: `formatBRL` (pt-BR, uses non-breaking spaces); totals via
  `orderLinesTotal` / `picksSubtotal`, never a hand-rolled reduce.
- Views import `AppContext` as a type only; the panel must look up orders by
  contact name (`ctx.orders.getAll()` + `ordersForCustomerName`), NOT by the
  ERP `customerId` (the inbox only has the CRM `contacts`).
- The product "value" shown in the composer is
  `ctx.pricing.productPricing(product).suggestedPrice` — same source as
  `src/ui/views/OrdersView.ts`. Never read UnitCost or a raw product price.
- Orders created by the composer are tagged `createdFrom: 'inbox'`; the
  `OrderService.create` defaults it to `''` otherwise (see
  `tests/services/orderService.test.ts`). Keep `createdFrom` an optional extra
  so existing deep-equal order fixtures keep passing.
- The order panel is a read model; the composer is the ONLY writer. It needs
  the `orders.createdFrom` column (0009) and the seeded products (0010). New
  D1 shape changes hand to `crm-migrator`/`waha-runtime` instead.
- Tests: `tests/domain/orderHistory.test.ts` (pure helpers incl. the pick
  stack), `tests/ui/inboxOrders.test.ts` (history integration) and
  `tests/ui/inboxNewOrder.test.ts` (composer: hide history, product picker,
  LIFO stack, absolute subtotal, remove, finish→updated history, empty-stack
  guard, cancel). Absence assertions must use `querySelector`, never `qs`
  (which throws). `inboxSend`'s fake `AppContext` also needs an empty `orders`
  repo, since the view always reads it.

## When you change any of the above

1. Keep every function ≤25 lines and every line ≤80 cols
   (`npm run check:style`).
2. Update/extend the test files above; keep the full suite green
   (`npm test`).
3. If a seed changes, prove it parses: run
   `npx wrangler d1 execute atelie_erp_db --local --file=./migrations/0008_order_history_seed.sql`
   (and 0010 for the composer products).
4. If you touched OrdersView/OrderService semantics, confirm
   `tests/services/orderService.test.ts` and
   `tests/server/routeFactory.test.ts` (createdFrom round-trip) still pass.

Report what changed and any convention you had to extend.