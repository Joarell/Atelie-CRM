import { createItemRoutes } from '../../../../server/routeFactory';
import {
  CONVERSATION_NOTES_TABLE,
  CONVERSATION_NOTES_SHAPE
} from '../../../../server/tables';
export const { PUT, DELETE } = createItemRoutes(
  CONVERSATION_NOTES_TABLE,
  CONVERSATION_NOTES_SHAPE
);