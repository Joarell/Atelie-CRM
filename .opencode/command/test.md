---
description: Run the vitest suite (all tests, or a filtered path passed as $ARGUMENTS).
agent: build
---

Run the unified vitest suite and resolve failures.

```
npx vitest run $ARGUMENTS
```

- With no arguments this runs everything under `tests/**`.
- Pass a path or filter via `$ARGUMENTS` (e.g. `tests/services` or `crmService`) to narrow the run.
- If a test fails, fix the underlying source bug rather than weakening the test, unless the test is genuinely stale — say so explicitly if you do.
- Re-run until green and report the file/test counts.
