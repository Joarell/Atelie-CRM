// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { restoreFields, snapshotFields } from '../../src/ui/formState';

function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  root.innerHTML = html;
  return root;
}

function redraw(root: HTMLElement, html: string): void {
  const snap = snapshotFields(root);
  root.innerHTML = html;
  restoreFields(root, snap);
}

const FORM = `
  <input id="a" value="um" />
  <textarea id="b">dois</textarea>
  <select id="c"><option value="x">x</option><option value="y">y</option></select>
  <input id="gone" value="somei" />
`;

const FORM_AGAIN = `
  <input id="a" value="" />
  <textarea id="b"></textarea>
  <select id="c"><option value="x">x</option><option value="y">y</option></select>
`;

// `T = HTMLElement` not `extends`: worker-configuration.d.ts merges workerd's
// `remove(): Element` into lib.dom, breaking `extends HTMLElement`. As in dom.ts.
function field<T = HTMLElement>(root: HTMLElement, id: string): T {
  return root.querySelector(`#${id}`) as T;
}

describe('snapshotFields/restoreFields — um redraw não pode comer a digitação', () => {
  it('devolve o valor de todo campo de texto após a troca do innerHTML', () => {
    const root = mount(FORM);
    field<HTMLInputElement>(root, 'a').value = 'digitado';
    field<HTMLTextAreaElement>(root, 'b').value = 'rascunho';
    field<HTMLSelectElement>(root, 'c').value = 'y';

    redraw(root, FORM_AGAIN);

    expect(field<HTMLInputElement>(root, 'a').value).toBe('digitado');
    expect(field<HTMLTextAreaElement>(root, 'b').value).toBe('rascunho');
    expect(field<HTMLSelectElement>(root, 'c').value).toBe('y');
  });

  it('devolve o foco ao campo que o leitor estava usando', () => {
    const root = mount(FORM);
    field<HTMLTextAreaElement>(root, 'b').focus();

    redraw(root, FORM_AGAIN);

    expect(document.activeElement).toBe(field(root, 'b'));
  });

  it('devolve o cursor, não só o fim do texto', () => {
    const root = mount(FORM);
    const area = field<HTMLTextAreaElement>(root, 'b');
    area.value = 'Ana Beatriz';
    area.focus();
    area.setSelectionRange(4, 9);

    redraw(root, FORM_AGAIN);

    const fresh = field<HTMLTextAreaElement>(root, 'b');
    expect(fresh.selectionStart).toBe(4);
    expect(fresh.selectionEnd).toBe(9);
  });

  it('ignora um campo que sumiu no markup novo', () => {
    const root = mount(FORM);
    field<HTMLInputElement>(root, 'a').value = 'digitado';

    expect(() => redraw(root, FORM_AGAIN)).not.toThrow();
    expect(field<HTMLInputElement>(root, 'a').value).toBe('digitado');
  });

  it('não mexe em checkbox/radio, cuja value não é o estado marcado', () => {
    const root = mount(`
      <input id="ck" type="checkbox" value="on" checked />
      <input id="rd" type="radio" value="r1" />
    `);
    field<HTMLInputElement>(root, 'ck').checked = false;

    redraw(root, `
      <input id="ck" type="checkbox" value="on" checked />
      <input id="rd" type="radio" value="r1" />
    `);

    expect(field<HTMLInputElement>(root, 'ck').checked).toBe(true);
  });

  it('sobrevive a um campo sem seleção (date/number), onde o cursor não existe', () => {
    const root = mount('<input id="d" type="date" value="2026-09-20" />');
    field<HTMLInputElement>(root, 'd').focus();

    expect(() => redraw(
      root, '<input id="d" type="date" value="" />'
    )).not.toThrow();
    expect(field<HTMLInputElement>(root, 'd').value).toBe('2026-09-20');
  });

  it('é inócuo quando nada estava em foco', () => {
    const root = mount(FORM);
    (document.activeElement as HTMLElement | null)?.blur();

    expect(() => redraw(root, FORM_AGAIN)).not.toThrow();
    expect(document.activeElement).not.toBe(field(root, 'b'));
  });
});
