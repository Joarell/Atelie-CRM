import { createItemRoutes } from '../../../../server/routeFactory';
import { CONTACTS_TABLE, CONTACTS_SHAPE } from '../../../../server/tables';
export const { PUT, DELETE } = createItemRoutes(CONTACTS_TABLE, CONTACTS_SHAPE);