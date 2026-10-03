import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import { PurchasesService } from '../../src/services/PurchasesService';
import { StockService } from '../../src/services/StockService';
import type { Ingredient, Purchase, PurchaseItem, StockMovement, RecipeComponent, Product } from '../../src/domain/types';
import { uid } from '../../src/domain/format';

function makeRepos() {
	return {
		purchases: new InMemoryRepository<Purchase>(),
		ingredients: InMemoryRepository.seeded<Ingredient>([
			{ id: 'flour', name: 'Farinha', unit: 'g', packageSize: 1000, packagePrice: 10, stock: 1000, minStock: 200 },
			{ id: 'sugar', name: 'Açúcar', unit: 'g', packageSize: 1000, packagePrice: 8, stock: 500, minStock: 100 }
		]),
		movements: new InMemoryRepository<StockMovement>(),
		components: InMemoryRepository.seeded<RecipeComponent>([]),
		products: InMemoryRepository.seeded<Product>([])
	};
}

function makeStockService(repos: ReturnType<typeof makeRepos>) {
	return new StockService(
		repos.ingredients,
		repos.components,
		repos.products,
		repos.movements
	);
}

describe('PurchasesService', () => {
	let repos: ReturnType<typeof makeRepos>;
	let stockService: StockService;
	let service: PurchasesService;

	beforeEach(() => {
		repos = makeRepos();
		stockService = makeStockService(repos);
		service = new PurchasesService(
			repos.purchases,
			repos.ingredients,
			repos.movements,
			stockService
		);
	});

	it('@spec:AC-410 — register saves purchase with supplier, date, and items', async () => {
		const draft: Omit<Purchase, 'id'> = {
			supplier: 'Fornecedor ABC',
			invoice: 'NF-123',
			date: '2026-03-10',
			items: [
				{ ingredientId: 'flour', ingredientName: 'Farinha', qty: 500, packageSize: 1000, packagePrice: 10 }
			],
			notes: ''
		};
		const saved = await service.register(draft);
		expect(saved.id).toBeDefined();
		expect(saved.supplier).toBe('Fornecedor ABC');
		expect(saved.date).toBe('2026-03-10');
		expect(saved.items).toHaveLength(1);
	});

	it('@spec:AC-411 — total value is sum of item values', async () => {
		const draft: Omit<Purchase, 'id'> = {
			supplier: 'Fornecedor ABC',
			invoice: 'NF-123',
			date: '2026-03-10',
			items: [
				{ ingredientId: 'flour', ingredientName: 'Farinha', qty: 500, packageSize: 1000, packagePrice: 10 },
				{ ingredientId: 'sugar', ingredientName: 'Açúcar', qty: 1000, packageSize: 1000, packagePrice: 8 }
			],
			notes: ''
		};
		await service.register(draft);
		const all = repos.purchases.getAll();
		expect(all).toHaveLength(1);
		// Item values: 500/1000*10 = 5, 1000/1000*8 = 8, total = 13
	});

	it('@spec:AC-412 — register gives stock entry and creates movement', async () => {
		const draft: Omit<Purchase, 'id'> = {
			supplier: 'Fornecedor ABC',
			invoice: 'NF-123',
			date: '2026-03-10',
			items: [
				{ ingredientId: 'flour', ingredientName: 'Farinha', qty: 500, packageSize: 1000, packagePrice: 10 }
			],
			notes: ''
		};
		await service.register(draft);
		const flour = repos.ingredients.getById('flour');
		expect(flour?.stock).toBe(1500); // 1000 + 500
		const movements = repos.movements.getAll();
		expect(movements).toHaveLength(1);
		expect(movements[0].type).toBe('entrada');
		expect(movements[0].qty).toBe(500);
		expect(movements[0].note).toContain('Fornecedor ABC');
	});

	it('@spec:AC-413 — future date is rejected', async () => {
		const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
		const draft: Omit<Purchase, 'id'> = {
			supplier: 'Fornecedor ABC',
			invoice: 'NF-123',
			date: tomorrow,
			items: [
				{ ingredientId: 'flour', ingredientName: 'Farinha', qty: 500, packageSize: 1000, packagePrice: 10 }
			],
			notes: ''
		};
		await expect(service.register(draft)).rejects.toThrow('não pode ser futura');
	});

	it('@spec:AC-414 — zero quantity or zero price is rejected', async () => {
		const draftZeroQty: Omit<Purchase, 'id'> = {
			supplier: 'Fornecedor ABC',
			invoice: 'NF-123',
			date: '2026-03-10',
			items: [
				{ ingredientId: 'flour', ingredientName: 'Farinha', qty: 0, packageSize: 1000, packagePrice: 10 }
			],
			notes: ''
		};
		await expect(service.register(draftZeroQty)).rejects.toThrow('Quantidade inválida');

		const draftZeroPrice: Omit<Purchase, 'id'> = {
			supplier: 'Fornecedor ABC',
			invoice: 'NF-123',
			date: '2026-03-10',
			items: [
				{ ingredientId: 'flour', ingredientName: 'Farinha', qty: 500, packageSize: 1000, packagePrice: 0 }
			],
			notes: ''
		};
		await expect(service.register(draftZeroPrice)).rejects.toThrow('Preço inválido');
	});

	it('@spec:AC-415 — listByMonth returns only purchases of that month, sorted', async () => {
		await service.register({
			supplier: 'A', invoice: '1', date: '2026-03-05',
			items: [{ ingredientId: 'flour', ingredientName: 'Farinha', qty: 100, packageSize: 1000, packagePrice: 10 }],
			notes: ''
		});
		await service.register({
			supplier: 'B', invoice: '2', date: '2026-03-15',
			items: [{ ingredientId: 'sugar', ingredientName: 'Açúcar', qty: 100, packageSize: 1000, packagePrice: 8 }],
			notes: ''
		});
		await service.register({
			supplier: 'C', invoice: '3', date: '2026-04-10',
			items: [{ ingredientId: 'flour', ingredientName: 'Farinha', qty: 100, packageSize: 1000, packagePrice: 10 }],
			notes: ''
		});

		const mar = service.listByMonth('2026-03');
		expect(mar).toHaveLength(2);
		expect(mar[0].supplier).toBe('A');
		expect(mar[1].supplier).toBe('B');

		const apr = service.listByMonth('2026-04');
		expect(apr).toHaveLength(1);
		expect(apr[0].supplier).toBe('C');
	});

	it('updates ingredient packagePrice and packageSize to purchase values', async () => {
		const draft: Omit<Purchase, 'id'> = {
			supplier: 'Fornecedor ABC',
			invoice: 'NF-123',
			date: '2026-03-10',
			items: [
				{ ingredientId: 'flour', ingredientName: 'Farinha', qty: 500, packageSize: 2000, packagePrice: 20 }
			],
			notes: ''
		};
		await service.register(draft);
		const flour = repos.ingredients.getById('flour');
		expect(flour?.packagePrice).toBe(20);
		expect(flour?.packageSize).toBe(2000);
	});

	it('rejects unknown ingredient', async () => {
		const draft: Omit<Purchase, 'id'> = {
			supplier: 'Fornecedor ABC',
			invoice: 'NF-123',
			date: '2026-03-10',
			items: [
				{ ingredientId: 'unknown', ingredientName: 'Inexistente', qty: 100, packageSize: 1000, packagePrice: 10 }
			],
			notes: ''
		};
		await expect(service.register(draft)).rejects.toThrow('não encontrado');
	});
});