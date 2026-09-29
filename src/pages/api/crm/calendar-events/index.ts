import { createCollectionRoutes } from '../../../../server/routeFactory';
import {
  CALENDAR_EVENTS_TABLE,
  CALENDAR_EVENTS_SHAPE
} from '../../../../server/tables';
export const { GET, POST } = createCollectionRoutes(
  CALENDAR_EVENTS_TABLE,
  CALENDAR_EVENTS_SHAPE
);