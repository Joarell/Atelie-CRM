---
name: auth-conventions
description: Rules for the login/session layer of this Astro + Cloudflare Worker + D1 app. Use when editing session auth, login/logout/password endpoints, the #/login screen, login UI in Equipe, the ApiAuthRepository, the auth_audit trail, or session hygiene — or when a task mentions login, sessions, token, password, auth, audit, same-origin, or "Trocar senha".
---

# Auth conventions (atelie-erp)

Single-tenant, D1-only, local-auth app. The DeskcommCRM-style login model is
already implemented; extend it, never rewrite it, and never add npm deps.

## The model (why not cookies/Argon2)

- **Bearer token in `localStorage`** (`crm_token`, `crm_user`) — the app's
  convention. The main.ts → repositories → /api flow sends
  `Authorization: Bearer <token>`. EventSource streams authenticate with
  `?token=` (`userFromTokenString`). **Do not switch to HttpOnly cookies**:
  the SPA + event streams cannot send cookies from `fetch`/`EventSource`
  without a large refactor, and there is no cross-site CSRF exposure with a
  bearer token.
- **PBKDF2-SHA256** password scheme (`crypto.subtle`): 100 000 iterations,
  256-bit, salt `deskcomm-seed-v1` (matches `migrations/0004_crm_seed.sql`).
  `hashPassword` / `verifyPassword` in `src/server/auth.ts`. **Argon2id is
  off the table** (Worker CPU budget + the no-new-deps rule).
- Seed admin: `admin@deskcomm.local` / `admin123`.

## D1 tables (`migrations/0003_crm.sql`, `0014_auth_security.sql`)

- `users(id, name, email UNIQUE, passwordHash, role, createdAt)`.
- `sessions(token PK, userId, createdAt, expiresAt)` — **keyed by `token`**,
  never by id. Always use `getEntity(db, SESSIONS_TABLE, SESSIONS_SHAPE,
  token, 'token')` / `deleteEntity(..., token, 'token')`.
- `auth_audit(id, userId, action, detail, ip, createdAt)`.
- Table name/shape pairs in `src/server/tables.ts`: `USERS_TABLE/SHAPE`,
  `SESSIONS_TABLE/SHAPE`, `AUTH_AUDIT_TABLE/SHAPE`. New schema migration 0015+
  must be appended to `db:migrate:local` AND `db:migrate:remote` in
  `package.json`.

## Server helpers (all take `Database` from `src/server/db.ts`, never D1Database)

- `src/server/auth.ts`: `hashPassword`, `verifyPassword`, `newSession`,
  `createSessionRow`, `userFromToken(db, request)`, `userFromTokenString`,
  `userByEmail`, `deleteSession`, `sessionToken(request)`,
  `updateUserPassword`, and the session-hygiene set:
  - `deleteSessionsForUser(db, userId)` — drop every session a user holds.
  - `revokeOtherSessions(db, userId, exceptToken)` — password-change hygiene.
  - `purgeExpiredSessions(db)` — expiry sweep, runs on login.
- `src/server/audit.ts`: `newAuditEntry(userId, action, detail, ip)` +
  `recordAudit(db, entry)` + `clientIp(request)` (`cf-connecting-ip`).
- `src/server/origin.ts`: `assertSameOrigin(request)` → `Response | null`.
  Every `/api/auth/*` route starts with it; a cross-origin `Origin` header
  yields 403 `origem_nao_permitida`.

## Session lifecycle rules

- **Login** (`POST /api/auth/login`): same-origin guard → resolve user →
  audit `login_failed` (bad creds) or `login_ok` → `purgeExpiredSessions` →
  `deleteSessionsForUser` (one active session per user) → new session row →
  return `{ token, user: publicUser(user) }`. Never reveal which of e-mail /
  password was wrong; return `credenciais_invalidas` for both.
- **Logout** (`POST /api/auth/logout`): delete the session, audit `logout`.
- **Password change** (`POST /api/auth/change-password`): valid session
  required; verify `currentPassword`; reject `<8` chars (`senha_curta`);
  `updateUserPassword`; `revokeOtherSessions` keeping the caller's token;
  audit `password_changed` / `password_change_failed`.
- **Admin user edit** (`PUT /api/users/[id]`): the wire body uses a `password`
  field (never `passwordHash` — the view builds it via `userPatchFor` in
  `CrmEquipeView.ts`). A supplied password resets the hash, revokes ALL the
  user's sessions and audits `user_password_reset`.
- Users created/deleted audit `user_created` / `user_deleted`.

## UI

- Dedicated login screen at **`#/login`** (`src/ui/views/LoginView.ts`):
  `.login-card`, inline `#login-error` (friendly PT-BR messages), redirect to
  `sessionStorage.login_return_path` set by the sidebar `data-foot-login`
  click in `main.ts`.
- Sidebar foot shows **Entrar** (`#/login`) when logged out, avatar + Sair
  when in.
- `CrmEquipeView` session bar has **Trocar senha** (`#change-password`) when
  logged in.

## Verification

- Read `.opencode/command/auth-battery.md` for the auth-scoped gate.
- Auth server tests: `tests/server/authSecurity.test.ts`,
  `tests/server/crmAuth.test.ts`; UI: `tests/ui/loginView.test.ts`,
  `tests/ui/equipe.test.ts` (all with `FakeD1` + the `seed()` rows helper —
  remember FakeD1's `Map` is keyed by the real table-name string, so use
  computed keys `[USERS_TABLE]: [...]`).
- Full gate: run `/preflight`.