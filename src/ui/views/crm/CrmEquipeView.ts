import type { AppContext } from '../../../state/AppContext';
import type { Role, User } from '../../../domain/crm';
import { escapeHtml, uid } from '../../../domain/format';
import { renderCrudTable, type TableColumn } from '../../CrudTable';
import { openModal, closeModal } from '../../Modal';
import { showToast } from '../../Toast';
import { autoRerender } from '../../reactive';
import { qs, qsIf, formValues } from '../../dom';
import { section, textField, selectField, modalFoot } from './crmUi';

const ROLE_LABELS: Record<Role, string> = {
	viewer: 'Visualização',
	agent: 'Atendente',
	manager: 'Gerente',
	admin: 'Administrador'
};

export function renderCrmEquipeView(
	root: HTMLElement,
	ctx: AppContext
): () => void {
	return autoRerender(() => draw(root, ctx), [
		ctx.users.subscribe.bind(ctx.users),
		ctx.auth.subscribe.bind(ctx.auth)
	]);
}

function draw(root: HTMLElement, ctx: AppContext): void {
	const me = ctx.auth.currentUser();
	const rows = sortByName(ctx.users.getAll());
	root.innerHTML = `
		${sessionBar(ctx, me)}
		${pageHead(me?.role ?? null)}
		${tableHtml(ctx, rows)}`;
	wireEvents(root, ctx);
}

function sortByName(users: User[]): User[] {
	return users.slice().sort((a, b) => a.name.localeCompare(b.name));
}

const USER_MANAGERS: Role[] = ['admin', 'manager'];

function pageHead(role: Role | null): string {
	return section('Equipe', 'Usuários e papéis do sistema', newUserBtn(role));
}

// POST /api/users exige `['admin','manager']` (users/index.ts). Renderizar
// o botao para um `viewer` produzia um clique que so voltava 403 — a UI
// dizia que a acao existia quando o servidor nao aceitava.
function newUserBtn(role: Role | null): string {
	if (!role || !USER_MANAGERS.includes(role)) return '';
	return '<button class="btn btn-primary" id="new-user">' +
		'+ Novo usuário</button>';
}

function tableHtml(ctx: AppContext, rows: User[]): string {
	return renderCrudTable({
		columns: columns(),
		rows,
		actions: (u) => actionButtons(ctx, u),
		emptyTitle: 'Nenhum usuário ainda',
		emptyHint: 'Crie o primeiro usuário para começar a logar.'
	});
}

function sessionBar(ctx: AppContext, me: User | null): string {
	if (me) return sessionBarLoggedIn(me);
	return sessionBarLoggedOut();
}

function sessionBarLoggedIn(me: User): string {
	const name = escapeHtml(me.name);
	const email = escapeHtml(me.email);
	const role = ROLE_LABELS[me.role];
	return (
		`<div class="session-bar"><div><strong>${name}</strong>` +
		`<span class="soft">${email} · ${role}</span></div>` +
		`\n      <div class="session-bar-actions">` +
		`\n        <button class="btn btn-ghost btn-sm" ` +
		`id="change-password">Trocar senha</button>` +
		`\n        <button class="btn btn-ghost btn-sm" id="logout">` +
		`Sair</button></div></div>`
	);
}

function sessionBarLoggedOut(): string {
	const hint =
		'<span class="soft">Entre para mandar mensagens ' +
		'e registrar ações.</span></div>';
	return (
		'<div class="session-bar"><div>' +
		`<strong class="soft">Nenhuma sessão ativa</strong>` +
		`${hint}
		<button class="btn btn-primary btn-sm" id="login">Entrar</button></div>`
	);
}

function columns(): TableColumn<User>[] {
	return [
		{ header: 'Nome', render: (u) => escapeHtml(u.name) },
		{ header: 'E-mail', render: (u) => escapeHtml(u.email) },
		{ header: 'Papel', render: (u) => escapeHtml(ROLE_LABELS[u.role]) }
	];
}

// DELETE /api/users/:id exige `['admin']` (users/[id].ts:50). A UI liberava
// o botao para `manager`, que clicava e levava 403. Aqui a tela espelha o
// endpoint.
function actionButtons(ctx: AppContext, user: User): string {
	const me = ctx.auth.currentUser();
	const others = ctx.users.getAll().filter((u) => u.id !== me?.id);
	const canRemove =
		me?.role === 'admin' &&
		(me?.id !== user.id || others.length === 0);
	return `${editBtn(user.id)}\n    ${deleteBtn(user.id, canRemove)}`;
}

function editBtn(userId: string): string {
	return (
		`<button class="btn btn-ghost btn-sm" data-edit="` +
		`${userId}>Editar</button>`
	);
}

function deleteBtn(userId: string, canRemove: boolean): string {
	if (!canRemove) return '';
	return (
		`<button class="btn btn-ghost btn-sm btn-danger" data-delete="` +
		`${userId}">Excluir</button>`
	);
}

function bindData(
	root: HTMLElement,
	key: string,
	onClick: (id: string) => void
): void {
	const dataKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
	root.querySelectorAll<HTMLElement>(`[data-${key}]`).forEach((btn) => {
		btn.addEventListener('click', () => onClick(btn.dataset[dataKey]!));
	});
}

function wireEvents(root: HTMLElement, ctx: AppContext): void {
	qsIf('#login', root)?.addEventListener('click', () => openLogin(ctx));
	qsIf('#logout', root)?.addEventListener('click', () => handleLogout(ctx));
	qsIf('#change-password', root)?.addEventListener('click', () =>
		openChangePassword(ctx));
	qsIf('#new-user', root)?.addEventListener('click', () => openUserForm(ctx));
	bindData(root, 'edit', (id) => openUserForm(ctx, ctx.users.getById(id)));
	bindData(root, 'delete', (id) => handleDelete(ctx, id));
}

async function handleLogout(ctx: AppContext): Promise<void> {
	await ctx.auth.logout();
	showToast('Sessão encerrada');
}

function openLogin(ctx: AppContext): void {
	const modal = openModal({ title: 'Entrar', bodyHtml: loginFormHtml() });
	qs('form', modal).addEventListener('submit', async (event) => {
		await loginSubmit(event, ctx);
	});
}

function loginFormHtml(): string {
	const email = textField('email', 'E-mail', '');
	const pass = textField('password', 'Senha', '');
	return (
		'<form>\n    ' +
		`${email}${pass}` +
		`\n    <div class="modal-foot" style="padding:16px 0 0;border:none;">` +
		`\n      <button type="button" class="btn" data-close-modal>` +
		`Cancelar</button>` +
		`\n      <button type="submit" class="btn btn-primary">` +
		`Entrar</button></div></form>`
	);
}

async function loginSubmit(event: Event, ctx: AppContext): Promise<void> {
	event.preventDefault();
	const values = formValues(event.target as HTMLFormElement);
	try {
		await ctx.auth.login(values.email, values.password);
		closeModal();
		showToast(`Bem-vindo, ${ctx.auth.currentUser()?.name ?? ''}`);
	} catch (error) {
		showToast(error instanceof Error ? error.message : 'Falha no login');
	}
}

function openChangePassword(ctx: AppContext): void {
	const modal = openModal({
		title: 'Trocar senha',
		bodyHtml: changePasswordFormHtml()
	});
	qs('form', modal).addEventListener('submit', async (event) => {
		await changePasswordSubmit(event, ctx);
	});
}

function changePasswordFormHtml(): string {
	return `<form>
		<div class="field"><label class="field-label">Senha atual</label>
		<input class="input" type="password" name="current_password"
			autocomplete="current-password" required></div>
		<div class="field"><label class="field-label">Nova senha
			(mín. 8 caracteres)</label>
		<input class="input" type="password" name="new_password"
			autocomplete="new-password" required></div>
		${modalFoot()}</form>`;
}

async function changePasswordSubmit(
	event: Event,
	ctx: AppContext
): Promise<void> {
	event.preventDefault();
	const values = formValues(event.target as HTMLFormElement);
	try {
		await ctx.auth.changePassword(
			values.current_password, values.new_password
		);
		closeModal();
		showToast('Senha alterada');
	} catch (error) {
		showToast(error instanceof Error ? error.message : 'Falha ao trocar');
	}
}

async function handleDelete(ctx: AppContext, id: string): Promise<void> {
	const user = ctx.users.getById(id);
	if (!user || !confirm(`Excluir o usuário ${user.name}?`)) return;
	await ctx.users.remove(id);
	showToast('Usuário excluído');
}

function openUserForm(ctx: AppContext, existing?: User): void {
	const modal = openModal({
		title: existing ? 'Editar usuário' : 'Novo usuário',
		bodyHtml: userFormHtml(existing)
	});
	qs('form', modal).addEventListener('submit', (event) =>
		handleSubmit(event, ctx, existing));
}

function roleOptions(): Array<{ value: string; label: string }> {
	return (Object.keys(ROLE_LABELS) as Role[]).map((r) => ({
		value: r,
		label: ROLE_LABELS[r]
	}));
}

function userFormHtml(existing?: User): string {
	const roles = roleOptions();
	const email = textField('email', 'E-mail', existing?.email ?? '');
	const role = existing?.role ?? 'viewer';
	const select = selectField('role', 'Papel', roles, role);
	return `<form>${textField('name', 'Nome', existing?.name ?? '')}
		<div class="field-row">${email}${select}</div>
		${passwordField(existing)}
		${modalFoot()}</form>`;
}

function passwordField(existing?: User): string {
	if (existing) {
		return (
			`<div class="field"><label class="field-label">` +
			`Nova senha (deixe em branco para manter)</label>` +
			`<input class="input" type="password" name="password"></div>`
		);
	}
	return (
		`<div class="field"><label class="field-label">Senha</label>` +
		`<input class="input" type="password" name="password" required></div>`
	);
}

async function handleSubmit(
	event: Event,
	ctx: AppContext,
	existing?: User
): Promise<void> {
	event.preventDefault();
	const values = formValues(event.target as HTMLFormElement);
	if (existing) {
		await ctx.users.update(existing.id, userPatchFor(values));
	} else {
		await saveNewUser(values);
	}
	closeModal();
	showToast(existing ? 'Usuário atualizado' : 'Usuário criado');
}

// The wire format for PUT /api/users/[id] carries `password` (hashed by
// the route), never `passwordHash` — that field is write-only server-side.
// Empty password means "keep the current one", so it is omitted.
export function userPatchFor(
	values: Record<string, string>
): Partial<User> & { password?: string } {
	const patch: Partial<User> = {
		name: values.name,
		email: values.email,
		role: values.role as Role
	};
	const casted = patch as Partial<User> & { password?: string };
	if (values.password) casted.password = values.password;
	return casted;
}

async function saveNewUser(values: Record<string, string>): Promise<void> {
	const body = JSON.stringify({
		id: uid(),
		name: values.name,
		email: values.email,
		role: values.role,
		password: values.password
	});
	const response = await fetch('/api/users', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body
	});
	if (!response.ok) {
		throw new Error(`Falha ao criar usuário (${response.status})`);
	}
}