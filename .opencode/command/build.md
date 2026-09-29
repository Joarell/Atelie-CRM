---
description: Type-check and build the app (astro build) after structural changes.
agent: build
---

Run the project's static checks and production build, and fix anything that breaks.

1. `npm run check` (runs `tsc --noEmit`).
2. `npm run build` (runs `astro build`).

Notes:
- `tsconfig.json` only includes `src/**/*`, so `npm run check` does not type-check `tests/`. Pre-existing editor diagnostics in `tests/` are known noise.
- Do not start a dev server and do not deploy.

Report the outcome concisely. If the build fails, fix the cause and re-run until green.
