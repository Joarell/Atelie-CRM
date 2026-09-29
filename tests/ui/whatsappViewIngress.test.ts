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

function buildCtx(
  state: WahaSessionState
): { ctx: AppContext; root: HTMLElement; dispose: () => void } {
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
      session: async () => state,
      start: async () => state,
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
    webhook: { configured: true, registered: false }
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
    state.webhook = { configured: false, registered: false };
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
    state.webhook = { configured: true, registered: true };
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
});