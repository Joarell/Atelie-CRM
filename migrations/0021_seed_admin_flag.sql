-- migrations/0021_seed_admin_flag.sql
-- Keep the column's default at 0 for every pre-existing user: nobody is locked
-- out of the API by this migration.
--
-- A flag do admin de seed nao e mais ligada aqui. O par (senha "admin123", sal
-- "deskcomm-seed-v1") deixou de existir — 0004_crm_seed.sql nao grava mais senha e
-- `npm run admin:bootstrap` cria o primeiro admin com senha aleatoria de uso
-- unico, ja com `mustChangePassword = 1`. Nao ha linha `seed-user-admin` para
-- marcar.
--
-- O `SELECT 1` e' obrigatorio, nao decorativo: `wrangler d1 execute --file`
-- rejeita um arquivo sem nenhuma declaracao executavel ("SQL code did not
-- contain a statement") e os scripts `db:migrate:*` / `db:seed:*` sao encadeados
-- com `&&`. Sem esta linha o seed aborta em 0021 e 0022/0023/0024/0025 nunca
-- rodam — foi exatamente o que quebrou o bootstrap do banco local. Ele nao
-- escreve nada: existe so para que o arquivo seja um arquivo valido.

SELECT 1;
