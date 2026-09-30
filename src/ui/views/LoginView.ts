import type { AppContext } from '../../state/AppContext';
import { qs, formValues } from '../dom';
import { showToast } from '../Toast';
import { icon } from '../icons';

const RETURN_KEY = 'login_return_path';

const ERROR_MESSAGES: Record<string, string> = {
	email_e_senha_obrigatorios: 'Informe e-mail e senha.',
	credenciais_invalidas: 'E-mail ou senha incorretos.',
	origem_nao_permitida: 'Origem não autorizada.',
	sessao_invalida: 'Sessão expirada.'
};

// Dedicated login screen (#/login). Coherent with the rest of the app: the
// same `.field`/`.input`/`.btn-primary` tokens, error inline (never a toast
// that can be missed), and a redirect back to the route the user came from.
export function renderLoginView(
	root: HTMLElement,
	ctx: AppContext
): () => void {
	const me = ctx.auth.currentUser();
	if (me) {
		drawLoggedIn(root, me);
		return () => {};
	}
	drawForm(root, ctx);
	return () => {};
}

function drawForm(root: HTMLElement, ctx: AppContext): void {
	root.innerHTML = loginCardHtml();
	qs('form', root).addEventListener('submit', (event) =>
		void loginSubmit(event, ctx, root));
}

function drawLoggedIn(
	root: HTMLElement,
	me: { name: string; email: string }
): void {
	root.innerHTML =
		`<div class="login-card">${loginBrand()}` +
		`\n    <h2>Você já está conectado</h2>` +
		`\n    <p class="soft">Sessão ativa de <strong>${me.name}</strong>` +
		`\n      (${me.email}).</p>` +
		`\n    <button class="btn btn-primary btn-block" id="go-dashboard">` +
		`\n      Ir para o Painel</button></div>`;
	qs('#go-dashboard', root).addEventListener('click', () => {
		window.location.hash = clearReturn();
	});
}

function loginCardHtml(): string {
	return `<div class="login-card">${loginBrand()}
		<h2>Entrar no Ateliê</h2>
		<p class="soft">Use seu e-mail de equipe para continuar.</p>
		<form>
			${fieldHtml('email', 'E-mail', 'email')}
			${fieldHtml('password', 'Senha', 'current-password')}
			<p class="login-error" id="login-error" role="alert"></p>
			<button class="btn btn-primary btn-block" id="login-submit"
				type="submit">Entrar</button>
		</form></div>`;
}

function loginBrand(): string {
	return `<div class="login-brand">${icon('equipe')}
		<div><strong class="mark">Ateliê</strong>
		<span class="soft sub">Vendas · Equipe · Ateliê</span></div></div>`;
}

function fieldHtml(
	name: string,
	label: string,
	autocomplete: string
): string {
	return `<div class="field">
		<label class="field-label" for="login-${name}">${label}</label>
		<input class="input" id="login-${name}" name="${name}"
			type="${name}" autocomplete="${autocomplete}" required>
	</div>`;
}

async function loginSubmit(
	event: Event,
	ctx: AppContext,
	root: HTMLElement
): Promise<void> {
	event.preventDefault();
	const values = formValues(event.target as HTMLFormElement);
	const errorEl = qs('#login-error', root);
	const submit = qs<HTMLButtonElement>('#login-submit', root);
	errorEl.textContent = '';
	submit.disabled = true;
	try {
		await ctx.auth.login(values.email, values.password);
		const name = ctx.auth.currentUser()?.name ?? '';
		showToast(`Bem-vindo, ${name}`);
		window.location.hash = returnPath();
	} catch (error) {
		errorEl.textContent = error instanceof Error
			? friendlyError(error)
			: 'Falha no login';
		submit.disabled = false;
	}
}

function returnPath(): string {
	const stored = sessionStorage.getItem(RETURN_KEY);
	sessionStorage.removeItem(RETURN_KEY);
	if (stored && stored !== '#/login') return stored;
	return '#/';
}

function clearReturn(): string {
	sessionStorage.removeItem(RETURN_KEY);
	return '#/';
}

function friendlyError(error: Error): string {
	return ERROR_MESSAGES[error.message] ?? error.message;
}