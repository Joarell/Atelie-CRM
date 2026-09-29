---
name: migration-conventions
description: Architecture and porting rules for moving DeskcommCRM features into this Astro 7 SSR + Cloudflare Worker + D1 app. Use when adding or extending CRM/Ateliê features, wiring new API routes, repositories, views, D1 tables/shapes, session auth, or tests — or when a task mentions DeskcommCRM, porting, migrating, "funil", "inbox", "contatos", "equipe", or D1.
---

# Migration conventions (DeskcommCRM → atelie-erp)

This app is the merged target: the DeskcommCRM sales CRM is the standard shell,
and the original Ateliê ERP lives under the `/atelie/*` submenu. Both share one
D1 database, one session-auth layer, and one vitest suite.

## Layered architecture

| Layer | Location | Rule |
| --- | --- | --- |
| Domain types | `src/domain/crm.ts`, `src/domain/*` | Plain types. Money is always integer **cents**. |
| Pure helpers | `src/domain/crmMath.ts` | Deterministic, no I/O, no DOM — unit-testable in isolation. |
| Server tables | `src/server/tables.ts` | `*_TABLE` name + `*_SHAPE` (`jsonFields`, `boolFields`). |
| Server CRUD | `src/server/crud.ts` | Generic `list/get/insert/update/delete` over table + shape. |
| Server DB interface | `src/server/db.ts` | Minimal `Database` (`prepare()` only). Depend on this, not `D1Database`, so `FakeD1` satisfies it. |
| Server auth | `src/server/auth.ts` | PBKDF2-SHA256 sessions in D1. |
| Server WAHA | `src/server/waha.ts` | Minimal WAHA REST client. Clock ceiling on every call; errors carry the HTTP status, never the response body. Testable with an injected `fetch`. |
| API routes | `src/pages/api/**` | Thin; delegate to `routeFactory` or auth helpers. |
| Repositories | `src/repositories/**` | Client data access implementing `IRepository<T>`. |
| Services | `src/services/**` | View orchestration (`CrmService`, feature services). |
| Views | `src/ui/views/**` | Imperative DOM built with `crmUi.ts` helpers. |
| Shell | `src/ui/{Sidebar,Router,main}.ts` | Nav groups, route map, legacy remaps. |
| Styles | `src/styles/global.css` | Single plain-CSS file; no Tailwind directives. |
| Tests | `tests/**` | Vitest; helpers in `tests/helpers/`. Type-checked separately by `tsconfig.tests.json` (`npm run check:tests`). |

## Non-negotiable conventions

- **Import depth from API routes.** CRM routes at `src/pages/api/crm/**` import
  `../../../../server/*`; top-level/ERP routes at `src/pages/api/**` import
  `../../../server/*`. Get this wrong and the build fails.
- **Route factories.** Prefer `createCollectionRoutes(table, shape)` → `{ GET, POST }`
  and `createItemRoutes(table, shape)` → `{ PUT, DELETE }` from
  `src/server/routeFactory.ts`. Hand-write only for auth or special logic
  (`src/pages/api/auth/*`, `src/pages/api/users/*`).
- **JSON / boolean columns** are declared once in the table shape
  (`jsonFields: ['tags']`, `boolFields: ['done','ativo']`); `src/server/mapping.ts`
  encodes/decodes. Never JSON.stringify by hand in a route.
- **Sessions are keyed by `token`, not `id`.** The `sessions` table's primary key
  is `token`. Always call `getEntity(db, SESSIONS_TABLE, SESSIONS_SHAPE, token, 'token')`
  and `deleteEntity(db, SESSIONS_TABLE, token, 'token')`. `crud.ts` accepts an
  optional `idColumn` (defaults to `'id'`) for exactly this case.
- **Take `Database`, not `D1Database`.** Server helpers type their `db` parameter
  as `Database` from `src/server/db.ts` (only `prepare()` is used). This keeps the
  layer testable with `FakeD1` and lets `getDb()` pass the real D1 binding through.
- **Tests have their own typecheck project.** Keep `tests/**` type-clean and run
  `npm run check:tests`; do not re-add `D1Database` to signatures just to satisfy a
  test double.
- **Auth entry points.** `userFromToken(db, request)` resolves a Bearer session to
  a user (or `null`). `publicUser(user)` strips `passwordHash` before any response.
- **Seed admin.** `admin@deskcomm.local` / `admin123` (PBKDF2-SHA256, 100k
  iterations, salt `deskcomm-seed-v1`). The hash lives in
  `migrations/0004_crm_seed.sql`.
- **Migrations & scripts.** `migrations/0001_init.sql` + `0003_crm.sql` +
  `0005_crm_features.sql` + `0007_waha.sql` + `0009_inbox_orders.sql` = schema;
  `0002_seed.sql` + `0004_crm_seed.sql` + `0006_crm_seed_features.sql` +
  `0008_order_history_seed.sql` + `0010_inbox_orders_seed.sql` +
  `0011_inbox_orders_chart_seed.sql` + `0012_inbox_month_chart_seed.sql` +
  `0013_abc_curve_seed.sql` = seeds.
  `db:migrate:*` runs 0001+0003+0005+0007+0009,
  `db:seed:*` runs 0002+0004+0006+0008+0010+0011+0012+0013. The D1 database
  name is `atelie_erp_db`;
  the binding is declared in `wrangler.toml` (replace the `database_id`
  placeholder after `wrangler d1 create atelie_erp_db`).
- **No new npm dependencies.** The app is framework-free: the SPA views are
  imperative DOM + plain CSS, and React/Radix/shadcn were removed entirely (see
  `tests/dependencies.test.ts`). `tailwindcss` + `@tailwindcss/vite` remain only
  as the CSS compiler; `astro`/`@astrojs/cloudflare` are the runtime. Reuse
  existing repositories/services via `src/state/AppContext.ts`.
- **Routing.** Register new views in `VIEW_BY_PATH` (`src/ui/main.ts`) and nav
  entries in `NAV_GROUPS` (`src/ui/Sidebar.ts`). Legacy flat ERP paths are remapped
  to `/atelie/*` through `LEGACY_TO_ATELIE`. The default route is `/`.

## Checklist: adding a feature

1. Extend the domain type + pure helpers.
2. Add table/shape in `src/server/tables.ts`; add migration SQL when the schema is new.
3. Add route files under `src/pages/api/crm/<feature>/{index,[id]}.ts` using the factories.
4. Add a repository, wire it into `AppContext` (`loadAll()` must hydrate it), and
   expose view-level logic through `CrmService` or a feature service.
5. Build the view in `src/ui/views/crm/<Feature>View.ts`, add the route + nav entry.
6. Add required classes/tokens to `src/styles/global.css`.
7. Add tests: pure helpers (`tests/domain`), service logic with
   `InMemoryRepository` (`tests/services`), route/auth with `FakeD1` + `userFromToken`
   (`tests/server`), client repos with a stubbed `fetch` (`tests/repositories`).
8. Run `/preflight` (typecheck + tests + build).

## Size rules (SOLID/DDD hygiene, enforced by `npm run check:style`)

Every function/method/constructor/arrow body is at most 25 lines; every source
line is at most 80 columns. `src/domain` is pure (imports nothing from this
repo); `src/services` orchestrate repositories only; views only `import type`
`AppContext`; tests import public symbols — so keep exported names/status codes
stable when splitting. Owners: `solid-refactor` (does the work), `style-guard`
(enforces the gate).

## Deliberately out of scope

Do not port these without an explicit request: the AI engine, voice, Google
OAuth, multi-tenant/`organization_id`, Sentry, Redis. The target is a
single-tenant, D1-only, local-auth app.

WAHA/WhatsApp **realtime** (webhooks, inbound ingest, agent send, session
start/stop, the WhatsApp UI) IS now ported — owns `waha-runtime`; the connection
test (`src/server/waha.ts` + `src/pages/api/whatsapp/health.ts`) is `waha-ops`.
Extend those through their owners, not by hand in a feature port.
