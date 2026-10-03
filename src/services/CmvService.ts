import type { IRepository } from '../repositories/IRepository';
import type {
	Ingredient, Order, Product, Purchase, StockMovement
} from '../domain/types';
import {
	monthKey,
	monthStart,
	nextMonthStart,
	stockAt,
	stockValueAt,
	purchasesTotal,
	cmvOfPeriod,
	cpvOfPeriod
} from '../domain/cmv';
import { calculateProductPricing, productDirectCost } from '../domain/pricing';

export interface CmvReport {
	month: string;
	initialStock: number;
	purchases: number;
	finalStock: number;
	cmv: number;
	laborCost: number;
	cpv: number;
}

export class CmvService {
	constructor(
		private readonly ingredients: IRepository<Ingredient>,
		private readonly orders: IRepository<Order>,
		private readonly products: IRepository<Product>,
		private readonly purchases: IRepository<Purchase>,
		private readonly movements: IRepository<StockMovement>
	) {}

	report(month: string): CmvReport {
		const start = monthStart(month);
		const end = nextMonthStart(month);

		const allIngredients = this.ingredients.getAll();
		const allMovements = this.movements.getAll();
		const allPurchases = this.purchases.getAll();
		const allOrders = this.orders.getAll();

		const unitCost = (ing: Ingredient) => ing.packagePrice / ing.packageSize;

		const initialStock = stockValueAt(allIngredients, allMovements, start, unitCost);
		const finalStock = stockValueAt(allIngredients, allMovements, end, unitCost);
		const purchasesValue = purchasesTotal(allPurchases, month);
		const cmv = cmvOfPeriod(initialStock, purchasesValue, finalStock);
		const laborCost = this.computePeriodLaborCost(allOrders, month);

		return this.buildReport(
			month, initialStock, purchasesValue, finalStock, cmv, laborCost
		);
	}

	private buildReport(
		month: string,
		initialStock: number,
		purchasesValue: number,
		finalStock: number,
		cmv: number,
		laborCost: number
	): CmvReport {
		return {
			month,
			initialStock,
			purchases: purchasesValue,
			finalStock,
			cmv,
			laborCost,
			cpv: cpvOfPeriod(cmv, laborCost)
		};
	}

	private computePeriodLaborCost(orders: Order[], month: string): number {
		let total = 0;
		for (const order of orders) {
			if (order.deliveryDate.slice(0, 7) !== month) continue;
			for (const line of order.lines) {
				const product = this.products.getById(line.productId);
				if (!product) continue;
				const directCost = productDirectCost(
					product,
					(id) => this.ingredients.getById(id),
					(id) => undefined // components not needed for labor
				);
				const pricing = calculateProductPricing(product, directCost);
				total += pricing.laborCost * line.qty;
			}
		}
		return total;
	}
}