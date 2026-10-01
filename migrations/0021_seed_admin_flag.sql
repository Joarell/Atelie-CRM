-- migrations/0021_seed_admin_flag.sql
-- Light the flag for the seeded admin, in every environment.
--
-- The guard is deliberately narrow: only the seeded row is touched, so an
-- operator who already created their own admin keeps a working account. The
-- statement is idempotent (a second run just rewrites 1 onto 1), which matters
-- because this migration runs on databases that never held the seed at all.

UPDATE users
SET mustChangePassword = 1
WHERE id = 'seed-user-admin';
