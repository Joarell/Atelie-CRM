-- migrations/0016_consents.sql
-- Consent management for LGPD compliance (Art. 7, 8, 9)
-- Tracks granular consent per subject (user/contact) and purpose

CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  subjectId TEXT NOT NULL,
  subjectType TEXT NOT NULL CHECK (subjectType IN ('user', 'contact')),
  purposes TEXT NOT NULL DEFAULT '[]', -- JSON array of purpose strings
  lawfulBasis TEXT NOT NULL CHECK (lawfulBasis IN ('consent', 'contract', 'legal_obligation', 'legitimate_interest', 'vital_interest', 'public_task')),
  status TEXT NOT NULL DEFAULT 'granted' CHECK (status IN ('granted', 'withdrawn', 'expired')),
  grantedAt TEXT NOT NULL,
  withdrawnAt TEXT,
  expiresAt TEXT,
  ip TEXT,
  userAgent TEXT,
  version TEXT NOT NULL DEFAULT '1.0',
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_consents_subject ON consents(subjectId, subjectType);
CREATE INDEX IF NOT EXISTS idx_consents_purpose ON consents(purposes);
CREATE INDEX IF NOT EXISTS idx_consents_status ON consents(status);