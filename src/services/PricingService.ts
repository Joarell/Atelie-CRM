import type { IRepository } from '../repositories/IRepository';
import type { Ingredient, RecipeComponent, Product } from '../domain/types';
import {
  componentTotalCost,
  productDirectCost,
  calculateProductPricing,
  type ProductPricing
} from '../domain/pricing';

// Bridges the pure domain math with the persisted collections: this is
// the only place that knows both "how pricing is calculated" and
// "where ingredients/components live". Views never touch domain/pricing
// directly, so the formula can change without touching UI code.
// Pricing itself now only needs the product's own fields (labor, fixed
// expenses, variable %, markup % all live on the product), so this
// service no longer depends on global settings at all.
export class PricingService {
  constructor(
    private readonly ingredients: IRepository<Ingredient>,
    private readonly components: IRepository<RecipeComponent>
  ) {}

  componentCost(component: RecipeComponent): number {
    return componentTotalCost(component, (id) => this.ingredients.getById(id));
  }

  productDirectCost(product: Product): number {
    return productDirectCost(
      product,
      (id) => this.ingredients.getById(id),
      (id) => this.components.getById(id)
    );
  }

  productPricing(product: Product): ProductPricing {
    const direct = this.productDirectCost(product);
    return calculateProductPricing(product, direct);
  }
}
