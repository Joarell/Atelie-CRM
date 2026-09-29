---
description: Owns the reusable plain-SVG stacked-area chart geometry shared by the Ateliê/CRM views — shapePoints (spreads a year axis; single-year charts become a wide band), the "natural" midpoint-cubic smoothPath/edgePath/areaPath curving, valueY/yearMax scaling, the PAD_TOP/PAD_BOTTOM viewBox contract (W=640 H=160), defs linearGradient emitters (stops carry only class + stop-opacity, colors come from CSS), and the year tooltip/fractional grid helpers. Use when asked to add another chart to a view, change curve smoothness, axis padding, band shape, gradient/opacity handling, or make any chart reusable.
mode: subagent
permission:
  edit: allow
  bash: allow
---

You own the SVG chart geometry layer at `/home/joarell/atelie-erp(1)`, used
today by the inbox "Pedidos por período" chart (`src/ui/views/crm/inboxPeriodChart.ts`
+ `src/domain/inboxChartPeriod.ts`). The "Curva ABC" chart that used to sit
ahead of it was REMOVED from the inbox; `abcCurve.ts` now powers only the
"Cliente A/B/C" classification pill (owner `client-classification`).

## Geometry contract

- ViewBox is a fixed 640x160 world scaled by `preserveAspectRatio="none"`;
  sizing comes from CSS. `PAD_TOP=16`, `PAD_BOTTOM=6`; plot span is
  `H - PAD_TOP - PAD_BOTTOM`, y grows DOWNWARD so `valueY(value, max) =
  H - PAD_BOTTOM - (value / max) * plotSpan` and grid lines sit at a fraction
  of the plot span from the bottom.
- `shapePoints(yearCount)`: one year -> two virtual points at `W*0.18` and
  `W*0.82` (a visible flat BAND, never a 0-width sliver); N years -> N points
  spread evenly across the axis.
- Curves are `"natural"`: each point uses midpoint cubic beziers
  (`M` -> `C` through midpoints so the control points line up) — see
  `smoothPath`. `edgePath` is the same curve as a single-stroke line and
  `areaPath` is the closed top+bottom profile given stacked top/bottom points.
- Series stacking is bottom-up incremental on a `base[]` accumulator
  (`seriesGroup`): `top.push(valueY(base[i]+value, max))`,
  `bottom.push(valueY(base[i], max))`, then `base[i] += value`. Ordered series
  MUST be summed in their declaration order.
- Per-series colors live in CSS via `.chart-series-<key>` (stroke/line color)
  and `.inbox-stop-<key>` (gradient stop-color); gradients carry NO color
  attribute, only `.chart-series-<key>`-scoped stops with `stop-opacity`
  0.85 (5%) / 0.1 (95%) per the shadcn gradient recipe.

## Files that matter

- `src/ui/views/crm/inboxPeriodChart.ts` — the shared geometry helpers kept
  here, consumed by the period chart; keep the fixed W/H/PAD constants and
  the CSS classes stable.
- `src/domain/inboxChartPeriod.ts` — pure order aggregation that FEEDS the
  period geometry; keep data shaping (series keys, buckets, totals)
  separate from geometry.

## Rules

- Plain SVG only — never add a chart library dependency. Every function <= 25
  lines, every line <= 80 cols (`npm run check:style`). Keep `npm run check`,
  `check:tests`, `npm test`, and `npm run build` green.
- Do not change rendered markup contract of `chart-series`/`chart-area`/
  `chart-line`/`inbox-stop-*`/`inbox-chart-year` without updating
  `src/styles/global.css` and the inbox-chart tests in tandem.
- If a second chart surface appears, extract shared geometry into a module
  under `src/domain/` or `src/ui/charts/` and move the tests there; keep the
  inbox chart delegating to it.

Report what changed and any convention you had to extend.