export { registerEquipmentRoutes, type EquipmentRoutesOptions } from './equipment.routes.js';
export { EquipmentRepository } from './equipment.repository.js';
export { EquipmentService } from './equipment.service.js';
export {
  MODULE_12_ERROR_CODES,
  MODULE_12_EVENT_TYPES,
  MODULE_12_HTTP_ROUTES,
  MODULE_12_MAX_PAGE_SIZE,
  MODULE_12_PERMISSION_CODES,
  MODULE_12_SERVER_OWNED_REQUEST_FIELDS,
  createEquipmentAssignmentBodySchema,
  createEquipmentBodySchema,
  createEquipmentMaintenanceBodySchema,
  createModule12Error,
  equipmentHistoryQuerySchema,
  equipmentHistoryResponseSchema,
  equipmentIdParamsSchema,
  equipmentMaintenanceResponseSchema,
  equipmentResponseSchema,
  equipmentUsageResponseSchema,
  listEquipmentQuerySchema,
  listEquipmentResponseSchema,
  recordEquipmentUsageBodySchema
} from './equipment.schema.js';
