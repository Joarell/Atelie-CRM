import { describe, it, expect } from 'vitest';
import type { Ingredient, StockMovement } from '../../src/domain/types';
import {
	monthKey,
	monthStart,
	nextMonthStart,
	stockAt,
	stockValueAt,
	purchasesTotal,
	cmvOfPeriod,
	cpvOfPeriod
} from '../../src/domain/cmv';

const flour: Ingredient = {
	id: 'flour', name: 'Farinha', unit: 'g', packageSize: 1000, packagePrice: 10, stock: 1000, minStock: 200
};
const sugar: Ingredient = {
	id: 'sugar', name: 'Açúcar', unit: 'g', packageSize: 1000, packagePrice: 8, stock: 500, minStock: 100
};

const movements: StockMovement[] = [
	{ id: 'm1', ingredientId: 'flour', ingredientName: 'Farinha', type: 'saida', qty: 300, note: 'Pedido', date: '2026-03-15T10:00:00.000Z' },
	{ id: 'm2', ingredientId: 'sugar', ingredientName: 'Açúcar', type: 'entrada', qty: 200, note: 'Compra', date: '2026-03-20T10:00:00.000Z' },
	{ id: 'm3', ingredientId: 'flour', ingredientName: 'Farinha', type: 'saida', qty: 100, note: 'Pedido', date: '2026-04-05T10:00:00.000Z' }
];

const unitCost = (ing: Ingredient) => ing.packagePrice / ing.packageSize;

describe('monthKey / monthStart / nextMonthStart', () => {
	it('extracts YYYY-MM from ISO date', () => {
		expect(monthKey('2026-03-15')).toBe('2026-03');
		expect(monthKey('2026-03-15T10:00:00.000Z')).toBe('2026-03');
	});

	it('monthStart returns first instant of month', () => {
		expect(monthStart('2026-03')).toBe('2026-03-01T00:00:00.000Z');
	});

	it('nextMonthStart returns first instant of following month', () => {
		expect(nextMonthStart('2026-03')).toBe('2026-04-01T00:00:00.000Z');
		expect(nextMonthStart('2026-12')).toBe('2027-01-01T00:00:00.000Z');
	});
});

describe('stockAt', () => {
	it('reconstructs stock at month start by undoing ALL movements on/after that instant', () => {
		// flour current stock 1000, had 300g saida on 2026-03-15 and 100g saida on 2026-04-05
		// at 2026-03-01T00:00:00.000Z, BOTH saidas haven't happened yet
		const s = stockAt(flour, movements, '2026-03-01T00:00:00.000Z');
		expect(s).toBe(1400); // 1000 + 300 + 100 (undo both saidas)
	});

	it('reconstructs stock at next month start', () => {
		// at 2026-04-01, March saidas are BEFORE the instant (not undone), April saida is after (undone)
		const s = stockAt(flour, movements, '2026-04-01T00:00:00.000Z');
		expect(s).toBe(1100); // 1000 + 100 (only undo April saida)
	});

	it('ignores movements of other ingredients', () => {
		// sugar current 500, had 200g entrada on 2026-03-20
		// at 2026-03-01, that entrada hasn't happened yet → undo it
		const s = stockAt(sugar, movements, '2026-03-01T00:00:00.000Z');
		expect(s).toBe(300); // 500 - 200 (undo the entrada)
	});
});

describe('stockValueAt', () => {
	it('sums stockAt * unitCost for all ingredients', () => {
		const val = stockValueAt([flour, sugar], movements, '2026-03-01T00:00:00.000Z', unitCost);
		// flour: 1400g * 0.01 = 14.00 (both March and April saidas undone)
		// sugar: 300g * 0.008 = 2.40 (March entrada undone)
		expect(val).toBeCloseTo(16.40);
	});
});

const testPurchases = [
	{
		date: '2026-03-10',
		items: [
			{ ingredientId: 'flour', qty: 500, packageSize: 1000, packagePrice: 10 }
		]
	},
	{
		date: '2026-04-05',
		items: [
			{ ingredientId: 'sugar', qty: 1000, packageSize: 1000, packagePrice: 8 }
		]
	}
];

describe('purchasesTotal', () => {
	it('sums only purchases inside the month', () => {
		expect(purchasesTotal(testPurchases, '2026-03')).toBeCloseTo(5.00); // 500/1000 * 10
		expect(purchasesTotal(testPurchases, '2026-04')).toBeCloseTo(8.00); // 1000/1000 * 8
		expect(purchasesTotal(testPurchases, '2026-02')).toBe(0);
	});
});

describe('cmvOfPeriod', () => {
	it('@spec:AC-416 — CMV = EI + C - EF', () => {
		expect(cmvOfPeriod(300, 500, 200)).toBe(600);
	});

	it('@spec:AC-417 — initial stock counts quantity before mid-month movement', () => {
		// At month start, ALL movements on/after that instant are undone.
		// The 300g saida on 15th AND the 100g saida on April 5th are both undone.
		const ei = stockValueAt([flour], movements, '2026-03-01T00:00:00.000Z', unitCost);
		expect(ei).toBeCloseTo(14.00); // 1400g * 0.01
	});

	it('@spec:AC-418 — purchases from other months are excluded', () => {
		expect(purchasesTotal(testPurchases, '2026-03')).toBeCloseTo(5.00);
		expect(purchasesTotal(testPurchases, '2026-04')).toBeCloseTo(8.00);
	});
});

describe('cpvOfPeriod', () => {
	it('CPV = CMV + laborCost', () => {
		expect(cpvOfPeriod(600, 150)).toBe(750);
	});
});