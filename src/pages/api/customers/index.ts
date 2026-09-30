import { createCollectionRoutes } from '../../../server/routeFactory';
import {
	CUSTOMERS_TABLE,
	CUSTOMERS_SHAPE
} from '../../../server/tables';

export const { GET, POST } = createCollectionRoutes(
	CUSTOMERS_TABLE,
	CUSTOMERS_SHAPE
);