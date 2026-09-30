import { createCollectionRoutes } from '../../../server/routeFactory';
import {
	PRODUCTS_TABLE,
	PRODUCTS_SHAPE
} from '../../../server/tables';

export const { GET, POST } = createCollectionRoutes(
	PRODUCTS_TABLE,
	PRODUCTS_SHAPE
);