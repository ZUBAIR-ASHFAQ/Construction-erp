import { recordAudit } from '@construction-erp/audit';
import { type DatabaseClient, type TransactionClient } from '@construction-erp/database';
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '@construction-erp/errors';
import { executeIdempotentCommand } from '@construction-erp/idempotency';
import { recordOutboxEvent } from '@construction-erp/outbox';
import { requireRequestSecurityContext } from '@construction-erp/request-context';
import { AdministrationRepository } from '../administration/administration.repository.js';
import { EquipmentRepository, type EquipmentProjectVisibility } from './equipment.repository.js';
import {
  createModule12Error,
  type CreateEquipmentAssignmentBody,
  type CreateEquipmentBody,
  type CreateEquipmentMaintenanceBody,
  type EndEquipmentAssignmentBody,
  type EquipmentHistoryQuery,
  type ListEquipmentQuery,
  type Module12PermissionCode,
  type RecordEquipmentUsageBody
} from './equipment.schema.js';

const ACTIVE = 'ACTIVE';
const ENDED = 'ENDED';
const POSTED = 'POSTED';
const RECORDED = 'RECORDED';
const DECIMAL_SCALE_4 = 10_000n;
const PRODUCT_TO_MINOR_UNITS_DIVISOR = 1_000_000n;
const MAX_MONEY_MINOR_UNITS = 999_999_999_999_999_999n;

type DecimalLike = string | Readonly<{ toString(): string }>;

/** Normalize one business token without changing its semantic value. */
function token(value: string): string {
  return value.trim().toUpperCase();
}

/** Convert one exact four-decimal value to a scaled integer. */
function decimalToScale4(value: DecimalLike): bigint {
  const text = value.toString();
  const [whole = '0', fraction = ''] = text.split('.');
  return (BigInt(whole) * DECIMAL_SCALE_4) + BigInt(`${fraction}0000`.slice(0, 4));
}

/** Serialize a scaled four-decimal integer without floating-point loss. */
function scale4ToDecimal(value: bigint): string {
  const whole = value / DECIMAL_SCALE_4;
  const fraction = (value % DECIMAL_SCALE_4).toString().padStart(4, '0');
  return `${whole}.${fraction}`;
}

/** Serialize a stored decimal rate in a stable four-decimal representation. */
function decimalString(value: DecimalLike): string {
  return scale4ToDecimal(decimalToScale4(value));
}

/** Convert one stored money value to a stable two-decimal representation. */
function moneyString(value: DecimalLike): string {
  const text = value.toString();
  const [whole = '0', fraction = ''] = text.split('.');
  return `${whole}.${`${fraction}00`.slice(0, 2)}`;
}

/** Round a non-negative integer quotient half-up. */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw new ValidationError({ message: 'Equipment cost calculation is invalid.' });
  return (numerator + denominator / 2n) / denominator;
}

/** Calculate quantity multiplied by rate as exact two-decimal money. */
function calculateAmount(quantity: DecimalLike, rate: DecimalLike): string {
  const quantityUnits = decimalToScale4(quantity);
  const rateUnits = decimalToScale4(rate);
  const minorUnits = divideRoundHalfUp(quantityUnits * rateUnits, PRODUCT_TO_MINOR_UNITS_DIVISOR);
  if (minorUnits > MAX_MONEY_MINOR_UNITS) throw new ValidationError({ message: 'Equipment usage amount exceeds the supported money range.' });
  return `${minorUnits / 100n}.${(minorUnits % 100n).toString().padStart(2, '0')}`;
}

/** Parse one validated date-only API value for database persistence. */
function inputDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Serialize one database date to the API date-only format. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Return a deterministic page window for one Equipment list. */
function pageWindow(query: ListEquipmentQuery) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 50;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Convert one Equipment row to the Final-21 API response. */
function equipmentResponse(row: Readonly<{
  id: string;
  code: string;
  name: string;
  equipmentType: string;
  ownershipType: string;
  defaultRate: DecimalLike | null;
  rateUnit: string | null;
  status: string;
}>) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    equipmentType: row.equipmentType,
    ownershipType: row.ownershipType,
    defaultRate: row.defaultRate === null ? null : decimalString(row.defaultRate),
    rateUnit: row.rateUnit,
    status: row.status
  };
}

/** Convert one Equipment assignment row to the Final-21 API response. */
function assignmentResponse(row: Readonly<{
  id: string;
  equipmentId: string;
  projectId: string;
  stageId: string | null;
  fromDate: Date;
  toDate: Date | null;
  status: string;
}>) {
  return {
    id: row.id,
    equipmentId: row.equipmentId,
    projectId: row.projectId,
    stageId: row.stageId,
    fromDate: dateOnly(row.fromDate),
    toDate: row.toDate ? dateOnly(row.toDate) : null,
    status: row.status
  };
}

/** Convert one Equipment usage row and assignment destination to the API response. */
function usageResponse<TCostActualId extends string | null>(row: Readonly<{
  id: string;
  assignmentId: string;
  usageDate: Date;
  quantity: DecimalLike;
  rate: DecimalLike;
  amount: DecimalLike;
  enteredBy: string;
  status: string;
}>, assignment: Readonly<{ projectId: string; stageId: string | null }>, costActualId: TCostActualId) {
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    projectId: assignment.projectId,
    stageId: assignment.stageId,
    usageDate: dateOnly(row.usageDate),
    quantity: decimalString(row.quantity),
    rate: decimalString(row.rate),
    amount: moneyString(row.amount),
    enteredBy: row.enteredBy,
    status: row.status,
    costActualId
  };
}

/** Convert one Equipment maintenance row to the API response. */
function maintenanceResponse(row: Readonly<{
  id: string;
  equipmentId: string;
  maintenanceDate: Date;
  type: string;
  cost: DecimalLike;
  note: string | null;
  status: string;
}>) {
  return {
    id: row.id,
    equipmentId: row.equipmentId,
    maintenanceDate: dateOnly(row.maintenanceDate),
    type: row.type,
    cost: moneyString(row.cost),
    note: row.note,
    status: row.status
  };
}

/** Final Module 12 business logic for Equipment assignment, usage, cost and maintenance. */
export class EquipmentService {
  /** Bind Equipment behavior to the application database. */
  constructor(private readonly db: DatabaseClient) {}

  /** Return whether the actor has one persisted Company-level permission. */
  private async hasCompanyPermission(repository: AdministrationRepository, permission: string, asOf: Date): Promise<boolean> {
    const security = requireRequestSecurityContext();
    const permissions = await repository.findEffectivePermissionCodes({
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ACTIVE],
      roleStatuses: [ACTIVE]
    });
    return permissions.includes(permission);
  }

  /** Require one Company-level Equipment permission. */
  private async requireCompanyPermission(repository: AdministrationRepository, permission: Module12PermissionCode, asOf: Date): Promise<void> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw new AuthorizationError();
    if (!(await this.hasCompanyPermission(repository, permission, asOf))) throw new AuthorizationError();
  }

  /** Require one Equipment permission for one Project in trusted request scope. */
  private async requireProjectPermission(repository: AdministrationRepository, projectId: string, permission: Module12PermissionCode, asOf: Date): Promise<void> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw new AuthorizationError();
    if (security.projectScope.kind === 'restricted' && !security.projectScope.projectIds.includes(projectId)) throw new AuthorizationError();
    const permissions = await repository.findEffectivePermissionCodesForProject(projectId, {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ACTIVE],
      roleStatuses: [ACTIVE]
    });
    if (permissions === null) throw new NotFoundError();
    if (!permissions.includes(permission)) throw new AuthorizationError();
  }

  /** Resolve Project visibility for the combined Equipment history read. */
  private historyVisibility(): EquipmentProjectVisibility {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw new AuthorizationError();
    return {
      allowedProjectIds: security.projectScope.kind === 'restricted' ? [...security.projectScope.projectIds] : null
    };
  }

  /** List Company Equipment after revalidating equipment.read. */
  async listEquipment(query: ListEquipmentQuery) {
    await this.requireCompanyPermission(new AdministrationRepository(this.db), 'equipment.read', new Date());
    const page = pageWindow(query);
    const result = await new EquipmentRepository(this.db).listEquipment(page);
    return { items: result.items.map(equipmentResponse), total: result.total, page: page.page, pageSize: page.pageSize };
  }

  /** Create one Equipment master exactly once. */
  async createEquipment(input: CreateEquipmentBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'equipment.create', idempotencyKey, fingerprintInput: input
    }, async (tx) => {
      await this.requireCompanyPermission(new AdministrationRepository(tx), 'equipment.manage', new Date());
      const repository = new EquipmentRepository(tx);
      const code = token(input.code);
      if (await repository.findEquipmentByCode(code)) throw new ConflictError({ message: 'Equipment code already exists in this company.' });
      const equipment = await repository.createEquipment({
        code,
        name: input.name.trim(),
        equipmentType: input.equipmentType.trim(),
        ownershipType: input.ownershipType.trim(),
        defaultRate: input.defaultRate ?? null,
        rateUnit: input.rateUnit?.trim() ?? null,
        status: ACTIVE
      });
      const response = equipmentResponse(equipment);
      await recordAudit(tx, { action: 'equipment.created', entityType: 'equipment', entityId: equipment.id, after: response });
      return { statusCode: 201, body: response };
    });
    return result.response.body;
  }

  /** Assign Equipment to one Project and optional Stage exactly once. */
  async assignEquipment(equipmentId: string, input: CreateEquipmentAssignmentBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'equipment.assign', idempotencyKey, fingerprintInput: { equipmentId, input }
    }, async (tx) => this.assignEquipmentOnce(tx, equipmentId, input));
    return result.response.body;
  }

  /** Validate availability and create one non-overlapping Project/Stage assignment. */
  private async assignEquipmentOnce(tx: TransactionClient, equipmentId: string, input: CreateEquipmentAssignmentBody) {
    const now = new Date();
    const users = new AdministrationRepository(tx);
    await this.requireProjectPermission(users, input.projectId, 'equipment.assign', now);
    const repository = new EquipmentRepository(tx);
    const equipment = await repository.lockEquipmentForWrite(equipmentId);
    if (!equipment) throw createModule12Error('EQUIPMENT_NOT_FOUND');
    if (token(equipment.status) !== ACTIVE) throw createModule12Error('EQUIPMENT_NOT_AVAILABLE');
    const project = await repository.findProject(input.projectId);
    if (!project) throw new NotFoundError();
    if (token(project.status) !== ACTIVE) throw createModule12Error('EQUIPMENT_NOT_AVAILABLE');
    if (input.stageId && !(await repository.findStage(input.projectId, input.stageId))) throw createModule12Error('INVALID_EQUIPMENT_STAGE');
    const fromDate = inputDate(input.fromDate);
    const toDate = input.toDate ? inputDate(input.toDate) : null;
    if (await repository.hasAssignmentOverlap(equipmentId, fromDate, toDate)) throw createModule12Error('ASSIGNMENT_OVERLAP');
    const assignment = await repository.createAssignment({
      equipmentId,
      projectId: input.projectId,
      stageId: input.stageId ?? null,
      fromDate,
      toDate,
      status: ACTIVE
    });
    const response = assignmentResponse(assignment);
    await recordAudit(tx, { action: 'equipment.assigned', entityType: 'equipment_assignment', entityId: assignment.id, projectId: assignment.projectId, stageId: assignment.stageId, after: response });
    await recordOutboxEvent(tx, { eventType: 'equipment.assigned', resourceType: 'equipment_assignment', resourceId: assignment.id, payload: response });
    return { statusCode: 201, body: response };
  }

  /** End one active Equipment assignment exactly once without deleting its history. */
  async endAssignment(equipmentId: string, assignmentId: string, input: EndEquipmentAssignmentBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'equipment.assignment.end', idempotencyKey, fingerprintInput: { equipmentId, assignmentId, input }
    }, async (tx) => this.endAssignmentOnce(tx, equipmentId, assignmentId, input));
    return result.response.body;
  }

  /** Validate the effective end date and persist one Equipment assignment end state. */
  private async endAssignmentOnce(tx: TransactionClient, equipmentId: string, assignmentId: string, input: EndEquipmentAssignmentBody) {
    const repository = new EquipmentRepository(tx);
    const current = await repository.findAssignment(equipmentId, assignmentId);
    if (!current) throw createModule12Error('EQUIPMENT_NOT_AVAILABLE');
    await this.requireProjectPermission(new AdministrationRepository(tx), current.projectId, 'equipment.assign', new Date());

    const equipment = await repository.lockEquipmentForWrite(equipmentId);
    if (!equipment) throw createModule12Error('EQUIPMENT_NOT_FOUND');
    const locked = await repository.lockAssignmentForWrite(equipmentId, assignmentId);
    if (!locked || token(locked.status) !== ACTIVE) throw createModule12Error('EQUIPMENT_NOT_AVAILABLE');

    const endDate = inputDate(input.endDate);
    if (endDate < locked.fromDate) {
      throw new ValidationError({ fieldErrors: [{ field: 'endDate', message: 'endDate cannot precede the assignment start date.' }] });
    }
    if (locked.toDate && endDate > locked.toDate) {
      throw new ValidationError({ fieldErrors: [{ field: 'endDate', message: 'endDate cannot extend the assignment beyond its existing end date.' }] });
    }
    const latestUsageDate = await repository.findLatestUsageDate(equipmentId, assignmentId);
    if (latestUsageDate && endDate < latestUsageDate) {
      throw new ValidationError({ fieldErrors: [{ field: 'endDate', message: 'endDate cannot precede posted Equipment usage.' }] });
    }

    const updated = await repository.endAssignment(equipmentId, assignmentId, endDate);
    if (!updated || token(updated.status) !== ENDED) throw createModule12Error('EQUIPMENT_NOT_AVAILABLE');
    const response = assignmentResponse(updated);
    await recordAudit(tx, { action: 'equipment.assignment_ended', entityType: 'equipment_assignment', entityId: assignmentId, projectId: updated.projectId, stageId: updated.stageId, before: assignmentResponse(locked), after: response });
    await recordOutboxEvent(tx, { eventType: 'equipment.assignment_ended', resourceType: 'equipment_assignment', resourceId: assignmentId, payload: response });
    return { statusCode: 200, body: response };
  }

  /** Record authorized Equipment usage and its Project/Stage actual cost exactly once. */
  async recordUsage(equipmentId: string, input: RecordEquipmentUsageBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'equipment.usage.create', idempotencyKey, fingerprintInput: { equipmentId, input }
    }, async (tx) => this.recordUsageOnce(tx, equipmentId, input));
    return result.response.body;
  }

  /** Validate assignment/date/rate and atomically post one Equipment actual cost. */
  private async recordUsageOnce(tx: TransactionClient, equipmentId: string, input: RecordEquipmentUsageBody) {
    const repository = new EquipmentRepository(tx);
    const current = await repository.findAssignment(equipmentId, input.assignmentId);
    if (!current) throw createModule12Error('EQUIPMENT_NOT_AVAILABLE');
    await this.requireProjectPermission(new AdministrationRepository(tx), current.projectId, 'equipment.usage.create', new Date());
    const equipment = await repository.lockEquipmentForWrite(equipmentId);
    if (!equipment) throw createModule12Error('EQUIPMENT_NOT_FOUND');
    if (token(equipment.status) !== ACTIVE) throw createModule12Error('EQUIPMENT_NOT_AVAILABLE');
    const assignment = await repository.lockAssignmentForWrite(equipmentId, input.assignmentId);
    if (!assignment) throw createModule12Error('EQUIPMENT_NOT_AVAILABLE');
    const usageDate = inputDate(input.usageDate);
    if (token(assignment.status) !== ACTIVE || usageDate < assignment.fromDate || (assignment.toDate && usageDate > assignment.toDate)) {
      throw createModule12Error('EQUIPMENT_NOT_AVAILABLE');
    }
    const rate = input.rate ?? (equipment.defaultRate ? equipment.defaultRate.toString() : null);
    if (rate === null) throw new ValidationError({ message: 'A usage rate is required when Equipment has no default rate.' });
    const amount = calculateAmount(input.quantity, rate);
    const actor = requireRequestSecurityContext().actorUserId;
    const usage = await repository.createUsage({
      assignmentId: assignment.id,
      usageDate,
      quantity: input.quantity,
      rate,
      amount,
      enteredBy: actor,
      status: POSTED
    });
    const actual = await repository.createUsageCostActual({
      projectId: assignment.projectId,
      stageId: assignment.stageId ?? null,
      usageId: usage.id,
      postingDate: usageDate,
      amount
    });
    const response = usageResponse(usage, assignment, actual.id);
    await recordAudit(tx, { action: 'equipment.usage_posted', entityType: 'equipment_usage', entityId: usage.id, projectId: assignment.projectId, stageId: assignment.stageId, after: response });
    await recordOutboxEvent(tx, { eventType: 'equipment.usage_posted', resourceType: 'equipment_usage', resourceId: usage.id, payload: response });
    return { statusCode: 201, body: response };
  }

  /** Record one Equipment maintenance history row exactly once. */
  async createMaintenance(equipmentId: string, input: CreateEquipmentMaintenanceBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'equipment.maintenance.create', idempotencyKey, fingerprintInput: { equipmentId, input }
    }, async (tx) => {
      await this.requireCompanyPermission(new AdministrationRepository(tx), 'equipment.maintenance.manage', new Date());
      const repository = new EquipmentRepository(tx);
      if (!(await repository.findEquipmentById(equipmentId))) throw createModule12Error('EQUIPMENT_NOT_FOUND');
      const maintenance = await repository.createMaintenance({
        equipmentId,
        maintenanceDate: inputDate(input.maintenanceDate),
        type: input.type.trim(),
        cost: input.cost,
        note: input.note?.trim() ?? null,
        status: RECORDED
      });
      const response = maintenanceResponse(maintenance);
      await recordAudit(tx, { action: 'equipment.maintenance_recorded', entityType: 'equipment_maintenance', entityId: maintenance.id, after: response });
      await recordOutboxEvent(tx, { eventType: 'equipment.maintenance_recorded', resourceType: 'equipment_maintenance', resourceId: maintenance.id, payload: response });
      return { statusCode: 201, body: response };
    });
    return result.response.body;
  }

  /** Return bounded Equipment assignment, usage, maintenance and Project/Stage cost history. */
  async getHistory(equipmentId: string, query: EquipmentHistoryQuery) {
    await this.requireCompanyPermission(new AdministrationRepository(this.db), 'equipment.read', new Date());
    const repository = new EquipmentRepository(this.db);
    const result = await repository.getHistory(equipmentId, this.historyVisibility(), query.pageSize ?? 50);
    if (!result) throw createModule12Error('EQUIPMENT_NOT_FOUND');
    const assignments = result.assignments.map(assignmentResponse);
    const costActualByUsageId = new Map(result.costActuals.map((row) => [row.sourceId, row.id]));
    const usage = result.usage.map((row: any) => usageResponse(row, row.assignment, costActualByUsageId.get(row.id) ?? null));
    const maintenance = result.maintenance.map(maintenanceResponse);
    const totals = new Map<string, { projectId: string; stageId: string | null; minorUnits: bigint }>();
    for (const row of usage) {
      const key = `${row.projectId}:${row.stageId ?? ''}`;
      const [whole = '0', fraction = ''] = row.amount.split('.');
      const amountMinor = BigInt(whole) * 100n + BigInt(`${fraction}00`.slice(0, 2));
      const current = totals.get(key) ?? { projectId: row.projectId, stageId: row.stageId, minorUnits: 0n };
      current.minorUnits += amountMinor;
      totals.set(key, current);
    }
    const costSummary = [...totals.values()].map((row) => ({
      projectId: row.projectId,
      stageId: row.stageId,
      amount: `${row.minorUnits / 100n}.${(row.minorUnits % 100n).toString().padStart(2, '0')}`
    }));
    return { equipment: equipmentResponse(result.equipment), assignments, usage, maintenance, costSummary };
  }
}
