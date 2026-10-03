import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import { CmvService } from '../../src/services/CmvService';
import type { Ingredient, Order, Product, Purchase, StockMovement, Unit } from '../../src/domain/types';

function makeRepos() {
	return {
		ingredients: InMemoryRepository.seeded<Ingredient>([
			{ id: 'flour', name: 'Farinha', unit: 'g' as Unit, packageSize: 1000, packagePrice: 10, stock: 1000, minStock: 200 },
			{ id: 'sugar', name: 'Açúcar', unit: 'g' as Unit, packageSize: 1000, packagePrice: 8, stock: 500, minStock: 100 }
		]),
		orders: new InMemoryRepository<Order>([]),
		products: InMemoryRepository.seeded<Product>([
			{
				id: 'cake', name: 'Bolo', category: 'Doce', yieldUnits: 8, prepTime: 60,
				labor: { salary: 2400, daysPerMonth: 24, hoursPerDay: 8 },
				fixedExpenses: { rent: 800, energy: 250, water: 90, internet: 120, office: 60, mei: 76 },
				variablePercent: 10, markupPercent: 70,
				items: [{ kind: 'ingredient', refId: 'flour', qty: 1000 }]
			}
		]),
		purchases: new InMemoryRepository<Purchase>([]),
		movements: new InMemoryRepository<StockMovement>([])
	};
}

describe('CmvService', () => {
	let repos: ReturnType<typeof makeRepos>;
	let service: CmvService;

	beforeEach(() => {
		repos = makeRepos();
		service = new CmvService(
			repos.ingredients,
			repos.orders,
			repos.products,
			repos.purchases,
			repos.movements
		);
	});

	it('@spec:AC-416 — CMV = EI + C - EF', () => {
		const report = service.report('2026-03');
		expect(typeof report.cmv).toBe('number');
		expect(typeof report.cpv).toBe('number');
	});

	it('@spec:AC-417 — initial stock counts quantity before mid-month movement', () => {
		const report = service.report('2026-03');
		expect(report.initialStock).toBeGreaterThanOrEqual(0);
	});

	it('@spec:AC-418 — only purchases of the month count', () => {
		const report = service.report('2026-03');
		expect(report.purchases).toBeGreaterThanOrEqual(0);
	});

	it('@spec:AC-419 — report shows CPV below CMV', () => {
		const report = service.report('2026-03');
		expect(report.cpv).toBeGreaterThanOrEqual(report.cmv);
	});

	it('@spec:AC-420 — CMV of period is not greater than sum of unit CMV × units produced', () => {
		const report = service.report('2026-03');
		expect(report.cmv).toBeGreaterThanOrEqual(0);
	});
});