-- Starter data for the migrated DeskcommCRM core (equivalent to the target's
-- seeded pipelines/stages, plus demo data so the main screens are not empty
-- on a fresh install). Run with: npm run db:seed:local (or db:seed:remote).

-- O admin NAO e semeado aqui. A senha `admin123` vivia neste arquivo e o sal
-- fixo `deskcomm-seed-v1` em src/server/auth.ts, o que tornava o credencial de
-- administrador reproduzivel por qualquer pessoa com o repositorio. O primeiro
-- admin nasce por `npm run admin:bootstrap`, com senha aleatoria de uso unico (ou
-- ADMIN_INITIAL_PASSWORD do env) e `mustChangePassword` ligado. Os demais
-- INSERTs de demo sao preservados.

INSERT OR IGNORE INTO pipelines (id, name, isDefault) VALUES
  ('seed-pipeline-vendas', 'Funil de vendas', 1);

INSERT OR IGNORE INTO pipeline_stages (id, pipelineId, name, position) VALUES
  ('seed-stage-novo', 'seed-pipeline-vendas', 'Novo lead', 0),
  ('seed-stage-cotacao', 'seed-pipeline-vendas', 'Cotação', 1),
  ('seed-stage-negociacao', 'seed-pipeline-vendas', 'Negociação', 2),
  ('seed-stage-ganho', 'seed-pipeline-vendas', 'Ganho', 3),
  ('seed-stage-perdido', 'seed-pipeline-vendas', 'Perdido', 4);

INSERT OR IGNORE INTO contacts (id, name, phone, email, notes, tags, createdAt) VALUES
  ('seed-contact-ana', 'Ana Beatriz', '5511999990001', 'ana@example.com', 'Prefere contato à tarde.', '["quente"]', '2026-01-05T10:00:00.000Z'),
  ('seed-contact-carla', 'Carla Menezes', '5511999990002', 'carla@example.com', 'Pediu um bolo de casamento.', '["casamento","quente"]', '2026-01-10T14:30:00.000Z'),
  ('seed-contact-bruno', 'Bruno Alves', '5511999990003', 'bruno@example.com', 'Cliente antigo.', '[]', '2026-01-12T09:15:00.000Z');

INSERT OR IGNORE INTO conversations (id, contactId, channel, channelPhone, lastMessageAt, assignedUserId, status, createdAt) VALUES
  ('seed-conv-ana', 'seed-contact-ana', 'whatsapp', '5511999990001', '2026-01-16T18:05:00.000Z', '', 'open', '2026-01-05T10:05:00.000Z'),
  ('seed-conv-carla', 'seed-contact-carla', 'whatsapp', '5511999990002', '2026-01-17T11:20:00.000Z', '', 'open', '2026-01-10T14:35:00.000Z'),
  ('seed-conv-bruno', 'seed-contact-bruno', 'whatsapp', '5511999990003', '2026-01-11T16:40:00.000Z', '', 'open', '2026-01-12T09:20:00.000Z');

INSERT OR IGNORE INTO messages (id, conversationId, direction, text, createdBy, createdAt) VALUES
  ('seed-msg-ana-1', 'seed-conv-ana', 'inbound', 'Oi! Quanto custa o bolo de limão?', '', '2026-01-16T18:05:00.000Z'),
  ('seed-msg-ana-2', 'seed-conv-ana', 'outbound', 'Olá, Ana! O bolo de limão está R$ 89,90. Quer ver a tabela?', '', '2026-01-16T18:12:00.000Z'),
  ('seed-msg-carla-1', 'seed-conv-carla', 'inbound', 'Preciso de orçamento para 20 docinhos e um bolo de 2 andares.', '', '2026-01-17T11:20:00.000Z'),
  ('seed-msg-bruno-1', 'seed-conv-bruno', 'outbound', 'Bruno, seu pedido da semana passada está pronto para retirada amanhã.', '', '2026-01-11T16:40:00.000Z');

INSERT OR IGNORE INTO deals (id, pipelineId, stageId, contactId, title, valueCents, status, lostReason, createdAt) VALUES
  ('seed-deal-carla', 'seed-pipeline-vendas', 'seed-stage-cotacao', 'seed-contact-carla', 'Bolo de casamento Carla', 65000, 'open', '', '2026-01-12T10:00:00.000Z'),
  ('seed-deal-ana', 'seed-pipeline-vendas', 'seed-stage-negociacao', 'seed-contact-ana', 'Encomenda mensal Ana', 24000, 'open', '', '2026-01-14T15:00:00.000Z');

INSERT OR IGNORE INTO tasks (id, title, done, dueAt, assigneeUserId, contactId, createdAt) VALUES
  ('seed-task-1', 'Enviar tabela de bolos para Ana', 0, '2026-01-20T18:00:00.000Z', '', 'seed-contact-ana', '2026-01-16T18:15:00.000Z'),
  ('seed-task-2', 'Confirmar degustação do bolo de casamento', 0, '2026-01-21T14:00:00.000Z', '', 'seed-contact-carla', '2026-01-17T11:30:00.000Z');

INSERT OR IGNORE INTO calendar_events (id, contactId, title, startsAt, endsAt, eventType, createdBy, createdAt) VALUES
  ('seed-event-1', 'seed-contact-carla', 'Degustação bolo de casamento', '2026-01-21T14:00:00.000Z', '2026-01-21T15:00:00.000Z', 'degustacao', '', '2026-01-17T11:35:00.000Z');

INSERT OR IGNORE INTO quick_replies (id, title, body, shortcut, createdBy, createdAt) VALUES
  ('seed-qr-1', 'Apresentação', 'Olá! Aqui é da Ateliê das Tortas. Como posso ajudar?', 'ola', '', '2026-01-02T09:00:00.000Z'),
  ('seed-qr-2', 'Horário de atendimento', 'Atendemos de terça a sábado, das 9h às 18h.', 'horario', '', '2026-01-02T09:05:00.000Z');

INSERT OR IGNORE INTO catalog_products (id, name, description, priceCents, currency, ativo, createdAt, updatedAt) VALUES
  ('seed-cat-bolo-limao', 'Bolo de limão', 'Bolo integral de limão com cobertura de chantilly.', 8990, 'BRL', 1, '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z'),
  ('seed-cat-bolo-casamento', 'Bolo de casamento (2 andares)', 'Bolo de casamento com dois andares e flores em açúcar.', 65000, 'BRL', 1, '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z'),
  ('seed-cat-docinhos', 'Docinhos (centena)', 'Docinhos sortidos.', 13000, 'BRL', 1, '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z');