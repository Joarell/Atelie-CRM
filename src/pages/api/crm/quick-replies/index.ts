import { createCollectionRoutes } from '../../../../server/routeFactory';
import {
	QUICK_REPLIES_TABLE,
	QUICK_REPLIES_SHAPE
} from '../../../../server/tables';
export const { GET, POST } = createCollectionRoutes(
	QUICK_REPLIES_TABLE,
	QUICK_REPLIES_SHAPE
);