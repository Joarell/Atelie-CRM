import { createItemRoutes } from '../../../../server/routeFactory';
import {
	APPOINTMENT_TYPES_TABLE,
	APPOINTMENT_TYPES_SHAPE
} from '../../../../server/tables';
export const { PUT, DELETE } = createItemRoutes(
	APPOINTMENT_TYPES_TABLE,
	APPOINTMENT_TYPES_SHAPE,
	{ update: 'manager', delete: 'manager' }
);