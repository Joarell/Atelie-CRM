import { createCollectionRoutes } from '../../../../server/routeFactory';
import {
  CONVERSATION_NOTES_TABLE,
  CONVERSATION_NOTES_SHAPE
} from '../../../../server/tables';
export const { GET, POST } = createCollectionRoutes(
  CONVERSATION_NOTES_TABLE,
  CONVERSATION_NOTES_SHAPE
);