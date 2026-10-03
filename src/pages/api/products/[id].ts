import { createItemRoutes } from '../../../server/routeFactory';
import { PRODUCTS_TABLE, PRODUCTS_SHAPE } from '../../../server/tables';

export const { PUT, DELETE } = createItemRoutes(
	PRODUCTS_TABLE,
	PRODUCTS_SHAPE,
	{ update: 'manager', delete: 'manager' }
);
