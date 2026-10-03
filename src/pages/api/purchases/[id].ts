import { createItemRoutes } from '../../../server/routeFactory';
import {
	PURCHASES_TABLE,
	PURCHASES_SHAPE
} from '../../../server/tables';

export const { PUT, DELETE } = createItemRoutes(
	PURCHASES_TABLE,
	PURCHASES_SHAPE,
	{ update: 'manager', delete: 'manager' }
);