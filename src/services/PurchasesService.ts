import type { IRepository } from '../repositories/IRepository';
import type {
	Ingredient, Purchase, PurchaseItem, StockMovement
} from '../domain/types';
import { uid, nowISO } from '../domain/format';
import { StockService } from './StockService';

export class PurchasesService {
	constructor(
		private readonly purchases: IRepository<Purchase>,
		private readonly ingredients: IRepository<Ingredient>,
		private readonly movements: IRepository<StockMovement>,
		private readonly stockService: StockService
	) {}

	listByMonth(monthKey: string): Purchase[] {
		const all = this.purchases.getAll();
		return all
			.filter((p) => p.date.slice(0, 7) === monthKey)
			.sort((a, b) => a.date.localeCompare(b.date));
	}

	async register(draft: Omit<Purchase, 'id'>): Promise<Purchase> {
		this.validateDraft(draft);
		const purchase = await this.savePurchase(draft);
		await this.applyStockEntries(purchase);
		return purchase;
	}

	private validateDraft(draft: Omit<Purchase, 'id'>): void {
		const today = new Date().toISOString().slice(0, 10);
		if (draft.date > today) {
			throw new Error('A data da compra não pode ser futura');
		}
		for (const item of draft.items) {
			if (item.qty <= 0) {
				throw new Error(`Quantidade inválida para ${item.ingredientName}`);
			}
			if (item.packagePrice <= 0) {
				throw new Error(`Preço inválido para ${item.ingredientName}`);
			}
			if (!this.ingredients.getById(item.ingredientId)) {
				throw new Error(`Ingrediente ${item.ingredientName} não encontrado`);
			}
		}
	}

	private async savePurchase(draft: Omit<Purchase, 'id'>): Promise<Purchase> {
		const purchase: Purchase = { ...draft, id: uid() };
		await this.purchases.add(purchase);
		return purchase;
	}

	private async applyStockEntries(purchase: Purchase): Promise<void> {
		for (const item of purchase.items) {
			await this.stockService.registerMovement(
				item.ingredientId, 'entrada', item.qty, `Compra de ${purchase.supplier}`
			);
			await this.ingredients.update(item.ingredientId, {
				packagePrice: item.packagePrice,
				packageSize: item.packageSize
			});
		}
	}

	async remove(id: string): Promise<void> {
		await this.purchases.remove(id);
	}
}