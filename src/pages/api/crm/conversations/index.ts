import { createCollectionRoutes } from '../../../../server/routeFactory';
import {
	CONVERSATIONS_TABLE,
	CONVERSATIONS_SHAPE
} from '../../../../server/tables';
export const { GET, POST } = createCollectionRoutes(
	CONVERSATIONS_TABLE,
	CONVERSATIONS_SHAPE
);