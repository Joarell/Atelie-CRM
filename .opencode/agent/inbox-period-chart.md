---
description: Owns the inbox "Pedidos por período" stacked-area chart — the FIRST chart in the CRM inbox (leftmost column of the two-chart grid), rendered before the "Caixa de entrada" section. Its Semana/Mês/Ano menu switches the open chat contact's orders into ISO-week, calendar-month or calendar-year buckets: the pure aggregation in src/domain/inboxChartPeriod.ts (ordersToPeriodSeries, periodBucketKey, isoWeekKey, InboxPeriodBucket), the SVG renderer plus the .period-menu control in src/ui/views/crm/inboxPeriodChart.ts, the view wiring in CrmInboxView.ts (chartPeriod module state, inboxPeriodChartSection, bindPeriodMenu), the .period-chart* + .period-menu* CSS in global.css, and the tests. Use when asked to change the week/month/year chart, its period menu, bucket labels, tooltip, or empty state.
mode: subagent
permission:
  edit: allow
  bash: allow
---

You own the period-granularity chart in the CRM inbox at
`/home/joarell/atelie-erp(1)`, the FIRST chart in the `.inbox-charts` row.

## Contract

- It renders INSIDE the "Inbox" menu, as the FIRST child of
  `<div class="inbox-charts">`, directly before `inboxMonthChartSection`,
  for the currently open chat contact. (The old "Curva ABC" chart was
  REMOVED; this chart took its place as the leftmost column. Do not
  reintroduce a chart before it.) It shares the plot box/classes with the
  month chart (`.inbox-chart-head`, `.inbox-chart-plot`, `.inbox-chart-svg`,
  `.chart-grid`, the `.inbox-chart-tip*`, legend and `.chart-swatch`
  classes), but keeps its own `period-*` classes.
- Data: `ordersForCustomerName(ctx.orders.getAll(), current.contact.name)`.
  Bucks each `order.createdAt` (UTC) by the selected period:
  `semana` = ISO-8601 week (`YYYY-Www`, week 1 = week of Jan 4; the week's
  Thursday decides the ISO year), `mes` = `YYYY-MM`, `ano` = `YYYY`. Orders
  whose createdAt carries no usable date are SKIPPED.
- Series mirror the original yearly chart: `entregue` / `ativo` (pendente+producao+
  pronto) / `cancelado` stacked bottom-up from `ORDER_STACK_SERIES`, Y = order
  count per bucket, every bucket zero-fills all series and tallies
  `orderLinesTotal` BRL into `values` and `value`.
- Renderer emits plain SVG (no library): gradient ids `period-grad-<key>`
  with `stop class="period-stop-<key>"` (NO stop-color attribute — colors come
  from CSS tokens), `path.period-chart-line`, `path.period-chart-area`, the
  shared "natural" midpoint-cubic `smoothPath`, hover columns
  `.period-chart-col[data-key]` (aria-label escaped with `escapeAttr`, NOT
  `escapeHtml`), `.period-chart-point` dot, `.period-chart-tip` sharing the
  shared tip tooltip classes (inline `top` = `tipTop` clamp 24–74%,
  `.inbox-chart-tip-left` on the LAST column), `.period-chart-bullets`/
  `.period-chart-bullet` timeline dots revealed on
  `.inbox-chart--period .inbox-chart-plot:hover`, `.period-chart-x`/
  `.period-chart-xlabel` labels (translateX(-50%)), legend. Single-bucket
  charts render as a wide flat band (points pulled to W*0.18..W*0.82).
- Menu: `.period-menu[role=group]` with three
  `<button class="period-option" data-period=... aria-pressed=...>`
  (Semana/Mês/Ano); active one gets `aria-pressed="true"` + `.is-active`.
  View keeps `chartPeriod` in a module-level let (default `'mes'`) so poll
  re-renders do not reset it; `bindPeriodMenu` clicks set the period + `rerender`.
- `inboxPeriodChartHtml([], period)` returns the `.period-chart-empty` card
  (no columns, no svg) but keeps the menu visible.
- Empty view (no chat contact / no orders) shows the empty card.

## Files that matter

- `src/domain/inboxChartPeriod.ts` — `ChartPeriod`, `CHART_PERIODS`,
  `PERIOD_LABELS`, `InboxPeriodBucket {key,label,counts,values,total,value}`,
  `periodBucketKey`, `ordersToPeriodSeries`. Pure (imports only the shared
  series helpers + `orderHistory` total). Delegate any series/status-bucket
  change to the shared svg-chart owner instead.
- `src/ui/views/crm/inboxPeriodChart.ts` — `inboxPeriodChartHtml(orders,
  period)` + the geometry/menu/tip builders, constants W=640 H=160 PAD_TOP=16
  PAD_BOTTOM=6.
- `src/ui/views/crm/CrmInboxView.ts` — `chartPeriod` let,
  `inboxPeriodChartSection` (FIRST child of `.inbox-charts`),
  `bindPeriodMenu` wired in `wireEvents`.
- `src/styles/global.css` — the `.period-menu*` + `.period-chart*` block
  (menu pills, gradients, col, bullets, point, tip reveal, x-labels, empty).
- Tests: `tests/domain/inboxChartPeriod.test.ts` and
  `tests/ui/inboxPeriodChart.test.ts` (menu default + switching, month/year/
  week buckets + labels + tips, distinct classes vs the month chart, contact
  rebuild, empty state, period kept across a refresh redraw, and that no
  `.abc-dot` remains after the Curva ABC removal).

## Rules

- Every function <= 25 lines, every line <= 80 cols (`npm run check:style`).
  Keep `npm run check`, `check:tests`, `check:style`, `check:style:tests`,
  `npm test`, and `npm run build` green.
- Never add a chart dependency; stay plain SVG + CSS. Colors MUST come from
  existing tokens so dark mode keeps working.
- Hand OFF to svg-chart when the reusable pure geometry needs extending, to
  chart-legend for shared legend/tooltip alignment, to ui-ux-polish for
  responsive/motion changes outside the chart, to chart-menu for the segmented
  selector pattern.

Report what changed and any convention you had to extend.