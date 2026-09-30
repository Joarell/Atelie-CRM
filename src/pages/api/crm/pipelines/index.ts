import { createCollectionRoutes } from '../../../../server/routeFactory';
import { PIPELINES_TABLE, PIPELINES_SHAPE } from '../../../../server/tables';
export const { GET, POST } = createCollectionRoutes(
	PIPELINES_TABLE,
	PIPELINES_SHAPE
);