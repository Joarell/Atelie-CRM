// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  pwaInstallable,
  setupPwaInstall,
  setupPwaUpdate,
  type InstallHost,
  type SwRegistration,
  type UpdateHost
} from '../../src/ui/pwaInstall';

function fakeInstallHost(): InstallHost {
  return {
    document,
    navigator: { serviceWorker: { controller: null, addEventListener: vi.fn() } },
    location: { protocol: 'https:', hostname: 'app.example.test' } as Location
  };
}

interface PromptableInstallEvent extends EventExists {
  prompt: ReturnType<typeof vi.fn>;
}

type EventExists = Event;

function makeInstallEvent(): PromptableInstallEvent {
  const event = new Event('beforeinstallprompt') as PromptableInstallEvent;
  event.preventDefault = vi.fn().mockReturnValue(undefined);
  event.prompt = vi.fn().mockResolvedValue(undefined);
  return event;
}

describe('pwaInstallable', () => {
  it('requires a secure context plus a service-worker container', () => {
    const host = fakeInstallHost();
    expect(pwaInstallable(host)).toBe(true);

    const insecure = { ...host, location: { ...host.location, protocol: 'http:' } };
    expect(pwaInstallable(insecure)).toBe(false);

    const noSw = { ...host, navigator: { ...host.navigator, serviceWorker: null } };
    expect(pwaInstallable(noSw)).toBe(false);
  });

  it('allows localhost for development', () => {
    const host = fakeInstallHost();
    const local = {
      ...host,
      location: { ...host.location, protocol: 'http:', hostname: 'localhost' }
    };
    expect(pwaInstallable(local)).toBe(true);
  });
});

describe('setupPwaInstall', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts a hidden install button and shows it on beforeinstallprompt', () => {
    setupPwaInstall(fakeInstallHost());
    const button = document.getElementById('pwa-install') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.hidden).toBe(true);
    expect(button.textContent).toBe('Instalar app');

    const event = makeInstallEvent();
    document.dispatchEvent(event);
    expect(button.hidden).toBe(false);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('hides after the user installs', () => {
    setupPwaInstall(fakeInstallHost());
    const button = document.getElementById('pwa-install') as HTMLButtonElement;
    document.dispatchEvent(makeInstallEvent());
    document.dispatchEvent(new Event('appinstalled'));
    expect(button.hidden).toBe(true);
  });

  it('fires the native prompt when the button is clicked', async () => {
    setupPwaInstall(fakeInstallHost());
    const button = document.getElementById('pwa-install') as HTMLButtonElement;
    const event = makeInstallEvent();
    document.dispatchEvent(event);

    button.click();
    await Promise.resolve();
    expect(event.prompt).toHaveBeenCalled();
    expect(button.hidden).toBe(true);
  });

  it('cleanup removes the button and the listeners', () => {
    const cleanup = setupPwaInstall(fakeInstallHost());
    expect(document.getElementById('pwa-install')).not.toBeNull();

    cleanup();
    expect(document.getElementById('pwa-install')).toBeNull();
    expect(document.querySelector('.pwa-install')).toBeNull();

    expect(() => document.dispatchEvent(makeInstallEvent())).not.toThrow();
  });
});

describe('setupPwaUpdate', () => {
  function fakeRegistration(): SwRegistration {
    return {
      installing: { state: 'installing', addEventListener: vi.fn(), removeEventListener: vi.fn() },
      waiting: { postMessage: vi.fn() }
    };
  }

  function fakeHost(): UpdateHost {
    return { controller: {}, reload: vi.fn() };
  }

  function stateListener(registration: SwRegistration): () => void {
    const add = registration.installing!.addEventListener as ReturnType<typeof vi.fn>;
    return add.mock.calls[0][1] as () => void;
  }

  it('prompts the worker and reloads once a new version installs', () => {
    const registration = fakeRegistration();
    const host = fakeHost();
    setupPwaUpdate(registration, host);

    (registration.installing as { state: string }).state = 'installed';
    stateListener(registration)();

    expect(registration.waiting!.postMessage).toHaveBeenCalledWith({
      type: 'SKIP_WAITING'
    });
    expect(host.reload).toHaveBeenCalledTimes(1);
  });

  it('ignores installs while an old worker is not controlling the page', () => {
    const registration = fakeRegistration();
    const host: UpdateHost = { controller: null, reload: vi.fn() };
    setupPwaUpdate(registration, host);

    (registration.installing as { state: string }).state = 'installed';
    stateListener(registration)();

    expect(registration.waiting!.postMessage).not.toHaveBeenCalled();
    expect(host.reload).not.toHaveBeenCalled();
  });

  it('only fires once', () => {
    const registration = fakeRegistration();
    const host = fakeHost();
    setupPwaUpdate(registration, host);
    const onState = stateListener(registration);

    (registration.installing as { state: string }).state = 'installed';
    onState();
    onState();

    expect(host.reload).toHaveBeenCalledTimes(1);
  });

  it('cleanup detaches the state listener', () => {
    const registration = fakeRegistration();
    const cleanup = setupPwaUpdate(registration, fakeHost());
    cleanup();
    expect(registration.installing!.removeEventListener).toHaveBeenCalledWith(
      'statechange',
      expect.any(Function)
    );
  });
});