-- migrations/0017_rate_limits.sql
-- Persistent rate limiting for LGPD security (Art. 46)

CREATE TABLE IF NOT EXISTS rate_limits (
  id TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  resetAt INTEGER NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(resetAt);