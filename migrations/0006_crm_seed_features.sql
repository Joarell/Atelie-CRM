-- Lookup data for the ported CRM features: tag vocabulary + the agenda's
-- appointment types (the same reserved seed values the old views assumed).
-- Run with: npm run db:seed:local (or db:seed:remote)

INSERT OR IGNORE INTO tags (id, name, color, ativo, createdAt) VALUES
  ('seed-tag-quente', 'quente', 'caramel', 1, '2026-01-01T00:00:00.000Z'),
  ('seed-tag-casamento', 'casamento', 'caramel', 1, '2026-01-01T00:00:00.000Z'),
  ('seed-tag-vip', 'vip', 'gold', 1, '2026-01-01T00:00:00.000Z');

INSERT OR IGNORE INTO appointment_types (id, name, durationMin, color, ativo, position, createdAt) VALUES
  ('seed-at-reuniao', 'Reunião', 60, '', 1, 0, '2026-01-01T00:00:00.000Z'),
  ('seed-at-degustacao', 'Degustação', 45, '', 1, 1, '2026-01-01T00:00:00.000Z'),
  ('seed-at-entrega', 'Entrega', 30, '', 1, 2, '2026-01-01T00:00:00.000Z'),
  ('seed-at-outro', 'Outro', 60, '', 1, 3, '2026-01-01T00:00:00.000Z');