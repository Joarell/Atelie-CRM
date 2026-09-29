import { createItemRoutes } from '../../../../server/routeFactory';
import { MESSAGES_TABLE, MESSAGES_SHAPE } from '../../../../server/tables';
export const { PUT, DELETE } = createItemRoutes(MESSAGES_TABLE, MESSAGES_SHAPE);