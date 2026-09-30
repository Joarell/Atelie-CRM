// Binds the per-menu "last update" stamp to the topbar.
//
// The data side is deliberately dumb: ApiRepository.notify() is the single
// funnel every mutation passes through, so main.ts subscribes every
// repository to `markDataChanged` and this module works out which menu is on
// screen. That keeps the feature out of the ~20 view files.

import {
	FreshnessLog,
	freshnessLabel
} from '../domain/dataFreshness';

const log = new FreshnessLog();

let stampEl: HTMLElement | null = null;
let currentMenu = '';

/** Exposed for tests and for the main.ts shell. */
export function freshnessLog(): FreshnessLog {
	return log;
}

/**
 * Normalises a router path into the menu key the stamp is stored under.
 * "" and "/" are both the dashboard.
 */
export function menuKeyFor(path: string): string {
	const trimmed = path.replace(/^#/, '').trim();
	return trimmed === '' ? '/' : trimmed;
}

/**
 * Points the stamp at `menu` and paints whatever that menu last recorded.
 * Called on every navigation so each menu shows ITS own last update.
 *
 * A menu seen for the first time this session is stamped with "now": arriving
 * on a menu loads its data, which is exactly the event the stamp reports. Any
 * later repository change overwrites it with the real mutation time.
 */
export function setActiveMenu(menu: string): void {
	currentMenu = menu;
	if (menu !== '' && !log.has(menu)) log.touch(menu);
	renderFreshness();
}

/** Records a data change for the menu currently on screen. */
export function markDataChanged(at?: number): void {
	if (currentMenu === '') return;
	log.touch(currentMenu, at);
	renderFreshness();
}

/**
 * Paints the stamp. Assigns only when the text actually changes: a single
 * action can notify several repositories at once, and re-writing identical
 * textContent would dirty the DOM for nothing.
 */
export function renderFreshness(): void {
	if (!stampEl || currentMenu === '') return;
	const label = freshnessLabel(log, currentMenu);
	const next = label === '' ? '' : `Atualizado às ${label}`;
	if (stampEl.textContent !== next) stampEl.textContent = next;
	stampEl.dataset.menu = currentMenu;
	stampEl.dataset.updatedAt = label === '' ? '' : String(log.read(currentMenu));
	stampEl.classList.toggle('is-empty', next === '');
}

/** Installs the stamp element once, when the shell is first built. */
export function mountFreshness(host: HTMLElement): void {
	stampEl = host;
	renderFreshness();
}

/** Test seam: drops the element and every recorded stamp. */
export function resetFreshness(): void {
	stampEl = null;
	currentMenu = '';
	log.clear();
}
