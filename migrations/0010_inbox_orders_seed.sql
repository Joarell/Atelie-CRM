-- Inbox "Novo pedido" seed: the Ateliê `products` table is otherwise empty
-- in a fresh DB, but the composer loads its picker from the "Produtos" menu
-- (ProductsView + /api/products). This seeds the three catalog products the
-- history seed (0008) already referenced by id — with a cost model that
-- prices them — plus one inbox-sourced (`createdFrom='inbox'`) order for
-- Ana Beatriz that is the newest of her history, proving the LIFO
-- "composer -> history updated" flow in a fresh DB. Its second line carries
-- a quantity counter (2× Docinhos at R$ 130) so the composer's
-- qty × unit-price subtotal math (2 × 130 + 89,9 = 349,9) is pinned by a
-- persisted seed, not only by unit tests.
-- Run with: npm run db:seed:local  (or db:seed:remote)

INSERT OR IGNORE INTO products (
  id, name, category, yieldUnits, prepTime, labor, fixedExpenses,
  variablePercent, markupPercent, items
) VALUES
  ('seed-cat-docinhos', 'Docinhos (centena)', 'Doces', 1, 60,
   '{"salary":1800,"daysPerMonth":24,"hoursPerDay":8}',
   '{"rent":800,"energy":250,"water":90,"internet":120,"office":60,"mei":76}',
   10, 70,
   '[{"kind":"ingredient","refId":"seed-leite-condensado","qty":395},{"kind":"ingredient","refId":"seed-creme-de-leite","qty":200},{"kind":"ingredient","refId":"seed-biscoito-maisena","qty":400},{"kind":"ingredient","refId":"seed-manteiga","qty":60}]'),
  ('seed-cat-bolo-limao', 'Bolo de limão', 'Bolos', 1, 90,
   '{"salary":1800,"daysPerMonth":24,"hoursPerDay":8}',
   '{"rent":800,"energy":250,"water":90,"internet":120,"office":60,"mei":76}',
   10, 70,
   '[{"kind":"ingredient","refId":"seed-suco-de-limao","qty":250},{"kind":"ingredient","refId":"seed-manteiga","qty":200},{"kind":"ingredient","refId":"seed-leite-condensado","qty":395},{"kind":"ingredient","refId":"seed-creme-de-leite","qty":200}]'),
  ('seed-cat-bolo-casamento', 'Bolo de casamento (2 andares)', 'Bolos', 1, 600,
   '{"salary":1800,"daysPerMonth":24,"hoursPerDay":8}',
   '{"rent":800,"energy":250,"water":90,"internet":120,"office":60,"mei":76}',
   10, 70,
   '[{"kind":"ingredient","refId":"seed-manteiga","qty":400},{"kind":"ingredient","refId":"seed-leite-condensado","qty":790},{"kind":"ingredient","refId":"seed-creme-de-leite","qty":400},{"kind":"ingredient","refId":"seed-biscoito-maisena","qty":400},{"kind":"ingredient","refId":"seed-chantilly","qty":1000}]');

INSERT OR IGNORE INTO orders (
  id, customerId, customerName, lines, deliveryDate, status,
  paymentStatus, notes, stockDeducted, createdFrom, createdAt
) VALUES (
  'seed-order-ana-3', 'seed-customer-ana', 'Ana Beatriz',
  '[{"productId":"seed-cat-docinhos","productName":"Docinhos (centena)","qty":2,"unitPrice":130},{"productId":"seed-cat-bolo-limao","productName":"Bolo de limão","qty":1,"unitPrice":89.9}]',
  '2026-02-24', 'pendente', 'a_pagar',
  'Pedido aberto pelo inbox.', 0, 'inbox',
  '2026-02-20T14:30:00.000Z'
);