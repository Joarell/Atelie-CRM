-- Inbox "Novo pedido": the CRM inbox "Pedidos" panel creates orders
-- directly (right column composer) instead of the ERP product screen.
-- This column tags every order by its origin so history surfaces and E2E
-- verification can tell inbox-created orders apart after the fact
-- (`createdFrom='inbox'`); orders made elsewhere default to ''.
-- Schema only — companion seed is 0010_inbox_orders_seed.sql.
-- Run with: npm run db:migrate:local  (or db:migrate:remote)

ALTER TABLE orders ADD COLUMN createdFrom TEXT NOT NULL DEFAULT '';