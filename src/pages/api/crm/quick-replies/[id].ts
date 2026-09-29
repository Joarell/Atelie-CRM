import { createItemRoutes } from '../../../../server/routeFactory';
import {
  QUICK_REPLIES_TABLE,
  QUICK_REPLIES_SHAPE
} from '../../../../server/tables';
export const { PUT, DELETE } = createItemRoutes(
  QUICK_REPLIES_TABLE,
  QUICK_REPLIES_SHAPE
);