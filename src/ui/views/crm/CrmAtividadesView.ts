import type { AppContext } from '../../../state/AppContext';
import type { CrmActivity } from '../../../domain/crm';
import { escapeHtml } from '../../../domain/format';
import { activityLabel } from '../../../domain/crmMath';
import { autoRerender } from '../../reactive';
import { qs } from '../../dom';
import { section, selectField } from './crmUi';

let actionFilter = '';
let contactFilter = '';

export function renderCrmAtividadesView(
  root: HTMLElement,
  ctx: AppContext
): () => void {
  return autoRerender(() => draw(root, ctx), [
    ctx.activities.subscribe.bind(ctx.activities),
    ctx.contacts.subscribe.bind(ctx.contacts)
  ]);
}

function draw(root: HTMLElement, ctx: AppContext): void {
  const all = ctx.crm.activities();
  const actions = [...new Set(all.map((a) => a.action))].sort();
  const filtered = all.filter((a) => matchesFilters(a));
  root.innerHTML = pageHtml(ctx, filtered, actions);
  wireEvents(root);
}

function pageHtml(
  ctx: AppContext,
  filtered: CrmActivity[],
  actions: string[]
): string {
  const contacts = ctx.contacts.getAll();
  const actionOpts = [
    { value: '', label: 'Todas' },
    ...actionOptionsOf(actions)
  ];
  const contactOpts = [
    { value: '', label: 'Todos' },
    ...contacts.map((c) => ({ value: c.id, label: c.name }))
  ];
  const sec = section(
    'Atividades',
    'Quem fez o quê, quando — o histórico do funil',
    ''
  );
  return `
    ${sec}
    <div class="filters">
      ${selectField('filter-action', 'Ação', actionOpts, actionFilter)}
      ${selectField('filter-contact', 'Contato', contactOpts, contactFilter)}
    </div>
    ${groupedHtml(ctx, filtered)}`;
}

function actionOptionsOf(
  actions: string[]
): Array<{ value: string; label: string }> {
  return actions.map((a) => ({ value: a, label: activityLabel(a) }));
}

function matchesFilters(activity: CrmActivity): boolean {
  return (
    (!actionFilter || activity.action === actionFilter) &&
    (!contactFilter || activity.contactId === contactFilter)
  );
}

function emptyList(): string {
  return (
    '<div class="empty-state"><div class="big">Sem atividades</div>' +
    '<p>As ações registradas pelo app aparecerão aqui.</p></div>'
  );
}

function groupedHtml(ctx: AppContext, activities: CrmActivity[]): string {
  if (activities.length === 0) return emptyList();
  const byDay = new Map<string, CrmActivity[]>();
  activities.forEach((activity) => {
    const day = activity.createdAt.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), activity]);
  });
  return [...byDay.entries()].map(([day, list]) => `
    <div class="agenda-day">
      <div class="agenda-day-label">${dayLabel(day)}</div>
      ${list.map((activity) => activityRow(ctx, activity)).join('')}
    </div>`).join('');
}

function activityRow(ctx: AppContext, activity: CrmActivity): string {
  const contact = ctx.contacts.getById(activity.contactId);
  const name = contact ? escapeHtml(contact.name) : '—';
  const evidence = activity.evidence
    ? ` · ${escapeHtml(activity.evidence)}`
    : '';
  const actionName = escapeHtml(activityLabel(activity.action));
  return `<div class="agenda-row">
    <div class="agenda-time">${timeOf(activity.createdAt)}</div>
    <div class="agenda-body">
      <div class="agenda-title">${actionName}</div>
      <div class="agenda-sub">${name}${evidence}</div>
    </div>
  </div>`;
}

function wireEvents(root: HTMLElement): void {
  qs('#filter-action', root)?.addEventListener('change', (event) => {
    actionFilter = (event.target as HTMLSelectElement).value;
  });
  qs('#filter-contact', root)?.addEventListener('change', (event) => {
    contactFilter = (event.target as HTMLSelectElement).value;
  });
}

function timeOf(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function dayLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}