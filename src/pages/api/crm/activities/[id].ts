import { createItemRoutes } from '../../../../server/routeFactory';
import {
	CRM_ACTIVITIES_TABLE,
	CRM_ACTIVITIES_SHAPE
} from '../../../../server/tables';
export const { PUT, DELETE } = createItemRoutes(
	CRM_ACTIVITIES_TABLE,
	CRM_ACTIVITIES_SHAPE
);