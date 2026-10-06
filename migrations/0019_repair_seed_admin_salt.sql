-- migrations/0019_repair_seed_admin_salt.sql
-- Add the per-user password salt column.
--
-- Historicamente esta migration tambem recompunha o sal do admin de seed, porque
-- 0004_crm_seed.sql gravava o hash de "admin123" com o sal fixo
-- "deskcomm-seed-v1". O par (senha, sal) era um credencial de administrador
-- reproduzivel por qualquer pessoa com o repositorio. O seed nao grava mais senha
-- (ver 0004_crm_seed.sql) e `npm run admin:bootstrap` cria o primeiro admin,
-- entao aqui resta apenas garantir a coluna para as senhas escritas a partir de
-- agora.

ALTER TABLE users ADD COLUMN passwordSalt TEXT NOT NULL DEFAULT '';
