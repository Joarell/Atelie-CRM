import { createCollectionRoutes } from '../../../../server/routeFactory';
import { STAGES_TABLE, STAGES_SHAPE } from '../../../../server/tables';
export const { GET, POST } = createCollectionRoutes(STAGES_TABLE, STAGES_SHAPE);