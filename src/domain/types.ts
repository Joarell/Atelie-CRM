// Core domain entities. Plain data — no behaviour, no persistence concerns.
// Keeping entities dumb is what lets services/repositories vary independently
// (Dependency Inversion: everyone depends on these shapes, not on each other).

export type Unit = 'g' | 'ml' | 'un';

export interface Ingredient {
	id: string;
	name: string;
	unit: Unit;
	packageSize: number;   // e.g. 1000 (g)
	packagePrice: number;  // R$ for that package
	stock: number;
	minStock: number;
}

export type ComponentType = 'base' | 'recheio' | 'cobertura';

export interface ComponentItem {
	ingredientId: string;
	qty: number; // in the ingredient's unit
}

export interface RecipeComponent {
	id: string;
	name: string;
	type: ComponentType;
	yieldDesc: string;
	prepTime: number; // minutes
	items: ComponentItem[];
}

export type ProductItemKind = 'ingredient' | 'component';

export interface ProductItem {
	kind: ProductItemKind;
	refId: string;
	qty: number;
}

// A product now carries its own full cost model — every number that feeds
// the final price lives on the product itself and is editable in its form.
// Settings (below) only supplies sensible defaults when a product is created.
export interface LaborInputs {
	salary: number;
	daysPerMonth: number;
	hoursPerDay: number;
}

export interface FixedExpenses {
	rent: number;
	energy: number;
	water: number;
	internet: number;
	office: number;
	mei: number;
}

export interface Product {
	id: string;
	name: string;
	category: string;
	yieldUnits: number;
	prepTime: number; // minutes
	labor: LaborInputs;
	fixedExpenses: FixedExpenses;
	variablePercent: number;
	markupPercent: number;
	items: ProductItem[];
}

export interface Customer {
	id: string;
	name: string;
	phone: string;
	email: string;
	notes: string;
}

export type OrderStatus =
	| 'pendente'
	| 'producao'
	| 'pronto'
	| 'entregue'
	| 'cancelado';
export type PaymentStatus = 'a_pagar' | 'pago';

export interface OrderLine {
	productId: string;
	productName: string;
	qty: number;
	unitPrice: number;
}

export interface Order {
	id: string;
	customerId: string;
	customerName: string;
	lines: OrderLine[];
	deliveryDate: string; // ISO date
	status: OrderStatus;
	paymentStatus: PaymentStatus;
	notes: string;
	stockDeducted: boolean;
	createdAt: string; // ISO datetime
	createdFrom?: string; // '' (ERP) or 'inbox' (Pedidos panel composer)
}

export type StockMovementType = 'entrada' | 'saida';

export interface StockMovement {
	id: string;
	ingredientId: string;
	ingredientName: string;
	type: StockMovementType;
	qty: number;
	note: string;
	date: string; // ISO datetime
}

export interface Settings {
	salary: number;
	daysPerMonth: number;
	hoursPerDay: number;
	rent: number;
	energy: number;
	water: number;
	internet: number;
	office: number;
	mei: number;
	variablePercent: number;
	defaultMarkupPercent: number;
}

export interface PurchaseItem {
	ingredientId: string;
	ingredientName: string;
	qty: number;
	packageSize: number;
	packagePrice: number;
}

export interface Purchase {
	id: string;
	supplier: string;
	invoice: string;
	date: string; // ISO date (YYYY-MM-DD)
	items: PurchaseItem[];
	notes: string;
}

export const DEFAULT_SETTINGS: Settings = {
	salary: 1800,
	daysPerMonth: 24,
	hoursPerDay: 8,
	rent: 800,
	energy: 250,
	water: 90,
	internet: 120,
	office: 60,
	mei: 76,
	variablePercent: 10,
	defaultMarkupPercent: 70
};
