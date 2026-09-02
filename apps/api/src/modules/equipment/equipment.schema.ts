import { AppError, ConflictError, NotFoundError } from '@construction-erp/errors';
import { z } from 'zod';

/** Maximum page size for bounded Equipment reads. */
export const MODULE_12_MAX_PAGE_SIZE = 100;

/** Final Module 12 permission vocabulary. */
export const MODULE_12_PERMISSION_CODES = Object.freeze([
  'equipment.read',
  'equipment.manage',
  'equipment.assign',
  'equipment.usage.create',
  'equipment.maintenance.manage'
] as const);

/** Final Module 12 stable business errors. */
export const MODULE_12_ERROR_CODES = Object.freeze([
  'EQUIPMENT_NOT_FOUND',
  'EQUIPMENT_NOT_AVAILABLE',
  'ASSIGNMENT_OVERLAP',
  'INVALID_EQUIPMENT_STAGE'
] as const);

/** Final Module 12 event vocabulary. */
export const MODULE_12_EVENT_TYPES = Object.freeze([
  'equipment.assigned',
  'equipment.usage_posted',
  'equipment.maintenance_recorded',
  'equipment.assignment_ended'
] as const);

/** Final Module 12 public route catalog. */
export const MODULE_12_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/equipment' }),
  Object.freeze({ method: 'POST', route: '/api/v1/equipment' }),
  Object.freeze({ method: 'POST', route: '/api/v1/equipment/:id/assignments' }),
  Object.freeze({ method: 'POST', route: '/api/v1/equipment/:id/assignments/:assignmentId/end' }),
  Object.freeze({ method: 'POST', route: '/api/v1/equipment/:id/usage' }),
  Object.freeze({ method: 'POST', route: '/api/v1/equipment/:id/maintenance' }),
  Object.freeze({ method: 'GET', route: '/api/v1/equipment/:id/history' })
] as const);

/** Fields that are always derived from trusted server context or business logic. */
export const MODULE_12_SERVER_OWNED_REQUEST_FIELDS = Object.freeze([
  'companyId',
  'actorUserId',
  'permissions',
  'allowedProjectIds',
  'status',
  'amount',
  'enteredBy',
  'sourceKey',
  'createdAt',
  'updatedAt'
] as const);

export type Module12PermissionCode = (typeof MODULE_12_PERMISSION_CODES)[number];
export type Module12ErrorCode = (typeof MODULE_12_ERROR_CODES)[number];

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD');
const nonNegativeDecimal = z.string().trim().regex(
  /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/,
  'value must be a non-negative decimal with at most 4 decimal places'
);
const nonNegativeMoney = z.string().trim().regex(
  /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/,
  'money must be a non-negative decimal with at most 2 decimal places'
);
const pageShape = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(MODULE_12_MAX_PAGE_SIZE).optional()
} as const;

/** Validate one Equipment path identifier. */
export const equipmentIdParamsSchema = z.object({ id: uuid }).strict();

/** Validate one Equipment assignment path identifier. */
export const equipmentAssignmentParamsSchema = z.object({ id: uuid, assignmentId: uuid }).strict();

/** Validate bounded Equipment list pagination. */
export const listEquipmentQuerySchema = z.object({ ...pageShape }).strict();

/** Validate the bounded combined history read. */
export const equipmentHistoryQuerySchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(MODULE_12_MAX_PAGE_SIZE).optional()
}).strict();

/** Validate one Company-owned Equipment master. */
export const createEquipmentBodySchema = z.object({
  code: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(300),
  equipmentType: z.string().trim().min(1).max(120),
  ownershipType: z.string().trim().min(1).max(64),
  defaultRate: nonNegativeDecimal.nullable().optional(),
  rateUnit: z.string().trim().min(1).max(32).nullable().optional()
}).strict().superRefine((value, context) => {
  const hasRate = value.defaultRate !== undefined && value.defaultRate !== null;
  const hasUnit = value.rateUnit !== undefined && value.rateUnit !== null;
  if (hasRate !== hasUnit) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: hasRate ? ['rateUnit'] : ['defaultRate'],
      message: 'Default rate and rate unit must be provided together.'
    });
  }
});

/** Validate one Project/Stage Equipment assignment. */
export const createEquipmentAssignmentBodySchema = z.object({
  projectId: uuid,
  stageId: uuid.nullable().optional(),
  fromDate: date,
  toDate: date.nullable().optional()
}).strict().refine((value) => value.toDate == null || value.toDate >= value.fromDate, {
  path: ['toDate'],
  message: 'Assignment end date must be on or after the start date.'
});

/** Validate the effective date used to end one active Equipment assignment. */
export const endEquipmentAssignmentBodySchema = z.object({
  endDate: date
}).strict();

/** Validate one usage/rental record tied to an existing assignment. */
export const recordEquipmentUsageBodySchema = z.object({
  assignmentId: uuid,
  usageDate: date,
  quantity: nonNegativeDecimal,
  rate: nonNegativeDecimal.nullable().optional()
}).strict();

/** Validate one maintenance history record. */
export const createEquipmentMaintenanceBodySchema = z.object({
  maintenanceDate: date,
  type: z.string().trim().min(1).max(120),
  cost: nonNegativeMoney,
  note: z.string().trim().max(4000).nullable().optional()
}).strict();

/** Safe Equipment master response. */
export const equipmentResponseSchema = z.object({
  id: uuid,
  code: z.string(),
  name: z.string(),
  equipmentType: z.string(),
  ownershipType: z.string(),
  defaultRate: z.string().nullable(),
  rateUnit: z.string().nullable(),
  status: z.string()
}).strict();

/** Safe Equipment assignment response. */
export const equipmentAssignmentResponseSchema = z.object({
  id: uuid,
  equipmentId: uuid,
  projectId: uuid,
  stageId: uuid.nullable(),
  fromDate: date,
  toDate: date.nullable(),
  status: z.string()
}).strict();

/** Safe Equipment usage response. */
export const equipmentUsageResponseSchema = z.object({
  id: uuid,
  assignmentId: uuid,
  projectId: uuid,
  stageId: uuid.nullable(),
  usageDate: date,
  quantity: z.string(),
  rate: z.string(),
  amount: z.string(),
  enteredBy: uuid,
  status: z.string(),
  costActualId: uuid
}).strict();

/** Safe Equipment maintenance response. */
export const equipmentMaintenanceResponseSchema = z.object({
  id: uuid,
  equipmentId: uuid,
  maintenanceDate: date,
  type: z.string(),
  cost: z.string(),
  note: z.string().nullable(),
  status: z.string()
}).strict();

/** Paginated Equipment register response. */
export const listEquipmentResponseSchema = z.object({
  items: z.array(equipmentResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(MODULE_12_MAX_PAGE_SIZE)
}).strict();

/** Project/Stage cost summary calculated from posted Equipment usage. */
export const equipmentCostSummaryResponseSchema = z.object({
  projectId: uuid,
  stageId: uuid.nullable(),
  amount: z.string()
}).strict();

/** Combined assignment/usage/maintenance history response. */
export const equipmentHistoryResponseSchema = z.object({
  equipment: equipmentResponseSchema,
  assignments: z.array(equipmentAssignmentResponseSchema),
  usage: z.array(equipmentUsageResponseSchema.omit({ costActualId: true }).extend({ costActualId: uuid.nullable() })),
  maintenance: z.array(equipmentMaintenanceResponseSchema),
  costSummary: z.array(equipmentCostSummaryResponseSchema)
}).strict();

const ERROR_MESSAGES: Readonly<Record<Module12ErrorCode, string>> = Object.freeze({
  EQUIPMENT_NOT_FOUND: 'The requested equipment was not found.',
  EQUIPMENT_NOT_AVAILABLE: 'The equipment is not available for this operation.',
  ASSIGNMENT_OVERLAP: 'The equipment assignment overlaps another assignment.',
  INVALID_EQUIPMENT_STAGE: 'The selected stage does not belong to the selected project.'
});

/** Create one stable Final Module 12 business error. */
export function createModule12Error(code: Module12ErrorCode): AppError {
  const message = ERROR_MESSAGES[code];
  if (code === 'EQUIPMENT_NOT_FOUND') return new NotFoundError({ code, message });
  return new ConflictError({ code, message });
}

export type ListEquipmentQuery = z.infer<typeof listEquipmentQuerySchema>;
export type EquipmentHistoryQuery = z.infer<typeof equipmentHistoryQuerySchema>;
export type CreateEquipmentBody = z.infer<typeof createEquipmentBodySchema>;
export type CreateEquipmentAssignmentBody = z.infer<typeof createEquipmentAssignmentBodySchema>;
export type EndEquipmentAssignmentBody = z.infer<typeof endEquipmentAssignmentBodySchema>;
export type RecordEquipmentUsageBody = z.infer<typeof recordEquipmentUsageBodySchema>;
export type CreateEquipmentMaintenanceBody = z.infer<typeof createEquipmentMaintenanceBodySchema>;
