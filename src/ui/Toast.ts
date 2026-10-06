let container: HTMLElement | null = null;

function getContainer(): HTMLElement {
	if (container) return container;
	container = document.createElement('div');
	container.className = 'toast-wrap';
	document.body.appendChild(container);
	return container;
}

export function showToast(message: string): void {
	const wrap = getContainer();
	// Newest wins: a still-visible toast from the previous action would sit
	// above (and be read as) the message this call is trying to deliver.
	wrap.replaceChildren();
	const el = document.createElement('div');
	el.className = 'toast';
	el.textContent = message;
	wrap.appendChild(el);
	window.setTimeout(() => el.remove(), 2600);
}

// A submit's confirmation belongs to the screen that produced it. Once that
// view is replaced — navigation, logout, or the footer refresh re-rendering it
// — the message is stale, and left floating over the new screen it reads as if
// the new screen had just been saved.
export function clearToast(): void {
	container?.replaceChildren();
}
