import type { AppContext } from '../../state/AppContext';
import type {
  RecipeComponent,
  ComponentItem,
  ComponentType
} from '../../domain/types';
import { formatBRL, uid, escapeHtml } from '../../domain/format';
import { renderEmptyState } from '../CrudTable';
import { openModal, closeModal } from '../Modal';
import { showToast } from '../Toast';
import { autoRerender } from '../reactive';
import { qs, formValues } from '../dom';
import { ingredientUnitCost } from '../../domain/pricing';

const TYPE_LABELS: Record<ComponentType, string> = {
  base: 'Base',
  recheio: 'Recheio',
  cobertura: 'Cobertura'
};
let activeTab: ComponentType = 'base';

export function renderComponentsView(
  root: HTMLElement,
  ctx: AppContext
): () => void {
  return autoRerender(() => draw(root, ctx), [
    ctx.components.subscribe.bind(ctx.components),
    ctx.ingredients.subscribe.bind(ctx.ingredients)
  ]);
}

function draw(root: HTMLElement, ctx: AppContext): void {
  const items = ctx.components.getAll().filter((c) => c.type === activeTab);
  const cards = items.length
    ? `<div class="grid-cards">${cardsHtml(items, ctx)}</div>`
    : renderEmptyState(
        'Nenhuma ficha aqui ainda',
        'Crie a primeira ficha técnica desta categoria.'
      );
  root.innerHTML = `
    <div class="section-head">
      <div><h2>Componentes</h2><p>Fichas técnicas de bases, ` +
    `recheios e coberturas</p></div>
      <button class="btn btn-primary" id="new-component">+ Nova ficha</button>
    </div>
    <div class="tabs">${renderTabs()}</div>
    ${cards}`;
  wireEvents(root, ctx);
}

function cardsHtml(items: RecipeComponent[], ctx: AppContext): string {
  return items.map((c) => renderCard(c, ctx)).join('');
}

function renderTabs(): string {
  return (Object.keys(TYPE_LABELS) as ComponentType[])
    .map(
      (type) =>
        `<div class="tab${type === activeTab ? ' active' : ''}" ` +
        `data-tab="${type}">${TYPE_LABELS[type]}</div>`
    )
    .join('');
}

function renderCard(component: RecipeComponent, ctx: AppContext): string {
  const cost = ctx.pricing.componentCost(component);
  const lines = component.items
    .map((item) => renderCardLine(item, ctx))
    .join('');
  return `<div class="recipe-card">
    <div class="rc-head"><div class="rc-eyebrow">${
      TYPE_LABELS[component.type]
    } · ${component.prepTime} min</div>
      <div class="rc-title">${escapeHtml(component.name)}</div></div>
    <div class="rc-body">${lines}</div>
    <div class="rc-foot"><span class="soft">Custo total</span><strong>${
      formatBRL(cost)
    }</strong></div>
    <div class="rc-actions">
      <button class="btn btn-ghost btn-sm" data-edit="${component.id}">` +
      `Editar</button>
      <button class="btn btn-ghost btn-sm btn-danger" data-delete=` +
      `"${component.id}">Excluir</button></div></div>`;
}

function renderCardLine(item: ComponentItem, ctx: AppContext): string {
  const ingredient = ctx.ingredients.getById(item.ingredientId);
  const name = ingredient ? ingredient.name : '(ingrediente removido)';
  return `<div class="rc-ing"><span>${escapeHtml(name)}</span><span>${
      item.qty
    } ${ingredient?.unit ?? ''}</span></div>`;
}

function wireEvents(root: HTMLElement, ctx: AppContext): void {
  root.querySelectorAll<HTMLElement>('[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab as ComponentType;
      draw(root, ctx);
    });
  });
  qs('#new-component', root).addEventListener('click', () => openForm(ctx));
  root.querySelectorAll<HTMLElement>('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () =>
      openForm(ctx, ctx.components.getById(btn.dataset.edit!))
    )
  );
  root.querySelectorAll<HTMLElement>('[data-delete]').forEach((btn) =>
    btn.addEventListener('click', () => handleDelete(ctx, btn.dataset.delete!))
  );
}

async function handleDelete(ctx: AppContext, id: string): Promise<void> {
  if (!confirm('Excluir esta ficha técnica?')) return;
  await ctx.components.remove(id);
  showToast('Ficha excluída');
}

// --- Form with dynamic ingredient rows ---

function openForm(ctx: AppContext, existing?: RecipeComponent): void {
  const rows: ComponentItem[] = existing
    ? existing.items.map((i) => ({ ...i }))
    : [];
  const title = existing ? 'Editar ficha técnica' : 'Nova ficha técnica';
  const modal = openModal({ title, bodyHtml: formShell(existing) });
  redrawRows(modal, ctx, rows);
  wireFormEvents(modal, ctx, rows, existing);
}

function formShell(existing?: RecipeComponent): string {
  const v = existing ?? {
    name: '',
    type: 'base' as ComponentType,
    yieldDesc: '',
    prepTime: 0
  };
  return `<form id="component-form">
    ${textField('name', 'Nome da ficha', v.name)}
    <div class="field-row" style="grid-template-columns:1fr 1fr 1fr;">
      ${typeSelect(v.type)}${
        textField('yieldDesc', 'Rendimento (descrição)', v.yieldDesc)
      }${numberField('prepTime', 'Tempo de preparo (min)', v.prepTime)}</div>
    <label class="field-label">Ingredientes</label>
    <div class="line-item-head"><span>Ingrediente</span><span>Qtd.</span>` +
    `<span>Custo</span><span></span></div>
    <div id="rows-container"></div>
    <button type="button" class="btn btn-sm" id="add-row">` +
    `+ Adicionar ingrediente</button>
    ${calcBoxShell()}
    <div class="modal-foot" style="padding:16px 0 0;border:none;">
      <button type="button" class="btn" data-close-modal>Cancelar</button>
      <button type="submit" class="btn btn-primary">Salvar ficha</button>` +
    `</div></form>`;
}

function calcBoxShell(): string {
  return `<div class="calc-box"><div class="calc-row total">` +
    `<span>Custo total da ficha</span><span id="component-total">` +
    `R$ 0,00</span></div></div>`;
}

function typeSelect(current: ComponentType): string {
  const options = (Object.keys(TYPE_LABELS) as ComponentType[])
    .map(
      (t) =>
        `<option value="${t}" ${t === current ? 'selected' : ''}>` +
        `${TYPE_LABELS[t]}</option>`
    )
    .join('');
  return `<div class="field"><label class="field-label">Tipo</label>` +
    `<select class="input" name="type">${options}</select></div>`;
}

function redrawRows(
  modal: HTMLElement,
  ctx: AppContext,
  rows: ComponentItem[]
): void {
  const container = qs('#rows-container', modal);
  container.innerHTML = rows
    .map((row, index) => rowHtml(row, index, ctx))
    .join('');
  updateTotal(modal, ctx, rows);
  wireRowEvents(modal, ctx, rows);
}

function rowHtml(row: ComponentItem, index: number, ctx: AppContext): string {
  const ingredient = ctx.ingredients.getById(row.ingredientId);
  const cost = ingredientUnitCost(ingredient) * row.qty;
  return `<div class="line-item" data-row="${index}">
    ${ingredientSelect(row.ingredientId, ctx)}
    <input class="input" type="number" step="0.01" min="0" data-qty value="${
      row.qty
    }">
    <span class="num soft">${formatBRL(cost)}</span>
    <button type="button" class="remove-row" data-remove-row ` +
    `aria-label="Remover">✕</button></div>`;
}

function ingredientSelect(selectedId: string, ctx: AppContext): string {
  const options = ctx.ingredients
    .getAll()
    .map(
      (i) =>
        `<option value="${i.id}" ${i.id === selectedId ? 'selected' : ''}>` +
        `${escapeHtml(i.name)}</option>`
    )
    .join('');
  return `<select class="input" data-ingredient>` +
    `<option value="">Selecione…</option>${options}</select>`;
}

function wireRowEvents(
  modal: HTMLElement,
  ctx: AppContext,
  rows: ComponentItem[]
): void {
  modal.querySelectorAll<HTMLElement>('[data-row]').forEach((rowEl) => {
    const index = Number(rowEl.dataset.row);
    const selectEl = qs<HTMLSelectElement>('[data-ingredient]', rowEl);
    selectEl.addEventListener('change', (e) => {
      updateRow(modal, ctx, rows, index, {
        ingredientId: (e.target as HTMLSelectElement).value
      });
    });
    const qtyEl = qs<HTMLInputElement>('[data-qty]', rowEl);
    qtyEl.addEventListener('input', (e) => {
      updateRow(modal, ctx, rows, index, {
        qty: Number((e.target as HTMLInputElement).value)
      });
    });
    qs('[data-remove-row]', rowEl).addEventListener('click', () => {
      rows.splice(index, 1);
      redrawRows(modal, ctx, rows);
    });
  });
}

function updateRow(
  modal: HTMLElement,
  ctx: AppContext,
  rows: ComponentItem[],
  index: number,
  patch: Partial<ComponentItem>
): void {
  rows[index] = { ...rows[index], ...patch };
  redrawRows(modal, ctx, rows);
}

function updateTotal(
  modal: HTMLElement,
  ctx: AppContext,
  rows: ComponentItem[]
): void {
  const total = rows.reduce((sum, row) => {
    const cost = ingredientUnitCost(ctx.ingredients.getById(row.ingredientId));
    return sum + cost * row.qty;
  }, 0);
  qs('#component-total', modal).textContent = formatBRL(total);
}

function wireFormEvents(
  modal: HTMLElement,
  ctx: AppContext,
  rows: ComponentItem[],
  existing?: RecipeComponent
): void {
  qs('#add-row', modal).addEventListener('click', () => {
    rows.push({ ingredientId: '', qty: 0 });
    redrawRows(modal, ctx, rows);
  });
  qs('#component-form', modal).addEventListener('submit', (event) =>
    handleSubmit(event, ctx, rows, existing)
  );
}

async function handleSubmit(
  event: Event,
  ctx: AppContext,
  rows: ComponentItem[],
  existing?: RecipeComponent
): Promise<void> {
  event.preventDefault();
  const values = formValues(event.target as HTMLFormElement);
  const validRows = rows.filter((r) => r.ingredientId && r.qty > 0);
  const data = {
    name: values.name,
    type: values.type as ComponentType,
    yieldDesc: values.yieldDesc,
    prepTime: Number(values.prepTime),
    items: validRows
  };
  if (existing) {
    await ctx.components.update(existing.id, data);
  } else {
    await ctx.components.add({ id: uid(), ...data });
  }
  closeModal();
  showToast('Ficha técnica salva');
}

function textField(name: string, label: string, value: string): string {
  return `<div class="field"><label class="field-label">${label}</label>
    <input class="input" name="${name}" value="${escapeHtml(value)}"` +
    ` required></div>`;
}

function numberField(name: string, label: string, value: number): string {
  return `<div class="field"><label class="field-label">${label}</label>
    <input class="input" type="number" step="0.01" min="0" name="${name}` +
    `" value="${value}" required></div>`;
}