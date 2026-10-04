// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderPurchasesView } from '../../src/ui/views/PurchasesView';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import { PurchasesService } from '../../src/services/PurchasesService';
import { StockService } from '../../src/services/StockService';
import type { Ingredient, Purchase, PurchaseItem, StockMovement, RecipeComponent, Product } from '../../src/domain/types';

function makeCtx() {
	const ingredients = InMemoryRepository.seeded<Ingredient>([
		{ id: 'flour', name: 'Farinha', unit: 'g', packageSize: 1000, packagePrice: 10, stock: 1000, minStock: 200 },
		{ id: 'sugar', name: 'Açúcar', unit: 'g', packageSize: 1000, packagePrice: 8, stock: 500, minStock: 100 }
	]);
	const components = InMemoryRepository.seeded<RecipeComponent>([]);
	const products = InMemoryRepository.seeded<Product>([]);
	const movements = InMemoryRepository.seeded<StockMovement>([]);
	const purchases = InMemoryRepository.seeded<Purchase>([]);

	const stockService = new StockService(ingredients, components, products, movements);
	const purchasesService = new PurchasesService(purchases, ingredients, movements, stockService);

	const root = document.createElement('div');
	document.body.appendChild(root);

	return {
		root,
		ctx: {
			ingredients: { getAll: () => ingredients.getAll(), getById: (id: string) => ingredients.getById(id), subscribe: (cb: () => void) => { cb(); return () => {}; } },
			purchases: { getAll: () => purchases.getAll(), getById: (id: string) => purchases.getById(id), subscribe: (cb: () => void) => { cb(); return () => {}; } },
			purchasesService,
			subscribe: (cb: () => void) => { cb(); return () => {}; }
		},
		cleanup: () => { root.remove(); }
	};
}

describe('PurchasesView — registro e listagem de compras', () => {
	let ctx: any;
	let cleanup: () => void;

	beforeEach(() => {
		const setup = makeCtx();
		ctx = setup.ctx;
		cleanup = setup.cleanup;
	});

	afterEach(() => {
		cleanup();
	});

	it('@spec:AC-410 — formulário salva compra com fornecedor, data e itens', async () => {
		const root = document.createElement('div');
		const unsubscribe = renderPurchasesView(root, ctx);
		const newBtn = root.querySelector('#new-purchase') as HTMLButtonElement;
		expect(newBtn).toBeTruthy();
		newBtn!.click();

		const modal = document.querySelector('.modal') as HTMLElement;
		expect(modal).toBeTruthy();

		const supplierInput = modal.querySelector('[name="supplier"]') as HTMLInputElement;
		const invoiceInput = modal.querySelector('[name="invoice"]') as HTMLInputElement;
		const dateInput = modal.querySelector('[name="date"]') as HTMLInputElement;
		expect(supplierInput).toBeTruthy();
		expect(invoiceInput).toBeTruthy();
		expect(dateInput).toBeTruthy();

		supplierInput!.value = 'Fornecedor ABC';
		invoiceInput!.value = 'NF-123';
		dateInput!.value = '2026-03-10';

		// Adiciona um item
		const addItemBtn = modal.querySelector('#add-item') as HTMLButtonElement;
		addItemBtn!.click();

		const ingredientSelect = modal.querySelector('[data-ingredient]') as HTMLSelectElement;
		const qtyInput = modal.querySelector('[data-qty]') as HTMLInputElement;
		const packageSizeInput = modal.querySelector('[data-packageSize]') as HTMLInputElement;
		const packagePriceInput = modal.querySelector('[data-packagePrice]') as HTMLInputElement;

		ingredientSelect!.value = 'flour';
		qtyInput!.value = '500';
		packageSizeInput!.value = '1000';
		packagePriceInput!.value = '10';

		const form = modal.querySelector('#purchase-form') as HTMLFormElement;
		form.dispatchEvent(new Event('submit', { bubbles: true }));

		await new Promise(r => setTimeout(r, 50));

		const purchases = ctx.purchases.getAll();
		expect(purchases).toHaveLength(1);
		expect(purchases[0].supplier).toBe('Fornecedor ABC');
		expect(purchases[0].date).toBe('2026-03-10');
		expect(purchases[0].items).toHaveLength(1);
		expect(purchases[0].items[0].ingredientId).toBe('flour');

		unsubscribe();
	});

	it('@spec:AC-413 — data futura é recusada', async () => {
		const root = document.createElement('div');
		const unsubscribe = renderPurchasesView(root, ctx);
		const newBtn = root.querySelector('#new-purchase') as HTMLButtonElement;
		newBtn!.click();

		const modal = document.querySelector('.modal') as HTMLElement;
		const dateInput = modal.querySelector('[name="date"]') as HTMLInputElement;
		const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
		dateInput!.value = tomorrow;

		const supplierInput = modal.querySelector('[name="supplier"]') as HTMLInputElement;
		const invoiceInput = modal.querySelector('[name="invoice"]') as HTMLInputElement;
		supplierInput!.value = 'Fornecedor ABC';
		invoiceInput!.value = 'NF-123';

		const addItemBtn = modal.querySelector('#add-item') as HTMLButtonElement;
		addItemBtn!.click();

		const ingredientSelect = modal.querySelector('[data-ingredient]') as HTMLSelectElement;
		const qtyInput = modal.querySelector('[data-qty]') as HTMLInputElement;
		const packageSizeInput = modal.querySelector('[data-packageSize]') as HTMLInputElement;
		const packagePriceInput = modal.querySelector('[data-packagePrice]') as HTMLInputElement;

		ingredientSelect!.value = 'flour';
		qtyInput!.value = '500';
		packageSizeInput!.value = '1000';
		packagePriceInput!.value = '10';

		const form = modal.querySelector('#purchase-form') as HTMLFormElement;
		form.dispatchEvent(new Event('submit', { bubbles: true }));

		// Aguarda o toast aparecer
		await new Promise(r => setTimeout(r, 100));

		// Verifica se o toast de erro apareceu
		const toast = document.querySelector('.toast') as HTMLElement;
		expect(toast).toBeTruthy();
		expect(toast.textContent).toContain('futura');

		unsubscribe();
	});

	it('@spec:AC-414 — quantidade zero ou preço zero é recusado', async () => {
		const root = document.createElement('div');
		const unsubscribe = renderPurchasesView(root, ctx);
		const newBtn = root.querySelector('#new-purchase') as HTMLButtonElement;
		newBtn!.click();

		const modal = document.querySelector('.modal') as HTMLElement;
		const supplierInput = modal.querySelector('[name="supplier"]') as HTMLInputElement;
		const invoiceInput = modal.querySelector('[name="invoice"]') as HTMLInputElement;
		const dateInput = modal.querySelector('[name="date"]') as HTMLInputElement;
		supplierInput!.value = 'Fornecedor ABC';
		invoiceInput!.value = 'NF-123';
		dateInput!.value = '2026-03-10';

		const addItemBtn = modal.querySelector('#add-item') as HTMLButtonElement;
		addItemBtn!.click();

		const ingredientSelect = modal.querySelector('[data-ingredient]') as HTMLSelectElement;
		const qtyInput = modal.querySelector('[data-qty]') as HTMLInputElement;
		const packageSizeInput = modal.querySelector('[data-packageSize]') as HTMLInputElement;
		const packagePriceInput = modal.querySelector('[data-packagePrice]') as HTMLInputElement;

		ingredientSelect!.value = 'flour';
		qtyInput!.value = '0';
		packageSizeInput!.value = '1000';
		packagePriceInput!.value = '10';

		const form = modal.querySelector('#purchase-form') as HTMLFormElement;
		form.dispatchEvent(new Event('submit', { bubbles: true }));

		await new Promise(r => setTimeout(r, 50));

		const toast = document.querySelector('.toast') as HTMLElement;
		expect(toast).toBeTruthy();
		expect(toast.textContent).toContain('Quantidade inválida');

		unsubscribe();
	});

	it('@spec:AC-415 — listagem filtra por mês e ordena cronologicamente', async () => {
		const root = document.createElement('div');
		const unsubscribe = renderPurchasesView(root, ctx);

		// Usa datas garantidamente no passado para evitar validação de data futura
		const today = new Date();
		const currentMonth = today.toISOString().slice(0, 7);
		const currentDay = today.getDate().toString().padStart(2, '0');
		const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
		const prevMonth = prevMonthDate.toISOString().slice(0, 7);
		
		// Registra compras no mês atual (dias passados) e mês anterior via service
		await ctx.purchasesService.register({
			supplier: 'A', invoice: '1', date: `${currentMonth}-${(today.getDate() - 2).toString().padStart(2, '0')}`,
			items: [{ ingredientId: 'flour', ingredientName: 'Farinha', qty: 100, packageSize: 1000, packagePrice: 10 }],
			notes: ''
		});
		await ctx.purchasesService.register({
			supplier: 'B', invoice: '2', date: `${currentMonth}-${(today.getDate() - 1).toString().padStart(2, '0')}`,
			items: [{ ingredientId: 'sugar', ingredientName: 'Açúcar', qty: 100, packageSize: 1000, packagePrice: 8 }],
			notes: ''
		});
		await ctx.purchasesService.register({
			supplier: 'C', invoice: '3', date: `${prevMonth}-10`,
			items: [{ ingredientId: 'flour', ingredientName: 'Farinha', qty: 100, packageSize: 1000, packagePrice: 10 }],
			notes: ''
		});

		// Re-renderiza a view
		const root2 = document.createElement('div');
		const unsubscribe2 = renderPurchasesView(root2, ctx);

		const list = root2.querySelector('.purchases-list') as HTMLElement;
		expect(list).toBeTruthy();

		const rows = list.querySelectorAll('.purchase-row');
		expect(rows).toHaveLength(2); // só mês atual

		const supplierCells = Array.from(rows).map(r => r.querySelector('.purchase-main strong')?.textContent);
		expect(supplierCells[0]).toBe('A');
		expect(supplierCells[1]).toBe('B');

		unsubscribe();
		unsubscribe2();
	});
});