import { createCollectionRoutes } from '../../../../server/routeFactory';
import { TASKS_TABLE, TASKS_SHAPE } from '../../../../server/tables';
export const { GET, POST } = createCollectionRoutes(TASKS_TABLE, TASKS_SHAPE);