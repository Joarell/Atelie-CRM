-- DeskcommCRM (migrated to Astro + Cloudflare D1) — core product schema.
-- Single-tenant: no organization_id; lightweight sessions in D1; money in
-- integer cents. Nested arrays (contacts.tags) stored as JSON text.
-- Run with: npm run db:migrate:local  (or db:migrate:remote)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  expiresAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(userId);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pipelines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  isDefault INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id TEXT PRIMARY KEY,
  pipelineId TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_stages_pipeline ON pipeline_stages(pipelineId);

CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  pipelineId TEXT NOT NULL,
  stageId TEXT NOT NULL,
  contactId TEXT NOT NULL,
  title TEXT NOT NULL,
  valueCents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  lostReason TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stageId);
CREATE INDEX IF NOT EXISTS idx_deals_contact ON deals(contactId);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  dueAt TEXT NOT NULL DEFAULT '',
  assigneeUserId TEXT NOT NULL DEFAULT '',
  contactId TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(dueAt);

CREATE TABLE IF NOT EXISTS quick_replies (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  shortcut TEXT NOT NULL DEFAULT '',
  createdBy TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  contactId TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  startsAt TEXT NOT NULL,
  endsAt TEXT NOT NULL DEFAULT '',
  eventType TEXT NOT NULL DEFAULT '',
  createdBy TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_start ON calendar_events(startsAt);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  contactId TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  channelPhone TEXT NOT NULL DEFAULT '',
  lastMessageAt TEXT NOT NULL DEFAULT '',
  assignedUserId TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contactId);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversationId TEXT NOT NULL,
  direction TEXT NOT NULL,
  text TEXT NOT NULL,
  createdBy TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversationId);

CREATE TABLE IF NOT EXISTS catalog_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priceCents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  ativo INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);