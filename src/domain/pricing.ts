import type {
	Ingredient,
	RecipeComponent,
	Product,
	LaborInputs,
	FixedExpenses
} from './types';

// Every function below is a pure, single-purpose calculation.
// They take plain data in and return plain numbers out — no lookups,
// no side effects. Callers (services) are responsible for resolving ids.

export function ingredientUnitCost(ingredient: Ingredient | undefined): number {
	if (!ingredient || !ingredient.packageSize) return 0;
	return ingredient.packagePrice / ingredient.packageSize;
}

export function componentTotalCost(
	component: RecipeComponent,
	resolveIngredient: (id: string) => Ingredient | undefined
): number {
	return component.items.reduce((sum, item) => {
		const cost = ingredientUnitCost(resolveIngredient(item.ingredientId));
		return sum + cost * item.qty;
	}, 0);
}

export function productDirectCost(
	product: Product,
	resolveIngredient: (id: string) => Ingredient | undefined,
	resolveComponent: (id: string) => RecipeComponent | undefined
): number {
	return product.items.reduce((sum, item) => {
		if (item.kind === 'ingredient') {
			return sum + ingredientUnitCost(resolveIngredient(item.refId)) * item.qty;
		}
		const component = resolveComponent(item.refId);
		const cost = component
			? componentTotalCost(component, resolveIngredient)
			: 0;
		return sum + cost * item.qty;
	}, 0);
}

export function hoursPerMonth(labor: LaborInputs): number {
	return labor.daysPerMonth * labor.hoursPerDay;
}

export function laborCostPerMinute(labor: LaborInputs): number {
	const hours = hoursPerMonth(labor);
	if (!hours) return 0;
	return labor.salary / hours / 60;
}

export function fixedMonthlyTotal(fixed: FixedExpenses): number {
	return fixed.rent + fixed.energy + fixed.water +
		fixed.internet + fixed.office + fixed.mei;
}

// Fixed costs are allocated using the same monthly working hours as labor
// (the business only "operates" during those hours), so it takes the
// product's own labor inputs as the time basis.
export function fixedCostPerMinute(
	fixed: FixedExpenses,
	labor: LaborInputs
): number {
	const hours = hoursPerMonth(labor);
	if (!hours) return 0;
	return fixedMonthlyTotal(fixed) / hours / 60;
}

export interface ProductPricing {
	directCost: number;
	laborCost: number;
	fixedCost: number;
	variableCost: number;
	totalCost: number;
	markupPercent: number;
	markupValue: number;
	suggestedPrice: number;
	unitPrice: number;
	// CMV (custo da mercadoria vendida) is the material cost of ONE unit:
	// directCost spread over the yield. CPV (custo do produto vendido) adds
	// the production labour. Neither carries fixed or variable expenses.
	cmvUnit: number;
	cpvUnit: number;
	profit: number;
	profitPercent: number;
}

type BatchParts = Omit<
	ProductPricing,
	'unitPrice' | 'cmvUnit' | 'cpvUnit' | 'profit' | 'profitPercent'
>;

// Everything needed to price a product now lives on the product itself
// (labor, fixed expenses, variable %, markup %) — no external settings
// object is consulted here anymore.
export function calculateProductPricing(
	product: Product,
	directCost: number
): ProductPricing {
	const laborCost =
		laborCostPerMinute(product.labor) * product.prepTime;
	const fixedPerMin = fixedCostPerMinute(product.fixedExpenses, product.labor);
	const fixedCost = fixedPerMin * product.prepTime;
	const variableCost = directCost * (product.variablePercent / 100);
	const totalCost = directCost + laborCost + fixedCost + variableCost;
	const markupPercent = product.markupPercent;
	const markupValue = totalCost * (markupPercent / 100);
	const suggestedPrice = totalCost + markupValue;
	const parts = {
		directCost,
		laborCost,
		fixedCost,
		variableCost,
		totalCost,
		markupPercent,
		markupValue,
		suggestedPrice
	};
	return buildPricingResult(parts, product.yieldUnits);
}

function buildPricingResult(
	parts: BatchParts,
	yieldUnits: number
): ProductPricing {
	const unitPrice = perUnit(parts.suggestedPrice, yieldUnits);
	const cmvUnit = perUnit(parts.directCost, yieldUnits);
	const cpvUnit = perUnit(parts.directCost + parts.laborCost, yieldUnits);
	const profit = parts.suggestedPrice - parts.totalCost;
	const profitPercent = parts.suggestedPrice
		? (parts.markupValue / parts.suggestedPrice) * 100
		: 0;
	return { ...parts, unitPrice, cmvUnit, cpvUnit, profit, profitPercent };
}

function perUnit(batchCost: number, yieldUnits: number): number {
	return yieldUnits ? batchCost / yieldUnits : batchCost;
}
