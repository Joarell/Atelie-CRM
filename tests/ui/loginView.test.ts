// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AppContext } from '../../src/state/AppContext';
import type { User } from '../../src/domain/crm';
import { renderLoginView } from '../../src/ui/views/LoginView';
import { qs } from '../../src/ui/dom';

vi.mock('../../src/ui/Toast', () => ({
  showToast: vi.fn()
}));

const USER: User = {
  id: 'u1',
  name: 'Admin',
  email: 'admin@deskcomm.local',
  passwordHash: '',
  role: 'admin',
  createdAt: '2026-01-01T00:00:00Z'
};

function makeCtx(auth: Partial<AppContext['auth']>): AppContext {
  return {
    auth: {
      login: vi.fn(),
      changePassword: vi.fn(),
      logout: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      currentUser: vi.fn(() => null),
      ...auth
    }
  } as unknown as AppContext;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mount(ctx: AppContext): HTMLElement {
  const root = document.createElement('div');
  renderLoginView(root, ctx);
  document.body.appendChild(root);
  return root;
}

describe('LoginView (#/login)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.location.hash = '';
    sessionStorage.clear();
  });

  it('renders the e-mail + password form when logged out', () => {
    const root = mount(makeCtx({}));
    expect(qs('input[name=email]', root)).toBeTruthy();
    expect(qs('input[name=password]', root)).toBeTruthy();
    expect(qs<HTMLButtonElement>('#login-submit', root).type).toBe('submit');
  });

  it('submits the credentials to auth.login and goes to the painel', async () => {
    const login = vi.fn().mockResolvedValue(USER);
    const ctx = makeCtx({ login });
    const root = mount(ctx);
    qs<HTMLInputElement>('input[name=email]', root).value = 'a@b.c';
    qs<HTMLInputElement>('input[name=password]', root).value = 'segredo';
    qs('form', root).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await flush();
    expect(login).toHaveBeenCalledWith('a@b.c', 'segredo');
    expect(window.location.hash).toBe('#/');
  });

  it('shows a friendly inline error and re-enables the button', async () => {
    const login = vi.fn().mockRejectedValue(new Error('credenciais_invalidas'));
    const root = mount(makeCtx({ login }));
    qs<HTMLInputElement>('input[name=email]', root).value = 'a@b.c';
    qs<HTMLInputElement>('input[name=password]', root).value = 'errada';
    qs('form', root).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await flush();
    expect(qs('#login-error', root).textContent).toBe(
      'E-mail ou senha incorretos.'
    );
    expect(qs<HTMLButtonElement>('#login-submit', root).disabled).toBe(false);
  });

  it('returns to the stored route after a successful login', async () => {
    sessionStorage.setItem('login_return_path', '#/equipe');
    window.location.hash = '#/login';
    const root = mount(makeCtx({ login: vi.fn().mockResolvedValue(USER) }));
    qs<HTMLInputElement>('input[name=email]', root).value = 'a@b.c';
    qs<HTMLInputElement>('input[name=password]', root).value = 'segredo';
    qs('form', root).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await flush();
    expect(window.location.hash).toBe('#/equipe');
    expect(sessionStorage.getItem('login_return_path')).toBeNull();
  });

  it('shows the logged-in state and lets the user go to the painel', () => {
    const ctx = makeCtx({ currentUser: vi.fn(() => USER) });
    const root = mount(ctx);
    expect(root.textContent).toContain('já está conectado');
    qs('#go-dashboard', root).click();
    expect(window.location.hash).toBe('#/');
  });
});