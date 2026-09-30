import { createCollectionRoutes } from '../../../../server/routeFactory';
import {
	CATALOG_PRODUCTS_TABLE,
	CATALOG_PRODUCTS_SHAPE
} from '../../../../server/tables';
export const { GET, POST } = createCollectionRoutes(
	CATALOG_PRODUCTS_TABLE,
	CATALOG_PRODUCTS_SHAPE
);