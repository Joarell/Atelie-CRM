// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/state/AppContext';
import type {
  AppointmentType, CalendarEvent, CatalogProduct, Contact,
  Conversation, ConversationNote, CrmActivity, Deal, Message,
  Pipeline, QuickReply, Stage, Tag, Task
} from '../../src/domain/crm';
import type { Order, OrderLine } from '../../src/domain/types';
import { CrmService } from '../../src/services/CrmService';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import { renderCrmInboxView } from '../../src/ui/views/crm/CrmInboxView';
import { qs } from '../../src/ui/dom';

vi.mock('../../src/ui/realtimeRefresh', () => ({
  startRealtimeRefresh: () => () => {}
}));

vi.mock('../../src/ui/Toast', () => ({
  showToast: vi.fn()
}));

const NOW = '2026-09-20T10:00:00.000Z';

function line(name: string, qty: number, unitPrice: number): OrderLine {
  return { productId: name, productName: name, qty, unitPrice };
}

function order(
  id: string,
  customerName: string,
  createdAt: string,
  lines: OrderLine[],
  status: Order['status'] = 'producao'
): Order {
  return {
    id,
    customerId: customerName,
    customerName,
    lines,
    deliveryDate: '2026-01-24',
    status,
    paymentStatus: 'a_pagar',
    notes: '',
    stockDeducted: false,
    createdAt
  };
}

function contact(id: string, name: string, phone: string): Contact {
  return {
    id, name, phone, email: '', notes: '', tags: [], createdAt: NOW
  };
}

function conversation(id: string, contactId: string): Conversation {
  return {
    id, contactId, channel: 'whatsapp', channelPhone: '5511999990000',
    lastMessageAt: NOW, assignedUserId: '', status: 'open',
    snoozedUntil: '', createdAt: NOW
  };
}

function buildCtx(): {
  ctx: AppContext;
  root: HTMLElement;
} {
  const contacts = InMemoryRepository.seeded<Contact>([
    contact('p1', 'Ana Beatriz', '5511999990001'),
    contact('p2', 'Carla Menezes', '5511999990002'),
    contact('p3', 'Zeca', '5511999990003')
  ]);
  const conversations = InMemoryRepository.seeded<Conversation>([
    conversation('conv-1', 'p1'),
    conversation('conv-2', 'p2'),
    conversation('conv-3', 'p3')
  ]);
  const messages = InMemoryRepository.seeded<Message>([
    { id: 'm1', conversationId: 'conv-1', direction: 'inbound',
      text: 'oi ana', createdBy: '', createdAt: NOW },
    { id: 'm2', conversationId: 'conv-2', direction: 'inbound',
      text: 'oi carla', createdBy: '', createdAt: NOW },
    { id: 'm3', conversationId: 'conv-3', direction: 'inbound',
      text: 'oi zeca', createdBy: '', createdAt: NOW }
  ]);
  const orders = InMemoryRepository.seeded<Order>([
    order('oana-old', 'Ana Beatriz', '2026-01-06T08:00:00.000Z',
      [line('Docinhos (centena)', 2, 130)], 'entregue'),
    order('oana-new', 'Ana Beatriz', '2026-01-19T09:30:00.000Z',
      [line('Bolo de limão', 1, 89.9)]),
    order('ocarla', 'Carla Menezes', '2026-01-17T12:00:00.000Z',
      [line('Bolo de casamento (2 andares)', 1, 650)]),
    order('orenata', 'Renata Vaz', '2026-01-20T09:00:00.000Z',
      [line('Docinhos (centena)', 1, 130)], 'cancelado')
  ]);
  const quickReplies = InMemoryRepository.seeded<QuickReply>([]);
  const crm = new CrmService({
    contacts,
    conversations,
    messages,
    quickReplies,
    pipelines: InMemoryRepository.seeded<Pipeline>([]),
    stages: InMemoryRepository.seeded<Stage>([]),
    deals: InMemoryRepository.seeded<Deal>([]),
    tasks: InMemoryRepository.seeded<Task>([]),
    events: InMemoryRepository.seeded<CalendarEvent>([]),
    catalog: InMemoryRepository.seeded<CatalogProduct>([]),
    activities: InMemoryRepository.seeded<CrmActivity>([]),
    notes: InMemoryRepository.seeded<ConversationNote>([]),
    appointmentTypes: InMemoryRepository.seeded<AppointmentType>([]),
    tags: InMemoryRepository.seeded<Tag>([])
  });
  const auth = {
    currentUser: () => ({ id: 'u1' })
  } as unknown as AppContext['auth'];
  const ctx = {
    crm,
    conversations,
    messages,
    contacts,
    quickReplies,
    orders,
    auth,
    whatsapp: { sendText: vi.fn(async () => undefined) }
  } as unknown as AppContext;
  const root = document.createElement('div');
  document.body.appendChild(root);
  renderCrmInboxView(root, ctx);
  return { ctx, root };
}

describe('Inbox order-history panel', () => {
  it('shows the Pedidos panel as the third inbox column', () => {
    const { root } = buildCtx();
    const panel = qs<HTMLElement>('.inbox-orders', root);
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain('Pedidos');
    const columns = root.querySelectorAll('.inbox > .inbox-list,' +
      '.inbox > .inbox-thread,.inbox > .inbox-orders');
    expect(columns).toHaveLength(3);
  });

  it('renders the open contact orders as a LIFO queue (newest first)', () => {
    const { root } = buildCtx();
    const cards = root.querySelectorAll('.order-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('Bolo de limão');
    expect(cards[0].textContent).toContain('Em produção');
    expect(cards[1].textContent).toContain('Docinhos (centena)');
    expect(cards[1].textContent).toContain('Entregue');
  });

  it('shows status tone badge, delivery date, items and total per card', () => {
    const { root } = buildCtx();
    const newest = root.querySelector<HTMLElement>('.order-card');
    expect(newest?.querySelector('.badge')?.className.trim()).toBe('badge');
    expect(newest?.querySelector('.order-card-lines')?.textContent)
      .toBe('1× Bolo de limão');
    expect(newest?.querySelector('.order-card-foot strong')?.textContent)
      .toBe('R$\u00A089,90');
    const older = root.querySelectorAll<HTMLElement>('.order-card')[1];
    expect(older.querySelector('.badge')?.classList.contains('badge-sage'))
      .toBe(true);
    expect(older.querySelector('.order-card-foot strong')?.textContent)
      .toBe('R$\u00A0260,00');
  });

  it('switches the queue to the other contact on conversation select', () => {
    const { root } = buildCtx();
    qs<HTMLElement>('[data-open="conv-2"]', root).click();
    const cards = root.querySelectorAll('.order-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('Bolo de casamento (2 andares)');
    const body = qs<HTMLElement>('.inbox-orders', root).textContent ?? '';
    expect(body).not.toContain('Bolo de limão');
    expect(body).not.toContain('Docinhos (centena)');
  });

  it('shows an empty state for a contact with no orders', () => {
    const { root } = buildCtx();
    qs<HTMLElement>('[data-open="conv-3"]', root).click();
    const body = qs<HTMLElement>('.inbox-orders', root).textContent ?? '';
    expect(body).toContain('Sem pedidos');
    expect(body).toContain('Nenhum pedido para este contato.');
    expect(root.querySelectorAll('.order-card')).toHaveLength(0);
  });

  it('ignores orders placed by customers who are not in the chat', () => {
    const { root } = buildCtx();
    const body = qs<HTMLElement>('.inbox-orders', root).textContent ?? '';
    expect(body).not.toContain('Renata Vaz');
    expect(body).not.toContain('cancelado');
  });
});