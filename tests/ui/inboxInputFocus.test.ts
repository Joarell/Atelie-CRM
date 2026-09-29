// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/state/AppContext';
import type {
  AppointmentType, CalendarEvent, CatalogProduct, Contact,
  Conversation, ConversationNote, CrmActivity, Deal, Message, Pipeline,
  QuickReply, Stage, Tag, Task
} from '../../src/domain/crm';
import type { Order, Product } from '../../src/domain/types';
import { CrmService } from '../../src/services/CrmService';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import {
  getTestRefreshInbox,
  renderCrmInboxView
} from '../../src/ui/views/crm/CrmInboxView';
import { qs, qsIf } from '../../src/ui/dom';

vi.mock('../../src/ui/Toast', () => ({ showToast: vi.fn() }));
vi.stubGlobal('EventSource', class {
  onerror: (() => void) | null = null;
  addEventListener = vi.fn();
  close = vi.fn();
  readyState = 1;
  constructor(public url: string) { void url; }
});

const T1 = '2026-09-21T09:00:00.000Z';
const T2 = '2026-09-21T09:30:00.000Z';

const scrollStore = new WeakMap<HTMLElement, number>();
Object.defineProperties(HTMLElement.prototype, {
  scrollHeight: { configurable: true, get: () => 600 },
  clientHeight: { configurable: true, get: () => 300 },
  scrollTop: {
    configurable: true,
    get(this: HTMLElement) { return scrollStore.get(this) ?? 0; },
    set(this: HTMLElement, value: number) { scrollStore.set(this, value); }
  }
});

// One order per month, so the "Pedidos do mês" menu really has a second
// choice to switch to.
const ORDERS: Order[] = [
  order('o-jan', '2026-01-15T10:00:00.000Z'),
  order('o-fev', '2026-02-15T10:00:00.000Z')
];

function order(id: string, createdAt: string): Order {
  return {
    id, customerId: 'p1', customerName: 'Ana',
    lines: [{ productId: 'pr1', productName: 'Bolo de limão', qty: 1,
      unitPrice: 8990 }],
    deliveryDate: createdAt.slice(0, 10), status: 'pendente',
    paymentStatus: 'a_pagar', notes: '', stockDeducted: false, createdAt
  };
}

interface Harness {
  ctx: AppContext;
  root: HTMLElement;
  messages: ReturnType<typeof InMemoryRepository.seeded<Message>>;
  notes: ReturnType<typeof InMemoryRepository.seeded<ConversationNote>>;
  sendText: ReturnType<typeof vi.fn>;
  rootListeners: string[];
}

function buildCtx(): Harness {
  const contacts = InMemoryRepository.seeded<Contact>([
    { id: 'p1', name: 'Ana', phone: '5511999990001', email: '', notes: '',
      tags: [], assignedUserId: '', createdAt: T1 }
  ]);
  const conversations = InMemoryRepository.seeded<Conversation>([
    { id: 'conv-1', contactId: 'p1', channel: 'whatsapp',
      channelPhone: '5511999990001', lastMessageAt: T1, assignedUserId: '',
      status: 'open', snoozedUntil: '', createdAt: T1 }
  ]);
  const messages = InMemoryRepository.seeded<Message>([
    { id: 'm1', conversationId: 'conv-1', direction: 'inbound',
      text: 'olá', createdBy: '', createdAt: T1 }
  ]);
  const quickReplies = InMemoryRepository.seeded<QuickReply>([
    { id: 'q1', title: 'Saudação', shortcut: 'oi',
      body: 'Olá! Como posso ajudar?', createdBy: 'u1', createdAt: T1 }
  ]);
  const notes = InMemoryRepository.seeded<ConversationNote>([]);
  const products = InMemoryRepository.seeded<Product>([
    { id: 'pr1', name: 'Bolo de limão', category: 'Doces', yieldUnits: 1,
      prepTime: 60, labor: { salary: 1800, daysPerMonth: 24, hoursPerDay: 8 },
      fixedExpenses: { rent: 800, energy: 250, water: 90, internet: 0,
        office: 0, mei: 0 },
      variablePercent: 0, markupPercent: 0, items: [] }
  ]);
  const sendText = vi.fn(async () => undefined);
  const crm = new CrmService({
    contacts, conversations, messages, quickReplies,
    pipelines: InMemoryRepository.seeded<Pipeline>([]),
    stages: InMemoryRepository.seeded<Stage>([]),
    deals: InMemoryRepository.seeded<Deal>([]),
    tasks: InMemoryRepository.seeded<Task>([]),
    events: InMemoryRepository.seeded<CalendarEvent>([]),
    catalog: InMemoryRepository.seeded<CatalogProduct>([]),
    activities: InMemoryRepository.seeded<CrmActivity>([]),
    notes,
    appointmentTypes: InMemoryRepository.seeded<AppointmentType>([]),
    tags: InMemoryRepository.seeded<Tag>([])
  });
  const ctx = {
    crm, conversations, messages, contacts, quickReplies,
    orders: InMemoryRepository.seeded<Order>(ORDERS),
    products,
    customers: InMemoryRepository.seeded([]),
    pricing: { productPricing: () => ({ suggestedPrice: 8990 }) },
    order: { create: vi.fn(async () => ({})) },
    auth: { currentUser: () => ({ id: 'u1' }) } as unknown as AppContext['auth'],
    whatsapp: { sendText }
  } as unknown as AppContext;

  const root = document.createElement('div');
  document.body.appendChild(root);
  // Spy on the ROOT itself: the inbox root outlives every redraw, so any
  // listener parked on it is a leak that stacks and fires again and again.
  const rootListeners: string[] = [];
  const original = root.addEventListener.bind(root);
  const spy = function (this: HTMLElement, ...args: unknown[]): void {
    rootListeners.push(args[0] as string);
    (original as (...a: unknown[]) => void)(...args);
  };
  root.addEventListener = spy as typeof root.addEventListener;

  renderCrmInboxView(root, ctx);
  return { ctx, root, messages, notes, sendText, rootListeners };
}

// What the SSE stream does on every pushed message: reload the caches and
// repaint the whole inbox. This is the event that used to wipe the field.
async function backgroundRefresh(): Promise<void> {
  await getTestRefreshInbox()!();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function openNotes(root: HTMLElement): void {
  qs<HTMLElement>('#toggle-notes', root).click();
}

// `composing` is module-level and survives between scenarios, so a composer
// left open by the previous one is closed first to pin the starting state.
function openComposer(root: HTMLElement): void {
  qsIf('#cancel-order', root)?.click();
  qs<HTMLElement>('#new-order', root).click();
}

// Every path under test is async (repository load -> redraw -> rerender), so
// one macrotask is not enough to drain the chain.
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function field<T extends HTMLElement>(root: HTMLElement, id: string): T {
  return qs<T>(`#${id}`, root);
}

describe('Inbox — o campo não pode ser apagado nem perder o foco', () => {
  it('mantém o texto, o foco e o cursor do compositor após um refresh', async () => {
    const { root } = buildCtx();
    const area = field<HTMLTextAreaElement>(root, 'composer-text');
    area.value = 'Ana, o bolo de limão';
    area.focus();
    area.setSelectionRange(4, 4);

    await backgroundRefresh();

    const fresh = field<HTMLTextAreaElement>(root, 'composer-text');
    expect(fresh.value).toBe('Ana, o bolo de limão');
    expect(document.activeElement).toBe(fresh);
    expect(fresh.selectionStart).toBe(4);
  });

  it('não apaga a anotação nem desfoca o campo de notas', async () => {
    const { root } = buildCtx();
    openNotes(root);
    const note = field<HTMLInputElement>(root, 'note-text');
    note.value = 'anotação importante';
    note.focus();

    await backgroundRefresh();

    const fresh = field<HTMLInputElement>(root, 'note-text');
    expect(fresh.value).toBe('anotação importante');
    expect(document.activeElement).toBe(fresh);
  });

  it('não apaga o texto escolhido numa resposta rápida', async () => {
    const { root } = buildCtx();
    qs<HTMLElement>('[data-reply]', root).click();
    expect(field<HTMLTextAreaElement>(root, 'composer-text').value)
      .toBe('Olá! Como posso ajudar?');

    await backgroundRefresh();

    expect(field<HTMLTextAreaElement>(root, 'composer-text').value)
      .toBe('Olá! Como posso ajudar?');
  });

  it('mantém o prazo escolhido no Adormecer', async () => {
    const { root } = buildCtx();
    field<HTMLSelectElement>(root, 'snooze-for').value = '1440';

    await backgroundRefresh();

    expect(field<HTMLSelectElement>(root, 'snooze-for').value).toBe('1440');
  });

  it('mantém entrega e observações do pedido em rascunho', async () => {
    const { root } = buildCtx();
    openComposer(root);
    const notes = field<HTMLTextAreaElement>(root, 'composer-notes');
    notes.value = 'sem cobertura';
    notes.dispatchEvent(new Event('input', { bubbles: true }));
    field<HTMLInputElement>(root, 'composer-delivery').value = '2026-12-25';
    field<HTMLInputElement>(root, 'composer-delivery')
      .dispatchEvent(new Event('change', { bubbles: true }));

    await backgroundRefresh();

    expect(field<HTMLTextAreaElement>(root, 'composer-notes').value)
      .toBe('sem cobertura');
    expect(field<HTMLInputElement>(root, 'composer-delivery').value)
      .toBe('2026-12-25');
  });

  it('mantém o produto escolhido no compositor de pedido', async () => {
    const { root } = buildCtx();
    openComposer(root);
    qs<HTMLElement>('#add-pick', root).click();
    const before = field<HTMLSelectElement>(root, 'product-pick').value;

    await backgroundRefresh();

    const picks = root.querySelectorAll('.composer-pick');
    expect(picks).toHaveLength(1);
    expect(field<HTMLSelectElement>(root, 'product-pick').value).toBe(before);
  });

  it('sobrevive a vários refreshes seguidos sem perder nada', async () => {
    const { root } = buildCtx();
    openNotes(root);
    field<HTMLInputElement>(root, 'note-text').value = 'persistente';
    field<HTMLSelectElement>(root, 'snooze-for').value = '4320';

    for (let i = 0; i < 5; i += 1) await backgroundRefresh();

    expect(field<HTMLInputElement>(root, 'note-text').value).toBe('persistente');
    expect(field<HTMLSelectElement>(root, 'snooze-for').value).toBe('4320');
  });
});

describe('Inbox — envio e nota que terminam depois de um redraw', () => {
  it('não devolve a mensagem enviada para o compositor', async () => {
    const { root, sendText } = buildCtx();
    const area = field<HTMLTextAreaElement>(root, 'composer-text');
    area.value = 'olá ana';
    // The send is in flight when a pushed message repaints the inbox.
    sendText.mockImplementation(async () => {
      await backgroundRefresh();
    });

    qs<HTMLFormElement>('#composer', root).dispatchEvent(new Event('submit', {
      bubbles: true, cancelable: true
    }));
    await flush();

    expect(sendText).toHaveBeenCalledTimes(1);
    expect(field<HTMLTextAreaElement>(root, 'composer-text').value).toBe('');
  });

  it('não joga fora o que o atendente digitou durante o envio', async () => {
    const { root, ctx, sendText } = buildCtx();
    field<HTMLTextAreaElement>(root, 'composer-text').value = 'olá ana';
    let typed!: () => void;
    sendText.mockImplementation(() => new Promise<void>((resolve) => {
      typed = () => {
        field<HTMLTextAreaElement>(root, 'composer-text').value = 'já vou';
        resolve();
      };
    }));

    qs<HTMLFormElement>('#composer', root).dispatchEvent(new Event('submit', {
      bubbles: true, cancelable: true
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    typed();
    await flush();

    expect(ctx.crm.inbox()).toHaveLength(1);
    expect(field<HTMLTextAreaElement>(root, 'composer-text').value)
      .toBe('já vou');
  });

  it('limpa a anotação salva depois de um redraw no meio', async () => {
    const { root, notes, ctx } = buildCtx();
    openNotes(root);
    field<HTMLInputElement>(root, 'note-text').value = 'ligar depois';
    await ctx.crm.addNote('conv-1', 'pré', 'u1');
    await backgroundRefresh();
    field<HTMLInputElement>(root, 'note-text').value = 'ligar depois';

    qs<HTMLFormElement>('#note-form', root).dispatchEvent(new Event('submit', {
      bubbles: true, cancelable: true
    }));
    await flush();

    expect(notes.getAll().map((n) => n.body)).toContain('ligar depois');
    expect(field<HTMLInputElement>(root, 'note-text').value).toBe('');
  });
});

describe('Inbox — o mês do gráfico não empilha listener no root', () => {
  it('nunca delega change para a root que sobrevive ao redraw', async () => {
    const { root, rootListeners } = buildCtx();
    for (let i = 0; i < 4; i += 1) await backgroundRefresh();

    expect(rootListeners.filter((type) => type === 'change')).toHaveLength(0);
  });

  it('ainda troca o mês depois de vários redraws', async () => {
    const { root } = buildCtx();
    const options = () => Array.from(
      qs<HTMLSelectElement>('.month-select', root).options
    ).map((o) => o.value);
    const other = options().find((value) =>
      value !== qs<HTMLSelectElement>('.month-select', root).value)!;

    await backgroundRefresh();
    const select = qs<HTMLSelectElement>('.month-select', root);
    select.value = other;
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(qs<HTMLSelectElement>('.month-select', root).value).toBe(other);
  });
});

describe('Inbox — a mensagem recebida continua chegando durante a digitação', () => {
  it('revela o texto novo sem roubar o campo do atendente', async () => {
    const { root, messages } = buildCtx();
    const area = field<HTMLTextAreaElement>(root, 'composer-text');
    area.value = 'digitando…';
    area.focus();

    await messages.add({
      id: 'm2', conversationId: 'conv-1', direction: 'inbound',
      text: 'chegou!', createdBy: '', createdAt: T2
    });
    await backgroundRefresh();

    expect(root.querySelectorAll('.bubble')).toHaveLength(2);
    expect(field<HTMLTextAreaElement>(root, 'composer-text').value)
      .toBe('digitando…');
    expect(document.activeElement)
      .toBe(field(root, 'composer-text'));
  });
});
