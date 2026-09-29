-- DeskcommCRM feature rolls ported on top of the CRM core (single-tenant,
-- D1): the activities bus (crm_lead_activities), conversation notes and
-- snooze, a centralized tag vocabulary, appointment types for the agenda,
-- plus new columns (deals.nextActionAt, conversations.snoozedUntil and
-- calendar_events.remindBeforeMin) that back the risk and reminder views.
-- Schema only — seed data lives in 0006_crm_seed_features.sql.
-- Run with: npm run db:migrate:local  (or db:migrate:remote)

ALTER TABLE deals ADD COLUMN nextActionAt TEXT NOT NULL DEFAULT '';
ALTER TABLE conversations ADD COLUMN snoozedUntil TEXT NOT NULL DEFAULT '';
ALTER TABLE calendar_events ADD COLUMN remindBeforeMin INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS crm_lead_activities (
  id TEXT PRIMARY KEY,
  contactId TEXT NOT NULL DEFAULT '',
  dealId TEXT NOT NULL DEFAULT '',
  actorKind TEXT NOT NULL DEFAULT 'user',
  actorUserId TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_contact ON crm_lead_activities(contactId);
CREATE INDEX IF NOT EXISTS idx_activities_deal ON crm_lead_activities(dealId);
CREATE INDEX IF NOT EXISTS idx_activities_date ON crm_lead_activities(createdAt);

CREATE TABLE IF NOT EXISTS conversation_notes (
  id TEXT PRIMARY KEY,
  conversationId TEXT NOT NULL,
  body TEXT NOT NULL,
  authorUserId TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_conversation ON conversation_notes(conversationId);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT 'caramel',
  ativo INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

CREATE TABLE IF NOT EXISTS appointment_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  durationMin INTEGER NOT NULL DEFAULT 60,
  color TEXT NOT NULL DEFAULT '',
  ativo INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);