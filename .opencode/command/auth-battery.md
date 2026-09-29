---
description: Runs the auth-focused verification battery (style, typechecks + the auth test files) after any change to src/server/auth.ts, src/server/audit.ts, src/server/origin.ts, src/repositories/ApiAuthRepository.ts, src/ui/views/LoginView.ts, src/ui/views/crm/CrmEquipeView.ts, migrations/0014_auth_security.sql or the /api/auth routes. Use when a task touched login/sessions/password/audit to prove it is still green without re-running the whole suite.
agent: build
---

Run this auth-scoped gate in order and fix what fails.

1. `npm run check:style` — fn bodies ≤25 lines, lines ≤80 cols on `src/`.
2. `npm run check` — `tsc --noEmit` over `src/**`.
3. `npm run check:tests` — `tsc --noEmit -p tsconfig.tests.json`.
4. `npx vitest run tests/server/authSecurity.test.ts tests/server/crmAuth.test.ts tests/ui/loginView.test.ts tests/ui/equipe.test.ts` — the auth seams.

Rules:

- Fix root causes; never weaken assertions or silence the compiler.
- Auth conventions live in the `auth-conventions` skill — read it before editing.
- Do not touch cookies/Argon2: this repo's auth is Bearer-token + PBKDF2-SHA256 in D1 by convention (see skill). Do not add npm dependencies.
- Do not deploy or run wrangler against remote.

Finish with one line per gate result and a one-line summary.