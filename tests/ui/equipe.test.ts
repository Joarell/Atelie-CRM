// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AppContext } from '../../src/state/AppContext';
import type { User } from '../../src/domain/crm';
import {
  renderCrmEquipeView,
  userPatchFor
} from '../../src/ui/views/crm/CrmEquipeView';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import { qs } from '../../src/ui/dom';

vi.mock('../../src/ui/Toast', () => ({
  showToast: vi.fn()
}));

const ADMIN: User = {
  id: 'u1',
  name: 'Admin',
  email: 'admin@deskcomm.local',
  passwordHash: '',
  role: 'admin',
  createdAt: '2026-01-01T00:00:00Z'
};

function makeCtx(me: User | null): AppContext {
  const users = InMemoryRepository.seeded<User>([ADMIN]);
  const auth = {
    currentUser: vi.fn(() => me),
    subscribe: vi.fn(() => () => {}),
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    changePassword: vi.fn().mockResolvedValue(undefined)
  } as unknown as AppContext['auth'];
  return { users, auth } as unknown as AppContext;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mount(ctx: AppContext): HTMLElement {
  const root = document.createElement('div');
  renderCrmEquipeView(root, ctx);
  document.body.appendChild(root);
  return root;
}

describe('CrmEquipeView — password editing', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('userPatchFor sends `password` (never passwordHash) for the wire', () => {
    const withPassword = userPatchFor({
      name: 'Admin', email: 'a@b.c', role: 'admin', password: 'nova-123'
    });
    expect(withPassword.password).toBe('nova-123');
    expect(withPassword).not.toHaveProperty('passwordHash');
    const kept = userPatchFor({
      name: 'Admin', email: 'a@b.c', role: 'admin', password: ''
    });
    expect(kept).not.toHaveProperty('password');
    expect(kept.email).toBe('a@b.c');
  });

  it('logged in: opens "Trocar senha" and calls auth.changePassword', async () => {
    const ctx = makeCtx(ADMIN);
    const root = mount(ctx);
    qs('#change-password', root).click();
    const modal = document.body.querySelector(
      'form input[name=current_password]'
    ) as HTMLInputElement;
    expect(modal).toBeTruthy();
    (document.body.querySelector(
      'input[name=new_password]'
    ) as HTMLInputElement).value = 'nova-senha-123';
    modal.value = 'admin123';
    const form = qs('form', document.body);
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await flush();
    expect(ctx.auth.changePassword).toHaveBeenCalledWith(
      'admin123', 'nova-senha-123'
    );
  });

  it('logged out: offers Entrar and submits the login form', async () => {
    const ctx = makeCtx(null);
    const root = mount(ctx);
    qs('#login', root).click();
    const form = qs('form', document.body);
    (qs<HTMLInputElement>('input[name=email]', form) as HTMLInputElement)
      .value = 'admin@deskcomm.local';
    (qs<HTMLInputElement>('input[name=password]', form) as HTMLInputElement)
      .value = 'admin123';
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await flush();
    expect(ctx.auth.login).toHaveBeenCalledWith(
      'admin@deskcomm.local', 'admin123'
    );
  });
});