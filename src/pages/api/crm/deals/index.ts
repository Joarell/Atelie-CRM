import { createCollectionRoutes } from '../../../../server/routeFactory';
import { DEALS_TABLE, DEALS_SHAPE } from '../../../../server/tables';
export const { GET, POST } = createCollectionRoutes(DEALS_TABLE, DEALS_SHAPE);