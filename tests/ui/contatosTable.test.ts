// @vitest-environment happy-dom
// The Contatos menu must reflect EVERY contact saved in the app, and saving
// a new one must both persist and land in the table.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AppContext } from '../../src/state/AppContext';
import type { Contact, User } from '../../src/domain/crm';
import { renderCrmContatosView } from '../../src/ui/views/crm/CrmContatosView';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import { qs } from '../../src/ui/dom';

vi.mock('../../src/ui/Toast', () => ({ showToast: vi.fn() }));

const ADMIN: User = {
  id: 'u1',
  name: 'Admin',
  email: 'admin@deskcomm.local',
  passwordHash: '',
  role: 'admin',
  createdAt: '2026-01-01T00:00:00Z'
};

/** A contact shaped exactly like the one the create form posts. */
function contact(index: number, over: Partial<Contact> = {}): Contact {
  return {
    id: `c${index}`,
    name: `Contato ${String(index).padStart(2, '0')}`,
    phone: `551190000${String(index).padStart(4, '0')}`,
    email: `c${index}@example.com`,
    notes: '',
    tags: [],
    assignedUserId: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    ...over
  };
}

function makeCtx(saved: Contact[]): AppContext {
  const contacts = InMemoryRepository.seeded<Contact>(saved);
  const auth = {
    currentUser: vi.fn(() => ADMIN),
    subscribe: vi.fn(() => () => {})
  } as unknown as AppContext['auth'];
  const crm = {
    recordActivity: vi.fn().mockResolvedValue(undefined)
  } as unknown as AppContext['crm'];
  return {
    contacts,
    deals: InMemoryRepository.seeded([]),
    conversations: InMemoryRepository.seeded([]),
    activities: InMemoryRepository.seeded([]),
    tags: InMemoryRepository.seeded([]),
    auth,
    crm
  } as unknown as AppContext;
}

function mount(ctx: AppContext): HTMLElement {
  const root = document.createElement('div');
  renderCrmContatosView(root, ctx);
  document.body.appendChild(root);
  return root;
}

function namesIn(root: HTMLElement): string[] {
  return [...root.querySelectorAll('tbody tr')]
    .map((tr) => tr.querySelector('td')?.textContent ?? '')
    .sort();
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('CrmContatosView lists every saved contact', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows a row for every contact in the repository @spec:AC-028', () => {
    // More than a screenful, so a silent cap would show up as a short count.
    const saved = Array.from({ length: 30 }, (_, i) => contact(i + 1));
    const root = mount(makeCtx(saved));

    expect(root.querySelectorAll('tbody tr')).toHaveLength(30);
  });

  it('renders each saved contact by name, phone and e-mail @spec:AC-029', () => {
    const root = mount(makeCtx([contact(1), contact(2)]));
    const text = root.textContent ?? '';

    expect(text).toContain('Contato 01');
    expect(text).toContain('5511900000001');
    expect(text).toContain('c1@example.com');
    expect(text).toContain('Contato 02');
    expect(text).toContain('c2@example.com');
  });

  it('sorts the whole set by name @spec:AC-030', () => {
    const saved = [
      contact(1, { name: 'Zilda' }),
      contact(2, { name: 'Ana' }),
      contact(3, { name: 'Marta' })
    ];
    const root = mount(makeCtx(saved));
    const firstCells = [...root.querySelectorAll('tbody tr')].map(
      (tr) => tr.querySelector('td')?.textContent ?? ''
    );

    expect(firstCells).toEqual(['Ana', 'Marta', 'Zilda']);
  });

  it('shows the empty state when nothing is saved @spec:AC-031', () => {
    const root = mount(makeCtx([]));

    expect(root.querySelector('tbody tr')).toBeFalsy();
    expect(root.textContent).toContain('Nenhum contato ainda');
  });

  it('keeps listing every contact while the duplicate panel is open', () => {
    // Two contacts share a phone, so the dupes toggle appears. Opening it
    // must not drop anybody from the main table.
    const saved = [
      contact(1, { name: 'Ana', phone: '5511900000001' }),
      contact(2, { name: 'Ana Copia', phone: '5511900000001' }),
      contact(3, { name: 'Bruno' })
    ];
    const root = mount(makeCtx(saved));

    const toggle = qs<HTMLButtonElement>('#toggle-dupes', root);
    expect(toggle).toBeTruthy();
    toggle?.click();

    expect(root.querySelectorAll('tbody tr')).toHaveLength(3);
  });
});

describe('CrmContatosView saves a new contact into the list', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('persists the submitted fields and shows the new row @spec:AC-032', async () => {
    const ctx = makeCtx([contact(1)]);
    const root = mount(ctx);

    qs<HTMLButtonElement>('#new-contact', root)?.click();
    const form = qs<HTMLFormElement>('.modal form', document.body);
    expect(form).toBeTruthy();

    const set = (name: string, value: string) => {
      const field = form?.querySelector<HTMLInputElement>(`[name="${name}"]`);
      expect(field).toBeTruthy();
      if (field) field.value = value;
    };
    set('name', 'Carla E2E');
    set('phone', '5511998887777');
    set('email', 'carla@example.com');
    const notes = form?.querySelector<HTMLTextAreaElement>('[name="notes"]');
    if (notes) notes.value = 'Compradora frequente';
    set('tags', 'vip, lead');

    form?.dispatchEvent(new Event('submit', { bubbles: true }));
    await flush();

    // Persisted with every field the user typed.
    const saved = ctx.contacts.getAll();
    const carla = saved.find((c) => c.name === 'Carla E2E');
    expect(carla).toBeDefined();
    expect(carla?.phone).toBe('5511998887777');
    expect(carla?.email).toBe('carla@example.com');
    expect(carla?.notes).toBe('Compradora frequente');
    expect(carla?.tags).toEqual(['vip', 'lead']);
    expect(carla?.assignedUserId).toBe('u1');
    expect(carla?.createdAt).toBeTruthy();

    // And the table grew to include it, without losing the older one.
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(root.textContent).toContain('Carla E2E');
    expect(namesIn(root)).toEqual(['Carla E2E', 'Contato 01']);
  });

  it('accumulates repeated saves so the list grows every time', async () => {
    const ctx = makeCtx([]);
    const root = mount(ctx);

    for (let i = 1; i <= 3; i += 1) {
      qs<HTMLButtonElement>('#new-contact', root)?.click();
      const form = qs<HTMLFormElement>('.modal form', document.body);
      const name = form?.querySelector<HTMLInputElement>('[name="name"]');
      if (name) name.value = `Novo ${i}`;
      form?.dispatchEvent(new Event('submit', { bubbles: true }));
      await flush();
    }

    expect(ctx.contacts.getAll()).toHaveLength(3);
    expect(root.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(root.textContent).toContain('Novo 1');
    expect(root.textContent).toContain('Novo 2');
    expect(root.textContent).toContain('Novo 3');
  });

  it('closes the modal so the new contact is visible @spec:AC-033', async () => {
    const root = mount(makeCtx([]));

    qs<HTMLButtonElement>('#new-contact', root)?.click();
    const form = qs<HTMLFormElement>('.modal form', document.body);
    const name = form?.querySelector<HTMLInputElement>('[name="name"]');
    if (name) name.value = 'Visivel';
    form?.dispatchEvent(new Event('submit', { bubbles: true }));
    await flush();

    expect(document.body.querySelector('.modal-backdrop')).toBeFalsy();
    expect(root.textContent).toContain('Visivel');
  });
});
