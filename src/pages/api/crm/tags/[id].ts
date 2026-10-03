import { createItemRoutes } from '../../../../server/routeFactory';
import { TAGS_TABLE, TAGS_SHAPE } from '../../../../server/tables';
export const { PUT, DELETE } = createItemRoutes(
	TAGS_TABLE,
	TAGS_SHAPE,
	{ update: 'manager', delete: 'manager' }
);