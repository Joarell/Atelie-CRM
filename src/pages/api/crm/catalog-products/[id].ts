import { createItemRoutes } from '../../../../server/routeFactory';
import {
  CATALOG_PRODUCTS_TABLE,
  CATALOG_PRODUCTS_SHAPE
} from '../../../../server/tables';
export const { PUT, DELETE } = createItemRoutes(
  CATALOG_PRODUCTS_TABLE,
  CATALOG_PRODUCTS_SHAPE
);