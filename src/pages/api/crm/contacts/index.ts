import { createCollectionRoutes } from '../../../../server/routeFactory';
import { CONTACTS_TABLE, CONTACTS_SHAPE } from '../../../../server/tables';
export const { GET, POST } = createCollectionRoutes(
  CONTACTS_TABLE,
  CONTACTS_SHAPE
);