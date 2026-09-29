// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/state/AppContext';
import type {
  AppointmentType, CalendarEvent, CatalogProduct, Contact,
  Conversation, ConversationNote, CrmActivity, Deal, Message,
  Pipeline, QuickReply, Stage, Tag, Task
} from '../../src/domain/crm';
import type { Order } from '../../src/domain/types';
import { CrmService } from '../../src/services/CrmService';
import { WhatsappService, type WahaGateway } from '../../src/services/WhatsappService';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import { renderCrmInboxView } from '../../src/ui/views/crm/CrmInboxView';
import { qs } from '../../src/ui/dom';

vi.mock('../../src/ui/realtimeRefresh', () => ({
  startRealtimeRefresh: () => () => {}
}));

vi.mock('../../src/ui/Toast', () => ({
  showToast: vi.fn()
}));

import { showToast } from '../../src/ui/Toast';

const NOW = '2026-09-20T10:00:00.000Z';
const CONV_ID = 'conv-1';

// happy-dom reports no layout, so we give every element the same fake scroll
// shape: a 600px-tall thread 300px viewport, with scrollTop stored per node.
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

function threadEl(root: HTMLElement): HTMLElement {
  return qs<HTMLElement>('.inbox-messages', root);
}

function scrollThread(root: HTMLElement, top: number): void {
  threadEl(root).scrollTop = top;
}

function fluent<T extends { id: string }>(seed: T[]): void {
  void InMemoryRepository.seeded(seed);
}

function buildCtx(
  channel = 'whatsapp',
  gateway?: WahaGateway
): {
  ctx: AppContext;
  messages: InMemoryRepository<Message>;
  conversations: InMemoryRepository<Conversation>;
  sendText: ReturnType<typeof vi.fn>;
} {
  const messages = InMemoryRepository.seeded<Message>([
    {
      id: 'm1', conversationId: CONV_ID, direction: 'inbound',
      text: 'olá', createdBy: '', createdAt: NOW
    }
  ]);
  const conversations = InMemoryRepository.seeded<Conversation>([
    {
      id: CONV_ID, contactId: 'p1', channel, channelPhone: '5511999990001',
      lastMessageAt: NOW, assignedUserId: '', status: 'open',
      snoozedUntil: '', createdAt: NOW
    }
  ]);
  const contacts = InMemoryRepository.seeded<Contact>([
    {
      id: 'p1', name: 'Ana', phone: '5511999990001', email: '',
      notes: '', tags: [], createdAt: NOW
    }
  ]);
  const quickReplies = InMemoryRepository.seeded<QuickReply>([]);
  const orders = InMemoryRepository.seeded<Order>([]);
  fluent(contacts.getAll());
  const sendText = vi.fn(async (_id: string, text: string) => {
    const outbound: Message = {
      id: 'm2', conversationId: CONV_ID, direction: 'outbound',
      text, createdBy: 'u1', createdAt: NOW, waStatus: 'sent'
    };
    await messages.add(outbound);
    return outbound;
  });
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
    currentUser: () => ({ id: 'u1' })
  } as unknown as AppContext['auth'];
  const ctx = {
    crm, conversations, messages, contacts, quickReplies, orders,
    auth,
    whatsapp: gateway
      ? new WhatsappService(gateway, messages, conversations)
      : { sendText }
  } as unknown as AppContext;
  return { ctx, messages, conversations, sendText };
}

function mountInbox(ctx: AppContext): {
  area: HTMLTextAreaElement;
  form: HTMLFormElement;
  root: HTMLElement;
} {
  const root = document.createElement('div');
  document.body.appendChild(root);
  renderCrmInboxView(root, ctx);
  return {
    area: qs<HTMLTextAreaElement>('#composer-text', root),
    form: qs<HTMLFormElement>('#composer', root),
    root
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Inbox Enviar button', () => {
  it('sends the typed text to WAHA and clears the composer', async () => {
    const { ctx, sendText } = buildCtx();
    const { area, form, root } = mountInbox(ctx);
    area.value = 'olá ana';
    form.dispatchEvent(new Event('submit', {
      bubbles: true, cancelable: true
    }));
    await flush();
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith(CONV_ID, 'olá ana');
    const fresh = qs<HTMLTextAreaElement>('#composer-text', root);
    expect(fresh.value).toBe('');
  });

  it('renders the sent message in the chat box next to the received ones', async () => {
    const { ctx } = buildCtx();
    const { area, form, root } = mountInbox(ctx);
    area.value = 'olá ana';
    form.dispatchEvent(new Event('submit', {
      bubbles: true, cancelable: true
    }));
    await flush();

    const bubbles = root.querySelectorAll('.bubble');
    expect(bubbles).toHaveLength(2);
    expect(root.querySelector('.bubble.in')?.textContent).toContain('olá');
    const out = root.querySelector('.bubble.out');
    expect(out?.textContent).toContain('olá ana');
    expect(out?.querySelector('.bubble-tick')).not.toBeNull();
  });

  it('shows the sent bubble immediately through the real WhatsappService', async () => {
    const gateway = {
      send: vi.fn(async () => ({
        id: 'm2', conversationId: CONV_ID, direction: 'outbound',
        text: 'olá ana', createdBy: 'u1', createdAt: NOW, waStatus: 'sent'
      }))
    } as unknown as WahaGateway;
    const { ctx, messages } = buildCtx('whatsapp', gateway);
    const { area, form, root } = mountInbox(ctx);
    area.value = 'olá ana';
    form.dispatchEvent(new Event('submit', {
      bubbles: true, cancelable: true
    }));
    await flush();

    expect(gateway.send).toHaveBeenCalledWith(CONV_ID, 'olá ana', undefined);
    expect(messages.getById('m2')).toMatchObject({ direction: 'outbound' });
    expect(root.querySelector('.bubble.in')?.textContent).toContain('olá');
    expect(root.querySelector('.bubble.out')?.textContent).toContain('olá ana');
  });

  it('does not send when the composer only holds whitespace', async () => {
    const { ctx, sendText } = buildCtx();
    const { area, form } = mountInbox(ctx);
    area.value = '   ';
    form.dispatchEvent(new Event('submit', {
      bubbles: true, cancelable: true
    }));
    await flush();
    expect(sendText).not.toHaveBeenCalled();
    expect(area.value).toBe('   ');
  });

  it('keeps the draft and toasts when WAHA send fails', async () => {
    const { ctx } = buildCtx();
    const failing = vi.fn(async () => {
      throw new Error('Waha indisponível');
    });
    (ctx.whatsapp as unknown as { sendText: typeof failing }).sendText = failing;
    const { area, form } = mountInbox(ctx);
    area.value = 'olá ana';
    form.dispatchEvent(new Event('submit', {
      bubbles: true, cancelable: true
    }));
    await flush();
    expect(showToast).toHaveBeenCalledWith('Waha indisponível');
    expect(area.value).toBe('olá ana');
  });

  it('routes non-WhatsApp conversations through the CRM, not WAHA', async () => {
    const { ctx, sendText } = buildCtx('email');
    const { area, form } = mountInbox(ctx);
    area.value = 'recado por email';
    form.dispatchEvent(new Event('submit', {
      bubbles: true, cancelable: true
    }));
    await flush();
    expect(sendText).not.toHaveBeenCalled();
    expect(ctx.messages.getAll()).toHaveLength(2);
  });
});

describe('Inbox thread (rolagem automática)', () => {
  it('gruda no fim ao enviar, mesmo lendo o histórico', async () => {
    const { ctx } = buildCtx();
    const { area, form, root } = mountInbox(ctx);
    scrollThread(root, 120);
    area.value = 'olá ana';
    form.dispatchEvent(new Event('submit', {
      bubbles: true, cancelable: true
    }));
    await flush();

    expect(threadEl(root).scrollTop).toBe(300);
    const bubbles = root.querySelectorAll('.bubble');
    expect(bubbles[1].textContent).toContain('olá ana');
    expect(bubbles[1].classList.contains('out')).toBe(true);
  });

  it('mantém a posição de um leitor já no fim em um redraw comum', async () => {
    const { ctx } = buildCtx();
    const { root } = mountInbox(ctx);
    scrollThread(root, 500);
    qs<HTMLElement>('#toggle-notes', root).click();

    const fresh = threadEl(root);
    expect(fresh.scrollTop).toBe(500);
  });

  it('nunca arrasta o leitor dentro do histórico em um redraw comum', async () => {
    const { ctx } = buildCtx();
    const { root } = mountInbox(ctx);
    scrollThread(root, 120);
    qs<HTMLElement>('#toggle-notes', root).click();

    expect(threadEl(root).scrollTop).toBe(120);
  });

  it('mostra a nova mensagem na base do chat após Enviar', async () => {
    const { ctx } = buildCtx();
    const { area, form, root } = mountInbox(ctx);
    area.value = 'olá ana';
    form.dispatchEvent(new Event('submit', {
      bubbles: true, cancelable: true
    }));
    await flush();

    const bubbles = root.querySelectorAll('.bubble');
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0].classList.contains('in')).toBe(true);
    expect(bubbles[1].textContent).toContain('olá ana');
    expect(bubbles[1].classList.contains('out')).toBe(true);
  });
});

// happy-dom does not resolve layout from external stylesheets, so the CSS
// contract for the inbox stacking on phone screens is checked against the
// stylesheet itself.
const globalCss = readFileSync('src/styles/global.css', 'utf8');

// Extracts every @media block for a breakpoint (brace-counted).
function mediaBlocks(maxWidth: string): string[] {
  const blocks: string[] = [];
  let from = 0;
  while (from !== -1) {
    const start = globalCss.indexOf(`@media (max-width: ${maxWidth})`, from);
    if (start === -1) break;
    let depth = 0;
    let i: number;
    for (i = start; i < globalCss.length; i += 1) {
      const ch = globalCss[i];
      if (ch === '{') depth += 1;
      if (ch !== '}') continue;
      depth -= 1;
      if (depth === 0) break;
    }
    blocks.push(globalCss.slice(start, i + 1));
    from = i + 1;
  }
  return blocks;
}

describe('Inbox — layout responsivo', () => {
  it('vira pilha única (list · thread · pedidos) nas telas móveis', () => {
    const mobile = mediaBlocks('880px')
      .find((block) => block.includes('.inbox'))
      ?.toString() ?? '';
    expect(mobile).toContain('.inbox');
    expect(mobile).toContain('grid-template-columns: 1fr');
    expect(mobile).toContain('.inbox-thread');
    expect(mobile).toContain('max-height: none');
  });
});