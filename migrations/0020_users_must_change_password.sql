-- migrations/0020_users_must_change_password.sql
-- Flag that closes the API until the holder rotates the credential.
--
-- The admin created by 0004_crm_seed.sql ships with a password documented in
-- the repository, so every deployment starts with a login that anyone can
-- replay. This flag turns that login into a dead end: the session is valid but
-- the middleware answers 403 `troca_de_senha_obrigatoria` for everything
-- outside the password-change allowlist.
--
-- Default 0 so every pre-existing user keeps working; 0021 turns it on for the
-- seed admin alone.

ALTER TABLE users ADD COLUMN mustChangePassword INTEGER NOT NULL DEFAULT 0;
