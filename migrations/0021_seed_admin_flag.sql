-- migrations/0021_seed_admin_flag.sql
-- Keep the column's default at 0 for every pre-existing user: nobody is locked
-- out of the API by this migration.
--
-- A flag do admin de seed nao e mais ligada aqui. O par (senha "admin123", sal
-- "deskcomm-seed-v1") deixou de existir — 0004_crm_seed.sql nao grava mais senha e
-- 0023_admin_bootstrap cria o primeiro admin com senha aleatoria de uso unico,
-- ja com `mustChangePassword = 1`. Nao ha mais linha `seed-user-admin` para marcar.

-- (nenhuma escrita: a coluna ja nasce com DEFAULT 0 em 0020)
