-- migrations/0023_owner_columns.sql
-- Add assignedUserId to the four CRM work tables that had no owner column,
-- so routeFactory can fail closed on an empty owner instead of allowing the
-- write (feature security-audit-fixes-v3, US-324).
--
-- ONE-SHOT COLUMNS: SQLite has no `ADD COLUMN IF NOT EXISTS`, so re-running
-- the ALTER statements below on a database that already has the columns fails
-- with "duplicate column name" and writes nothing. The indexes and the
-- backfill are idempotent and safe to re-run. Same convention as 0005/0007/
-- 0009/0018, which also carry plain ALTER TABLE statements.
--
-- IDEMPOTENT BACKFILL: each UPDATE is guarded by `assignedUserId = ''`, so
-- running it again never overwrites an owner that is already filled. Every
-- statement is a no-op when there is nothing to derive.

ALTER TABLE calendar_events ADD COLUMN assignedUserId TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_calendar_events_assigned_user
  ON calendar_events(assignedUserId);

ALTER TABLE catalog_products ADD COLUMN assignedUserId TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_catalog_products_assigned_user
  ON catalog_products(assignedUserId);

ALTER TABLE crm_lead_activities ADD COLUMN assignedUserId TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_crm_lead_activities_assigned_user
  ON crm_lead_activities(assignedUserId);

ALTER TABLE conversation_notes ADD COLUMN assignedUserId TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_conversation_notes_assigned_user
  ON conversation_notes(assignedUserId);

-- Backfill: each work table has its own author column, so the owner is derived
-- rather than invented. Rows whose author is itself empty stay empty on
-- purpose: an empty owner is what makes routeFactory fail closed (AC-359).
UPDATE calendar_events
  SET assignedUserId = createdBy
  WHERE assignedUserId = '' AND createdBy <> '';

UPDATE crm_lead_activities
  SET assignedUserId = actorUserId
  WHERE assignedUserId = '' AND actorUserId <> '';

UPDATE conversation_notes
  SET assignedUserId = authorUserId
  WHERE assignedUserId = '' AND authorUserId <> '';

-- catalog_products has no author column, so it falls back to the oldest admin
-- (assumption ASM-206). EXISTS keeps this a no-op on an empty users table, so
-- the subquery never yields NULL and the column is never set to empty.
UPDATE catalog_products
  SET assignedUserId = (
    SELECT id FROM users WHERE role = 'admin'
    ORDER BY createdAt ASC, id ASC LIMIT 1
  )
  WHERE assignedUserId = ''
    AND EXISTS (SELECT 1 FROM users WHERE role = 'admin');