-- migrations/0015_action_logs.sql
-- Per-client action log table for tracing critical user actions.
-- Each client gets their own partition via clientId for isolation.

CREATE TABLE IF NOT EXISTS action_logs (
  id TEXT PRIMARY KEY,
  clientId TEXT NOT NULL,
  userId TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  metadata TEXT,  -- JSON string for flexible extra data
  ip TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_action_logs_client
  ON action_logs(clientId, createdAt DESC);

CREATE INDEX IF NOT EXISTS idx_action_logs_user
  ON action_logs(userId, createdAt DESC);

CREATE INDEX IF NOT EXISTS idx_action_logs_action
  ON action_logs(action, createdAt DESC);