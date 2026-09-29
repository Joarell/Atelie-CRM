---
description: Regenerates the PWA icon PNGs from the self-contained script into public/icon-192.png, icon-512.png, icon-maskable-512.png and apple-touch-icon.png, then proves files are byte-stable and the manifest contract still passes.
agent: build
---

Regenerate the PWA icons and prove the seam is unchanged:

1. `npm run pwa:icons` — runs `node scripts/generate-pwa-icons.ts` which writes
   `public/icon-192.png`, `public/icon-512.png`,
   `public/icon-maskable-512.png` and `public/apple-touch-icon.png` with a
   self-contained zlib PNG encoder (no dependencies).
2. Confirm the runner reported all four files written and that `git status`
   shows no unexpected diffs (the script is deterministic — regenerating must
   be a no-op).
3. `npx vitest run tests/pwa/manifest.test.ts` — manifest fields plus on-disk
   PNG signatures and exact declared sizes.
4. `npx vitest run tests/domain/pwa.test.ts` — no routing drift.

Rules:
- Never hand-edit the PNGs; the script is the single source of the icon art.
- The maskable icon must be full-bleed (no transparent margin within the safe
  zone) and the `any` icons keep transparent corners for the browser tile.
- Follow up with /pwa-verify if you changed the generator.

Finish with one short summary: files written, test totals, and PASS/FAIL per step.