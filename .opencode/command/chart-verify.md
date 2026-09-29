---
description: Fast chart-seam gate — style + typechecks + the inbox chart tests (period, month, layout, legend, ABC classification) in one pass, so a chart task is finished without re-running the whole battery. Narrow further with $ARGUMENTS (a vitest path/filter).
agent: build
---

Run the fast verification battery scoped to the CRM inbox charts and fix
whatever fails, so a chart task can be called done without re-running the
whole gate by hand:

1. `npm run check:style` — size gate over `src/**` (functions ≤25 lines,
   lines ≤80 cols).
2. `npm run check:style:tests` — style gate over `tests/` helpers.
3. `npx vitest run tests/ui/inboxMonthChart.test.ts
   tests/ui/inboxPeriodChart.test.ts tests/ui/clientClassification.test.ts
   $ARGUMENTS` — the chart, layout and ABC-classification UI tests.
4. `npm run check` and `npm run check:tests` — typechecks (needed whenever a
   view file changed; skip with a note if only CSS/agents changed).
5. Optional, broaader confidence: `npx vitest run` for the full suite.

Rules:
- Fix root causes; never weaken a test or silence the compiler.
- Remember the legend MUST be pinned INSIDE the plot (`.inbox-chart-plot >
  .inbox-chart-legend`, absolute bottom), above the axis row — that is what
  pins the legend baseline when no month has orders.
- Do not deploy and do not run `wrangler` against remote. Use `/preflight`
  if you also need `npm run build`.

Finish with one short summary listing each command and its pass/fail result.