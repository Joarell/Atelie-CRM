let container: HTMLElement | null = null;

function getContainer(): HTMLElement {
  if (container) return container;
  container = document.createElement('div');
  container.className = 'toast-wrap';
  document.body.appendChild(container);
  return container;
}

export function showToast(message: string): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  getContainer().appendChild(el);
  window.setTimeout(() => el.remove(), 2600);
}
