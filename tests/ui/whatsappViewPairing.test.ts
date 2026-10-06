// @vitest-environment happy-dom
import {
  afterEach, beforeEach, describe, expect, it, vi
} from 'vitest';
import type { AppContext } from '../../src/state/AppContext';
import type {
  WahaHealth, WahaSessionSnapshot
} from '../../src/domain/whatsapp';
import type { WahaSessionState } from '../../src/repositories/WahaApiRepository';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import { renderCrmWhatsAppView } from '../../src/ui/views/crm/CrmWhatsAppView';
import { qs } from '../../src/ui/dom';

type Built = { root: HTMLElement; dispose: () => void };

function healthWith(status: string): WahaHealth {
  return {
    configured: true, reachable: true, authenticated: true, healthy: true,
    version: '2026.8.2', engine: 'NOWEB', tier: 'CORE', detail: null,
    session: { name: 'default', status }
  };
}

function buildCtx(state: WahaSessionState): Built {
  const ctx = {
    conversations: InMemoryRepository.seeded([]),
    messages: InMemoryRepository.seeded([]),
    contacts: InMemoryRepository.seeded([]),
    auth: {
      isAuthenticated: () => false,
      currentUser: () => ({ id: 'u1' }),
      subscribe: () => () => {}
    },
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
  return { root, dispose };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function stateFor(
  status: string,
  qr?: string,
  healthStatus = status
): WahaSessionState {
  const session: WahaSessionSnapshot = { name: 'default', status };
  if (qr) session.qr = qr;
  return {
    configured: true,
    health: healthWith(healthStatus),
    session,
    webhook: {
      configured: true, registered: true,
      acceptable: true, refusal: null
    }
  };
}

function startDisabled(root: HTMLElement): boolean {
  return qs<HTMLButtonElement>('#waha-start', root).disabled;
}

type Rotating = {
  root: HTMLElement;
  dispose: () => void;
  sessionCalls: () => number;
  rotate: (next: WahaSessionState) => void;
};

// `rotate` swaps what the next session() call returns WITHOUT notifying the
// view, modelling the engine's silent QR rotation — that is the whole defect.
function ctxWithSession(
  session: () => Promise<WahaSessionState>
): AppContext {
  return {
    conversations: InMemoryRepository.seeded([]),
    messages: InMemoryRepository.seeded([]),
    contacts: InMemoryRepository.seeded([]),
    auth: {
      isAuthenticated: () => false,
      currentUser: () => ({ id: 'u1' }),
      subscribe: () => () => {}
    },
    whatsapp: {
      session,
      start: session,
      stop: async () => true,
      sendText: async () => ({})
    }
  } as unknown as AppContext;
}

function buildRotating(initial: WahaSessionState): Rotating {
  let state = initial;
  let calls = 0;
  const ctx = ctxWithSession(async () => {
    calls += 1;
    return state;
  });
  const root = document.createElement('div');
  document.body.appendChild(root);
  const dispose = renderCrmWhatsAppView(root, ctx);
  return {
    root,
    dispose,
    sessionCalls: () => calls,
    rotate: (next: WahaSessionState) => {
      state = next;
    }
  };
}

function renderedQr(root: HTMLElement): string | null {
  return qs<HTMLImageElement>('img.waha-qr', root)?.getAttribute('src') ?? null;
}

// Scoped to the hint paragraph: the start BUTTON is also labelled
// "Iniciar sessão", so asserting on the whole card would always match and the
// invariant would be vacuous.
function hintText(root: HTMLElement): string {
  const field = qs<HTMLElement>('.field-label', root).parentElement;
  return field?.querySelector('p')?.textContent ?? '';
}

// The invariant that was broken: pairingHint read the raw snapshot status and
// had no WORKING branch, so a PAIRED session was told to press "Iniciar
// sessão" — a button that is disabled precisely because the session already
// works. The operator was chasing a QR that could never arrive.
describe('WhatsApp view — pairing hint agrees with the buttons', () => {
  it('nunca manda pressionar Iniciar sessão com o botão desabilitado', async () => {
    const cases = ['WORKING', 'STARTING', 'SCAN_QR_CODE', 'STOPPED', 'FAILED'];
    for (const status of cases) {
      const { root, dispose } = buildCtx(stateFor(status));
      await flush();
      dispose();
      if (startDisabled(root)) {
        expect(hintText(root), status).not.toContain('Iniciar sessão');
      }
    }
  });

  it('diz que a sessão pareada não usa QR quando está WORKING', async () => {
    const { root, dispose } = buildCtx(stateFor('WORKING'));
    await flush();
    dispose();
    expect(startDisabled(root)).toBe(true);
    expect(hintText(root)).toContain('pareada');
    expect(hintText(root)).toContain('não usa QR');
  });

  it('pede para iniciar quando a sessão está STOPPED', async () => {
    const { root, dispose } = buildCtx(stateFor('STOPPED'));
    await flush();
    dispose();
    expect(startDisabled(root)).toBe(false);
    expect(hintText(root)).toContain('Aperte "Iniciar sessão"');
  });

  it('aguarda o QR enquanto a sessão está STARTING', async () => {
    const { root, dispose } = buildCtx(stateFor('STARTING'));
    await flush();
    dispose();
    expect(root.textContent).toContain('Aguardando o QR');
  });

  it('avisa que o QR não chegou em SCAN_QR_CODE sem payload', async () => {
    const { root, dispose } = buildCtx(stateFor('SCAN_QR_CODE'));
    await flush();
    dispose();
    expect(root.textContent).toContain('O QR ainda não chegou');
  });

  it('descreve a falha de pareamento em FAILED', async () => {
    const { root, dispose } = buildCtx(stateFor('FAILED'));
    await flush();
    dispose();
    expect(root.textContent).toContain('falhou ao parear');
  });

  it('renderiza a imagem do QR quando o motor devolve o data URL', async () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    const { root, dispose } = buildCtx(stateFor('SCAN_QR_CODE', png));
    await flush();
    dispose();
    const img = qs<HTMLImageElement>('img.waha-qr', root);
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe(png);
    expect(img.getAttribute('alt')).toBe('QR do WhatsApp');
    expect(img.classList.contains('waha-qr')).toBe(true);
    expect(hintText(root)).not.toContain('Iniciar sessão');
  });

  // health says WORKING while the snapshot is stale/STOPPED: the button is
  // disabled off `working`, so the hint must follow the same flag rather than
  // the raw snapshot status.
  it('segue o health quando o snapshot discorda do status real', async () => {
    const { root, dispose } = buildCtx(stateFor('STOPPED', undefined, 'WORKING'));
    await flush();
    dispose();
    expect(startDisabled(root)).toBe(true);
    expect(root.textContent).toContain('pareada');
  });
});

// The engine ROTATES the pairing QR while it waits for a scan (two /auth/qr
// calls 20s apart under a steady SCAN_QR_CODE returned two different images)
// and publishes NO event for it, so nothing ever told the view its rendered
// code was dead: an admin scanned a well-formed QR and the scan failed with
// no clue why. Locked here so the pairing-only poll is never removed as
// "redundant with realtime" — realtime has nothing to say about this.
describe('WhatsApp view — polling do QR de pareamento', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const staleQr = 'data:image/png;base64,VEVTVGU=';
  const freshQr = 'data:image/png;base64,RlSRVNIIQ==';

  it('rebusca a sessão e troca o QR stale pelo rotacionado', async () => {
    const view = buildRotating(stateFor('SCAN_QR_CODE', staleQr));
    await vi.advanceTimersByTimeAsync(0);
    expect(renderedQr(view.root)).toBe(staleQr);

    view.rotate(stateFor('SCAN_QR_CODE', freshQr));
    await vi.advanceTimersByTimeAsync(5000);

    expect(renderedQr(view.root)).toBe(freshQr);
    view.dispose();
  });

  it('não devolve o mesmo QR para sempre: o conteúdo muda', async () => {
    const view = buildRotating(stateFor('SCAN_QR_CODE', staleQr));
    await vi.advanceTimersByTimeAsync(0);
    const seen = new Set<string | null>([renderedQr(view.root)]);
    for (const next of ['A', 'B', 'C']) {
      view.rotate(stateFor('SCAN_QR_CODE', `data:image/png;base64,${next}`));
      await vi.advanceTimersByTimeAsync(5000);
      seen.add(renderedQr(view.root));
    }
    expect(seen.size).toBe(4);
    view.dispose();
  });

  // The anti-regression test: a poll that outlives the pairing window would
  // hammer the route forever on every screen open.
  it('para de consultar assim que a sessão fica WORKING', async () => {
    const view = buildRotating(stateFor('SCAN_QR_CODE', staleQr));
    await vi.advanceTimersByTimeAsync(5000);
    const polling = view.sessionCalls();
    expect(polling).toBeGreaterThan(0);

    view.rotate(stateFor('WORKING'));
    await vi.advanceTimersByTimeAsync(5000);
    const paired = view.sessionCalls();

    await vi.advanceTimersByTimeAsync(60000);
    expect(view.sessionCalls()).toBe(paired);
    expect(view.sessionCalls()).toBeGreaterThan(polling);
    view.dispose();
  });

  it('não faz polling quando a sessão já nasce WORKING', async () => {
    const view = buildRotating(stateFor('WORKING'));
    await vi.advanceTimersByTimeAsync(0);
    const initial = view.sessionCalls();
    await vi.advanceTimersByTimeAsync(60000);
    expect(view.sessionCalls()).toBe(initial);
    view.dispose();
  });

  it('não deixa o timer vivo depois do teardown', async () => {
    const view = buildRotating(stateFor('SCAN_QR_CODE', staleQr));
    await vi.advanceTimersByTimeAsync(5000);
    expect(view.sessionCalls()).toBeGreaterThan(0);

    view.dispose();
    const afterDispose = view.sessionCalls();

    await vi.advanceTimersByTimeAsync(60000);
    expect(view.sessionCalls()).toBe(afterDispose);
  });

  // syncPairingPoll() runs after EVERY load, so the guard is the only thing
  // keeping repeated status reads from stacking intervals.
  it('não duplica o intervalo com várias leituras de status', async () => {
    const view = buildRotating(stateFor('SCAN_QR_CODE', staleQr));
    await vi.advanceTimersByTimeAsync(0);
    const before = view.sessionCalls();
    await vi.advanceTimersByTimeAsync(5000);
    expect(view.sessionCalls() - before).toBe(1);
    view.dispose();
  });
});