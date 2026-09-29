-- Optional starter data, equivalent to the old client-side seedData.ts.
-- Run with: npm run db:seed:local  (or db:seed:remote)

INSERT OR IGNORE INTO settings (
  id, salary, daysPerMonth, hoursPerDay, rent, energy, water, internet, office, mei, variablePercent, defaultMarkupPercent
) VALUES (
  'global', 1800, 24, 8, 800, 250, 90, 120, 60, 76, 10, 70
);

INSERT OR IGNORE INTO ingredients (id, name, unit, packageSize, packagePrice, stock, minStock) VALUES
  ('seed-biscoito-maisena', 'Biscoito maisena', 'g', 400, 7.5, 2000, 400),
  ('seed-manteiga', 'Manteiga', 'g', 200, 9.9, 1000, 200),
  ('seed-leite-condensado', 'Leite condensado', 'g', 395, 6.2, 3160, 395),
  ('seed-creme-de-leite', 'Creme de leite', 'g', 200, 3.8, 1600, 400),
  ('seed-suco-de-limao', 'Suco de limão', 'ml', 500, 8.0, 500, 250),
  ('seed-chantilly', 'Chantilly', 'g', 1000, 24.9, 2000, 500);
