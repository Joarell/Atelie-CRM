// @vitest-environment happy-dom
// Recarregar a pagina nao pode abrir popup nenhum. Os dois popups que um
// reload dispara no Chrome vivem fora do DOM, entao nao ha API para "deletar"
// um dialogo ja aberto — o unico jeito e nunca criar a condicao que o
// dispara:
//
//  1. "a pagina que voce esta vendo usou informacoes que voce digitou"
//     (Confirm Form Resubmission): sai quando o documento foi carregado por um
//     POST de form. Como o roteamento e por hash, todas as rotas compartilham
//     UM documento, entao um unico submit nativo escapa e contamina o app
//     inteiro. O guard cancela todo submit, em todo boot.
//
//  2. "Sair deste site?": sai quando algo registra `beforeunload`. O app nao
//     registra nenhum, e este teste trava essa ausencia.
//
// Detalhe que faz este teste valer: um reload real nao reaproveita o
// documento anterior. Aqui o `document` do happy-dom sobreviveria entre boots
// e o listener do PRIMEIRO boot continuaria anexado — a probe passaria sem
// provar nada. Por isso cada reload remove os listeners registrados no boot
// anterior (`freshDocument`), senao o teste so mediria o boot #1.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

type Listener = [string, EventListener];

const docListeners: Listener[] = [];
const windowListeners: string[] = [];
let nativeSubmitCalls = 0;

// Rastreia o que cada boot anexa, para devolver o documento ao estado de
// "virgem" — que e o que um reload de verdade faz.
function installTracking(): void {
  const realDocAdd = document.addEventListener.bind(document);
  const realWinAdd = window.addEventListener.bind(window);
  document.addEventListener = ((
    type: string, fn: EventListener, opts?: AddEventListenerOptions
  ) => {
    docListeners.push([type, fn]);
    return realDocAdd(type, fn, opts);
  }) as typeof document.addEventListener;
  window.addEventListener = ((
    type: string, ...rest: unknown[]
  ) => {
    if (type === 'beforeunload') windowListeners.push(type);
    return (realWinAdd as (...a: unknown[]) => void)(type, ...rest);
  }) as typeof window.addEventListener;
  HTMLFormElement.prototype.submit = function submit(): void {
    nativeSubmitCalls++;
  };
}

function freshDocument(): void {
  for (const [type, fn] of docListeners.splice(0)) {
    document.removeEventListener(type, fn);
  }
  document.body.innerHTML = '<div id="app"></div>';
  nativeSubmitCalls = 0;
}

async function waitForShell(): Promise<void> {
  for (let i = 0; i < 300; i++) {
    if (document.querySelector('.app-shell')) return;
    await new Promise((res) => setTimeout(res, 5));
  }
  throw new Error('shell nao montou no reload');
}

// Um reload: documento novo, modulos novos, boot novo. Hash e storage ficam,
// como ficariam num reload de verdade.
async function reload(hash: string): Promise<void> {
  freshDocument();
  window.location.hash = hash;
  vi.resetModules();
  await import('../../src/main');
  await waitForShell();
}

// Um form sem handler, como o de uma view que ainda nao anexou o bind. Sem o
// guard, o submit escapa e vira documento POST.
function probeSubmitIsPrevented(): boolean {
  const probe = document.createElement('form');
  probe.innerHTML = '<button type="submit">Enviar</button>';
  document.body.appendChild(probe);
  const event = new Event('submit', { bubbles: true, cancelable: true });
  probe.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('reload nao abre popup', () => {
  beforeAll(() => {
    // O alvo e o reload, nao o conteudo: listagem em 404 cai em `[]` e
    // `/api/auth/me` em 401 limpa a sessao, entao um stub so basta.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('[]', {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    window.matchMedia ||= () =>
      ({ matches: false }) as unknown as MediaQueryList;
    installTracking();
  });

  beforeEach(() => {
    windowListeners.length = 0;
    window.location.hash = '#/';
  });

  it('recarrega sem pedir resubmissao nem confirmacao de saida', async () => {
    await reload('#/login');
    expect(probeSubmitIsPrevented()).toBe(true);
    expect(windowListeners).toEqual([]);
    expect(nativeSubmitCalls).toBe(0);
  });

  it('rearma o guard a cada boot, nao so no primeiro', async () => {
    // Sem `freshDocument` tirar os listeners do boot anterior, o guard do
    // boot #1 seguiria anexado e estas asserts passariam por heranca.
    const routes = ['#/', '#/login', '#/vendas/inbox', '#/atelie/pedidos'];
    for (const route of routes) {
      await reload(route);
      expect(probeSubmitIsPrevented()).toBe(true);
      expect(nativeSubmitCalls).toBe(0);
    }
  });

  it('nao registra beforeunload em nenhuma rota percorrida', async () => {
    const routes = [
      '#/', '#/vendas/funil', '#/vendas/inbox', '#/atelie/estoque'
    ];
    for (const route of routes) {
      await reload(route);
      expect(windowListeners).toEqual([]);
    }
  });
});
