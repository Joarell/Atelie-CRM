// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { AppContext } from '../../src/state/AppContext';
import type {
  WahaHealth, WahaSessionSnapshot
} from '../../src/domain/whatsapp';
import type { WahaSessionState } from '../../src/repositories/WahaApiRepository';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import { renderCrmWhatsAppView } from '../../src/ui/views/crm/CrmWhatsAppView';
import { qs } from '../../src/ui/dom';

function liveHealth(): WahaHealth {
  return {
    configured: true, reachable: true, authenticated: true, healthy: true,
    version: '2026.7.2', engine: 'NOWEB', tier: 'CORE', detail: null,
    session: { name: 'default', status: 'WORKING' }
  };
}

function liveSession(): WahaSessionSnapshot {
  return { name: 'default', status: 'WORKING' };
}

type Built = { ctx: AppContext; root: HTMLElement; dispose: () => void };
type SessionCall = () => Promise<WahaSessionState>;

function buildCtx(state: WahaSessionState): Built {
  return buildWith(async () => state);
}

function buildFailingCtx(reason: string): Built {
  return buildWith(async () => {
    throw new Error(reason);
  });
}

function buildWith(load: SessionCall): Built {
  const conversations = InMemoryRepository.seeded([]);
  const messages = InMemoryRepository.seeded([]);
  const contacts = InMemoryRepository.seeded([]);
  const auth = {
    isAuthenticated: () => false,
    currentUser: () => ({ id: 'u1' }),
    subscribe: () => () => {}
  } as unknown as AppContext['auth'];
  const ctx = {
    conversations, messages, contacts,
    auth,
    whatsapp: {
      session: load,
      start: async () => load(),
      stop: async () => true,
      sendText: async () => ({})
    }
  } as unknown as AppContext;
  const root = document.createElement('div');
  document.body.appendChild(root);
  const dispose = renderCrmWhatsAppView(root, ctx);
  return { ctx, root, dispose };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function baseState(): WahaSessionState {
  return {
    configured: true, health: liveHealth(), session: liveSession(),
    webhook: { configured: true, registered: false, acceptable: true, refusal: null }
  };
}

describe('WhatsApp view — ingress readiness banner', () => {
  it('alerta quando a sessão roda sem o webhook registrado', async () => {
    const { root, dispose } = buildCtx(baseState());
    await flush();
    dispose();
    const banner = qs<HTMLElement>('.warn-banner', root);
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('Webhook não registrado no motor');
  });

  it('alerta quando WHATSAPP_HOOK_URL está ausente do ambiente', async () => {
    const state = baseState();
    state.webhook = {
      configured: false, registered: false, acceptable: false, refusal: null
    };
    const { root, dispose } = buildCtx(state);
    await flush();
    dispose();
    const banner = qs<HTMLElement>('.warn-banner', root);
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('Webhook não configurado');
    expect(banner.textContent).toContain('WHATSAPP_HOOK_URL');
  });

  it('omite o banner quando a entrega está registrada', async () => {
    const state = baseState();
    state.webhook = {
      configured: true, registered: true, acceptable: true, refusal: null
    };
    const { root, dispose } = buildCtx(state);
    await flush();
    dispose();
    expect(root.querySelector('.warn-banner')).toBeNull();
  });

  it('omite o banner quando o motor está fora do ar', async () => {
    const state = baseState();
    state.health = {
      ...liveHealth(), reachable: false, healthy: false,
      detail: 'waha_inacessivel'
    };
    const { root, dispose } = buildCtx(state);
    await flush();
    dispose();
    expect(root.querySelector('.warn-banner')).toBeNull();
  });

  // Regression guard for the silent ingress outage: the webhook IS registered
  // and the session IS WORKING, so before this the view returned no banner at
  // all while the app 503'd every single delivery and archived nothing.
  it('alerta quando a entrega é recusada, mesmo com webhook registrado', async () => {
    const state = baseState();
    state.webhook = {
      configured: true, registered: true,
      acceptable: false, refusal: 'secret_required'
    };
    const { root, dispose } = buildCtx(state);
    await flush();
    dispose();
    const banner = qs<HTMLElement>('.warn-banner', root);
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('Webhook recusado pelo app');
    expect(banner.textContent).toContain('WAHA_HMAC_SECRET');
  });

  // Regression guard for the misleading report: the engine was healthy
  // (`alcancavel true`, `WORKING`) while the auth middleware answered 403
  // `troca_de_senha_obrigatoria`, and the view still said "WAHA inacessível",
  // sending the operator to debug a motor that was working the whole time.
  it('não acusa o motor quando a leitura foi recusada por auth', async () => {
    const { root, dispose } = buildFailingCtx('troca_de_senha_obrigatoria');
    await flush();
    dispose();
    expect(root.textContent).not.toContain('WAHA inacessível');
    expect(root.textContent).toContain('Login pendente');
  });

  it('ainda acusa o motor quando a falha é de transporte', async () => {
    const { root, dispose } = buildFailingCtx('fetch failed');
    await flush();
    dispose();
    expect(root.textContent).toContain('WAHA inacessível');
    expect(root.textContent).not.toContain('Login pendente');
  });

  // Regression guard: `requireRole` answers `papel_insuficiente` to any
  // logged-in non-admin on this admin-only route. It was classified as a
  // transport failure, so a healthy engine was blamed for a role problem.
  it('não acusa o motor quando o papel não permite o WhatsApp', async () => {
    const { root, dispose } = buildFailingCtx('papel_insuficiente');
    await flush();
    dispose();
    expect(root.textContent).not.toContain('WAHA inacessível');
    expect(root.textContent).toContain('Acesso restrito');
  });

  // The login card tells the operator to re-login and rotate a password, which
  // can NEVER fix a role refusal. Keeping the two apart is the whole point.
  it('não empresta o conselho de login quando o problema é o papel', async () => {
    const { root, dispose } = buildFailingCtx('nao_autorizado');
    await flush();
    dispose();
    expect(root.textContent).toContain('Acesso restrito');
    expect(root.textContent).not.toContain('Login pendente');
    expect(root.textContent).not.toContain('troque a senha');
  });
});