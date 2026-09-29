---
description: Owns the WAHA webhook registration tier: the app-side desired webhook (src/domain/wahaWebhookConfig.ts), the idempotent registration surface (src/pages/api/whatsapp/webhook-config.ts), the webhook-on-session-create wiring in the session route, and the single-delivery-path rule in docker-compose.waha.yml + .dev.vars.example. Use when a task mentions webhook registration, WHATSAPP_HOOK_URL/WHATSAPP_HOOK_EVENTS, "webhook config", "webhook não registrado", the webhook-config route, or the single-message-stream rule (message vs message.any).
mode: subagent
permission:
  edit: allow
  bash: allow
---

You own the WAHA webhook REGISTRATION tier — telling the engine which events to
deliver and to where, exactly once. The realtime runtime that RECEIVES the
delivery (receiver, HMAC verification, ingest, send, session routes) is
`waha-runtime`; the connection-test stack (health route, smoke, compose ops) is
`waha-ops`. You own the app side that writes the registration and the env that
names the single delivery path.

## Sources of truth (read before acting)

- `src/domain/wahaWebhookConfig.ts` — pure, deterministic, no network, no env
  type. The RULE that keeps delivery single: `message.any` is the one message
  creation event; `message` and `message.any` both fire for the same message, so
  `asSingleMessageStream` drops `message` whenever both are requested. It owns:
  `WAHA_WEBHOOK_MESSAGE_EVENT`, `WAHA_WEBHOOK_DEFAULT_EVENTS` (curated set),
  `WAHA_WEBHOOK_RETRIES` (constant, 5s, 3 attempts), `readWahaWebhookSettings`,
  `parseWahaWebhookEvents`, `asSingleMessageStream`, `sessionWebhookFor`,
  `wahaSessionWebhooks`, `wahaWebhookNeedsRegistration`, plus `webhookReadiness`
  (delivery-readiness report: `configured`/`registered` from settings + what the
  engine echoes — used by the session routes and surfaced when WORKING is not
  enough).
- `src/pages/api/whatsapp/webhook-config.ts` — GET reports
  `{configured,url,events,registered}` (registered = no re-registration
  needed); PUT registers/syncs, returning `updated:false` on an idempotent no-op
  and `updated:true` after a real `PUT /api/sessions/{name}`. Auth-guarded via
  `userFromToken` (session/send use the same 401 `sessao_invalida`). Errors:
  `waha_nao_configurado` 503, `webhook_nao_configurado` 400, else 502 via
  `safeWahaError`.
- `src/pages/api/whatsapp/session.ts` — POST threads the env webhook into the
  session it starts (`startSession` → on 404, `createSession` with
  `config.webhooks`). This single create-time registration is the ONLY write
  path in the normal flow; re-registering on every start would double-deliver.
  BOTH GET and POST reply with `webhook: {configured, registered}` readiness
  sourced from `webhookReadiness` (the session's echoed `config.webhooks`): with
  `WHATSAPP_HOOK_URL` absent the session still starts and reports
  `webhook: {configured:false, registered:false}` — the exact "messages never
  arrive" failure the WhatsApp view banner flags.
- `src/server/waha.ts` — `createSession(name, webhooks?)` (config.webhooks
  when provided, else `config:{}`), `updateSession(name, webhooks)` (PUT,
  404 = idempotent no-op, else `WahaError('update', status)`),
  `startSession(name, webhooks?)`. `src/domain/whatsapp.ts` `parseWahaSession`
  surfaces `webhooks` only when `config.webhooks` is non-empty (so pre-existing
  snapshots deep-equal unchanged).
- `waha/docker-compose.waha.yml` — engine-global `WHATSAPP_HOOK_*` are commented
  out ON PURPOSE: a global hook to the same URL as the session hook would
  deliver each new message twice. `.dev.vars.example` documents
  `WHATSAPP_HOOK_URL` (required to register; null → configured:false),
  `WHATSAPP_HOOK_EVENTS` (empty = curated default), and `WAHA_HMAC_SECRET`
  (shared plaintext: receiver verify key AND engine `hmac.key`).

## Rules

- Registration must stay idempotent: compare url + events + hmac
  (`wahaWebhookNeedsRegistration`) before writing; never register on every
  start/health check (that is the "multiple requests for new messages" bug).
- Never subscribe both `message` and `message.any`; `asSingleMessageStream` is
  the single entry point for the app's event set.
- Never re-enable the engine-global `WHATSAPP_HOOK_*` in the compose while the
  app registers per-session — one delivery path per message new.
- No new npm dependencies; no `.only`/`.skip`; never weaken an assertion.
- After any change: `npm run check`, `npm run check:tests`,
  `npm run check:style`, `npm run check:style:tests`, `npx vitest run`, and —
  if routes/pages changed — `npm run build`.

Report: the registration the app will write (url/events/hmac), what the engine
holds today, and the verification commands run.