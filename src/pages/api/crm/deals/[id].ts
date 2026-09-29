import { createItemRoutes } from '../../../../server/routeFactory';
import { DEALS_TABLE, DEALS_SHAPE } from '../../../../server/tables';
export const { PUT, DELETE } = createItemRoutes(DEALS_TABLE, DEALS_SHAPE);