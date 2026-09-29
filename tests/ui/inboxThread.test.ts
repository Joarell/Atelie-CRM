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
const T2 = '2026-09-21T09:30:00.000Z';
const T3 = '2026-09-21T10:00:00.000Z';

// happy-dom reports no layout, so every element gets the same fake scroll
// shape used by the send/receive tests.
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

interface SeedState {
  contacts: ReturnType<typeof InMemoryRepository.seeded<Contact>>;
  conversations: ReturnType<typeof InMemoryRepository.seeded<Conversation>>;
  messages: ReturnType<typeof InMemoryRepository.seeded<Message>>;
}

// Two open conversations:
//   conv-1 (Ana)  touched at T1, has an inbound message at T1
//   conv-2 (Bruno) touched at T3 (most recent), has messages at T1 and T3
function seed(): SeedState {
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
      channelPhone: '5511999990002', lastMessageAt: T3, assignedUserId: '',
      status: 'open', snoozedUntil: '', createdAt: T2 }
  ]);
  const messages = InMemoryRepository.seeded<Message>([
    { id: 'm1', conversationId: 'conv-1', direction: 'inbound',
      text: 'sou da ana', createdBy: '', createdAt: T1 },
    { id: 'm2', conversationId: 'conv-2', direction: 'outbound',
      text: 'sou do bruno (enviado)', createdBy: 'u1', createdAt: T1 },
    { id: 'm3', conversationId: 'conv-2', direction: 'inbound',
      text: 'sou do bruno', createdBy: '', createdAt: T3 }
  ]);
  return { contacts, conversations, messages };
}

function buildCtx(state: SeedState): {
  ctx: AppContext;
  root: HTMLElement;
} {
  const crm = new CrmService({
    contacts: state.contacts, conversations: state.conversations,
    messages: state.messages,
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
  const ctx = {
    crm, conversations: state.conversations, contacts: state.contacts,
    messages: state.messages,
    quickReplies: InMemoryRepository.seeded<QuickReply>([]),
    orders: InMemoryRepository.seeded<Order>([]),
    products: InMemoryRepository.seeded([]),
    customers: InMemoryRepository.seeded([]),
    pricing: { productPricing: () => ({ suggestedPrice: 0 }) },
    order: { create: async () => ({}) },
    auth, whatsapp: { sendText: async () => ({}) }
  } as unknown as AppContext;
  const root = document.createElement('div');
  document.body.appendChild(root);
  renderCrmInboxView(root, ctx);
  return { ctx, root };
}

function bubbles(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.bubble'));
}

function textOf(b: HTMLElement): string {
  return b.querySelector('.bubble-text')?.textContent?.trim() ?? '';
}

describe('Inbox — carregamento do thread do chat selecionado', () => {
  it('monta o thread completo do chat aberto, mais antigo no topo', () => {
    const { root } = buildCtx(seed());
    // conv-2 is most recent, so it is the DEFAULT active chat.
    const head = qs<HTMLElement>('.inbox-thread-head strong', root);
    expect(head?.textContent).toBe('Bruno');

    const rows = bubbles(root);
    expect(rows).toHaveLength(2);
    expect(textOf(rows[0])).toBe('sou do bruno (enviado)');
    expect(textOf(rows[1])).toBe('sou do bruno');
    expect(rows[0].classList.contains('out')).toBe(true);
    expect(rows[1].classList.contains('in')).toBe(true);
  });

  it('não sangra mensagens de conversas irmãs no thread', () => {
    const { root } = buildCtx(seed());
    // conv-2's thread must NOT contain conv-1's "sou da ana".
    const texts = bubbles(root).map(textOf);
    expect(texts).toEqual(['sou do bruno (enviado)', 'sou do bruno']);
    expect(texts).not.toContain('sou da ana');
  });

  it('troca o thread ao clicar na conversa irmã', () => {
    const { root } = buildCtx(seed());
    qs<HTMLElement>('[data-open="conv-1"]', root).click();

    const head = qs<HTMLElement>('.inbox-thread-head strong', root);
    expect(head?.textContent).toBe('Ana');
    const texts = bubbles(root).map(textOf);
    expect(texts).toEqual(['sou da ana']);
  });

  it('re-monta o thread a partir da inbox atual (sem estado de montagem velho)', () => {
    // Regression: activeId used to be module state that survived across
    // separate renderCrmInboxView calls, pinning the PREVIOUS mount's chat —
    // so a fresh mount of /inbox kept showing an old conversation's thread
    // while the newest conversation (with a newer client message) stayed
    // hidden. A fresh mount must re-derive the active chat from the CURRENT
    // inbox (most recent conversation first).
    const state = seed();
    const first = buildCtx(state);
    qs<HTMLElement>('[data-open="conv-1"]', first.root).click();
    expect(
      qs<HTMLElement>('.inbox-thread-head strong', first.root)?.textContent
    ).toBe('Ana');

    const second = buildCtx(state);
    expect(
      qs<HTMLElement>('.inbox-thread-head strong', second.root)?.textContent
    ).toBe('Bruno');
    expect(bubbles(second.root)).toHaveLength(2);
    expect(textOf(bubbles(second.root)[0])).toBe('sou do bruno (enviado)');
  });

  it('ordena "Conversas abertas" como LIFO (mais recente no topo)', () => {
    const { root } = buildCtx(seed());
    // conv-2 (Bruno) has the newest message, so it must sit above conv-1.
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-open]'))
      .map((r) => r.dataset.open);
    expect(rows).toEqual(['conv-2', 'conv-1']);
  });

  it('não herda a rolagem da conversa anterior ao clicar num contato', () => {
    const { root } = buildCtx(seed());
    const thread = qs<HTMLElement>('.inbox-messages', root);
    thread.scrollTop = 333;

    qs<HTMLElement>('[data-open="conv-1"]', root).click();

    const fresh = qs<HTMLElement>('.inbox-messages', root);
    expect(fresh.scrollTop).toBe(0);
  });
});