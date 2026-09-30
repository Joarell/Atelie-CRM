import { createCollectionRoutes } from '../../../server/routeFactory';
import {
	STOCK_MOVEMENTS_TABLE,
	STOCK_MOVEMENTS_SHAPE
} from '../../../server/tables';

export const { GET, POST } = createCollectionRoutes(
	STOCK_MOVEMENTS_TABLE,
	STOCK_MOVEMENTS_SHAPE
);