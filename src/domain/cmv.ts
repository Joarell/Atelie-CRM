import type { Ingredient, StockMovement, StockMovementType } from './types';

// Minimal purchase shape used by this module — the real Purchase type
// lives in src/domain/types.ts and will be aligned later.
export interface Purchasable {
	date: string; // ISO date (YYYY-MM-DD)
	items: Array<{
		ingredientId: string;
		qty: number;
		packageSize: number;
		packagePrice: number;
	}>;
}

// Returns 'YYYY-MM' from an ISO date or datetime string.
export function monthKey(dateISO: string): string {
	return dateISO.slice(0, 7);
}

// Returns the ISO datetime of the FIRST instant of the given month (YYYY-MM).
export function monthStart(monthKey: string): string {
	return `${monthKey}-01T00:00:00.000Z`;
}

// Returns the ISO datetime of the FIRST instant of the FOLLOWING month.
// Using an exclusive end avoids 23:59:59.999 boundary bugs.
export function nextMonthStart(monthKey: string): string {
	const [yearStr, monthStr] = monthKey.split('-');
	const year = Number(yearStr);
	const month = Number(monthStr);
	const nextMonth = month === 12 ? 1 : month + 1;
	const nextYear = month === 12 ? year + 1 : year;
	return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00.000Z`;
}

// Reconstructs the stock level of an ingredient at a given instant.
// The current stock is ingredient.stock. Every movement with date >= instant
// is "undone": entradas are subtracted, saidas are added back.
export function stockAt(
	ingredient: Ingredient,
	movements: StockMovement[],
	instantISO: string
): number {
	let stock = ingredient.stock;
	for (const m of movements) {
		if (m.ingredientId !== ingredient.id) continue;
		if (m.date < instantISO) continue;
		if (m.type === 'entrada') {
			stock -= m.qty;
		} else {
			stock += m.qty;
		}
	}
	return stock;
}

// Computes the monetary value of stock at a given instant.
// unitCost is a function that returns the per-unit cost for an ingredient.
export function stockValueAt(
	ingredients: Ingredient[],
	movements: StockMovement[],
	instantISO: string,
	unitCost: (ing: Ingredient) => number
): number {
	let total = 0;
	for (const ing of ingredients) {
		const qty = stockAt(ing, movements, instantISO);
		if (qty > 0) {
			total += qty * unitCost(ing);
		}
	}
	return total;
}

// Sums the monetary value of purchases whose date falls inside the given month.
// Purchase dates are plain YYYY-MM-DD; monthKey is YYYY-MM.
export function purchasesTotal(
	purchases: Purchasable[],
	monthKey: string
): number {
	let total = 0;
	for (const p of purchases) {
		if (p.date.slice(0, 7) !== monthKey) continue;
		for (const item of p.items) {
			const unitCost = item.packagePrice / item.packageSize;
			total += (item.qty / item.packageSize) * item.packagePrice;
		}
	}
	return total;
}

// CMV = EI + C - EF (Estoque Inicial + Compras - Estoque Final)
export function cmvOfPeriod(
	initialValue: number,
	purchasesValue: number,
	finalValue: number
): number {
	return initialValue + purchasesValue - finalValue;
}

// CPV do período = CMV + mão de obra do período
export function cpvOfPeriod(cmv: number, laborCost: number): number {
	return cmv + laborCost;
}