import type { AppContext } from '../../../state/AppContext';
import type { Deal, Pipeline, Stage, Contact } from '../../../domain/crm';
import { escapeHtml } from '../../../domain/format';
import { formatPriceCents } from '../../../domain/crmMath';
import { openModal, closeModal } from '../../Modal';
import { showToast } from '../../Toast';
import { autoRerender } from '../../reactive';
import { qs, qsa, formValues } from '../../dom';
import {
  section,
  textField,
  numberField,
  selectField,
  modalFoot,
  rowButton
} from './crmUi';

let showRisk = false;

type RiskDeal = ReturnType<AppContext['crm']['riskDeals']>[number];

interface SelectOption {
  value: string;
  label: string;
}

export function renderCrmFunilView(
  root: HTMLElement,
  ctx: AppContext
): () => void {
  return autoRerender(() => draw(root, ctx), [
    ctx.pipelines.subscribe.bind(ctx.pipelines),
    ctx.stages.subscribe.bind(ctx.stages),
    ctx.deals.subscribe.bind(ctx.deals),
    ctx.contacts.subscribe.bind(ctx.contacts),
    ctx.activities.subscribe.bind(ctx.activities)
  ]);
}

function draw(root: HTMLElement, ctx: AppContext): void {
  const pipeline = ctx.crm.defaultPipeline();
  const stages = ctx.crm.pipelineStages(pipeline?.id ?? '');
  const total = pipeline ? ctx.crm.pipelineOpenTotal(pipeline.id) : 0;
  const risk = ctx.crm.riskDeals(3);
  const riskChip = riskChipBtn(risk.length);
  root.innerHTML = pageHtml(ctx, pipeline, stages, total, risk, riskChip);
  wireEvents(root, ctx, stages);
}

function pageHtml(
  ctx: AppContext,
  pipeline: ReturnType<AppContext['crm']['defaultPipeline']>,
  stages: Stage[],
  total: number,
  risk: RiskDeal[],
  riskChip: string
): string {
  const btn =
    `<button class="btn btn-primary" id="new-deal">+ Novo negócio</button> ` +
    riskChip;
  const head = section(
    'Funil de vendas',
    `${pipeline?.name ?? 'Sem funil'} · ${formatPriceCents(total)} em aberto`,
    btn
  );
  const kanban = stages.map((stage) => renderColumn(ctx, stage)).join('');
  return `
    ${head}
    ${showRisk ? riskSection(ctx, risk) : ''}
    <div class="kanban">${kanban}</div>`;
}

function riskChipBtn(count: number): string {
  if (count === 0) return '';
  const active = showRisk ? ' active' : '';
  return (
    `<button class="btn btn-ghost btn-sm${active}" id="toggle-risk"` +
    ` title="Negócios sem ação recente">Em risco (${count})</button>`
  );
}

function riskSection(ctx: AppContext, risk: RiskDeal[]): string {
  if (risk.length === 0) return noRiskBlock();
  const items = risk.map((item) => riskItem(ctx, item)).join('');
  return (
    `<div class="risk-box">` +
    `<strong>Negócios em aberto precisando de ação</strong>` +
    `\n    <div class="risk-list">${items}</div></div>`
  );
}

function noRiskBlock(): string {
  return (
    '<div class="risk-box"><strong>Nenhum negócio em risco.</strong>' +
    '<span>Negócios em aberto sem ação nos últimos dias ' +
    'aparecem aqui.</span></div>'
  );
}

function riskItem(ctx: AppContext, item: RiskDeal): string {
  const subName = item.contact ? escapeHtml(item.contact.name) : '—';
  const sub = `${subName} · ${formatPriceCents(item.deal.valueCents)}`;
  return `
      <div class="risk-item" data-deal-id="${item.deal.id}">
        <div class="risk-title">${escapeHtml(item.deal.title)}</div>
        <div class="risk-sub">${sub}</div>
      </div>`;
}

function renderColumn(ctx: AppContext, stage: Stage): string {
  const deals = ctx.crm.dealsInStage(stage.id);
  const total = ctx.crm.stageTotal(stage.id);
  const name = escapeHtml(stage.name);
  const meta = `${deals.length} · ${formatPriceCents(total)}`;
  const cards = deals
    .map((deal) => renderCard(ctx, deal, stage))
    .join('');
  const empty = '<div class="kanban-empty">Sem negócios</div>';
  return `<div class="kanban-col">
    <div class="kanban-head"><span class="kanban-title">${name}</span>
      <span class="kanban-meta">${meta}</span></div>
    <div class="kanban-cards">${cards || empty}</div>
  </div>`;
}

function renderCard(ctx: AppContext, deal: Deal, current: Stage): string {
  const contact = ctx.contacts.getById(deal.contactId);
  const contactName = contact ? escapeHtml(contact.name) : '—';
  return `<div class="deal-card" data-deal-id="${deal.id}">
    <div class="deal-title">${escapeHtml(deal.title)}</div>
    <div class="deal-sub">${contactName}</div>
    <div class="deal-value">${formatPriceCents(deal.valueCents)}</div>
    <div class="deal-actions">
      ${moveSelect(ctx, deal, current)}
      ${rowButton('Ganho', 'won', deal.id)}
      ${rowButton('Perdido', 'lost', deal.id)}
      ${actionButtons(deal)}
    </div>
  </div>`;
}

function actionButtons(deal: Deal): string {
  return (
    `${rowButton('Editar', 'edit-deal', deal.id)}` +
    rowButton('Duplicar', 'clone-deal', deal.id) +
    rowButton('Excluir', 'delete-deal', deal.id, true)
  );
}

function moveSelect(ctx: AppContext, deal: Deal, current: Stage): string {
  const stages = ctx.crm.pipelineStages(deal.pipelineId);
  const options = stages.map((s) => ({ value: s.id, label: s.name }));
  const optHtml = options.map((o) => optionTag(o, current.id)).join('');
  return (
    `<select class="input deal-move" data-deal="${deal.id}" ` +
    `title="Mover etapa">${optHtml}</select>`
  );
}

function optionTag(o: SelectOption, selected: string): string {
  const sel = o.value === selected ? ' selected' : '';
  return (
    `<option value="${escapeHtml(o.value)}"${sel}>` +
    `${escapeHtml(o.label)}</option>`
  );
}

function eachClick(
  root: HTMLElement,
  selector: string,
  onClick: (btn: HTMLElement) => void
): void {
  root
    .querySelectorAll<HTMLElement>(selector)
    .forEach((btn) => btn.addEventListener('click', () => onClick(btn)));
}

function wireEvents(root: HTMLElement, ctx: AppContext, stages: Stage[]): void {
  qs('#new-deal', root).addEventListener('click', () =>
    openDealForm(ctx, stages));
  qs('#toggle-risk', root)?.addEventListener('click', () => {
    showRisk = !showRisk;
    draw(root, ctx);
  });
  eachClick(root, '[data-won]', (b) => setWonLost(ctx, b.dataset.won!, 'won'));
  eachClick(root, '[data-lost]', (b) =>
    setWonLost(ctx, b.dataset.lost!, 'lost'));
  eachClick(root, '[data-edit-deal]', (b) => {
    openDealForm(ctx, stages, ctx.deals.getById(b.dataset.editDeal!));
  });
  eachClick(root, '[data-clone-deal]', (b) => {
    handleClone(ctx, b.dataset.cloneDeal!);
  });
  eachClick(root, '[data-delete-deal]', (b) => {
    handleDelete(ctx, b.dataset.deleteDeal!);
  });
  qsa<HTMLSelectElement>('.deal-move', root).forEach((select) =>
    select.addEventListener('change', () =>
      moveDeal(ctx, select.dataset.deal!, select.value)));
}

async function setWonLost(
  ctx: AppContext,
  dealId: string,
  status: Deal['status']
): Promise<void> {
  const lostReason = status === 'lost' ? prompt('Motivo da perda:') || '' : '';
  await ctx.crm.setDealStatus(dealId, status, lostReason);
  showToast(status === 'won' ? 'Negócio ganho' : 'Negócio perdido');
}

async function moveDeal(
  ctx: AppContext,
  dealId: string,
  stageId: string
): Promise<void> {
  await ctx.crm.moveDeal(dealId, stageId);
  showToast('Etapa atualizada');
}

async function handleClone(ctx: AppContext, id: string): Promise<void> {
  await ctx.crm.cloneDeal(id);
  showToast('Negócio duplicado');
}

async function handleDelete(ctx: AppContext, id: string): Promise<void> {
  if (!confirm('Excluir este negócio?')) return;
  await ctx.deals.remove(id);
  showToast('Negócio excluído');
}

function openDealForm(
  ctx: AppContext,
  stages: Stage[],
  existing?: Deal
): void {
  const modal = openModal({
    title: existing ? 'Editar negócio' : 'Novo negócio',
    bodyHtml: dealFormHtml(ctx, stages, existing)
  });
  qs('form', modal).addEventListener('submit', (event) =>
    handleSubmit(event, ctx, existing));
}

function dealFormHtml(
  ctx: AppContext,
  stages: Stage[],
  existing?: Deal
): string {
  const v = existing;
  return `<form>
    ${textField('title', 'Título', v?.title ?? '')}
    <div class="field-row">${rowFields(ctx, stages, v)}</div>
    <div class="field-row">${valueFields(v)}</div>
    ${modalFoot()}</form>`;
}

function rowFields(ctx: AppContext, stages: Stage[], v?: Deal): string {
  const contactOptions = ctx.contacts
    .getAll()
    .map((c) => ({ value: c.id, label: c.name }));
  const stageOptions = stages.map((s) => ({ value: s.id, label: s.name }));
  const contactSel = selectField(
    'contactId',
    'Contato',
    contactOptions,
    v?.contactId ?? ''
  );
  const stageSel = selectField(
    'stageId',
    'Etapa',
    stageOptions,
    v?.stageId ?? stages[0]?.id
  );
  return `${contactSel}${stageSel}`;
}

function valueFields(v?: Deal): string {
  const value = v ? (v.valueCents / 100).toFixed(2) : '';
  return (
    `${numberField('value', 'Valor (R$)', '0.01', value)}` +
    nextActionField(v)
  );
}

function nextActionField(v?: Deal): string {
  const value = v?.nextActionAt ? v.nextActionAt.slice(0, 10) : '';
  return (
    '<div class="field"><label class="field-label">' +
    'Próxima ação (data)</label>' +
    `<input class="input" type="date" name="nextActionAt" ` +
    `value="${escapeHtml(value)}"></div>`
  );
}

async function handleSubmit(
  event: Event,
  ctx: AppContext,
  existing?: Deal
): Promise<void> {
  event.preventDefault();
  const values = formValues(event.target as HTMLFormElement);
  const rawNext = values.nextActionAt;
  const nextActionAt = rawNext
    ? new Date(`${rawNext}T00:00:00`).toISOString()
    : '';
  const data = {
    pipelineId: existing?.pipelineId ?? ctx.crm.defaultPipeline()?.id ?? '',
    stageId: values.stageId,
    contactId: values.contactId,
    title: values.title,
    valueCents: Math.round(Number(values.value) * 100),
    status: existing?.status ?? 'open' as Deal['status'],
    lostReason: existing?.lostReason ?? '',
    nextActionAt,
    assignedUserId: existing?.assignedUserId ?? ''
  };
  if (existing) {
    await ctx.crm.updateDeal(existing.id, data);
  } else {
    await ctx.crm.addDeal(data);
  }
  closeModal();
  showToast('Negócio salvo');
}