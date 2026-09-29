---
description: Validate the WAHA (WhatsApp) integration: offline typecheck + unit suite, then a live smoke test when the local container is up ($ARGUMENTS can pass a vitest filter).
agent: build
---

Validate the WAHA integration end to end and fix what fails.

1. `npm run check` and `npm run check:tests` — must be clean.
2. Offline unit suite (deterministic, no Docker needed):
   ```
   npx vitest run tests/server/waha.test.ts tests/server/whatsappHealth.test.ts tests/domain/whatsapp.test.ts $ARGUMENTS
   ```
3. Live smoke (needs the local container; fails fast if Docker/daemon is off):
   ```
   npm run waha:smoke
   ```
   Read the report: `saudavel` must be `true` (or a known transient `detail` like
   `sessao_sem_conexao: SCAN_QR_CODE`, which still proves the connection). Exit
   `0` = reachable + authenticated; `1` = unreachable or refused key; `2` = not
   configured.

Rules: fix root causes, never weaken tests, never log the WAHA response body or
secrets. If a `detail` fails, map it per `docs/whatsapp-waha.md` §7
(troubleshooting) and apply the listed fix (e.g. sync the `sha512:` key between
`docker-compose.waha.yml` and `.dev.vars`, `npm run waha:smoke` (live engine health)).

Finish with a summary: each gate's result and the final smoke health line.