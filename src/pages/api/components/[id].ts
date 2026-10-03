import { createItemRoutes } from '../../../server/routeFactory';
import {
	COMPONENTS_TABLE,
	COMPONENTS_SHAPE
} from '../../../server/tables';

export const { PUT, DELETE } = createItemRoutes(
	COMPONENTS_TABLE,
	COMPONENTS_SHAPE,
	{ update: 'manager', delete: 'manager' }
);