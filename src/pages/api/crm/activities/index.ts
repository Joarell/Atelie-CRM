import { createCollectionRoutes } from '../../../../server/routeFactory';
import {
  CRM_ACTIVITIES_TABLE,
  CRM_ACTIVITIES_SHAPE
} from '../../../../server/tables';
export const { GET, POST } = createCollectionRoutes(
  CRM_ACTIVITIES_TABLE,
  CRM_ACTIVITIES_SHAPE
);