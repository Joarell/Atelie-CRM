import { createCollectionRoutes } from '../../../server/routeFactory';
import { ORDERS_TABLE, ORDERS_SHAPE } from '../../../server/tables';

export const { GET, POST } = createCollectionRoutes(ORDERS_TABLE, ORDERS_SHAPE);
