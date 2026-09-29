---
description: Check EGRESS connectivity to the WAHA engine (real transport, real base URL).
---
Run the live egress probe — the exact path the Workers app uses to reach the
engine host outbound HTTPS:
npm run waha:egress
Exit semantics (enforced by scripts/waha-smoke.ts):
0 = reachable AND authenticated (egress works)
1 = engine unreachable (blocked egress / host down)
2 = not configured (skip: offline battery stays green)
```

This is the honest egress gate: real `readWahaConfig` → real `WahaClient.checkConnection` → real host. Offline/CDF: exit 2 keeps the deterministic battery untouched.
