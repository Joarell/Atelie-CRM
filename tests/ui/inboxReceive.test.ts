// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/state/AppContext';
import type {
  AppointmentType, CalendarEvent, CatalogProduct, Contact,
  Conversation, ConversationNote, CrmActivity, Deal, Message, Pipeline,
  QuickReply, Stage, Tag, Task
} from '../../src/domain/crm';
import type { Order } from '../../src/domain/types';
import type { IRepository } from '../../src/repositories/IRepository';
import { CrmService } from '../../src/services/CrmService';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import { renderCrmInboxView, getTestRefreshInbox } from '../../src/ui/views/crm/CrmInboxView';
import { qs } from '../../src/ui/dom';

vi.mock('../../src/ui/Toast', () => ({
  showToast: vi.fn()
}));

// Mock EventSource to prevent real connections in tests
const eventSourceUrls: string[] = [];
vi.stubGlobal('EventSource', class MockEventSource {
  onopen: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  onerror: (() => void) | null = null;
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  close = vi.fn();
  readyState = 1; // OPEN
  constructor(public url: string) {
    eventSourceUrls.push(url);
    // Simulate async connection
    setTimeout(() => this.onopen?.(), 0);
  }
});

const T1 = '2026-09-21T09:00:00.000Z';
const T2 = '2026-09-21T09:30:00.000Z';
const T3 = '2026-09-21T10:00:00.000Z';

// happy-dom reports no layout, so every element gets the same fake scroll
// shape used by the send tests: 600px thread, 300px viewport.
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

// The D1 mirror: the "server-side" rows the WAHA webhook writes to, and the
// inbox poll reloads from (mirrors refreshInbox's conversations/messages/
// contacts.load()). Nothing else in this test mutates it.
function serverState(): {
  contacts: Contact[];
  conversations: Conversation[];
  messages: Message[];
} {
  return {
    contacts: [{
      id: 'p1', name: 'Ana', phone: '5511999990001', email: '',
      notes: '', tags: [], createdAt: T1
    }],
    conversations: [{
      id: 'conv-1', contactId: 'p1', channel: 'whatsapp',
      channelPhone: '5511999990001', remoteId: '5511999990001@c.us',
      lastMessageAt: T1, assignedUserId: '', status: 'open',
      snoozedUntil: '', createdAt: T1
    }],
    messages: [{
      id: 'm1', conversationId: 'conv-1', direction: 'inbound',
      text: 'olá, tem bolo de limão hoje?', createdBy: '', createdAt: T1
    }]
  };
}

// Repository whose load() re-reads the D1 mirror exactly like ApiRepository
// re-fetches /api/crm/* — the poll can therefore pick up webhook-written rows.
class ServerRepo<T extends { id: string }> implements IRepository<T> {
  private cache: T[];
  constructor(private readonly source: () => T[]) {
    this.cache = this.snapshot();
  }
  async load(): Promise<void> {
    this.cache = this.snapshot();
  }
  getAll(): T[] {
    return this.cache.map((item) => ({ ...item }));
  }
  getById(id: string): T | undefined {
    const found = this.cache.find((item) => item.id === id);
    return found ? { ...found } : undefined;
  }
  async add(item: T): Promise<T> {
    this.cache.push({ ...item });
    return { ...item };
  }
  async update(id: string, patch: Partial<T>): Promise<T | undefined> {
    const index = this.cache.findIndex((item) => item.id === id);
    if (index === -1) return undefined;
    this.cache[index] = { ...this.cache[index], ...patch };
    return { ...this.cache[index] };
  }
  async remove(id: string): Promise<void> {
    this.cache = this.cache.filter((item) => item.id !== id);
  }
  stash(item: T): void {
    const index = this.cache.findIndex((c) => c.id === item.id);
    if (index === -1) this.cache.push({ ...item });
    else this.cache[index] = { ...item };
  }
  subscribe(): () => void {
    return () => {};
  }
  private snapshot(): T[] {
    return this.source().map((item) => ({ ...item }));
  }
}

function inbound(
  id: string, text: string, at: string, conversationId = 'conv-1'
): Message {
  return {
    id, conversationId, direction: 'inbound', text, createdBy: '',
    createdAt: at
  };
}

// What handleInboundMessage() writes to D1, at the domain level: the message,
// a touched lastMessageAt on its conversation, and — for a brand-new peer —
// a freshly created contact + conversation.
function deliver(
  state: {
    contacts: Contact[]; conversations: Conversation[]; messages: Message[];
  },
  message: Message,
  peer: { name: string; phone: string; jid: string }
): void {
  const normalized = peer.phone.replace(/\D/g, '');
  let contact = state.contacts.find(
    (c) => c.phone.replace(/\D/g, '') === normalized
  );
  if (!contact) {
    contact = {
      id: `p-${normalized}`, name: peer.name, phone: peer.phone, email: '',
      notes: '', tags: [], createdAt: message.createdAt
    };
    state.contacts.push(contact);
  }
  let conversation = state.conversations.find(
    (c) => c.contactId === contact!.id
  );
  if (!conversation) {
    conversation = {
      id: `conv-${normalized}`, contactId: contact.id, channel: 'whatsapp',
      channelPhone: peer.phone, remoteId: peer.jid, lastMessageAt: '',
      assignedUserId: '', status: 'open', snoozedUntil: '',
      createdAt: message.createdAt
    };
    state.conversations.push(conversation);
  }
  state.messages.push({ ...message, conversationId: conversation.id });
  conversation.lastMessageAt = message.createdAt;
}

function buildCtx(
  state: ReturnType<typeof serverState>
): { ctx: AppContext; root: HTMLElement; messages: ServerRepo<Message>; testRefresh: (() => Promise<void>) | null } {
  const contacts = new ServerRepo<Contact>(() => state.contacts);
  const conversations = new ServerRepo<Conversation>(() => state.conversations);
  const messages = new ServerRepo<Message>(() => state.messages);
  const quickReplies = InMemoryRepository.seeded<QuickReply>([]);
  const orders = InMemoryRepository.seeded<Order>([]);
  const crm = new CrmService({
    contacts, conversations, messages, quickReplies,
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
    currentUser: () => ({ id: 'u1' }),
    token: () => 'test-token-123'
  } as unknown as AppContext['auth'];
  const ctx = {
    crm, conversations, contacts, messages, quickReplies, orders,
    products: InMemoryRepository.seeded([]),
    customers: InMemoryRepository.seeded([]),
    pricing: { productPricing: () => ({ suggestedPrice: 0 }) },
    order: { create: async () => ({}) },
    auth, whatsapp: { sendText: async () => ({}) }
  } as unknown as AppContext;
  const root = document.createElement('div');
  document.body.appendChild(root);
  renderCrmInboxView(root, ctx);
  // Get the test refresh function after rendering
  const testRefresh = getTestRefreshInbox();
  return { ctx, root, messages, testRefresh };
}

async function poll(ctx: { testRefresh: (() => Promise<void>) | null }): Promise<void> {
  await ctx.testRefresh!();
}

function threadEl(root: HTMLElement): HTMLElement {
  return qs<HTMLElement>('.inbox-messages', root);
}

function bubbles(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.bubble'));
}

function setScrollTop(root: HTMLElement, top: number): void {
  threadEl(root).scrollTop = top;
}

function previewOf(root: HTMLElement, id: string): HTMLElement | null {
  return qs<HTMLElement>(
    `.inbox-item[data-open="${id}"] .inbox-item-preview`, root
  );
}

describe('Inbox recebimento (poll de histórico)', () => {
  it('mostra a mensagem recebida no chat aberto após o poll', async () => {
    const state = serverState();
    const { root, testRefresh } = buildCtx(state);
    expect(bubbles(root)).toHaveLength(1);

    deliver(state, inbound('m2', 'chegou! 🍰', T2), {
      name: 'Ana', phone: '5511999990001', jid: '5511999990001@c.us'
    });
    await poll({ testRefresh });

    const rows = bubbles(root);
    expect(rows).toHaveLength(2);
    const newest = rows[1];
    expect(newest.classList.contains('in')).toBe(true);
    expect(newest.textContent).toContain('chegou! 🍰');
    expect(previewOf(root, 'conv-1')?.textContent).toContain('chegou! 🍰');
  });

  it('expõe o contrato: created_at nunca pode ser a época de 1970', async () => {
    // Pins the UI contract the server fix guarantees. A payload without a
    // `timestamp` used to be stamped 1970-01-01 (valid Date!) — with that,
    // the new bubble sorts as the OLDEST, so it fails to surface at the
    // newest (bottom) slot of the chronological thread and the conversation
    // preview stays stale, so the inbox looks frozen exactly as reported.
    // The server must therefore deliver a normalized createdAt.
    const state = serverState();
    const { root, testRefresh } = buildCtx(state);
    deliver(state, inbound('m2', 'chegou! 🍰', '1970-01-01T00:00:00.000Z'), {
      name: 'Ana', phone: '5511999990001', jid: '5511999990001@c.us'
    });
    await poll({ testRefresh });

    const rows = bubbles(root);
    expect(rows).toHaveLength(2);
    expect(rows[0].classList.contains('in')).toBe(true);
    expect(rows[1].classList.contains('in')).toBe(true);
    expect(rows[0].textContent).toContain('chegou! 🍰');
    expect(rows[1].textContent).not.toContain('chegou! 🍰');
    expect(previewOf(root, 'conv-1')?.textContent)
      .not.toContain('chegou! 🍰');
  });

  it('gruda no fim ao receber quando o leitor já está no fim', async () => {
    const state = serverState();
    const { root, testRefresh } = buildCtx(state);
    setScrollTop(root, 500);

    deliver(state, inbound('m2', 'chegou! 🍰', T2), {
      name: 'Ana', phone: '5511999990001', jid: '5511999990001@c.us'
    });
    await poll({ testRefresh });

    const el = threadEl(root);
    expect(el.scrollTop).toBe(300);
    expect(bubbles(root)).toHaveLength(2);
  });

  it('não arrasta o leitor enquanto ele lê o histórico', async () => {
    const state = serverState();
    const { root, testRefresh } = buildCtx(state);
    setScrollTop(root, 120);

    deliver(state, inbound('m2', 'chegou! 🍰', T2), {
      name: 'Ana', phone: '5511999990001', jid: '5511999990001@c.us'
    });
    await poll({ testRefresh });

    expect(bubbles(root)).toHaveLength(2);
    expect(threadEl(root).scrollTop).toBe(120);
  });

  it('cria a conversa de um cliente novo na caixa após o poll', async () => {
    const state = serverState();
    const { root, testRefresh } = buildCtx(state);

    deliver(state, inbound('m-x', 'quero um bolo de casamento', T2), {
      name: 'Bruno', phone: '5511999990007', jid: '5511999990007@c.us'
    });
    await poll({ testRefresh });

    const row = qs<HTMLElement>(
      '.inbox-item[data-open="conv-5511999990007"]', root
    );
    expect(row).not.toBeNull();
    expect(qs<HTMLElement>('strong', row).textContent).toBe('Bruno');
    expect(
      qs<HTMLElement>('.inbox-item-preview', row).textContent
    ).toContain('quero um bolo de casamento');
  });

  it('aplica LIFO: a conversa recém-mensajada sobe ao topo da caixa', async () => {
    const state = serverState();
    // conv-0 (Zeca) is OLDER than conv-1 (Ana): sits second in the stack.
    state.conversations.push({
      id: 'conv-0', contactId: 'p0', channel: 'whatsapp',
      channelPhone: '5511999990000', remoteId: '5511999990000@c.us',
      lastMessageAt: '2026-09-21T08:00:00.000Z', assignedUserId: '',
      status: 'open', snoozedUntil: '', createdAt: '2026-09-21T08:00:00.000Z'
    });
    state.contacts.push({
      id: 'p0', name: 'Zeca', phone: '5511999990000', email: '',
      notes: '', tags: [], createdAt: '2026-09-21T08:00:00.000Z'
    });
    const { root, testRefresh } = buildCtx(state);
    expect(Array.from(root.querySelectorAll<HTMLElement>('[data-open]'))
      .map((r) => r.dataset.open)).toEqual(['conv-1', 'conv-0']);

    // Zeca (conv-0) got the newest message, so his row jumps to the top.
    deliver(state, inbound('m-lifo', 'quero levar hoje', T3), {
      name: 'Zeca', phone: '5511999990000', jid: '5511999990000@c.us'
    });
    await poll({ testRefresh });

    expect(Array.from(root.querySelectorAll<HTMLElement>('[data-open]'))
      .map((r) => r.dataset.open)).toEqual(['conv-0', 'conv-1']);
  });

  it('atualiza os ticks de entrega sem recarregar a página', async () => {
    const state = serverState();
    state.messages.push({
      id: 'm0', conversationId: 'conv-1', direction: 'outbound',
      text: 'sim, tem!', createdBy: 'u1', createdAt: T1, waStatus: 'sent'
    });
    const { root, testRefresh } = buildCtx(state);
    expect(qs<HTMLElement>('.bubble.out .bubble-tick', root)
      ?.textContent).toBe('✓');

    const sent = state.messages.find((m) => m.id === 'm0')!;
    state.messages[state.messages.indexOf(sent)] = {
      ...sent, waStatus: 'read', readAt: T2
    };
    await poll({ testRefresh });

    expect(qs<HTMLElement>('.bubble.out .bubble-tick', root)
      ?.textContent).toBe('✓✓✷');
  });

  it('envia o token de sessão ao conectar o EventSource', async () => {
    // Regression: /api/crm/events returns 401 without a token, and an
    // EventSource cannot set an Authorization header — so the URL must
    // carry `?token=`. Without it the browser stream never opens and the
    // chat would freeze (never receive webhook-pushed messages).
    eventSourceUrls.length = 0;
    buildCtx(serverState());
    const sseUrl = eventSourceUrls[0];
    expect(sseUrl.startsWith('/api/crm/events?since=')).toBe(true);
    expect(sseUrl).toContain('token=test-token-123');
  });
});