// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/state/AppContext';
import type {
  AppointmentType, CalendarEvent, CatalogProduct, Contact,
  Conversation, ConversationNote, CrmActivity, Deal, Message, Pipeline,
  QuickReply, Stage, Tag, Task
} from '../../src/domain/crm';
import type { Order } from '../../src/domain/types';
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

const T1 = '2026-09-21T09:00:00.000Z';
const T2 = '2026-09-21T08:00:00.000Z';
const FAR = '2099-01-01T00:00:00.000Z';

const scrollStore = new WeakMap<HTMLElement, number>();
Object.defineProperties(HTMLElement.prototype, {
  scrollHeight: { configurable: true, get: () => 600 },
  clientHeight: { configurable: true, get: () => 300 },
  scrollTop: {
    configurable: true,
    get(this: HTMLElement) {
      return scrollStore.get(this) ?? 0;
    },
    set(this: HTMLElement, value: number) {
      scrollStore.set(this, value);
    }
  }
});

function seed(): {
  contacts: ReturnType<typeof InMemoryRepository.seeded<Contact>>;
  conversations: ReturnType<typeof InMemoryRepository.seeded<Conversation>>;
} {
  const contacts = InMemoryRepository.seeded<Contact>([
    { id: 'p1', name: 'Ana', phone: '5511999990001', email: '',
      notes: '', tags: [], createdAt: T1 },
    { id: 'p2', name: 'Bruno', phone: '5511999990002', email: '',
      notes: '', tags: [], createdAt: T2 }
  ]);
  const conversations = InMemoryRepository.seeded<Conversation>([
    { id: 'conv-1', contactId: 'p1', channel: 'whatsapp',
      channelPhone: '5511999990001', lastMessageAt: T1, assignedUserId: '',
      status: 'open', snoozedUntil: '', createdAt: T1 },
    { id: 'conv-2', contactId: 'p2', channel: 'whatsapp',
      channelPhone: '5511999990002', lastMessageAt: T1, assignedUserId: '',
      status: 'open', snoozedUntil: FAR, createdAt: T2 }
  ]);
  return { contacts, conversations };
}

function makeCtx(opts: {
  contacts: ReturnType<typeof InMemoryRepository.seeded<Contact>>;
  conversations: ReturnType<typeof InMemoryRepository.seeded<Conversation>>;
  messages?: ReturnType<typeof InMemoryRepository.seeded<Message>>;
}): AppContext {
  const messages = opts.messages ??
    InMemoryRepository.seeded<Message>([
      { id: 'm1', conversationId: 'conv-1', direction: 'outbound',
        text: 'olá, Ana!', createdBy: 'u1', createdAt: T1 }
    ]);
  const crm = new CrmService({
    contacts: opts.contacts, conversations: opts.conversations, messages,
    quickReplies: InMemoryRepository.seeded<QuickReply>([]),
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
  const auth = { currentUser: () => ({ id: 'u1' }) } as unknown as AppContext['auth'];
  return {
    crm, conversations: opts.conversations, contacts: opts.contacts,
    messages,
    quickReplies: InMemoryRepository.seeded<QuickReply>([]),
    orders: InMemoryRepository.seeded<Order>([]),
    products: InMemoryRepository.seeded([]),
    customers: InMemoryRepository.seeded([]),
    pricing: { productPricing: () => ({ suggestedPrice: 0 }) },
    order: { create: async () => ({}) },
    auth, whatsapp: { sendText: async () => ({}) }
  } as unknown as AppContext;
}

function render(ctx: AppContext): HTMLElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  renderCrmInboxView(root, ctx);
  return root;
}

function buildRoot(): HTMLElement {
  return render(makeCtx(seed()));
}

function openRows(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-open]'));
}

function dormantRows(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-restore]'));
}

describe('Inbox — retomar conversa adormecida', () => {
  it('lists the snoozed conversation under "Adormecidas"', () => {
    const root = buildRoot();
    expect(openRows(root).map((r) => r.dataset.open)).toEqual(['conv-1']);
    expect(dormantRows(root).map((r) => r.dataset.restore)).toEqual(['conv-2']);
    const head = qs<HTMLElement>('.inbox-list-head--dormant', root);
    expect(head?.textContent).toContain('Adormecidas');
  });

  it('restores a conversation: back to the open list and opened', async () => {
    const root = buildRoot();
    qs<HTMLElement>('[data-restore="conv-2"]', root).click();
    await vi.waitFor(() => {
      expect(dormantRows(root)).toHaveLength(0);
    });

    expect(openRows(root).map((r) => r.dataset.open)).toContain('conv-2');
    const name = qs<HTMLElement>('.inbox-thread-head strong', root);
    expect(name?.textContent).toBe('Bruno');
  });

  it('still shows the dormant queue when nothing is open', () => {
    const state = seed();
    state.conversations.stash({
      id: 'conv-1', contactId: 'p1', channel: 'whatsapp',
      channelPhone: '5511999990001', lastMessageAt: T1,
      assignedUserId: '', status: 'closed', snoozedUntil: '', createdAt: T1
    });
    const root = render(makeCtx(state));

    expect(openRows(root)).toHaveLength(0);
    expect(dormantRows(root).map((r) => r.dataset.restore)).toEqual(['conv-2']);
  });

  it('"Adormecer" parks the conversation and "Restaurar" brings it back', async () => {
    const root = buildRoot();
    const select = qs<HTMLSelectElement>('#snooze-for', root);
    select.value = '30';
    qs<HTMLElement>('#snooze-btn', root).click();
    await vi.waitFor(() => {
      expect(openRows(root).map((r) => r.dataset.open)).not.toContain('conv-1');
    });

    expect(dormantRows(root).map((r) => r.dataset.restore)).toEqual([
      'conv-1', 'conv-2'
    ]);

    qs<HTMLElement>('[data-restore="conv-1"]', root).click();
    await vi.waitFor(() => {
      expect(dormantRows(root).map((r) => r.dataset.restore)).toEqual(
        ['conv-2']
      );
    });

    expect(openRows(root).map((r) => r.dataset.open)).toContain('conv-1');
  });
});