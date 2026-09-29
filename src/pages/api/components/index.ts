import { createCollectionRoutes } from '../../../server/routeFactory';
import {
  COMPONENTS_TABLE,
  COMPONENTS_SHAPE
} from '../../../server/tables';

export const { GET, POST } = createCollectionRoutes(
  COMPONENTS_TABLE,
  COMPONENTS_SHAPE
);