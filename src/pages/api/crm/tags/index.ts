import { createCollectionRoutes } from '../../../../server/routeFactory';
import { TAGS_TABLE, TAGS_SHAPE } from '../../../../server/tables';
export const { GET, POST } = createCollectionRoutes(TAGS_TABLE, TAGS_SHAPE);