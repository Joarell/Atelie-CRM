import { createItemRoutes } from '../../../../server/routeFactory';
import { STAGES_TABLE, STAGES_SHAPE } from '../../../../server/tables';
export const { PUT, DELETE } = createItemRoutes(
	STAGES_TABLE,
	STAGES_SHAPE,
	{ update: 'manager', delete: 'manager' }
);