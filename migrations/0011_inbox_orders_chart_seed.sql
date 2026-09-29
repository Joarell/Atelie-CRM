-- Inbox "Area Chart - Gradient" seed: earlier-year orders so the inbox chart
-- ("Pedidos por ano", stacked by status for the open chat contact) renders
-- multiple stacked areas in a fresh DB instead of a single column. Rows reuse
-- the customers/products seeded by 0008 + 0010. Run with:
--   npm run db:seed:local   (or db:seed:remote)

INSERT OR IGNORE INTO orders (
  id, customerId, customerName, lines, deliveryDate, status,
  paymentStatus, notes, stockDeducted, createdAt
) VALUES
  ('seed-order-ana-2024-1', 'seed-customer-ana', 'Ana Beatriz',
   '[{"productId":"seed-cat-docinhos","productName":"Docinhos (centena)","qty":4,"unitPrice":130}]',
   '2024-03-15', 'entregue', 'pago', 'Encomenda da igreja.', 1,
   '2024-03-10T09:00:00.000Z'),
  ('seed-order-ana-2024-2', 'seed-customer-ana', 'Ana Beatriz',
   '[{"productId":"seed-cat-bolo-limao","productName":"Bolo de limão","qty":1,"unitPrice":89.9}]',
   '2024-09-08', 'cancelado', 'a_pagar', 'Cancelado pela cliente.', 0,
   '2024-09-01T10:00:00.000Z'),
  ('seed-order-ana-2025-1', 'seed-customer-ana', 'Ana Beatriz',
   '[{"productId":"seed-cat-bolo-casamento","productName":"Bolo de casamento (2 andares)","qty":1,"unitPrice":650}]',
   '2025-05-20', 'entregue', 'pago', 'Casamento da prima.', 1,
   '2025-05-12T08:30:00.000Z'),
  ('seed-order-ana-2025-2', 'seed-customer-ana', 'Ana Beatriz',
   '[{"productId":"seed-cat-docinhos","productName":"Docinhos (centena)","qty":3,"unitPrice":130}]',
   '2025-08-30', 'producao', 'a_pagar', 'Aniversário do filho.', 0,
   '2025-08-21T14:00:00.000Z'),
  ('seed-order-carla-2024-1', 'seed-customer-carla', 'Carla Menezes',
   '[{"productId":"seed-cat-bolo-limao","productName":"Bolo de limão","qty":1,"unitPrice":89.9}]',
   '2024-06-10', 'entregue', 'pago', 'Retirada na loja.', 1,
   '2024-06-02T11:00:00.000Z'),
  ('seed-order-carla-2025-1', 'seed-customer-carla', 'Carla Menezes',
   '[{"productId":"seed-cat-bolo-casamento","productName":"Bolo de casamento (2 andares)","qty":1,"unitPrice":650}]',
   '2025-11-20', 'cancelado', 'a_pagar', 'Casamento adiado.', 0,
   '2025-11-05T13:00:00.000Z'),
  ('seed-order-bruno-2024-1', 'seed-customer-bruno', 'Bruno Alves',
   '[{"productId":"seed-cat-docinhos","productName":"Docinhos (centena)","qty":2,"unitPrice":130}]',
   '2024-12-19', 'entregue', 'pago', 'Festa de fim de ano.', 1,
   '2024-12-02T09:00:00.000Z'),
  ('seed-order-bruno-2025-1', 'seed-customer-bruno', 'Bruno Alves',
   '[{"productId":"seed-cat-bolo-limao","productName":"Bolo de limão","qty":2,"unitPrice":89.9}]',
   '2025-04-28', 'entregue', 'pago', 'Aniversário da esposa.', 1,
   '2025-04-20T10:00:00.000Z'),
  ('seed-order-bruno-2026-1', 'seed-customer-bruno', 'Bruno Alves',
   '[{"productId":"seed-cat-bolo-casamento","productName":"Bolo de casamento (2 andares)","qty":1,"unitPrice":650}]',
   '2026-01-30', 'pendente', 'a_pagar', 'Casamento de março.', 0,
   '2026-01-22T15:00:00.000Z');