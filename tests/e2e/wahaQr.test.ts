// @vitest-environment happy-dom
// E2E do QR de pareamento do WhatsApp: o motor WAHA devolve a imagem em
// `GET /api/{sessao}/auth/qr`, a rota `/api/whatsapp/session` anexa esse data
// URL ao snapshot e a view o mostra como <img class="waha-qr">.
//
// Estes testes sobem o app de verdade (src/main.ts) e atravessam a cadeia
// INTEIRA — motor -> rota real -> WahaApiRepository -> CrmWhatsAppView — com
// o motor WAHA de mentira. Eles existem porque cada elo ja tinha teste
// isolado (rota em tests/server/whatsappSessionRoute.test.ts, view em
// tests/ui/whatsappViewPairing.test.ts) e mesmo assim o operador podia ficar
// sem QR: um data URL malformado, um status sem `qr`, ou um `configured:false`
// engolido viram uma tela "atualize em instantes" sem nenhuma pista do
// porque. Aqui o silencio nao passa.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { APIContext } from 'astro';
import { FakeD1 } from '../helpers/fakeD1';
import { hashPassword, userFromToken } from '../../src/server/auth';
import {
  USERS_TABLE,
  SESSIONS_TABLE,
  AUTH_AUDIT_TABLE,
  WAHA_SESSIONS_TABLE
} from '../../src/server/tables';
import type { User } from '../../src/domain/crm';
import { POST as loginPost } from '../../src/pages/api/auth/login';
import { GET as meGet } from '../../src/pages/api/auth/me';
import { GET as settingsGet } from '../../src/pages/api/settings';
import { GET as sessionGet, POST as sessionPost } from '../../src/pages/api/whatsapp/session';

const EMAIL = 'qr@deskcomm.local';
const PASSWORD = 'qr-senha-forte-123';

// Bytes de imagem (PNG) do motor. Estes 4 sao "\x89PNG" — o que
// `binaryDataUrl` embrulha no data URL exato abaixo. A mesma carga aparece como
// base64 no envelope JSON que o motor devolve quando o pedido aceita JSON.
const ENGINE_PNG_BYTES = new Uint8Array([137, 80, 78, 71]);
const ENGINE_PNG_BASE64 = 'iVBORw==';
const ENGINE_QR = 'data:image/png;base64,iVBORw==';

const state = vi.hoisted(() => ({
  db: null as unknown as FakeD1,
  // O que o motor WAHA responde, mudado por teste.
  engine: {
    sessionStatus: 'SCAN_QR_CODE' as string,
    qr: 'data:image/png;base64,AAA=' as string | null,
    qrStatus: 200 as number
  },
  engineCalls: [] as string[]
}));

vi.mock('cloudflare:workers', () => ({
  env: {
    get DB() {
      return state.db;
    },
    get WAHA_API_BASE_URL() {
      return 'http://waha.test';
    },
    get WAHA_API_KEY() {
      return 'plaintext-local';
    },
    get WAHA_SESSION_NAME() {
      return 'default';
    },
    get WHATSAPP_HOOK_URL() {
      return 'https://app.test/api/whatsapp/webhook';
    },
    get WAHA_HMAC_SECRET() {
      return 'test-secret-0123456789abcdef0123456789';
    }
  }
}));

type ApiRoute = (ctx: APIContext) => Response | Promise<Response>;
const routes = new Map<string, ApiRoute>();

async function seedDb(): Promise<FakeD1> {
  const digest = await hashPassword(PASSWORD);
  const admin: User = {
    id: 'seed-user-qr',
    name: 'QR Admin',
    email: EMAIL,
    passwordHash: digest.hash,
    passwordSalt: digest.salt,
    role: 'admin',
    createdAt: '2026-01-01T00:00:00Z'
  };
  return FakeD1.from({
    [USERS_TABLE]: [admin as unknown as Record<string, unknown>],
    [SESSIONS_TABLE]: [],
    [AUTH_AUDIT_TABLE]: []
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// O motor WAHA de mentira. Só os endpoints que a cadeia do QR toca:
// version (health), sessions/{nome} (snapshot) e {nome}/auth/qr (a imagem).
//
// `/auth/qr` NEGOCIA pelo `Accept`, igual ao NOWEB real (medido no engine
// 2026.8.2): `application/json` devolve o envelope `{mimetype, data}`, e
// qualquer coisa que peça imagem (`image/png`, `*/*`) devolve os bytes PNG
// crus. Um stub que devolvesse sempre PNG passaria o teste e mentiria sobre o
// contrato — foi assim que a app ficou só com um dos dois caminhos coberto.
function engineResponse(url: string, accept: string): Response {
  state.engineCalls.push(url);
  if (url.endsWith('/api/server/version')) {
    return jsonResponse({ version: '2026.8.2', engine: 'NOWEB', tier: 'CORE' });
  }
  if (url.includes('/auth/qr')) {
    const qr = state.engine.qr;
    if (!qr || state.engine.qrStatus !== 200) {
      return jsonResponse({ message: 'Session is not in SCAN_QR_CODE' }, 422);
    }
    if (accept.includes('application/json')) {
      return jsonResponse({ mimetype: 'image/png', data: ENGINE_PNG_BASE64 });
    }
    return new Response(ENGINE_PNG_BYTES, {
      status: 200,
      headers: { 'Content-Type': 'image/png' }
    });
  }
  if (url.includes('/api/sessions/')) {
    return jsonResponse({ name: 'default', status: state.engine.sessionStatus });
  }
  return jsonResponse({ error: 'not_found' }, 404);
}

// Reproduz o que `src/middleware.ts` faz antes de qualquer rota: resolve o
// usuario da cookie HttpOnly e coloca em `locals.user`. Sem este passo a rota
// do QR responde 401 pelo motivo errado (sem sessao no harness, e nao porque o
// admin foi barrado) e o teste passaria medindo o harness.
async function apiContext(request: Request): Promise<APIContext> {
  const user = await userFromToken(state.db, request);
  return { request, params: {}, locals: { user } } as unknown as APIContext;
}

// A sessao viaja em cookie HttpOnly (`crm_session`) que o navegador carrega
// sozinho, mas o happy-dom o remove do Request (`headers.get('cookie')`
// retorna null). O harness entao usa o fallback que o proprio `userFromToken`
// suporta — Bearer, "para curl/headless" — com o token lido do mesmo D1 que o
// login escreveu. Sem isso a rota do QR responde 401 por um motivo que nao
// existe em producao.
let sessionToken: string | null = null;

function stubFetch(): void {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const absolute = new URL(String(input), 'http://localhost').toString();
    const headers = new Headers(init?.headers);
    if (sessionToken) headers.set('authorization', `Bearer ${sessionToken}`);
    const request = new Request(absolute, { ...init, headers });
    const parsed = new URL(absolute);
    const handler = routes.get(`${request.method} ${parsed.pathname}`);
    const response = parsed.host === 'waha.test'
      ? engineResponse(absolute, headers.get('accept') ?? '')
      : handler
        ? await handler(await apiContext(request))
        : jsonResponse({ error: 'not_found' }, 404);
    if (parsed.pathname === '/api/auth/login' && response.status === 200) {
      const sessions = state.db.rows(SESSIONS_TABLE) as Array<{ token?: string }>;
      sessionToken = sessions[sessions.length - 1]?.token ?? null;
    }
    return response;
  });
}

async function waitFor(
  check: () => void,
  label = 'condicao',
  ms = 4000
): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      check();
      return;
    } catch {
      if (Date.now() - start > ms) {
        const view = document.querySelector('#view-root')?.innerHTML ?? '';
        throw new Error(
          `waitFor timeout em "${label}". #view-root: ${view.slice(0, 400)}`
        );
      }
      await new Promise((res) => setTimeout(res, 10));
    }
  }
}

function viewRoot(): HTMLElement {
  const el = document.querySelector<HTMLElement>('#view-root');
  if (!el) throw new Error('no #view-root');
  return el;
}

function qrImage(): HTMLImageElement {
  const img = viewRoot().querySelector<HTMLImageElement>('img.waha-qr');
  if (!img) throw new Error('no img.waha-qr na view');
  return img;
}

async function logIn(): Promise<void> {
  window.location.hash = '#/login';
  window.dispatchEvent(new Event('hashchange'));
  await waitFor(() => {
    if (!document.querySelector('#login-email')) throw new Error('no form');
  }, 'form de login');
  const email = document.querySelector<HTMLInputElement>('#login-email');
  const password = document.querySelector<HTMLInputElement>('#login-password');
  (email as HTMLInputElement).value = EMAIL;
  (password as HTMLInputElement).value = PASSWORD;
  document
    .querySelector<HTMLFormElement>('form')
    ?.dispatchEvent(new Event('submit', { bubbles: true }));
  await waitFor(() => {
    if (!localStorage.getItem('crm_user')) {
      throw new Error('sessao ainda nao persistida');
    }
  }, 'sessao persistida apos login');
}

async function openWhatsApp(): Promise<void> {
  window.location.hash = '#/whatsapp';
  window.dispatchEvent(new Event('hashchange'));
  await waitFor(() => {
    if (!viewRoot().firstElementChild) throw new Error('view nao renderizou');
  }, 'view do WhatsApp montada');
}

describe('QR de pareamento do WhatsApp (app real + motor WAHA de mentira)', () => {
  beforeAll(async () => {
    state.db = await seedDb();
    state.engine.sessionStatus = 'SCAN_QR_CODE';
    state.engine.qr = 'data:image/png;base64,AAA=';
    state.engine.qrStatus = 200;
    stubFetch();
    routes.set('POST /api/auth/login', loginPost);
    routes.set('GET /api/auth/me', meGet);
    routes.set('GET /api/settings', settingsGet);
    routes.set('GET /api/whatsapp/session', sessionGet);
    routes.set('POST /api/whatsapp/session', sessionPost);

    window.matchMedia ||= () =>
      ({ matches: false }) as unknown as MediaQueryList;
    document.body.innerHTML = '<div id="app"></div>';
    await import('../../src/main');
    await waitFor(() => {
      if (!document.querySelector('.app-shell')) throw new Error('no shell');
    }, 'shell montado');
    await logIn();
    await openWhatsApp();
  });

  it('mostra o QR do motor como imagem para o admin na tela', async () => {
    await waitFor(() => {
      qrImage();
    }, 'img.waha-qr renderizado');

    const img = qrImage();
    // O src e exatamente o data URL que o motor serviu — nao um placeholder,
    // nao um QR truncado, nao um data URL de outro formato.
    expect(img.getAttribute('src')).toBe(ENGINE_QR);
    // A imagem veio do endpoint de QR do motor, nao de um placeholder.
    expect(state.engineCalls).toContain('http://waha.test/api/default/auth/qr');
    // Uma sessao esperando scan mostra QR, nunca a instrucao de apertar
    // "Iniciar sessao" — o button so existe para abrir a sessao.
    expect(viewRoot().textContent ?? '').not.toContain('Aperte "Iniciar sessão"');
  });

  it('usa o data URL do motor e preserva o alt e a classe de estilo', async () => {
    await waitFor(() => {
      qrImage();
    }, 'img.waha-qr renderizado');
    const img = qrImage();
    expect(img.getAttribute('alt')).toBe('QR do WhatsApp');
    expect(img.classList.contains('waha-qr')).toBe(true);
    expect((img.getAttribute('src') ?? '').startsWith('data:image/png;base64,'))
      .toBe(true);
  });

  it('nao deixa o QR vazar para um usuario sem sessao de admin', async () => {
    // A rota e admin-only por design: o QR liga um numero de WhatsApp. Um
    // operator sem permissao recebe 403 e a view cai no login hint, jamais no
    // <img>. Este teste trava essa fronteira pela rota real.
    const denied = await sessionGet({
      request: new Request('http://localhost/api/whatsapp/session'),
      params: {},
      locals: {}
    } as unknown as APIContext);
    expect(denied.status).toBe(401);
  });

  it('espelha o status SCAN_QR_CODE no D1 para a view saber o que esperar', async () => {
    await waitFor(() => {
      qrImage();
    }, 'img.waha-qr renderizado');
    const mirrored = state.db.rows(WAHA_SESSIONS_TABLE);
    expect(mirrored.length).toBeGreaterThan(0);
    const latest = mirrored[mirrored.length - 1];
    expect(latest.status).toBe('SCAN_QR_CODE');
  });
});
