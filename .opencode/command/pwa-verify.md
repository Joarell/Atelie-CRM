---
description: Verifies the PWA seam is intact — runs the four PWA test files, checks the manifest + icons on disk, and confirms every installation/offline contract (routing order, precache, cache version, secure-context gating) before the seam is declared done.
agent: build
---

Run the PWA verification and fix whatever fails so the app is provably
installable and offline-ready:

1. `npm run pwa:icons` — regenerate the icon PNGs from
   `scripts/generate-pwa-icons.ts` (idempotent; must not change the files).
2. `npx vitest run tests/domain/pwa.test.ts` — routing order
   (`other → api → page → static`), `isStaticPath`, cache name.
3. `npx vitest run tests/pwa/swContract.test.ts` — executes the real
   `public/sw.js` through a fake `self`/`caches`/`fetch`: lifecycle hooks,
   precache + cache version parity with `src/domain/pwa.ts`, stale-cache
   cleanup on activate, cross-origin/non-GET/`/api/*` bypass, offline
   navigation served from the shell, and `SKIP_WAITING` handling.
4. `npx vitest run tests/pwa/manifest.test.ts` — manifest identity, icons with
   exact on-disk sizes (valid PNG signatures), and the `/`-rooted start/scope.
5. `npx vitest run tests/ui/pwaInstall.test.ts` — install button + update flow.

Rules:
- If a cache/version rename is required, update BOTH `src/domain/pwa.ts` and
  `public/sw.js` and re-run step 3 so the contract cannot drift.
- Never register the worker on http other than localhost; keep the
  secure-context gate in `src/ui/pwaInstall.ts` and `src/ui/pwa.ts`.
- Follow up with `/verify` so the whole battery stays green.

Finish with one short summary: each step PASS/FAIL plus the final test count.