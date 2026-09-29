import { createItemRoutes } from '../../../../server/routeFactory';
import {
  CALENDAR_EVENTS_TABLE,
  CALENDAR_EVENTS_SHAPE
} from '../../../../server/tables';
export const { PUT, DELETE } = createItemRoutes(
  CALENDAR_EVENTS_TABLE,
  CALENDAR_EVENTS_SHAPE
);