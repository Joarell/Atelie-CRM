import { createItemRoutes } from '../../../../server/routeFactory';
import { TASKS_TABLE, TASKS_SHAPE } from '../../../../server/tables';
export const { PUT, DELETE } = createItemRoutes(TASKS_TABLE, TASKS_SHAPE);