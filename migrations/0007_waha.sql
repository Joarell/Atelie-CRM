-- WhatsApp/WAHA engine (migrated integration) — messages/conversations grow
-- the fields the webhook and the send path need, plus the two WAHA-only tables
-- (session mirror + raw webhook archive).
-- Single-tenant, D1. Run with: npm run db:migrate:local (or db:migrate:remote)

-- Messages: WhatsApp metadata. All new columns have defaults so the generic
-- CRM insert path (id, conversationId, direction, text, createdBy, createdAt)
-- keeps working unmodified.
ALTER TABLE messages ADD COLUMN externalId TEXT;
ALTER TABLE messages ADD COLUMN ack INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN waStatus TEXT NOT NULL DEFAULT 'sent';
ALTER TABLE messages ADD COLUMN messageType TEXT NOT NULL DEFAULT 'text';
ALTER TABLE messages ADD COLUMN mediaUrl TEXT NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN mediaMime TEXT NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN remoteJid TEXT NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN fromMe INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN waTimestamp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN editedAt TEXT NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN revokedAt TEXT NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN deliveredAt TEXT NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN readAt TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external ON messages(externalId) WHERE externalId IS NOT NULL;

-- Conversations: remote WAHA chat identity, so a webhook always lands on the
-- same conversation (and the send path knows the exact jid of the peer).
ALTER TABLE conversations ADD COLUMN remoteId TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_remote ON conversations(remoteId) WHERE remoteId IS NOT NULL;

-- Sparse mirror of the WAHA session state (single `default` session): lets the
-- app answer status/QR reads fast without a live probe of the engine.
CREATE TABLE IF NOT EXISTS waha_sessions (
  name TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  lastCheckAt TEXT NOT NULL DEFAULT '',
  lastChangeAt TEXT NOT NULL DEFAULT ''
);

-- Raw webhook archive: every event is stored BEFORE it is interpreted, so a
-- payload outside the contract is not lost and can be replayed/diagnosed.
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  eventType TEXT NOT NULL,
  session TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}',
  receivedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received ON webhook_events(receivedAt);