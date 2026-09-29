-- Order-history seeds for the CRM inbox "Pedidos" panel (order history for
-- the current chat contact, shown as a LIFO queue by customerName).
-- The orders table already exists from 0001_init.sql — this seed only adds
-- rows whose customerName matches the CRM seed contacts (0004_crm_seed.sql),
-- plus matching customers rows so the ERP Pedidos screen stays coherent.
-- Ana Beatriz gets two orders with different createdAt to exercise the LIFO
-- order (newest on top). Run with: npm run db:seed:local (or db:seed:remote)

INSERT OR IGNORE INTO customers (id, name, phone, email, notes) VALUES
  ('seed-customer-ana', 'Ana Beatriz', '5511999990001', 'ana@example.com', 'Clientes também cadastrados no CRM.'),
  ('seed-customer-carla', 'Carla Menezes', '5511999990002', 'carla@example.com', 'Clientes também cadastrados no CRM.'),
  ('seed-customer-bruno', 'Bruno Alves', '5511999990003', 'bruno@example.com', 'Clientes também cadastrados no CRM.');

INSERT OR IGNORE INTO orders (
  id, customerId, customerName, lines, deliveryDate, status,
  paymentStatus, notes, stockDeducted, createdAt
) VALUES
  ('seed-order-ana-1', 'seed-customer-ana', 'Ana Beatriz',
   '[{"productId":"seed-cat-docinhos","productName":"Docinhos (centena)","qty":2,"unitPrice":130}]',
   '2026-01-08', 'entregue', 'pago', 'Encomenda da festa de aniversário.', 1,
   '2026-01-06T08:00:00.000Z'),
  ('seed-order-ana-2', 'seed-customer-ana', 'Ana Beatriz',
   '[{"productId":"seed-cat-bolo-limao","productName":"Bolo de limão","qty":1,"unitPrice":89.9}]',
   '2026-01-24', 'producao', 'a_pagar', 'Aniversário da mãe.', 0,
   '2026-01-19T09:30:00.000Z'),
  ('seed-order-carla-1', 'seed-customer-carla', 'Carla Menezes',
   '[{"productId":"seed-cat-bolo-casamento","productName":"Bolo de casamento (2 andares)","qty":1,"unitPrice":650},{"productId":"seed-cat-docinhos","productName":"Docinhos (centena)","qty":3,"unitPrice":130}]',
   '2026-02-14', 'pendente', 'a_pagar', 'Casamento com docinhos.', 0,
   '2026-01-17T12:00:00.000Z'),
  ('seed-order-bruno-1', 'seed-customer-bruno', 'Bruno Alves',
   '[{"productId":"seed-cat-bolo-limao","productName":"Bolo de limão","qty":2,"unitPrice":89.9}]',
   '2026-01-12', 'pronto', 'pago', 'Retirada na loja.', 1,
   '2026-01-05T10:00:00.000Z');