import { createCollectionRoutes } from '../../../../server/routeFactory';
import { MESSAGES_TABLE, MESSAGES_SHAPE } from '../../../../server/tables';
export const { GET, POST } = createCollectionRoutes(
  MESSAGES_TABLE,
  MESSAGES_SHAPE
);