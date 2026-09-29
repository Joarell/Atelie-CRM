import type { AppContext } from '../../state/AppContext';
import type {
  Order,
  OrderLine,
  OrderStatus,
  PaymentStatus
} from '../../domain/types';
import {
  formatBRL,
  formatDate,
  todayISO,
  escapeHtml
} from '../../domain/format';
import {
  orderItemsText
} from '../../domain/orderHistory';
import {
  kanbanColumns,
  ordersByDeliveryDate,
  shiftDay,
  type KanbanColumn
} from '../../domain/orderKanban';
import { openModal, closeModal } from '../Modal';
import { showToast } from '../Toast';
import { autoRerender } from '../reactive';
import { qs, qsa, formValues } from '../dom';

// Board state survives redraws (repo refresh / status changes redraw the
// whole view, so the selected day and the in-flight drag live up here).
let kanbanDay = todayISO();
let draggedOrderId: string | null = null;

export function renderOrdersView(
  root: HTMLElement,
  ctx: AppContext
): () => void {
  return autoRerender(() => draw(root, ctx), [
    ctx.orders.subscribe.bind(ctx.orders),
    ctx.customers.subscribe.bind(ctx.customers),
    ctx.products.subscribe.bind(ctx.products)
  ]);
}

function draw(root: HTMLElement, ctx: AppContext): void {
  const day = kanbanDay;
  root.innerHTML = pageHtml(ctx, day);
  wireEvents(root, ctx, day);
}

function pageHtml(ctx: AppContext, day: string): string {
  const orders = ordersByDeliveryDate(ctx.orders.getAll(), day);
  const board = kanbanColumns(orders).map((c) => columnHtml(ctx, c)).join('');
  return `
    <div class="section-head">
      <div><h2>Pedidos</h2><p>Board de produção · ${formatDate(day)}</p></div>
      ${dayToolbar(day)}
    </div>
    <div class="kanban orders-board">
      ${board}
    </div>`;
}

function dayToolbar(day: string): string {
  return `<div class="orders-toolbar">
    <button class="btn btn-ghost btn-sm" id="day-prev" ` +
    `title="Dia anterior">◀</button>
    <input class="input" type="date" id="day-input" value="${day}">
    <button class="btn btn-ghost btn-sm" id="day-next" ` +
    `title="Próximo dia">▶</button>
    <button class="btn btn-primary" id="new-order">+ Novo pedido</button>
  </div>`;
}

function columnHtml(ctx: AppContext, column: KanbanColumn): string {
  const cards = column.orders.map((o) => cardHtml(ctx, o)).join('');
  const empty = '<div class="kanban-empty">Nenhum pedido</div>';
  return `<div class="kanban-col kanban-col--${column.status}" ` +
    `data-status="${column.status}">
    <div class="kanban-head"><span class="kanban-title">` +
    `${escapeHtml(column.label)}</span>
      <span class="kanban-meta">${column.count} · ` +
    `${formatBRL(column.total)}</span></div>
    <div class="kanban-cards">${cards || empty}</div>
  </div>`;
}

function cardHtml(ctx: AppContext, order: Order): string {
  return `<div class="deal-card board-card" draggable="true" ` +
    `data-order="${order.id}">
    <div class="deal-title">${escapeHtml(order.customerName)}</div>
    <div class="deal-sub">${escapeHtml(orderItemsText(order.lines))}</div>
    <div class="deal-value">${formatBRL(ctx.order.orderTotal(order))}</div>
    <div class="deal-actions">
      ${paymentBadge(order)}
      ${boardActions(order)}
    </div>
  </div>`;
}

function paymentBadge(order: Order): string {
  const paid = order.paymentStatus === 'pago';
  const badge = paid ? 'badge-sage' : 'badge-caramel';
  const label = paid ? 'Pago' : 'A pagar';
  return `<button class="badge ${badge}" data-toggle-payment="` +
    `${order.id}" style="border:none;">${label}</button>`;
}

function boardActions(order: Order): string {
  const eligible =
    !order.stockDeducted &&
    order.status !== 'pendente' &&
    order.status !== 'cancelado';
  const deductBtn = eligible
    ? `<button class="btn btn-ghost btn-sm" data-deduct="${order.id}">` +
      `Baixar estoque</button>`
    : '';
  return `${deductBtn}<button class="btn btn-ghost btn-sm btn-danger" ` +
    `data-delete="${order.id}">Excluir</button>`;
}

function wireEvents(root: HTMLElement, ctx: AppContext, day: string): void {
  qs('#day-prev', root).addEventListener('click', () => {
    kanbanDay = shiftDay(day, -1);
    draw(root, ctx);
  });
  qs('#day-next', root).addEventListener('click', () => {
    kanbanDay = shiftDay(day, 1);
    draw(root, ctx);
  });
  qs('#day-input', root).addEventListener('change', (event) => {
    kanbanDay = (event.target as HTMLInputElement).value;
    draw(root, ctx);
  });
  qs('#new-order', root).addEventListener('click', () => openForm(ctx));
  wireCardActions(root, ctx);
  wireBoardDrag(root, ctx);
}

function wireCardActions(root: HTMLElement, ctx: AppContext): void {
  root.querySelectorAll<HTMLElement>('[data-toggle-payment]').forEach(
    (btn) => btn.addEventListener('click', () => togglePayment(ctx, btn))
  );
  root.querySelectorAll<HTMLElement>('[data-deduct]').forEach((btn) =>
    btn.addEventListener('click', () => handleDeduct(ctx, btn.dataset.deduct!))
  );
  root.querySelectorAll<HTMLElement>('[data-delete]').forEach((btn) =>
    btn.addEventListener('click', () => handleDelete(ctx, btn.dataset.delete!))
  );
}

function wireBoardDrag(root: HTMLElement, ctx: AppContext): void {
  qsa<HTMLElement>('[data-order]', root).forEach((card) => {
    card.addEventListener('dragstart', (event) =>
      handleDragStart(event as DragEvent, card.dataset.order!));
  });
  qsa<HTMLElement>('.kanban-col', root).forEach((col) => {
    col.addEventListener('dragover', (event) =>
      handleDragOver(event as DragEvent, col));
    col.addEventListener('dragleave', () => col.classList.remove('dragover'));
    col.addEventListener('drop', (event) =>
      handleDrop(event as DragEvent, ctx, col));
  });
}

function handleDragStart(event: DragEvent, orderId: string): void {
  draggedOrderId = orderId;
  event.dataTransfer?.setData('text/plain', orderId);
}

function handleDragOver(event: DragEvent, col: HTMLElement): void {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  col.classList.add('dragover');
}

function handleDrop(
  event: DragEvent,
  ctx: AppContext,
  col: HTMLElement
): void {
  event.preventDefault();
  col.classList.remove('dragover');
  const fromTransfer = event.dataTransfer?.getData('text/plain') ?? '';
  const orderId = draggedOrderId ?? fromTransfer;
  draggedOrderId = null;
  if (!orderId) return;
  const status = col.dataset.status as OrderStatus;
  void moveOrder(ctx, orderId, status);
}

async function moveOrder(
  ctx: AppContext,
  orderId: string,
  status: OrderStatus
): Promise<void> {
  const order = ctx.orders.getById(orderId);
  if (!order || order.status === status) return;
  await ctx.order.setStatus(orderId, status);
  showToast('Status atualizado');
}

async function togglePayment(ctx: AppContext, btn: HTMLElement): Promise<void> {
  const order = ctx.orders.getById(btn.dataset.togglePayment!);
  if (!order) return;
  const next: PaymentStatus =
    order.paymentStatus === 'pago' ? 'a_pagar' : 'pago';
  await ctx.order.setPaymentStatus(order.id, next);
}

async function handleDeduct(ctx: AppContext, orderId: string): Promise<void> {
  if (!confirm('Dar baixa no estoque com os ingredientes deste pedido?')) {
    return;
  }
  await ctx.order.deductStock(orderId);
  showToast('Estoque atualizado');
}

async function handleDelete(ctx: AppContext, id: string): Promise<void> {
  if (!confirm('Excluir este pedido?')) return;
  await ctx.orders.remove(id);
  showToast('Pedido excluído');
}

// --- New order form ---

function openForm(ctx: AppContext): void {
  if (!ctx.customers.getAll().length) {
    return showToast('Cadastre um cliente antes de criar um pedido');
  }
  if (!ctx.products.getAll().length) {
    return showToast('Cadastre um produto antes de criar um pedido');
  }
  const lines: OrderLine[] = [];
  const modal = openModal({ title: 'Novo pedido', bodyHtml: formShell(ctx) });
  redrawLines(modal, ctx, lines);
  wireFormEvents(modal, ctx, lines);
}

function formShell(ctx: AppContext): string {
  return `<form id="order-form">
    <div class="field-row" style="grid-template-columns:2fr 1fr;">
      ${customerSelect(ctx)}${dateField(todayISO())}</div>
    <label class="field-label">Itens do pedido</label>
    <div class="line-item-head"><span>Produto</span><span>Qtd.</span>` +
    `<span>Preço unit.</span><span></span></div>
    <div id="lines-container"></div>
    <button type="button" class="btn btn-sm" id="add-line">` +
    `+ Adicionar produto</button>
    <div class="field" style="margin-top:12px;"><label class="field-label">` +
    `Observações</label><textarea class="input" name="notes" rows="2">` +
    `</textarea></div>
    <div class="calc-box"><div class="calc-row total">` +
    `<span>Total do pedido</span><span id="order-total">R$ 0,00</span>` +
    `</div></div>
    <div class="modal-foot" style="padding:16px 0 0;border:none;">
      <button type="button" class="btn" data-close-modal>Cancelar</button>
      <button type="submit" class="btn btn-primary">Criar pedido</button>` +
    `</div></form>`;
}

function dateField(value: string): string {
  return `<div class="field"><label class="field-label">Entrega</label>` +
    `<input class="input" type="date" name="deliveryDate" value="` +
    `${value}" required></div>`;
}

function customerSelect(ctx: AppContext): string {
  const options = ctx.customers
    .getAll()
    .map(
      (c) =>
        `<option value="${c.id}">` +
        `${escapeHtml(c.name)}</option>`
    )
    .join('');
  return `<div class="field"><label class="field-label">Cliente</label>` +
    `<select class="input" name="customerId" required>${options}` +
    `</select></div>`;
}

function redrawLines(
  modal: HTMLElement,
  ctx: AppContext,
  lines: OrderLine[]
): void {
  const container = qs('#lines-container', modal);
  container.innerHTML = lines
    .map((line, index) => lineHtml(line, index, ctx))
    .join('');
  updateOrderTotal(modal, lines);
  wireLineEvents(modal, ctx, lines);
}

function lineHtml(line: OrderLine, index: number, ctx: AppContext): string {
  return `<div class="line-item" data-line="${index}">
    ${productSelect(line.productId, ctx)}
    <input class="input" type="number" min="1" step="1" data-qty value="${
      line.qty
    }">
    <input class="input" type="number" min="0" step="0.01" data-price value="${
      line.unitPrice.toFixed(2)
    }">
    <button type="button" class="remove-row" data-remove-line aria-label=` +
    `"Remover">✕</button></div>`;
}

function productSelect(selectedId: string, ctx: AppContext): string {
  const opts = ctx.products
    .getAll()
    .map(
      (p) =>
        `<option value="${p.id}" ` +
        `${p.id === selectedId ? 'selected' : ''}>` +
        `${escapeHtml(p.name)}</option>`
    )
    .join('');
  return `<select class="input" data-product>${opts}</select>`;
}

function wireLineEvents(
  modal: HTMLElement,
  ctx: AppContext,
  lines: OrderLine[]
): void {
  modal.querySelectorAll<HTMLElement>('[data-line]').forEach((lineEl) =>
    wireLine(modal, ctx, lines, lineEl)
  );
}

function wireLine(
  modal: HTMLElement,
  ctx: AppContext,
  lines: OrderLine[],
  lineEl: HTMLElement
): void {
  const index = Number(lineEl.dataset.line);
  wireProductSelect(modal, ctx, lines, index, lineEl);
  wireQtyInput(modal, lines, index, lineEl);
  wirePriceInput(modal, lines, index, lineEl);
  wireRemoveLine(modal, ctx, lines, index, lineEl);
}

function wireProductSelect(
  modal: HTMLElement,
  ctx: AppContext,
  lines: OrderLine[],
  index: number,
  lineEl: HTMLElement
): void {
  const selectEl = qs<HTMLSelectElement>('[data-product]', lineEl);
  selectEl.addEventListener('change', (e) =>
    changeLineProduct(
      modal,
      ctx,
      lines,
      index,
      (e.target as HTMLSelectElement).value
    )
  );
}

function wireQtyInput(
  modal: HTMLElement,
  lines: OrderLine[],
  index: number,
  lineEl: HTMLElement
): void {
  const qtyEl = qs<HTMLInputElement>('[data-qty]', lineEl);
  qtyEl.addEventListener('input', (e) => {
    lines[index].qty = Number((e.target as HTMLInputElement).value);
    updateOrderTotal(modal, lines);
  });
}

function wirePriceInput(
  modal: HTMLElement,
  lines: OrderLine[],
  index: number,
  lineEl: HTMLElement
): void {
  const priceEl = qs<HTMLInputElement>('[data-price]', lineEl);
  priceEl.addEventListener('input', (e) => {
    lines[index].unitPrice = Number((e.target as HTMLInputElement).value);
    updateOrderTotal(modal, lines);
  });
}

function wireRemoveLine(
  modal: HTMLElement,
  ctx: AppContext,
  lines: OrderLine[],
  index: number,
  lineEl: HTMLElement
): void {
  qs('[data-remove-line]', lineEl).addEventListener('click', () => {
    lines.splice(index, 1);
    redrawLines(modal, ctx, lines);
  });
}

function changeLineProduct(
  modal: HTMLElement,
  ctx: AppContext,
  lines: OrderLine[],
  index: number,
  productId: string
): void {
  const product = ctx.products.getById(productId);
  if (!product) return;
  const pricing = ctx.pricing.productPricing(product);
  lines[index] = {
    ...lines[index],
    productId,
    productName: product.name,
    unitPrice: pricing.suggestedPrice
  };
  redrawLines(modal, ctx, lines);
}

function updateOrderTotal(modal: HTMLElement, lines: OrderLine[]): void {
  const total = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  qs('#order-total', modal).textContent = formatBRL(total);
}

function wireFormEvents(
  modal: HTMLElement,
  ctx: AppContext,
  lines: OrderLine[]
): void {
  qs('#add-line', modal).addEventListener('click', () =>
    addLine(modal, ctx, lines)
  );
  qs('#order-form', modal).addEventListener('submit', (event) =>
    handleSubmit(event, ctx, lines)
  );
}

function addLine(
  modal: HTMLElement,
  ctx: AppContext,
  lines: OrderLine[]
): void {
  const product = ctx.products.getAll()[0];
  if (!product) return;
  const pricing = ctx.pricing.productPricing(product);
  lines.push({
    productId: product.id,
    productName: product.name,
    qty: 1,
    unitPrice: pricing.suggestedPrice
  });
  redrawLines(modal, ctx, lines);
}

async function handleSubmit(
  event: Event,
  ctx: AppContext,
  lines: OrderLine[]
): Promise<void> {
  event.preventDefault();
  if (!lines.length) return showToast('Adicione ao menos um produto');
  const values = formValues(event.target as HTMLFormElement);
  const customer = ctx.customers.getById(values.customerId);
  if (!customer) return;
  await ctx.order.create({
    customerId: customer.id,
    customerName: customer.name,
    lines,
    deliveryDate: values.deliveryDate,
    notes: values.notes
  });
  closeModal();
  showToast('Pedido criado');
}