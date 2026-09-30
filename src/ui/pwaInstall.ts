import { qsIf } from './dom';

// PWA install/update affordance, DOM-only: `main.ts` calls `setupPwaInstall`
// once after the shell mounts. All browser surfaces are injected so tests can
// drive them without a real service-worker/navigation stack.

export interface InstallEvent {
	preventDefault(): void;
	prompt(): Promise<void>;
}

export interface InstallHost {
	document: Document;
	navigator: {
		serviceWorker: {
			controller: unknown | null;
			addEventListener(type: string, handler: () => void): void;
		} | null;
	} | null;
	location: Location;
}

export function pwaInstallable(host: InstallHost): boolean {
	return (
		host.location.protocol === 'https:' ||
		host.location.hostname === 'localhost'
	) && host.navigator?.serviceWorker !== null;
}

type Listener = [EventTarget, string, (e: Event) => void];

// Small holder so the callbacks share mutable state without a closure maze.
interface InstallState {
	deferred: InstallEvent | null;
	button: HTMLButtonElement;
}

function mountInstallButton(
	doc: Document,
	id: string,
	label: string
): HTMLButtonElement {
	const btn = doc.createElement('button');
	btn.id = id;
	btn.className = 'btn btn-primary pwa-install';
	btn.type = 'button';
	btn.textContent = label;
	btn.hidden = true;
	doc.body.appendChild(btn);
	return btn;
}

function onBeforeInstall(
	state: InstallState,
	event: Event
): void {
	event.preventDefault();
	state.deferred = event as unknown as InstallEvent;
	state.button.hidden = false;
}

function onAppInstalled(state: InstallState): void {
	state.button.hidden = true;
}

function onClickInstall(
	state: InstallState,
	id: string,
	doc: Document,
	event: Event
): void {
	const target = event.target as HTMLElement | null;
	if (!target || (target.id !== id && !target.closest(`#${id}`))) return;
	const deferred = state.deferred;
	if (!deferred) return;
	const btn = qsIf<HTMLButtonElement>(`#${id}`, doc) ?? state.button;
	btn.hidden = true;
	state.deferred = null;
	void deferred.prompt();
}

function bindInstallHandlers(
	doc: Document,
	id: string,
	state: InstallState
): Listener[] {
	const out: Listener[] = [];
	const bind = (t: EventTarget, type: string, fn: (e: Event) => void) => {
		t.addEventListener(type, fn);
		out.push([t, type, fn]);
	};
	bind(doc, 'beforeinstallprompt', (e) => onBeforeInstall(state, e));
	bind(doc, 'appinstalled', () => onAppInstalled(state));
	bind(doc, 'click', (e) => onClickInstall(state, id, doc, e));
	return out;
}

// Listens for `beforeinstallprompt` and mounts a small install button; on
// click it shows the browser's native prompt. Returns a cleanup function.
export function setupPwaInstall(
	host: InstallHost,
	buttonLabel = 'Instalar app'
): () => void {
	const doc = host.document;
	const id = 'pwa-install';
	const state: InstallState = {
		deferred: null,
		button: mountInstallButton(doc, id, buttonLabel)
	};
	const listeners = bindInstallHandlers(doc, id, state);
	return () => {
		state.button.remove();
		for (const [target, type, fn] of listeners) {
			target.removeEventListener(type, fn);
		}
	};
}

// Minimal surface of a ServiceWorkerRegistration the update watcher needs.
export interface SwRegistration {
	installing: {
		state: string;
		addEventListener(t: string, f: () => void): void;
		removeEventListener(t: string, f: () => void): void;
	} | null;
	waiting: { postMessage(msg: unknown): void } | null;
}

export interface UpdateHost {
	controller: unknown | null;
	reload(): void;
}

// Best-practice update flow: when the freshly installed worker finds an old
// one already controlling the page, ask it to skip waiting so it activates
// and serves the new bundle, then reload the page onto it. Returns a cleanup.
export function setupPwaUpdate(
	registration: SwRegistration,
	host: UpdateHost
): () => void {
	let busy = false;
	const onState: () => void = () => {
		if (busy || registration.installing?.state !== 'installed') return;
		if (!registration.waiting || !host.controller) return;
		busy = true;
		registration.waiting.postMessage({ type: 'SKIP_WAITING' });
		host.reload();
	};
	registration.installing?.addEventListener('statechange', onState);
	return () => {
		registration.installing?.removeEventListener('statechange', onState);
	};
}