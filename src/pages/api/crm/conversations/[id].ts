import { createItemRoutes } from '../../../../server/routeFactory';
import {
  CONVERSATIONS_TABLE,
  CONVERSATIONS_SHAPE
} from '../../../../server/tables';
export const { PUT, DELETE } = createItemRoutes(
  CONVERSATIONS_TABLE,
  CONVERSATIONS_SHAPE
);