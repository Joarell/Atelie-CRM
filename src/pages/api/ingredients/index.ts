import { createCollectionRoutes } from '../../../server/routeFactory';
import {
	INGREDIENTS_TABLE,
	INGREDIENTS_SHAPE
} from '../../../server/tables';

export const { GET, POST } = createCollectionRoutes(
	INGREDIENTS_TABLE,
	INGREDIENTS_SHAPE
);