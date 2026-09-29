-- Ateliê ERP — initial D1 schema.
-- Nested objects/arrays (recipe items, labor, fixed expenses, order lines)
-- are stored as JSON text columns and parsed/serialised in src/server/mapping.ts.
-- Run with: npm run db:migrate:local  (or db:migrate:remote for production)

CREATE TABLE IF NOT EXISTS ingredients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  packageSize REAL NOT NULL,
  packagePrice REAL NOT NULL,
  stock REAL NOT NULL DEFAULT 0,
  minStock REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS components (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  yieldDesc TEXT NOT NULL DEFAULT '',
  prepTime REAL NOT NULL DEFAULT 0,
  items TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  yieldUnits REAL NOT NULL DEFAULT 1,
  prepTime REAL NOT NULL DEFAULT 0,
  labor TEXT NOT NULL,
  fixedExpenses TEXT NOT NULL,
  variablePercent REAL NOT NULL DEFAULT 0,
  markupPercent REAL NOT NULL DEFAULT 0,
  items TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customerId TEXT NOT NULL,
  customerName TEXT NOT NULL,
  lines TEXT NOT NULL DEFAULT '[]',
  deliveryDate TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  paymentStatus TEXT NOT NULL DEFAULT 'a_pagar',
  notes TEXT NOT NULL DEFAULT '',
  stockDeducted INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  ingredientId TEXT NOT NULL,
  ingredientName TEXT NOT NULL,
  type TEXT NOT NULL,
  qty REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  salary REAL NOT NULL DEFAULT 0,
  daysPerMonth REAL NOT NULL DEFAULT 0,
  hoursPerDay REAL NOT NULL DEFAULT 0,
  rent REAL NOT NULL DEFAULT 0,
  energy REAL NOT NULL DEFAULT 0,
  water REAL NOT NULL DEFAULT 0,
  internet REAL NOT NULL DEFAULT 0,
  office REAL NOT NULL DEFAULT 0,
  mei REAL NOT NULL DEFAULT 0,
  variablePercent REAL NOT NULL DEFAULT 0,
  defaultMarkupPercent REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customerId);
CREATE INDEX IF NOT EXISTS idx_movements_ingredient ON stock_movements(ingredientId);
