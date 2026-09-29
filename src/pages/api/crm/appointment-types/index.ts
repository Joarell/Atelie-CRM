import { createCollectionRoutes } from '../../../../server/routeFactory';
import {
  APPOINTMENT_TYPES_TABLE,
  APPOINTMENT_TYPES_SHAPE
} from '../../../../server/tables';
export const { GET, POST } = createCollectionRoutes(
  APPOINTMENT_TYPES_TABLE,
  APPOINTMENT_TYPES_SHAPE
);