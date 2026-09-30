import type { Product, RecipeComponent, Order } from './types';

export type UsageMap = Record<string, number>;

// Flattens a product's recipe (ingredients + one level of components)
// into "how many grams/ml/units of each raw ingredient are needed
// to make ONE batch of this product".
export function expandProductUsage(
	product: Product,
	resolveComponent: (id: string) => RecipeComponent | undefined
): UsageMap {
	const usage: UsageMap = {};
	for (const item of product.items) {
		if (item.kind === 'ingredient') {
			addUsage(usage, item.refId, item.qty);
			continue;
		}
		const component = resolveComponent(item.refId);
		if (component) addComponentUsage(usage, component, item.qty);
	}
	return usage;
}

function addComponentUsage(
	usage: UsageMap,
	component: RecipeComponent,
	multiplier: number
): void {
	for (const item of component.items) {
		addUsage(usage, item.ingredientId, item.qty * multiplier);
	}
}

function addUsage(usage: UsageMap, ingredientId: string, qty: number): void {
	usage[ingredientId] = (usage[ingredientId] ?? 0) + qty;
}

// Combines usage across every line of an order (product usage * qty ordered).
export function expandOrderUsage(
	order: Order,
	resolveProduct: (id: string) => Product | undefined,
	resolveComponent: (id: string) => RecipeComponent | undefined
): UsageMap {
	const total: UsageMap = {};
	for (const line of order.lines) {
		const product = resolveProduct(line.productId);
		if (!product) continue;
		const perUnit = expandProductUsage(product, resolveComponent);
		mergeUsage(total, perUnit, line.qty);
	}
	return total;
}

function mergeUsage(
	target: UsageMap,
	source: UsageMap,
	multiplier: number
): void {
	for (const id of Object.keys(source)) {
		addUsage(target, id, source[id] * multiplier);
	}
}
