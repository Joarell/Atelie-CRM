-- migrations/0019_repair_seed_admin_salt.sql
-- Restore the seeded admin's password salt.
--
-- 0004_crm_seed.sql stores the PBKDF2 hash of "admin123" computed with the
-- salt "deskcomm-seed-v1". Databases seeded before that salt existed kept an
-- empty passwordSalt while the stored hash still used it, so verifyPassword()
-- recomputed the digest with "" and the seed admin could not log in at all.
--
-- The column itself was never added by any earlier migration, so this file
-- adds it (defaulting to '') and then backfills the seed row. The guard is
-- deliberately narrow: it only rewrites the seed admin while the salt is empty
-- AND the hash is the known seed hash. An admin who already changed their
-- password has a random salt and is never touched, and the statement is
-- idempotent (a second run matches zero rows).

ALTER TABLE users ADD COLUMN passwordSalt TEXT NOT NULL DEFAULT '';

UPDATE users
SET passwordSalt = 'deskcomm-seed-v1'
WHERE id = 'seed-user-admin'
  AND passwordSalt = ''
  AND passwordHash = '022d504d3b3433f2cde7ac9185a4e1d340e67ed70a943dbc4ef14bf8c3174a00';
