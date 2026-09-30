import { icon } from './icons';

export interface ModalOptions {
	title: string;
	bodyHtml: string;
	onMount?: (modalEl: HTMLElement) => void;
}

let backdropEl: HTMLElement | null = null;

export function openModal(options: ModalOptions): HTMLElement {
	closeModal();
	backdropEl = buildBackdrop(options);
	document.body.appendChild(backdropEl);
	wireDismiss(backdropEl);
	options.onMount?.(backdropEl);
	return backdropEl;
}

export function closeModal(): void {
	backdropEl?.remove();
	backdropEl = null;
}

function buildBackdrop(options: ModalOptions): HTMLElement {
	const backdrop = document.createElement('div');
	backdrop.className = 'modal-backdrop';
	backdrop.innerHTML = `
		<div class="modal" role="dialog" aria-modal="true">
			<div class="modal-head">
				<h3>${options.title}</h3>
				<button class="btn btn-ghost btn-icon" data-close-modal ` +
		`aria-label="Fechar">${icon('close')}</button>
			</div>
			<div class="modal-body">${options.bodyHtml}</div>
		</div>`;
	return backdrop;
}

function wireDismiss(backdrop: HTMLElement): void {
	backdrop.addEventListener('click', (event) => {
		const target = event.target as HTMLElement;
		if (target === backdrop || target.closest('[data-close-modal]')) {
			closeModal();
		}
	});
}