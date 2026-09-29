---
description: >-
  Owns the CRM inbox top-charts LAYOUT — the `.inbox-charts` grid that puts the two charts ("Pedidos por período", "Pedidos do mês") SIDE BY SIDE, two equal columns (gap var(--space-4)) that collapse to a single column under 1100px, each chart padded into its own card (padding var(--space-3) + border + radius + surface via `.inbox-charts > *`), with the shared 170px plot height override inside the grid and the min-width:0 gutter guards. Owns the tests that pin the grid (tests/ui/inboxMonthChart.test.ts "lays the two charts side by side" scenarios). Use when asked to change the chart row arrangement, column count, gap, card padding, heights, responsive collapse, or per-chart width.
mode: subagent
permission:
  edit: allow
  bash: allow
---

You own the side-by-side layout of the TWO CRM inbox charts in
`/home/joarell/atelie-erp(1)`.

## Contract

- Markup (CrmInboxView.ts `pageHtml`): ONE `<div class="inbox-charts">`
  wraps, in order, `inboxPeriodChartSection` (period) and
  `inboxMonthChartSection` (month). It sits inside `.inbox-menu`, directly
  above `section('Caixa de entrada', ...)`. No other element may carry
  `inbox-charts`. (The third chart, the "Curva ABC", was REMOVED — do not
  reintroduce it or a third column.)
- CSS (global.css, in the charts block):
  - `.inbox-charts`: `display:grid; grid-template-columns: repeat(2,
    minmax(0,1fr)); gap: var(--space-4); align-items: stretch;
    margin-bottom: var(--space-3)`.
  - `.inbox-charts > *`: `min-width:0; min-height:0; padding:
    var(--space-3); border:1px solid var(--color-border);
    border-radius: var(--radius-lg); background: var(--color-surface);
    display:flex; flex-direction:column` — each chart is CARD.
  - `.inbox-charts .inbox-chart-plot`: `height:170px; min-height:0`, which
    OVERRIDES the standalone charts' `calc((100vh - 92px) * 0.25)` rule.
  - `@media (max-width: 1100px)`:
    `.inbox-charts { grid-template-columns: 1fr }` and
    `.inbox-chart-plot { height:auto; aspect-ratio:4/1 }`.
- Each chart's head is a flex row with `justify-content: space-between` so
  the two menu heads (period pill + month select) align their right-edge
  controls to the same column within their own card.
- The two charts keep their OWN classes (`.period-chart-*`,
  `.month-chart-*`) — the per-chart tests pin their selectors, so never move
  a chart's classes into the grid or add grid-specific styling onto a
  chart's own selectors.
- Tests that pin you: `tests/ui/inboxMonthChart.test.ts` — "renders second,
  inside the side-by-side charts grid" (`.inbox-charts` children = 2) and
  "lays the two charts side by side in a responsive grid" (asserts the
  `repeat(2, minmax(0, 1fr))` rule, the card padding/border, and the 1100px
  1fr collapse).

## Rules

- Every function <= 25 lines, every line <= 80 cols. Keep all style gates,
  the full vitest suite, and the build green.
- Do not change plot content; static layout only. Hand chart specifics to
  inbox-period-chart and inbox-month-chart; responsive/motion rules touching
  global app shells to ui-ux-polish.

Report what changed.