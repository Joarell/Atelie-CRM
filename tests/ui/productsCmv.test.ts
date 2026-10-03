// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderProductsView } from '../../src/ui/views/ProductsView';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import { PricingService } from '../../src/services/PricingService';
import { StockService } from '../../src/services/StockService';
import type { Ingredient, RecipeComponent, Product, Customer, Order, StockMovement, Purchase } from '../../src/domain/types';

function makeCtx() {
	const ingredients = InMemoryRepository.seeded<Ingredient>([
		{ id: 'flour', name: 'Farinha', unit: 'g', packageSize: 1000, packagePrice: 10, stock: 1000, minStock: 200 },
		{ id: 'butter', name: 'Manteiga', unit: 'g', packageSize: 200, packagePrice: 16, stock: 500, minStock: 100 }
	]);
	const components = InMemoryRepository.seeded<RecipeComponent>([
		{
			id: 'dough', name: 'Massa', type: 'base', yieldDesc: '1x', prepTime: 10,
			items: [{ ingredientId: 'flour', qty: 500 }]
		}
	]);
	const products = InMemoryRepository.seeded<Product>([
		{
			id: 'cake', name: 'Bolo', category: 'Doce', yieldUnits: 4, prepTime: 60,
			labor: { salary: 2400, daysPerMonth: 24, hoursPerDay: 8 },
			fixedExpenses: { rent: 800, energy: 250, water: 90, internet: 120, office: 60, mei: 76 },
			variablePercent: 10, markupPercent: 70,
			items: [{ kind: 'ingredient', refId: 'flour', qty: 400 }]
		}
	]);
	const customers = new InMemoryRepository<Customer>();
	const orders = new InMemoryRepository<Order>();
	const movements = new InMemoryRepository<StockMovement>();
	const purchases = new InMemoryRepository<Purchase>();

	const pricing = new PricingService(ingredients, components);
	const stock = new StockService(ingredients, components, products, movements);

	const root = document.createElement('div');
	document.body.appendChild(root);

	return {
		root,
		ctx: {
			ingredients: { getAll: () => ingredients.getAll(), getById: (id: string) => ingredients.getById(id), subscribe: (cb: () => void) => { cb(); return () => {}; } },
			components: { getAll: () => components.getAll(), getById: (id: string) => components.getById(id), subscribe: (cb: () => void) => { cb(); return () => {}; } },
			products: { getAll: () => products.getAll(), getById: (id: string) => products.getById(id), subscribe: (cb: () => void) => { cb(); return () => {}; } },
			customers: { getAll: () => customers.getAll(), getById: (id: string) => customers.getById(id), subscribe: (cb: () => void) => { cb(); return () => {}; } },
			orders: { getAll: () => orders.getAll(), getById: (id: string) => orders.getById(id), subscribe: (cb: () => void) => { cb(); return () => {}; } },
			movements: { getAll: () => movements.getAll(), getById: (id: string) => movements.getById(id), subscribe: (cb: () => void) => { cb(); return () => {}; } },
			purchases: { getAll: () => purchases.getAll(), getById: (id: string) => purchases.getById(id), subscribe: (cb: () => void) => { cb(); return () => {}; } },
			settings: { get: () => ({ salary: 2400, daysPerMonth: 24, hoursPerDay: 8, rent: 800, energy: 250, water: 90, internet: 120, office: 60, mei: 76, variablePercent: 10, defaultMarkupPercent: 70 }), subscribe: (cb: () => void) => { cb(); return () => {}; } },
			pricing: { productPricing: (p: Product) => pricing.productPricing(p), productDirectCost: (p: Product) => pricing.productDirectCost(p, (id) => ingredients.getById(id), (id) => components.getById(id)), componentCost: (c: RecipeComponent) => pricing.componentCost(c), subscribe: (cb: () => void) => { cb(); return () => {}; } },
			stock: { subscribe: (cb: () => void) => { cb(); return () => {}; } },
			cmv: { subscribe: (cb: () => void) => { cb(); return () => {}; } }
		},
		cleanup: () => { root.remove(); }
	};
}

describe('ProductsView — CMV/CPV no card e formulário', () => {
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

	it('@spec:AC-408 — formulário mostra CMV e CPV abaixo do Custo total', () => {
		const root = document.createElement('div');
		const unsubscribe = renderProductsView(root, ctx);
		const editBtn = root.querySelector('[data-edit="cake"]') as HTMLButtonElement;
		expect(editBtn).toBeTruthy();
		editBtn!.click();

		const modal = document.querySelector('.modal') as HTMLElement;
		expect(modal).toBeTruthy();

		const calcBox = modal.querySelector('#calc-box') as HTMLElement;
		expect(calcBox).toBeTruthy();
		const html = calcBox.innerHTML;
		expect(html).toContain('CMV');
		expect(html).toContain('CPV');
		const cmvIdx = html.indexOf('CMV');
		const cpvIdx = html.indexOf('CPV');
		const totalIdx = html.indexOf('Custo total');
		expect(totalIdx).toBeLessThan(cmvIdx);
		expect(cmvIdx).toBeLessThan(cpvIdx);

		unsubscribe();
	});

	it('@spec:AC-409 — valores do formulário acompanham a edição da receita', () => {
		const root = document.createElement('div');
		const unsubscribe = renderProductsView(root, ctx);
		const editBtn = root.querySelector('[data-edit="cake"]') as HTMLButtonElement;
		editBtn!.click();

		const modal = document.querySelector('.modal') as HTMLElement;
		const qtyInput = modal.querySelector('[data-qty]') as HTMLInputElement;
		expect(qtyInput).toBeTruthy();

		qtyInput!.value = '800';
		qtyInput!.dispatchEvent(new Event('input', { bubbles: true }));

		const calcBox = modal.querySelector('#calc-box') as HTMLElement;
		const html = calcBox.innerHTML;
		expect(html).toContain('CMV');
		expect(html).toContain('R$&nbsp;2,00');

		unsubscribe();
	});

	it('@spec:AC-403 — linhas mostram apenas a sigla e o valor', () => {
		const root = document.createElement('div');
		const unsubscribe = renderProductsView(root, ctx);
		const editBtn = root.querySelector('[data-edit="cake"]') as HTMLButtonElement;
		editBtn!.click();

		const modal = document.querySelector('.modal') as HTMLElement;
		const calcBox = modal.querySelector('#calc-box') as HTMLElement;
		const html = calcBox.innerHTML;

		// CMV line should contain only "CMV" and the value, no explanatory text
		expect(html).toMatch(/CMV.*R\$\&nbsp;[\d.,]+/);
		// CPV line should contain only "CPV" and the value, no explanatory text
		expect(html).toMatch(/CPV.*R\$\&nbsp;[\d.,]+/);
		// Should NOT contain explanatory text like "custo da mercadoria vendida" or similar
		expect(html).not.toContain('custo da mercadoria');
		expect(html).not.toContain('custo do produto');

		unsubscribe();
	});
});