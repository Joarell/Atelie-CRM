-- Inbox charts seed: the third chart, "Pedidos do mês", aggregates EVERY
-- order whose createdAt falls in the current calendar month (bar per day with
-- orders). Unlike the static seeds (0008/0010/0011) its bars must exist the
-- day it runs, so dates here are RELATIVE to `now` (SQLite date arithmetic):
--   • current month   — a spread of days 1..27 across Ana/Carla/Bruno so the
--     month chart renders many bars with different heights on a fresh DB;
--   • today           — one order created right now, so the "current" day is
--     always present;
--   • prior month     — feeds the period chart's Mês view and the yearly
--     chart's neighbouring bands;
--   • same month a year ago — gives the yearly ("Pedidos por ano") chart a
--     second-year band for the open-contact comparison.
-- Unique ids derive from the computed dates, so re-running in a later month
-- seeds fresh rows instead of colliding. Run with:
--   npm run db:seed:local   (or db:seed:remote)

-- Current month: one order per row, scattered days + varied hours. D1's SQLite
-- caps compound SELECT terms, so rows are split into small INSERTs (<=4 terms).

-- Days 1..4
INSERT OR IGNORE INTO orders (
  id, customerId, customerName, lines, deliveryDate, status,
  paymentStatus, notes, stockDeducted, createdAt
)
SELECT
  'seed-month-' || date('now', 'start of month', '+' || p.d || ' days'),
  p.customerId, p.customerName, p.lines,
  date('now', 'start of month', '+' || p.d || ' days', '+3 days'),
  p.status, p.paymentStatus, p.notes, 0,
  strftime('%Y-%m-%dT%H:%M:%fZ',
    datetime('now', 'start of month', '+' || p.d || ' days',
      '+' || p.h || ' hours'))
FROM (
  SELECT 1 AS d, 9 AS h, 'seed-customer-ana' AS customerId,
    'Ana Beatriz' AS customerName,
    '[{"productId":"seed-cat-docinhos","productName":"Docinhos (centena)","qty":2,"unitPrice":130}]' AS lines,
    'entregue' AS status, 'pago' AS paymentStatus, 'Retirada na loja.' AS notes
  UNION ALL SELECT 1, 14, 'seed-customer-carla', 'Carla Menezes',
    '[{"productId":"seed-cat-bolo-limao","productName":"Bolo de limão","qty":1,"unitPrice":89.9}]',
    'entregue', 'pago', 'Pedido pelo WhatsApp.'
  UNION ALL SELECT 2, 10, 'seed-customer-bruno', 'Bruno Alves',
    '[{"productId":"seed-cat-docinhos","productName":"Docinhos (centena)","qty":3,"unitPrice":130}]',
    'producao', 'a_pagar', 'Aniversário da mãe.'
  UNION ALL SELECT 4, 15, 'seed-customer-ana', 'Ana Beatriz',
    '[{"productId":"seed-cat-bolo-casamento","productName":"Bolo de casamento (2 andares)","qty":1,"unitPrice":650}]',
    'pendente', 'a_pagar', 'Casamento da irmã.'
) AS p;

-- Days 6..12
INSERT OR IGNORE INTO orders (
  id, customerId, customerName, lines, deliveryDate, status,
  paymentStatus, notes, stockDeducted, createdAt
)
SELECT
  'seed-month-' || date('now', 'start of month', '+' || p.d || ' days'),
  p.customerId, p.customerName, p.lines,
  date('now', 'start of month', '+' || p.d || ' days', '+3 days'),
  p.status, p.paymentStatus, p.notes, 0,
  strftime('%Y-%m-%dT%H:%M:%fZ',
    datetime('now', 'start of month', '+' || p.d || ' days',
      '+' || p.h || ' hours'))
FROM (
  SELECT 6 AS d, 9 AS h, 'seed-customer-carla' AS customerId,
    'Carla Menezes' AS customerName,
    '[{"productId":"seed-cat-docinhos","productName":"Docinhos (centena)","qty":2,"unitPrice":130}]' AS lines,
    'entregue' AS status, 'pago' AS paymentStatus, 'Festa do filho.' AS notes
  UNION ALL SELECT 6, 18, 'seed-customer-bruno', 'Bruno Alves',
    '[{"productId":"seed-cat-bolo-limao","productName":"Bolo de limão","qty":2,"unitPrice":89.9}]',
    'entregue', 'pago', 'Encomenda do trabalho.'
  UNION ALL SELECT 9, 11, 'seed-customer-ana', 'Ana Beatriz',
    '[{"productId":"seed-cat-bolo-limao","productName":"Bolo de limão","qty":1,"unitPrice":89.9}]',
    'pronto', 'a_pagar', 'Retirada no sábado.'
  UNION ALL SELECT 12, 16, 'seed-customer-carla', 'Carla Menezes',
    '[{"productId":"seed-cat-bolo-casamento","productName":"Bolo de casamento (2 andares)","qty":1,"unitPrice":650}]',
    'cancelado', 'a_pagar', 'Noiva desmarcou.'
) AS p;

-- Days 15..21
INSERT OR IGNORE INTO orders (
  id, customerId, customerName, lines, deliveryDate, status,
  paymentStatus, notes, stockDeducted, createdAt
)
SELECT
  'seed-month-' || date('now', 'start of month', '+' || p.d || ' days'),
  p.customerId, p.customerName, p.lines,
  date('now', 'start of month', '+' || p.d || ' days', '+3 days'),
  p.status, p.paymentStatus, p.notes, 0,
  strftime('%Y-%m-%dT%H:%M:%fZ',
    datetime('now', 'start of month', '+' || p.d || ' days',
      '+' || p.h || ' hours'))
FROM (
  SELECT 15 AS d, 10 AS h, 'seed-customer-bruno' AS customerId,
    'Bruno Alves' AS customerName,
    '[{"productId":"seed-cat-docinhos","productName":"Docinhos (centena)","qty":4,"unitPrice":130}]' AS lines,
    'entregue' AS status, 'pago' AS paymentStatus, 'Confirmação.' AS notes
  UNION ALL SELECT 18, 13, 'seed-customer-ana', 'Ana Beatriz',
    '[{"productId":"seed-cat-docinhos","productName":"Docinhos (centena)","qty":2,"unitPrice":130}]',
    'producao', 'a_pagar', 'Pagamento no WhatsApp.'
  UNION ALL SELECT 21, 9, 'seed-customer-carla', 'Carla Menezes',
    '[{"productId":"seed-cat-bolo-limao","productName":"Bolo de limão","qty":1,"unitPrice":89.9}]',
    'entregue', 'pago', 'Retirada na loja.'
  UNION ALL SELECT 21, 17, 'seed-customer-bruno', 'Bruno Alves',
    '[{"productId":"seed-cat-bolo-limao","productName":"Bolo de limão","qty":1,"unitPrice":89.9}]',
    'pendente', 'a_pagar', 'Chá de bebê.'
) AS p;

-- Days 24..27
INSERT OR IGNORE INTO orders (
  id, customerId, customerName, lines, deliveryDate, status,
  paymentStatus, notes, stockDeducted, createdAt
)
SELECT
  'seed-month-' || date('now', 'start of month', '+' || p.d || ' days'),
  p.customerId, p.customerName, p.lines,
  date('now', 'start of month', '+' || p.d || ' days', '+3 days'),
  p.status, p.paymentStatus, p.notes, 0,
  strftime('%Y-%m-%dT%H:%M:%fZ',
    datetime('now', 'start of month', '+' || p.d || ' days',
      '+' || p.h || ' hours'))
FROM (
  SELECT 24 AS d, 12 AS h, 'seed-customer-ana' AS customerId,
    'Ana Beatriz' AS customerName,
    '[{"productId":"seed-cat-bolo-casamento","productName":"Bolo de casamento (2 andares)","qty":1,"unitPrice":650}]' AS lines,
    'entregue' AS status, 'pago' AS paymentStatus, 'Casamento do primo.' AS notes
  UNION ALL SELECT 27, 10, 'seed-customer-carla', 'Carla Menezes',
    '[{"productId":"seed-cat-docinhos","productName":"Docinhos (centena)","qty":3,"unitPrice":130}]',
    'entregue', 'pago', 'Festa de aniversário.'
) AS p;

-- Today: one fresh order so the "current" day always has a bar.
INSERT OR IGNORE INTO orders (
  id, customerId, customerName, lines, deliveryDate, status,
  paymentStatus, notes, stockDeducted, createdAt
)
SELECT
  'seed-month-now-' || date('now'),
  'seed-customer-bruno', 'Bruno Alves',
  '[{"productId":"seed-cat-bolo-limao","productName":"Bolo de limão","qty":2,"unitPrice":89.9}]',
  date('now', '+3 days'), 'pendente', 'a_pagar', 'Chegou hoje pelo WhatsApp.', 0,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

-- Prior month: feeds the period chart (Mês view) for the neighbouring bucket.
INSERT OR IGNORE INTO orders (
  id, customerId, customerName, lines, deliveryDate, status,
  paymentStatus, notes, stockDeducted, createdAt
)
SELECT
  'seed-month-prev-' || date('now', '-1 month', 'start of month', '+12 days'),
  'seed-customer-ana', 'Ana Beatriz',
  '[{"productId":"seed-cat-bolo-limao","productName":"Bolo de limão","qty":1,"unitPrice":89.9}]',
  date('now', '-1 month', 'start of month', '+15 days'),
  'entregue', 'pago', 'Pedido do mês passado.', 0,
  strftime('%Y-%m-%dT%H:%M:%fZ',
    datetime('now', '-1 month', 'start of month', '+12 days', '+10 hours'));

-- Same month, one year ago: a second band for the yearly chart.
INSERT OR IGNORE INTO orders (
  id, customerId, customerName, lines, deliveryDate, status,
  paymentStatus, notes, stockDeducted, createdAt
)
SELECT
  'seed-month-1y-' || date('now', '-1 year', 'start of month', '+3 days'),
  'seed-customer-bruno', 'Bruno Alves',
  '[{"productId":"seed-cat-docinhos","productName":"Docinhos (centena)","qty":1,"unitPrice":130}]',
  date('now', '-1 year', 'start of month', '+3 days', '+20 days'),
  'entregue', 'pago', 'Mesmo mês no ano passado.', 0,
  strftime('%Y-%m-%dT%H:%M:%fZ',
    datetime('now', '-1 year', 'start of month', '+3 days', '+9 hours'));