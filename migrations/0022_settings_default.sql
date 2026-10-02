-- migrations/0022_settings_default.sql
-- A linha `global` de settings passa a nascer na migration, porque `GET
-- /api/settings` deixou de escrever: antes, um GET em um banco sem configuracao
-- fazia INSERT, ou seja, um read mudava estado (e uma transacao de leitura
-- escrevia em uma base possivelmente somente-leitura).
--
-- As colunas sao exatamente as de migrations/0001_init.sql; a tabela ja existe
-- nesse ponto, entao nao ha CREATE aqui. Um banco novo que roda todas as
-- migrations ainda recebe a linha pelo INSERT OR IGNORE.
INSERT OR IGNORE INTO settings (
  id, salary, daysPerMonth, hoursPerDay,
  rent, energy, water, internet, office, mei,
  variablePercent, defaultMarkupPercent
) VALUES (
  'global', 1800, 24, 8,
  800, 250, 90, 120, 60, 76,
  10, 70
);
