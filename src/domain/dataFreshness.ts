// "Last update" bookkeeping for every menu.
//
// The app has no single place that knows "the user just changed data",
// because views talk to repositories and repositories notify subscribers.
// This module is the pure half: a per-menu log of when data last changed,
// plus the clock format the topbar renders. Kept free of DOM/storage so it
// can be unit tested on its own (see tests/domain/dataFreshness.test.ts).

/** Sentinel for "this menu has never been updated in this session". */
export const NO_FRESHNESS = 0;

export class FreshnessLog {
	private readonly byMenu = new Map<string, number>();

	/** Records that `menu` data changed at `at` (defaults to now). */
	touch(menu: string, at: number = Date.now()): void {
		this.byMenu.set(menu, at);
	}

	/** Epoch millis of the last change for `menu`, or NO_FRESHNESS. */
	read(menu: string): number {
		return this.byMenu.get(menu) ?? NO_FRESHNESS;
	}

	/** True once `menu` has recorded at least one change. */
	has(menu: string): boolean {
		return this.read(menu) !== NO_FRESHNESS;
	}

	/** Menus carrying a stamp, in insertion order. */
	menus(): string[] {
		return [...this.byMenu.keys()];
	}

	/** Drops every stamp — used when the session data is replaced. */
	clear(): void {
		this.byMenu.clear();
	}
}

/**
 * HH:MM:SS in the viewer's local time. Second precision on purpose: a menu
 * can be updated several times in a row within one minute, and a coarser
 * format would hide that.
 */
export function formatFreshness(at: number): string {
	const date = new Date(at);
	return [date.getHours(), date.getMinutes(), date.getSeconds()]
		.map((part) => String(part).padStart(2, '0'))
		.join(':');
}

/**
 * The topbar label for a menu, or an empty string when the menu has never
 * been updated. An empty string (rather than a dash or "—") lets the caller
 * simply write it into the element and let CSS hide the empty state.
 */
export function freshnessLabel(log: FreshnessLog, menu: string): string {
	return log.has(menu) ? formatFreshness(log.read(menu)) : '';
}
