import { createItemRoutes } from '../../../server/routeFactory';
import {
	INGREDIENTS_TABLE,
	INGREDIENTS_SHAPE
} from '../../../server/tables';

export const { PUT, DELETE } = createItemRoutes(
	INGREDIENTS_TABLE,
	INGREDIENTS_SHAPE
);