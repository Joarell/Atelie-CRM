import { createItemRoutes } from '../../../server/routeFactory';
import { ORDERS_TABLE, ORDERS_SHAPE } from '../../../server/tables';

export const { PUT, DELETE } = createItemRoutes(
	ORDERS_TABLE,
	ORDERS_SHAPE,
	{ update: 'manager', delete: 'manager' }
);
