import type { AppContext } from '../../state/AppContext';
import type { Customer } from '../../domain/types';
import { formatBRL, uid, escapeHtml } from '../../domain/format';
import { renderCrudTable, type TableColumn } from '../CrudTable';
import { openModal, closeModal } from '../Modal';
import { showToast } from '../Toast';
import { autoRerender } from '../reactive';
import { qs, formValues } from '../dom';

export function renderCustomersView(
	root: HTMLElement,
	ctx: AppContext
): () => void {
	return autoRerender(() => draw(root, ctx), [
		ctx.customers.subscribe.bind(ctx.customers),
		ctx.orders.subscribe.bind(ctx.orders)
	]);
}

function draw(root: HTMLElement, ctx: AppContext): void {
	const table = crudTableHtml(ctx);
	root.innerHTML = `
		<div class="section-head">
			<div><h2>Clientes</h2><p>Histórico e valor de cada cliente</p></div>
			<button class="btn btn-primary" id="new-customer">+ Novo cliente</button>
		</div>
		${table}`;
	wireEvents(root, ctx);
}

function crudTableHtml(ctx: AppContext): string {
	return renderCrudTable({
		columns: columns(ctx),
		rows: ctx.customers.getAll(),
		actions: actionButtons,
		emptyTitle: 'Nenhum cliente ainda',
		emptyHint: 'Cadastre clientes para vincular aos pedidos.'
	});
}

function columns(ctx: AppContext): TableColumn<Customer>[] {
	return [
		{ header: 'Nome', render: (c) => escapeHtml(c.name) },
		{ header: 'Telefone', render: (c) => escapeHtml(c.phone) },
		{
			header: 'Pedidos',
			render: (c) => String(ctx.customer.statsFor(c.id).orderCount),
			alignRight: true
		},
		{
			header: 'Total gasto',
			render: (c) => formatBRL(ctx.customer.statsFor(c.id).totalSpent),
			alignRight: true
		}
	];
}

function actionButtons(customer: Customer): string {
	return (
		`<button class="btn btn-ghost btn-sm" data-edit="${customer.id}">` +
		`Editar</button>
		<button class="btn btn-ghost btn-sm btn-danger" data-delete=` +
		`"${customer.id}">Excluir</button>`
	);
}

function wireEvents(root: HTMLElement, ctx: AppContext): void {
	qs('#new-customer', root).addEventListener('click', () => openForm(ctx));
	root.querySelectorAll<HTMLElement>('[data-edit]').forEach((btn) =>
		btn.addEventListener('click', () =>
			openForm(ctx, ctx.customers.getById(btn.dataset.edit!))
		)
	);
	root.querySelectorAll<HTMLElement>('[data-delete]').forEach((btn) =>
		btn.addEventListener('click', () => handleDelete(ctx, btn.dataset.delete!))
	);
}

async function handleDelete(ctx: AppContext, id: string): Promise<void> {
	if (!confirm('Excluir este cliente?')) return;
	await ctx.customers.remove(id);
	showToast('Cliente excluído');
}

function openForm(ctx: AppContext, existing?: Customer): void {
	const title = existing ? 'Editar cliente' : 'Novo cliente';
	const modal = openModal({ title, bodyHtml: formHtml(existing) });
	qs('form', modal).addEventListener('submit', (event) =>
		handleSubmit(event, ctx, existing)
	);
}

function formHtml(existing?: Customer): string {
	const v = existing ?? { name: '', phone: '', email: '', notes: '' };
	return `<form>${textField('name', 'Nome', v.name)}
		<div class="field-row" style="grid-template-columns:1fr 1fr;">${
			textField('phone', 'Telefone', v.phone)
		}${
			textField('email', 'E-mail', v.email, false)
		}</div>
		<div class="field"><label class="field-label">Notas</label>` +
		`<textarea class="input" name="notes" rows="3">${escapeHtml(v.notes)}` +
		`</textarea></div>
		<div class="modal-foot" style="padding:16px 0 0;border:none;">
			<button type="button" class="btn" data-close-modal>Cancelar</button>
			<button type="submit" class="btn btn-primary">Salvar</button>` +
		`</div></form>`;
}

function textField(
	name: string,
	label: string,
	value: string,
	required = true
): string {
	return `<div class="field"><label class="field-label">${label}</label>
		<input class="input" name="${name}" value="${escapeHtml(value)}" ${
			required ? 'required' : ''
		}></div>`;
}

async function handleSubmit(
	event: Event,
	ctx: AppContext,
	existing?: Customer
): Promise<void> {
	event.preventDefault();
	const values = formValues(event.target as HTMLFormElement);
	const data = {
		name: values.name,
		phone: values.phone,
		email: values.email,
		notes: values.notes
	};
	if (existing) {
		await ctx.customers.update(existing.id, data);
	} else {
		await ctx.customers.add({ id: uid(), ...data });
	}
	closeModal();
	showToast('Cliente salvo');
}