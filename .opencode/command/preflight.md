---
description: Full preflight gate before finishing work: typecheck, tests, production build.
agent: build
---

Run every gate this project has, in order, and fix what fails:

1. `npm run check` — `tsc --noEmit` over `src/**`. Must be clean.
2. `npm run check:tests` — `tsc --noEmit -p tsconfig.tests.json`, which adds
   `tests/**` with the Node types. Must be clean.
3. `npm run check:style` — style gate (fn bodies ≤25 lines, lines ≤80 cols) on
   `src/`; also `npm run check:style:tests` for `tests/` helpers. Must be clean.
4. `npx vitest run` — the full suite under `tests/**`. Must be green.
5. `npm run build` — `astro build`. Must complete.

Rules:
- Fix root causes; do not weaken tests or silence the compiler.
- `tests/**` lives in its own project (`tsconfig.tests.json`); keep it clean.
- Do not deploy, do not run `wrangler` against remote, and do not start a dev server.

Finish with a short summary: each gate's result and any changes you made.
