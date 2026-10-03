import { createCollectionRoutes } from '../../../server/routeFactory';
import {
	PURCHASES_TABLE,
	PURCHASES_SHAPE
} from '../../../server/tables';

export const { GET, POST } = createCollectionRoutes(
	PURCHASES_TABLE,
	PURCHASES_SHAPE
);