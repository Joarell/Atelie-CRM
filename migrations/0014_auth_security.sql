-- Auth security additions: audit trail + session housekeeping.
-- `auth_audit` records who did what (login success/failure, logout,
-- password changes, user CRUD) for the D1-only login app. The expiry index
-- backs the session purge that runs on each successful login.
-- Run with: npm run db:migrate:local  (or db:migrate:remote)

CREATE TABLE IF NOT EXISTS auth_audit (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_audit_user ON auth_audit(userId);
CREATE INDEX IF NOT EXISTS idx_auth_audit_created ON auth_audit(createdAt);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expiresAt);