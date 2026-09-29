---
description: Audit the dependency graph and framework purity (this app is framework-free — no React/Radix/shadcn), prune anything unused, and prove the gates stay green.
agent: build
---

Audit and, where safe, prune the dependency footprint. The target stack is
`astro` + `@astrojs/cloudflare` (runtime), `tailwindcss` + `@tailwindcss/vite`
(CSS compiler), plus `vite`, `vitest`, `happy-dom`, `typescript`, `wrangler`.

Steps:

1. Read `package.json` and `astro.config.ts`.
2. For each dependency, search `src/**`, `tests/**`, `astro.config.ts`, and
   `*.astro` for real imports. A dependency with no importer is a candidate.
3. Remove candidates from `package.json`, then run `bun install` (updates
   `bun.lock`, prunes `node_modules`).
4. Fix stale comments in `astro.config.ts` and the `@source` list in
   `src/styles/global.css` if directories disappeared (e.g. `../components`).
5. Run the gates:
   - `bun run check` — `tsc --noEmit` over `src/**`.
   - `bun run check:tests` — `tsc --noEmit -p tsconfig.tests.json`.
   - `npx vitest run` — full suite, including
     `tests/dependencies.test.ts` (the no-React guard).
   - `bun run build` — `astro build`.
6. If any gate fails, revert only the offending removal and report it.

Rules:
- Never remove `astro`, `@astrojs/cloudflare`, `tailwindcss`,
  `@tailwindcss/vite`, `vite`, `vitest`, `happy-dom`, `wrangler`, or
  `typescript`.
- Never hand-edit `bun.lock` or `node_modules`.
- Do not weaken `tests/dependencies.test.ts` to make a removal pass.
- Do not deploy or run `wrangler` against remote.

Finish with a table: dependency → used/unused (evidence) → action → gate result.
