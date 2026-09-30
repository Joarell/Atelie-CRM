import type { AppContext } from '../../state/AppContext';
import type { Settings } from '../../domain/types';
import { formatBRL } from '../../domain/format';
import { showToast } from '../Toast';
import { autoRerender } from '../reactive';
import { qs, formValues } from '../dom';
import {
	hoursPerMonth,
	laborCostPerMinute,
	fixedMonthlyTotal,
	fixedCostPerMinute
} from '../../domain/pricing';

export function renderSettingsView(
	root: HTMLElement,
	ctx: AppContext
): () => void {
	return autoRerender(() => draw(root, ctx), [
		ctx.settings.subscribe.bind(ctx.settings)
	]);
}

function draw(root: HTMLElement, ctx: AppContext): void {
	const s = ctx.settings.get();
	root.innerHTML = `
		<div class="section-head"><div><h2>Configurações</h2><p>Valores ` +
		`padrão usados ao criar um novo produto — cada produto ` +
		`pode ter os seus próprios depois, editáveis na ficha ` +
		`dele</p></div></div>
		<form id="settings-form" class="card" ` +
		`style="padding:20px 22px;max-width:640px;">` +
		settingsFormHtml(s) +
		`\n    <div class="card" style="padding:16px 20px;max-width:640px;` +
		`margin-top:16px;">${summaryHtml(s)}</div>`;
	wireEvents(root, ctx);
}

function settingsFormHtml(s: Settings): string {
	return `
			${laborFieldsHtml(s)}
			${fixedFieldsHtml(s)}
			<h3>Margens</h3>
			${marginsFieldsHtml(s)}
			<button type="submit" class="btn btn-primary">Salvar ` +
			`configurações</button>
		</form>`;
}

function laborFieldsHtml(s: Settings): string {
	const salary = field('salary', 'Salário mensal (R$)', s.salary);
	const days = field('daysPerMonth', 'Dias trabalhados/mês', s.daysPerMonth);
	const hours = field('hoursPerDay', 'Horas/dia', s.hoursPerDay);
	return `<h3 style="margin-top:0;">Mão de obra</h3>
			${fieldRow3(salary, days, hours)}`;
}

function fixedFieldsHtml(s: Settings): string {
	const rent = field('rent', 'Aluguel', s.rent);
	const energy = field('energy', 'Energia', s.energy);
	const water = field('water', 'Água', s.water);
	const internet = field('internet', 'Internet', s.internet);
	const office = field('office', 'Escritório', s.office);
	const mei = field('mei', 'MEI / contador', s.mei);
	return `<h3>Despesas fixas mensais</h3>
			${fieldRow3(rent, energy, water)}
			${fieldRow2(internet, office)}
			${mei}`;
}

function marginsFieldsHtml(s: Settings): string {
	const variable = field(
		'variablePercent',
		'Despesa variável (%)',
		s.variablePercent
	);
	const markup = field(
		'defaultMarkupPercent',
		'Markup padrão (%)',
		s.defaultMarkupPercent
	);
	return fieldRow2(variable, markup);
}

function fieldRow2(a: string, b: string): string {
	return `<div class="field-row" ` +
		`style="grid-template-columns:1fr 1fr;">${a}${b}</div>`;
}

function fieldRow3(a: string, b: string, c: string): string {
	return `<div class="field-row" ` +
		`style="grid-template-columns:1fr 1fr 1fr;">${a}${b}${c}</div>`;
}

function field(name: string, label: string, value: number): string {
	return `<div class="field"><label class="field-label">${label}</label>
		<input class="input" type="number" step="0.01" min="0" name="${name}` +
		`" value="${value}" required></div>`;
}

function summaryHtml(s: Settings): string {
	const rows = [
		summaryRow('Horas trabalhadas/mês', `${hoursPerMonth(s)}h`),
		summaryRow(
			'Custo do minuto de mão de obra',
			formatBRL(laborCostPerMinute(s))
		),
		summaryRow(
			'Total de despesas fixas/mês',
			formatBRL(fixedMonthlyTotal(s))
		),
		summaryRow(
			'Custo do minuto de despesas fixas',
			formatBRL(fixedCostPerMinute(s, s))
		)
	];
	return rows.join('\n    ');
}

function summaryRow(label: string, value: string): string {
	return `<div class="calc-row"><span class="soft">${label}</span>` +
		`<span class="num">${value}</span></div>`;
}

function wireEvents(root: HTMLElement, ctx: AppContext): void {
	qs('#settings-form', root).addEventListener('submit', (event) =>
		handleSubmit(event, ctx)
	);
}

async function handleSubmit(event: Event, ctx: AppContext): Promise<void> {
	event.preventDefault();
	const values = formValues(event.target as HTMLFormElement);
	const numeric = Object.entries(values).map(([k, v]) => [k, Number(v)]);
	const patch = Object.fromEntries(numeric) as unknown as Partial<Settings>;
	await ctx.settings.update(patch);
	showToast('Configurações salvas');
}