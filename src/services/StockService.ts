import type { IRepository } from '../repositories/IRepository';
import type {
	Ingredient, RecipeComponent, Product, Order, StockMovement
} from '../domain/types';
import { uid, nowISO } from '../domain/format';
import { expandOrderUsage, type UsageMap } from '../domain/stock';

export class StockService {
	constructor(
		private readonly ingredients: IRepository<Ingredient>,
		private readonly components: IRepository<RecipeComponent>,
		private readonly products: IRepository<Product>,
		private readonly movements: IRepository<StockMovement>
	) {}

	lowStock(): Ingredient[] {
		return this.ingredients.getAll().filter((i) => i.stock <= i.minStock);
	}

	registerMovement(
		ingredientId: string, type: StockMovement['type'], qty: number, note: string
	): Promise<void> {
		const ingredient = this.ingredients.getById(ingredientId);
		if (!ingredient) return Promise.resolve();
		const delta = type === 'entrada' ? qty : -qty;
		return this.applyMovement(ingredient, type, qty, note, delta);
	}

	usageForOrder(order: Order): UsageMap {
		return expandOrderUsage(
			order,
			(id) => this.products.getById(id),
			(id) => this.components.getById(id)
		);
	}

	async deductForOrder(order: Order): Promise<void> {
		const usage = this.usageForOrder(order);
		for (const [ingredientId, qty] of Object.entries(usage)) {
			await this.registerMovement(
				ingredientId, 'saida', qty, `Pedido de ${order.customerName}`
			);
		}
	}

	private async applyMovement(
		ingredient: Ingredient,
		type: StockMovement['type'],
		qty: number,
		note: string,
		delta: number
	): Promise<void> {
		const stock = ingredient.stock + delta;
		await this.ingredients.update(ingredient.id, { stock });
		await this.saveMovement(ingredient, type, qty, note);
	}

	private saveMovement(
		ingredient: Ingredient,
		type: StockMovement['type'],
		qty: number,
		note: string
	): Promise<StockMovement> {
		return this.movements.add({
			id: uid(),
			ingredientId: ingredient.id,
			ingredientName: ingredient.name,
			type,
			qty,
			note,
			date: nowISO()
		});
	}
}