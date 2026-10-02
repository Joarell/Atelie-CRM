import { escapeHtml, escapeAtrib } from '../../../domain/format';
import { ABC_CLIENT_LABELS, type AbcClass } from '../../../domain/abcCurve';

// Small shared builders used by the CRM views — keeps the per-view files
// focused on their screen instead of repeating field/heading markup.

export function section(
	heading: string,
	hint: string,
	actions = '',
	lead = ''
): string {
	const title = lead
		? `<div class="section-title">${lead}<h2>${heading}</h2></div>`
		: `<h2>${heading}</h2>`;
	const head =
		`<div class="section-head"><div>${title}` +
		`<p>${hint}</p></div>`;
	const tail = `${actions ? `<div>${actions}</div>` : ''}</div>`;
	return head + tail;
}

// Inline badge for the client's ABC classification, shown before a section
// heading (the inbox's "Caixa de entrada") on the same row. Tiers carry
// distinct colors so the reading is immediate; empty when unclassified.
export function clientClassBadge(abc: AbcClass | null): string {
	if (!abc) return '';
	const tier = abc.toLowerCase();
	return `<span class="client-class client-class-${tier}">` +
		`${ABC_CLIENT_LABELS[abc]}</span>`;
}

export function kpiCard(label: string, value: string, hint: string): string {
	const delta = hint ? `<div class="delta">${hint}</div>` : '';
	return (
		`<div class="card kpi"><div class="label">${label}</div>
		<div class="value">${value}</div>` +
		delta +
		'</div>'
	);
}

export function field(label: string, inputHtml: string, full = false): string {
	const grid = full ? ' style="grid-column:1/-1;"' : '';
	const open =
		`<div class="field"${grid}>` +
		`<label class="field-label">${label}</label>`;
	return open + inputHtml + '</div>';
}

export function textField(
	name: string,
	label: string,
	value: string,
	required = true
): string {
	const attrs = ` class="input" name="${name}" value="${escapeAtrib(value)}"`;
	const req = required ? ' required' : '';
	return field(label, `<input${attrs}${req}>`);
}

export function numberField(
	name: string,
	label: string,
	step = '0.01',
	value = ''
): string {
	const attrsA = ` class="input" type="number" step="${step}" min="0"`;
	const valueAttr = escapeAtrib(String(value));
	const attrsB = ` name="${name}" value="${valueAttr}" required`;
	return field(label, `<input${attrsA}${attrsB}>`);
}

export function dateField(name: string, label: string, value = ''): string {
	const attrs =
		` class="input" type="date" name="${name}"` +
		` value="${escapeAtrib(value)}"`;
	return field(label, `<input${attrs}>`);
}

export function datetimeField(name: string, label: string, value = ''): string {
	const attrsA = ` class="input" type="datetime-local" name="${name}"`;
	const attrsB = ` value="${escapeAtrib(value)}"`;
	return field(label, `<input${attrsA}${attrsB}>`);
}

function optionHtml(
	o: { value: string; label: string },
	selected: string
): string {
	const sel = o.value === selected ? ' selected' : '';
	return (
		`<option value="${escapeAtrib(o.value)}"${sel}>` +
		`${escapeHtml(o.label)}</option>`
	);
}

export function selectField(
	name: string,
	label: string,
	options: Array<{ value: string; label: string }>,
	selected = ''
): string {
	const opts = options.map((o) => optionHtml(o, selected)).join('');
	return field(label, `<select class="input" name="${name}">${opts}</select>`);
}

export function badge(
	label: string,
	tone: 'neutral' | 'caramel' = 'neutral'
): string {
	const caramel = tone === 'caramel' ? ' badge-caramel' : '';
	return `<span class="badge${caramel}">${escapeHtml(label)}</span>`;
}

export function modalFoot(): string {
	return `<div class="modal-foot" style="padding:16px 0 0;border:none;">
		<button type="button" class="btn" data-close-modal>Cancelar</button>
		<button type="submit" class="btn btn-primary">Salvar</button></div>`;
}

export function rowButton(
	label: string,
	dataset: string,
	value: string,
	danger = false
): string {
	const cls = danger ? ' btn-danger' : '';
	return (
		`<button class="btn btn-ghost btn-sm${cls}" ` +
		`data-${dataset}="${escapeAtrib(value)}">` +
		label +
		'</button>'
	);
}