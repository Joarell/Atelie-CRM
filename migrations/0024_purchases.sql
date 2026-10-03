-- CMV/CPV — registro de compras de ingredientes.
-- Necessário para a apuração CMV = EI + C - EF: o "C" (compras) não tinha
-- registro. stock_movements guarda só quantidade, sem preço, sem fornecedor.
-- Itens em coluna JSON, mesma convenção de products.items / orders.lines.

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  supplier TEXT NOT NULL DEFAULT '',
  invoice TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,                       -- ISO date (YYYY-MM-DD)
  items TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date);