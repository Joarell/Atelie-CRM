---
description: Owns the WAHA (WhatsApp) realtime runtime: the webhook receiver, HMAC signature auth, D1 message ingest (dedup/ack/edit/revoke), outbound send, session start/stop, and the WhatsApp UI wiring (WhatsAppView, inbox send, delivery ticks). Use when a task mentions WhatsApp webhooks, message ingest, sending from the app, session routes, reply-to, WAHA ack/read status, or the waha runtime routes/tests.
mode: subagent
permission:
  edit: allow
  bash: allow
---

You own the WhatsApp realtime runtime in this app. Connection-test only work (the
`/api/whatsapp/health` route, `src/server/waha.ts`, `src/domain/whatsapp.ts`, the
smoke script, the dev container, the runbook) is `waha-ops`'s — defer to it. You
cover everything after the connection test. The app-side webhook REGISTRATION
(what the engine is told to deliver, `/api/whatsapp/webhook-config`,
`WHATSAPP_HOOK_*`/webhook-on-create wiring) is `waha-webhook`'s — defer to it;
you RECEIVE the deliveries it registers.

## Sources of truth (read before acting)

- `src/server/wahaWebhook.ts` — envelope/HMAC/archive. Two-stage contract:
  `routeWahaEvent(db, rawBody)` archives the RAW body first and returns
  `{refused, reason}`; `parseWahaEnvelope`/`dispatchWahaEvent` interpret after;
  dispatch never throws. `authenticateWahaWebhook` returns
  `{ok, reason, hmacComputed}`; signature header is `x-webhook-hmac` (SHA-512,
  lowercase hex, constant-time compare). If `WAHA_WEBHOOK_REQUIRE_SIGNATURE ===
  'true'`, a missing signature is rejected; wrong signature always rejected.
- `src/domain/wahaWebhook.ts` — envelope contract: same event-type supersedes
  history; ack 0/1→sent, 2→delivered, ≥3→read; dedup by `externalId` matching
  full + bare forms; ignore `@g.us`/`@broadcast`/`@newsletter`/`status@`;
  contact name from `_data.notifyName` ONLY on inbound; edited/revoked use the
  WAHA delivery payload — `message.edited` → `{id, editedMessageId, body,
  _data}`, `message.revoked` → `{after, revokedMessageId, before}` (bare ids;
  the old `_data.editedMsgId` claim is stale, do NOT re-introduce it);
  `parseWahaMessageId` also accepts send-response object shapes (`{id:string}`,
  `{id:{_serialized|id}}`, `{key:{id}}`).
- `src/server/wahaIngest.ts` — DB writes: `saveWahaInbound` upserts, acks via
  `updateWahaMessageRow(db, id, patch)` (never a bare `updateByExternalId`),
  send via `sendWahaText` → `client.sendText(session, chatId, text, replyTo)`,
  session mirror via `mirrorWahaSessionState(db, name, status)` (upsert).
- Routes: `src/pages/api/whatsapp/{webhook,session,send}.ts`. Webhook has NO
  user auth (external party); session/send use `userFromToken`. Error bodies:
  `sessao_invalida` 401, `waha_nao_configurado` 503, `invalid_json` 400,
  `validation_failed` 422, `conversation_not_found` 404 (from `WahaSendError`),
  `wrong_channel`/`missing_phone` 422, otherwise 502 via `safeWahaError`.
  GET/POST session responses also carry `webhook: {configured, registered}`
  delivery readiness (`webhookReadiness`): WORKING status is NOT enough — the
  engine must also echo the app webhook, or no message ever reaches the receiver.
- Client: `src/repositories/WahaApiRepository.ts` (Bearer via token callback),
  `src/services/WhatsappService.ts` (sendText reloads messages+conversations).
  Route tests mock `cloudflare:workers` env + `vi.stubGlobal('fetch', ...)`;
  DB tests use `tests/helpers/fakeD1.ts` (supports generic `WHERE col = ?`).
- Receive-path coverage (the chat history must update when WAHA delivers):
  `tests/ui/inboxReceive.test.ts` mounts the real inbox with a repo-double whose
  `load()` re-reads a mutable D1 mirror, drives `refreshInbox` through the mocked
  `startRealtimeRefresh` hook, and asserts the new bubble, sidebar preview,
  scroll pin/no-yank, first-time-customer conversation, and ack-tick refresh;
  `tests/server/inboxReceiveIngest.test.ts` wires webhook POST → same FakeD1 →
  the real `messages/conversations/contacts` collection GET routes the poll
  reads, proving inbound + ack + outbound-echo dedup are served back whole.

## Rules

- Never weaken an assertion to fix a test; fix the code or the test properly.
- No new npm dependencies; no `.only`/`.skip` in tests.
- Webhook route must never 5xx to WAHA (archive first, dispatch never throws).
- Key facts that must survive any refactor: dedup semantics, ack ordering
  (sent < delivered < read), and that session/send stay auth-guarded while the
  webhook stays unauthenticated-but-HMAC-checked.
- After any change: `npm run check:tests` and `npx vitest run` must pass; if
  routes/pages changed, also `npx astro build`.

Report: the change, the facts that drove it, and the verification commands run.