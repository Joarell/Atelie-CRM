// @vitest-environment happy-dom
// Regressao do aviso do Chrome "a pagina que voce esta vendo usou informacoes
// que voce digitou" (Confirm Form Resubmission). O sintoma era "em todo
// refresh e em todo menu": o roteamento e por hash, entao cada menu cria uma
// entrada de historico que aponta para o MESMO documento — um unico submit
// nativo que escapasse en contaminava todas as rotas ate a aba fechar.
import { describe, it, expect, beforeEach } from 'vitest';
import { blockNativeSubmit, formValues, qs } from '../../src/ui/dom';

function render(html: string): void {
	document.body.innerHTML = html;
}

describe('blockNativeSubmit', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		blockNativeSubmit();
	});

	it('cancela o submit de form que nao tem handler proprio', () => {
		render('<form id="orfa"><input name="email" value="a@b.c"></form>');
		const form = qs<HTMLFormElement>('#orfa');
		const event = new Event('submit', { cancelable: true });
		form.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
	});

	it('cancela o submit disparado pelo botao de um form sem handler', () => {
		render('<form id="sem-bind"><button type="submit">Enviar</button></form>');
		const event = new Event('submit', { cancelable: true, bubbles: true });
		qs<HTMLFormElement>('#sem-bind').dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
	});

	it('nao impede o handler da view de rodar (so cancela a acao padrao)', () => {
		render('<form id="com-handler"></form>');
		const form = qs<HTMLFormElement>('#com-handler');
		let handled = false;
		form.addEventListener('submit', () => { handled = true; });
		const event = new Event('submit', { cancelable: true });
		form.dispatchEvent(event);
		expect(handled).toBe(true);
		expect(event.defaultPrevented).toBe(true);
	});

	it('roda antes do handler da view (capture) e nao quebra os valores', () => {
		render('<form id="valores"><input name="nome" value="Ana"></form>');
		const form = qs<HTMLFormElement>('#valores');
		const order: string[] = [];
		form.addEventListener('submit', () => { order.push('view'); });
		document.addEventListener(
			'submit',
			() => { order.push('guard'); },
			true
		);
		form.dispatchEvent(new Event('submit', { cancelable: true }));
		expect(order).toEqual(['guard', 'view']);
		expect(formValues(form)).toEqual({ nome: 'Ana' });
	});

	it('protege forms criados depois do boot (innerHTML trocado)', () => {
		document.body.innerHTML = '';
		blockNativeSubmit();
		render('<form id="tardio"></form>');
		const event = new Event('submit', { cancelable: true });
		qs<HTMLFormElement>('#tardio').dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
	});

	it('nao afeta forms do login, que ja cancelavam o proprio submit', () => {
		render('<form id="login"></form>');
		const form = qs<HTMLFormElement>('#login');
		form.addEventListener('submit', (event) => { event.preventDefault(); });
		const event = new Event('submit', { cancelable: true });
		form.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
	});
});
