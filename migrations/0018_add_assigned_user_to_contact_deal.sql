-- migrations/0018_add_assigned_user_to_contact_deal.sql
-- Add assignedUserId to contacts and deals for LGPD data access tracking.
--
-- ONE-SHOT: SQLite has no `ADD COLUMN IF NOT EXISTS`, so re-running this
-- file on a database that already has the column fails with
-- "duplicate column name: assignedUserId" and writes nothing. That is
-- harmless here (the indexes below are `IF NOT EXISTS`, and this file is
-- last in the chain) but the npm script exits non-zero. Only run it when
-- bootstrapping a database that predates this file. Same convention as
-- 0005/0007/0009, which also carry plain ALTER TABLE statements.

ALTER TABLE contacts ADD COLUMN assignedUserId TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_user ON contacts(assignedUserId);

ALTER TABLE deals ADD COLUMN assignedUserId TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_deals_assigned_user ON deals(assignedUserId);