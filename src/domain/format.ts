// Small, single-purpose formatting helpers. No dependencies on the rest
// of the app, so they're trivially reusable and testable.

export function formatBRL(value: number): string {
	return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatNumber(value: number, digits = 1): string {
	return value.toLocaleString('pt-BR', { maximumFractionDigits: digits });
}

export function formatDate(iso: string): string {
	if (!iso) return '—';
	const [y, m, d] = iso.split('-');
	return `${d}/${m}/${y}`;
}

export function todayISO(): string {
	return new Date().toISOString().slice(0, 10);
}

export function nowISO(): string {
	return new Date().toISOString();
}

export function uid(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function escapeHtml(text: string): string {
	const div = document.createElement('div');
	div.textContent = text ?? '';
	return div.innerHTML;
}

export function escapeAtrib(text: string): string {
	return escapeHtml(text)
		.replace(/\"/g, "&quot;")
		.replace(/\'/g, "&#x27;")
}
