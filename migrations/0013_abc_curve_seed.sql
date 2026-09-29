-- ABC curve seed: the inbox's first chart, "Curva ABC", ranks a contact's
-- orders by BRL value and folds the cumulative share; the five orders below
-- give Ana Beatriz (seed-customer-ana) the cleanest possible split at the
-- 80/95 boundaries so the A/B/C bands are distinct on a fresh DB:
--   650 + 650 + 130 + 130 + 89.9 = 1649.9
--   p1/p2 → 78.79%          : Classe A (2 pedidos)
--   p3/p4 → 94.55%          : Classe B (2 pedidos)
--   p5    → 100%            : Classe C (1 pedido)
-- Unlike 0012's relative dates, these carry static createdAt weekdays spread
-- over 2024–2026 so the curve's x-label and tooltip dates stay stable. They
-- intentionally reuse the same products as the other inbox seeds (their
-- catalog ids are resolved in sqlite/seed.ts). Run with:
--   npm run db:seed:local   (or db:seed:remote)

-- Four biggest orders first (D1's SQLite caps compound SELECT terms).
INSERT OR IGNORE INTO orders (
  id, customerId, customerName, lines, deliveryDate, status,
  paymentStatus, notes, stockDeducted, createdAt
)
SELECT * FROM (
  SELECT 'seed-abc-casamento-1' AS id,
    'seed-customer-ana' AS customerId, 'Ana Beatriz' AS customerName,
    '[{"productId":"seed-cat-bolo-casamento","productName":"Bolo de casamento (2 andares)","qty":1,"unitPrice":650}]',
    '2024-03-16', 'entregue', 'pago', 'Casamento da prima.', 0,
    '2024-03-05T10:00:00.000Z'
  UNION ALL SELECT 'seed-abc-casamento-2',
    'seed-customer-ana', 'Ana Beatriz',
    '[{"productId":"seed-cat-bolo-casamento","productName":"Bolo de casamento (2 andares)","qty":1,"unitPrice":650}]',
    '2024-09-21', 'entregue', 'pago', 'Casamento do primo em setembro.', 0,
    '2024-09-09T09:30:00.000Z'
  UNION ALL SELECT 'seed-abc-docinhos-1',
    'seed-customer-ana', 'Ana Beatriz',
    '[{"productId":"seed-cat-docinhos","productName":"Docinhos (centena)","qty":1,"unitPrice":130}]',
    '2025-01-18', 'entregue', 'pago', 'Festa do aniversário de 15 anos.', 0,
    '2025-01-07T11:00:00.000Z'
  UNION ALL SELECT 'seed-abc-docinhos-2',
    'seed-customer-ana', 'Ana Beatriz',
    '[{"productId":"seed-cat-docinhos","productName":"Docinhos (centena)","qty":1,"unitPrice":130}]',
    '2025-06-14', 'entregue', 'a_pagar', 'Retirada antes da festa.', 0,
    '2025-06-02T15:20:00.000Z'
) AS p;

-- The class C tail order.
INSERT OR IGNORE INTO orders (
  id, customerId, customerName, lines, deliveryDate, status,
  paymentStatus, notes, stockDeducted, createdAt
)
SELECT
  'seed-abc-limao',
  'seed-customer-ana', 'Ana Beatriz',
  '[{"productId":"seed-cat-bolo-limao","productName":"Bolo de limão","qty":1,"unitPrice":89.9}]',
  '2026-02-07', 'entregue', 'pago', 'Bolo pequeno para o escritório.', 0,
  '2026-01-19T16:40:00.000Z';