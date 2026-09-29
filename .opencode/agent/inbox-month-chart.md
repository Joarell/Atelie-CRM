---
description: Owns the inbox "Pedidos do mês" bar chart — ALL orders in the system (every customer, not just the open chat contact) inside a pickable calendar month, one bar per day with orders: the pure aggregation in src/domain/inboxMonthChart.ts (ordersByDay, isSameMonth, allOrderMonths, monthSummary, InboxDayPoint), the SVG bar renderer in src/ui/views/crm/inboxMonthChart.ts (bars + x-labels + tooltips reusing .inbox-chart-tip), the month PICKER (.month-menu > select.month-select listing every month with orders plus the selected one, module-level chartMonth + bindMonthMenu in CrmInboxView.ts), the .month-chart* + .month-menu* + .month-select CSS in global.css, and the relative-date seed migrations/0012_inbox_month_chart_seed.sql (current month, today, prior month, same month a year ago). Use when asked to change the monthly all-orders chart, its month menu/options, day buckets, bar geometry, tooltip, month label, empty state, or the 0012 seed.
mode: subagent
permission:
  edit: allow
  bash: allow
---

You own the "Pedidos do mês" chart in the CRM inbox at
`/home/joarell/atelie-erp(1)`.

## Contract

- Scope: unlike the ABC and period charts (per-CONTACT), this chart
  aggregates EVERY order in the system inside a user-picked calendar month.
  One bar per DAY that has orders; days without orders are not rendered.
  The view passes `ctx.orders.getAll()` (never a per-contact slice) PLUS the
  module-level `chartMonth` (default `todayISO().slice(0, 7)`) so month
  choices survive poll re-renders and contact switches.
- Month picker: header row puts `.month-menu[role=group]` (aria-label "Mês do
  gráfico") to the right of the title; it holds
  `<select class="month-select" data-month-select="" aria-label="Escolher
  mês">` with one option per month. Options = every distinct month that has
  orders (`allOrderMonths`, newest first) PLUS the current selection
  (`monthOptions` force-adds it, so a stale/empty selection stays visible),
  labelled `monthChartLabel` ("setembro 2026"). The chosen option carries
  `selected`. The subtitle `<p class="month-chart-sub">` under the head
  echoes the selected month — NOT necessarily "today". Users can only pick
  months present in the menu, so "empty month" is only reachable when the
  SELECTED month has no orders (e.g. current month on a fresh DB, or after
  data changes).
- Binding: `bindMonthMenu(root)` is a delegated `change` listener on the
  inbox root (class gate `month-select`) that sets `chartMonth` then calls
  `rerender()`. Test events must dispatch `new Event('change',
  { bubbles: true })` — plain `change` does not bubble to the root.
- Domain (`src/domain/inboxMonthChart.ts`, pure): `ordersByDay(orders,
  monthKey)` filters via `isSameMonth` (createdAt must match `YYYY-MM-DD`,
  then month-prefix) and buckets ascending by day into `InboxDayPoint
  {day, label (DD/MM), total, value}`; `total` = order count, `value` =
  `orderLinesTotal` summed; `monthSummary` totals orders + BRL;
  `allOrderMonths` returns distinct `YYYY-MM` desc. Skip createdAt values
  that aren't valid `YYYY-MM-DD`.
- Renderer (`inboxMonthChart.ts`): plain-SVG bar chart. One `<rect
  class="month-chart-bar">` per bucket, centered in its `W/points.length`
  slot at `BAR_RATIO=0.62`, height scaled by `maxTotal` (never zero — max
  falls back to 1). Hover columns reuse the shared tip tooltip classes
  (`.inbox-chart-tip`, `.inbox-chart-tip-left` on the last, `escapeAttr` for
  the `data-key`), x-labels `.month-chart-xlabel` `translateX(-50%)` at the
  top of `.month-chart-x`, and a legend `inbox-chart-legend` quoting the
  month subtotal ("3 pedidos · R$ …"). Empty month → `.month-chart-empty`
  card, no svg. IMPORTANT: the month chart is BARS and adds NO `defs
  linearGradient` — only the period chart does (it pins its own gradient
  counts in its test).
- CSS (global.css): `.month-chart-bar` (accent fill, hover via
  `.month-chart-col:hover` overlay), `.month-chart-cols` absolute flex strip,
  `.month-chart-x*`, `.month-chart-sub`, `.month-menu`/`.month-select` pill.
  The chart renders INSIDE the `.inbox-charts` grid (2 columns side by side
  with card padding; it is the SECOND column — owner `inbox-charts-layout`),
  so its
  `.inbox-chart-plot` is 170px tall; do not add chart-level layout.
- Seed (`migrations/0012_inbox_month_chart_seed.sql`): relative dates via
  `date('now', 'start of month', '+N days')` so the chart has bars the day it
  runs; ids include the computed date so later months seed fresh rows.
  Reuses customers/products from 0008/0010. **D1/SQLite quirks to respect in
  this file**: compound `SELECT ... UNION ALL ...` terms in a FROM subquery
  are capped (keep <=4), and `AS alias(col1, col2)` column lists after a FROM
  subquery are NOT supported — name columns in the first SELECT and use
  plain `AS p`.

## Rules

- Every function <= 25 lines, every line <= 80 cols
  (`npm run check:style`). Keep `npm run check`, `check:tests`,
  `check:style`, `check:style:tests`, `npm test`, and `npm run build` green.
- Colors MUST come from existing tokens. No chart library.
- Hand OFF series/tooltip language to svg-chart, period bucketing to
  inbox-period-chart, the side-by-side grid to inbox-charts-layout.

Report what changed.