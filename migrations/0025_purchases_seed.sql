-- CMV/CPV — seed de compras com datas relativas.
-- Roda DEPOIS de 0024_purchases.sql e 0002_seed.sql.
-- Usa datas relativas (mês atual, mês anterior, mesmo mês ano passado)
-- para o relatório CMV ter dados em qualquer dia de execução.

-- Helper: data do mês atual (YYYY-MM-DD)
-- O app usa `date('now')` do SQLite/D1 que resolve no momento da execução.

-- Compras do mês atual
INSERT INTO purchases (id, supplier, invoice, date, items, notes) VALUES
('seed-purchase-1', 'Fornecedor Atual', 'NF-001', date('now', 'start of month', '+5 days'),
 '[{"ingredientId":"flour","ingredientName":"Farinha","qty":500,"packageSize":1000,"packagePrice":10},
   {"ingredientId":"sugar","ingredientName":"Açúcar","qty":1000,"packageSize":1000,"packagePrice":8}]',
 'Compra do mês corrente');

-- Compras do mês anterior
INSERT INTO purchases (id, supplier, invoice, date, items, notes) VALUES
('seed-purchase-2', 'Fornecedor Anterior', 'NF-002', date('now', 'start of month', '-1 month', '+10 days'),
 '[{"ingredientId":"butter","ingredientName":"Manteiga","qty":200,"packageSize":200,"packagePrice":16},
   {"ingredientId":"flour","ingredientName":"Farinha","qty":1000,"packageSize":1000,"packagePrice":10}]',
 'Compra do mês passado');

-- Compras do mesmo mês do ano passado
INSERT INTO purchases (id, supplier, invoice, date, items, notes) VALUES
('seed-purchase-3', 'Fornecedor Ano Passado', 'NF-003', date('now', 'start of month', '-1 year', '+15 days'),
 '[{"ingredientId":"sugar","ingredientName":"Açúcar","qty":2000,"packageSize":1000,"packagePrice":8},
   {"ingredientId":"flour","ingredientName":"Farinha","qty":500,"packageSize":1000,"packagePrice":10}]',
 'Compra do mesmo mês ano passado');

-- Atualiza o estoque dos ingredientes para refletir as entradas das compras acima
-- Farinha: seed 0002 tem 1000g. Compras: +500 (atual) +1000 (anterior) +500 (ano passado) = +2000
-- Açúcar: seed 0002 tem 500g. Compras: +1000 (atual) +2000 (ano passado) = +3000
-- Manteiga: seed 0002 tem 500g. Compras: +200 (anterior) = +200
UPDATE ingredients SET stock = stock + 2000 WHERE id = 'flour';
UPDATE ingredients SET stock = stock + 3000 WHERE id = 'sugar';
UPDATE ingredients SET stock = stock + 200 WHERE id = 'butter';

-- Movimentações de entrada correspondentes (para reconstrução de EI/EF)
-- Usa date() para que as movimentações tenham datas consistentes com as compras
INSERT INTO stock_movements (id, ingredientId, ingredientName, type, qty, note, date) VALUES
('seed-mov-1', 'flour', 'Farinha', 'entrada', 500, 'Compra de Fornecedor Atual', date('now', 'start of month', '+5 days')),
('seed-mov-2', 'sugar', 'Açúcar', 'entrada', 1000, 'Compra de Fornecedor Atual', date('now', 'start of month', '+5 days')),
('seed-mov-3', 'butter', 'Manteiga', 'entrada', 200, 'Compra de Fornecedor Anterior', date('now', 'start of month', '-1 month', '+10 days')),
('seed-mov-4', 'flour', 'Farinha', 'entrada', 1000, 'Compra de Fornecedor Anterior', date('now', 'start of month', '-1 month', '+10 days')),
('seed-mov-5', 'sugar', 'Açúcar', 'entrada', 2000, 'Compra de Fornecedor Ano Passado', date('now', 'start of month', '-1 year', '+15 days')),
('seed-mov-6', 'flour', 'Farinha', 'entrada', 500, 'Compra de Fornecedor Ano Passado', date('now', 'start of month', '-1 year', '+15 days'));