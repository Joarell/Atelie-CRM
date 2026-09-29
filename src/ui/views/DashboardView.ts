import type { AppContext } from '../../state/AppContext';
import { formatBRL, formatDate } from '../../domain/format';
import { renderEmptyState } from '../CrudTable';
import { autoRerender } from '../reactive';
import type { Ingredient, Order } from '../../domain/types';

export function renderDashboardView(
  root: HTMLElement,
  ctx: AppContext
): () => void {
  return autoRerender(() => draw(root, ctx), [
    ctx.orders.subscribe.bind(ctx.orders),
    ctx.products.subscribe.bind(ctx.products),
    ctx.ingredients.subscribe.bind(ctx.ingredients)
  ]);
}

function draw(root: HTMLElement, ctx: AppContext): void {
  root.innerHTML = `
    <div class="section-head"><div><h2>Painel</h2><p>` +
    `Visão geral do ateliê hoje</p></div></div>
    <div class="grid-cards" style="margin-bottom:22px;">${renderKpis(ctx)}</div>
    <div class="grid-cards" style="grid-template-columns:1.3fr 1fr;">
      <div class="card" style="padding:16px 18px;">${
        renderUpcomingOrders(ctx)
      }</div>
      <div class="card" style="padding:16px 18px;">${renderLowStock(ctx)}</div>
    </div>`;
}

function renderKpis(ctx: AppContext): string {
  const pending = ctx.orders
    .getAll()
    .filter((o) => o.status === 'pendente' || o.status === 'producao');
  const revenue = ctx.order.monthRevenue();
  const lowStock = ctx.stock.lowStock();
  return [
    kpiCard('Produtos cadastrados', String(ctx.products.getAll().length), ''),
    kpiCard('Pedidos em aberto', String(pending.length), ''),
    kpiCard('Receita do mês', formatBRL(revenue), 'pedidos entregues e pagos'),
    kpiCard('Estoque baixo', String(lowStock.length), 'ingredientes')
  ].join('');
}

function kpiCard(label: string, value: string, delta: string): string {
  return `<div class="card kpi"><div class="label">${label}</div>
    <div class="value">${value}</div>${
      delta ? `<div class="delta">${delta}</div>` : ''
    }</div>`;
}

function renderUpcomingOrders(ctx: AppContext): string {
  const upcoming = ctx.orders
    .getAll()
    .filter((o) => o.status !== 'entregue' && o.status !== 'cancelado')
    .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))
    .slice(0, 6);
  const rows = upcoming.map(renderOrderRow).join('');
  const list = upcoming.length
    ? `<div>${rows}</div>`
    : renderEmptyState(
        'Nenhum pedido em aberto',
        'Crie um pedido na aba Pedidos.'
      );
  return `<h3 style="margin-top:0;">Próximas entregas</h3>${list}`;
}

function renderOrderRow(order: Order): string {
  const delivery = formatDate(order.deliveryDate);
  return `<div class="calc-row"><span>${order.customerName} · ${delivery}</span>
    <span class="badge badge-caramel">${order.status}</span></div>`;
}

function renderLowStock(ctx: AppContext): string {
  const items = ctx.stock.lowStock();
  const rows = items.map(lowStockRow).join('');
  const body = items.length
    ? rows
    : renderEmptyState(
        'Tudo certo',
        'Nenhum ingrediente abaixo do mínimo.'
      );
  return `<h3 style="margin-top:0;">Estoque baixo</h3>${body}`;
}

function lowStockRow(i: Ingredient): string {
  return `<div class="calc-row"><span>${i.name}</span>
    <span class="num soft">${i.stock} / ${i.minStock} ${i.unit}</span></div>`;
}