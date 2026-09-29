import { createItemRoutes } from '../../../../server/routeFactory';
import { PIPELINES_TABLE, PIPELINES_SHAPE } from '../../../../server/tables';
export const { PUT, DELETE } = createItemRoutes(
  PIPELINES_TABLE,
  PIPELINES_SHAPE
);