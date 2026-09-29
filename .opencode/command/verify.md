---
description: Fast completion gate — typecheck + style + full test suite in one pass, so a task can be finished quickly.
agent: build
---

Run the fast verification battery (no astro build) and fix whatever fails, so
the task can be called done without re-running each gate by hand:

1. `npm run check` — `tsc --noEmit` over `src/**`.
2. `npm run check:tests` — `tsc --noEmit -p tsconfig.tests.json` (adds `tests/**`).
3. `npm run check:style` — size gate over `src/**` (functions ≤25 lines, lines ≤80 cols).
4. `npm run check:style:tests` — style gate over `tests/` helpers.
5. `npx vitest run $ARGUMENTS` — the full suite under `tests/**` (pass a path
   to narrow the run).

Rules:
- Fix root causes; never weaken a test or silence the compiler.
- Do not deploy, do not run `wrangler` against remote, and do not start a dev
  server. Use `/preflight` if you also need `npm run build`.

Finish with one short summary listing each command and its pass/fail result.