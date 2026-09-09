import { recordAudit } from '@construction-erp/audit';
import { type DatabaseClient, type TransactionClient } from '@construction-erp/database';
import { AuthorizationError, NotFoundError, ValidationError } from '@construction-erp/errors';
import { executeIdempotentCommand } from '@construction-erp/idempotency';
import { allocateCompanyNumber } from '@construction-erp/numbering';
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
  type RecordEquipmentUsageBody,
  type ReverseEquipmentAssignmentBody,
  type UpdateEquipmentBody
} from './equipment.schema.js';

const ACTIVE = 'ACTIVE';
const ENDED = 'ENDED';
const REVERSED = 'REVERSED';
const POSTED = 'POSTED';
const RECORDED = 'RECORDED';
const DECIMAL_SCALE_4 = 10_000n;
const PRODUCT_TO_MINOR_UNITS_DIVISOR = 1_000_000n;
const MAX_MONEY_MINOR_UNITS = 999_999_999_999_999_999n;
const EQUIPMENT_SEQUENCE_KEY = 'equipment';
const EQUIPMENT_RATE_UNITS = ['HOUR', 'DAY', 'MONTH'] as const;

type DecimalLike = string | Readonly<{ toString(): string }>;
type EquipmentRateUnit = (typeof EQUIPMENT_RATE_UNITS)[number];

/** Normalize one business token without changing its semantic value. */
function token(value: string): string {
  return value.trim().toUpperCase();
}

/** Canonicalize legacy rate-unit casing before it reaches calculations or persistence. */
function normalizeRateUnit(value: string | null): EquipmentRateUnit | null {
  if (value === null) return null;
  const normalized = token(value);
  return EQUIPMENT_RATE_UNITS.find((unit) => unit === normalized) ?? null;
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

/** Convert signed exact money into minor units for append-only adjustments. */
function moneyToMinorUnits(value: DecimalLike): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.toString().trim());
  if (!match) throw new ValidationError({ message: 'Equipment expense amount is invalid.' });
  const sign = match[1] === '-' ? -1n : 1n;
  return sign * ((BigInt(match[2] ?? '0') * 100n) + BigInt(`${match[3] ?? ''}00`.slice(0, 2)));
}

/** Serialize signed minor units as stable two-decimal money. */
function minorUnitsToMoney(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const text = `${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
  return negative ? `-${text}` : text;
}

/** Sum Equipment Expense source rows without floating-point arithmetic. */
function sumExpenseActuals(rows: readonly Readonly<{ amount: DecimalLike }>[]): bigint {
  return rows.reduce((sum, row) => sum + moneyToMinorUnits(row.amount), 0n);
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

/** Calculate chargeable quantity from an inclusive date range and captured rate unit. */
function datedQuantity(quantity: DecimalLike, rateUnit: EquipmentRateUnit, fromDate: Date, fromMinute: number, toDate: Date, toMinute: number): string {
  const days = BigInt(Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1);
  if (rateUnit === 'HOUR') {
    const elapsedMinutes = BigInt(Math.floor((toDate.getTime() - fromDate.getTime()) / 60_000) + toMinute - fromMinute);
    if (elapsedMinutes <= 0n) throw new ValidationError({ message: 'Hourly equipment completion time must be after its assignment start time.' });
    return scale4ToDecimal(divideRoundHalfUp(decimalToScale4(quantity) * elapsedMinutes, 60n));
  }
  const periods = rateUnit === 'MONTH' ? (days + 29n) / 30n : days;
  return scale4ToDecimal(decimalToScale4(quantity) * periods);
}

/** Parse one validated date-only API value for database persistence. */
function inputDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Convert a validated HH:mm value to minutes after midnight. */
function inputMinute(value = '00:00'): number {
  const [hours = '0', minutes = '0'] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/** Serialize minutes after midnight as HH:mm. */
function minuteTime(value: number): string {
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
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
  assignments?: ReadonlyArray<Readonly<{ id: string; project: Readonly<{ name: string }>; stage: Readonly<{ name: string }> | null }>>;
}>) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    equipmentType: row.equipmentType,
    ownershipType: row.ownershipType,
    defaultRate: row.defaultRate === null ? null : decimalString(row.defaultRate),
    rateUnit: normalizeRateUnit(row.rateUnit),
    status: row.status,
    assignmentStatus: row.assignments?.length ? 'ASSIGNED' : 'UNASSIGNED',
    activeAssignmentId: row.assignments?.[0]?.id ?? null,
    assignedProjectName: row.assignments?.[0]?.project.name ?? null,
    assignedStageName: row.assignments?.[0]?.stage?.name ?? null
  };
}

/** Convert one Equipment assignment row to the Final-21 API response. */
function assignmentResponse(row: Readonly<{
  id: string;
  equipmentId: string;
  projectId: string;
  stageId: string | null;
  fromDate: Date;
  fromMinute: number;
  toDate: Date | null;
  toMinute: number | null;
  quantity: DecimalLike;
  rate: DecimalLike;
  rateUnit: string;
  estimatedAmount: DecimalLike | null;
  status: string;
  project?: Readonly<{ name: string }>;
  stage?: Readonly<{ name: string }> | null;
}>) {
  return {
    id: row.id,
    equipmentId: row.equipmentId,
    projectId: row.projectId,
    stageId: row.stageId,
    fromDate: dateOnly(row.fromDate),
    fromTime: minuteTime(row.fromMinute),
    toDate: row.toDate ? dateOnly(row.toDate) : null,
    toTime: row.toMinute === null ? null : minuteTime(row.toMinute),
    quantity: decimalString(row.quantity),
    rate: decimalString(row.rate),
    rateUnit: normalizeRateUnit(row.rateUnit) ?? row.rateUnit,
    estimatedAmount: row.estimatedAmount === null ? null : moneyString(row.estimatedAmount),
    status: row.status,
    projectName: row.project?.name ?? null,
    stageName: row.stage?.name ?? null
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
}>, assignment: Readonly<{ projectId: string; stageId: string | null; status: string; project?: Readonly<{ name: string }>; stage?: Readonly<{ name: string }> | null }>, costActualId: TCostActualId) {
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    projectId: assignment.projectId,
    stageId: assignment.stageId,
    projectName: assignment.project?.name ?? null,
    stageName: assignment.stage?.name ?? null,
    usageDate: dateOnly(row.usageDate),
    quantity: decimalString(row.quantity),
    rate: decimalString(row.rate),
    amount: moneyString(row.amount),
    enteredBy: row.enteredBy,
    status: token(assignment.status) === REVERSED ? REVERSED : row.status,
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
      await repository.ensureEquipmentSequence();
      const code = (await allocateCompanyNumber(tx, { sequenceKey: EQUIPMENT_SEQUENCE_KEY })).formatted;
      const equipment = await repository.createEquipment({
        code,
        name: input.name.trim(),
        equipmentType: input.equipmentType?.trim() || 'General',
        ownershipType: input.ownershipType,
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

  /** Update editable Equipment details exactly once while retaining its automatic code. */
  async updateEquipment(equipmentId: string, input: UpdateEquipmentBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'equipment.update', idempotencyKey, fingerprintInput: { equipmentId, input }
    }, async (tx) => {
      await this.requireCompanyPermission(new AdministrationRepository(tx), 'equipment.manage', new Date());
      const repository = new EquipmentRepository(tx);
      const before = await repository.findEquipmentById(equipmentId);
      if (!before) throw createModule12Error('EQUIPMENT_NOT_FOUND');
      const equipment = await repository.updateEquipment(equipmentId, {
        name: input.name.trim(),
        equipmentType: input.equipmentType?.trim() || 'General',
        ownershipType: input.ownershipType,
        defaultRate: input.defaultRate ?? null,
        rateUnit: input.rateUnit ?? null
      });
      if (!equipment) throw createModule12Error('EQUIPMENT_NOT_FOUND');
      const response = equipmentResponse(equipment);
      await recordAudit(tx, { action: 'equipment.updated', entityType: 'equipment', entityId: equipment.id, before: equipmentResponse(before), after: response });
      return { statusCode: 200, body: response };
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
    const fromMinute = inputMinute(input.fromTime);
    const toDate = input.toDate ? inputDate(input.toDate) : null;
    const toMinute = input.toTime ? inputMinute(input.toTime) : null;
    const rate = equipment.defaultRate?.toString() ?? null;
    const rateUnit = normalizeRateUnit(equipment.rateUnit);
    if (!rate || !rateUnit) throw new ValidationError({ message: 'Configure a valid default rate and rate unit before assigning this equipment.' });
    if (rateUnit === 'HOUR' && !input.fromTime) throw new ValidationError({ fieldErrors: [{ field: 'fromTime', message: 'Start time is required for hourly equipment.' }] });
    if (input.toTime && !toDate) throw new ValidationError({ fieldErrors: [{ field: 'toTime', message: 'To date is required when a to time is provided.' }] });
    if (rateUnit === 'HOUR' && toDate && !input.toTime) throw new ValidationError({ fieldErrors: [{ field: 'toTime', message: 'To time is required for an hourly estimate.' }] });
    if (await repository.hasAssignmentOverlap(equipmentId, fromDate, toDate)) throw createModule12Error('ASSIGNMENT_OVERLAP');
    const estimatedAmount = calculateAmount(toDate ? datedQuantity(input.quantity, rateUnit, fromDate, fromMinute, toDate, toMinute ?? 0) : input.quantity, rate);
    const assignment = await repository.createAssignment({
      equipmentId,
      projectId: input.projectId,
      stageId: input.stageId ?? null,
      fromDate,
      fromMinute,
      toDate,
      toMinute,
      quantity: input.quantity,
      rate,
      rateUnit,
      estimatedAmount,
      status: ACTIVE
    });
    await repository.createAssignmentExpenseActual({
      projectId: assignment.projectId,
      stageId: assignment.stageId,
      assignmentId: assignment.id,
      sourceType: 'equipment_assignment',
      sourceKeySuffix: 'assigned',
      postingDate: assignment.fromDate,
      amount: estimatedAmount
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
    await this.requireProjectPermission(new AdministrationRepository(tx), current.projectId, 'equipment.usage.create', new Date());

    const equipment = await repository.lockEquipmentForWrite(equipmentId);
    if (!equipment) throw createModule12Error('EQUIPMENT_NOT_FOUND');
    const locked = await repository.lockAssignmentForWrite(equipmentId, assignmentId);
    if (!locked || token(locked.status) !== ACTIVE) throw createModule12Error('EQUIPMENT_NOT_AVAILABLE');
    const rateUnit = normalizeRateUnit(locked.rateUnit);
    if (!rateUnit) throw new ValidationError({ message: 'The assignment has an invalid equipment rate unit.' });

    const endDate = inputDate(input.endDate);
    const endMinute = inputMinute(input.endTime);
    if (rateUnit === 'HOUR' && !input.endTime) throw new ValidationError({ fieldErrors: [{ field: 'endTime', message: 'Completion time is required for hourly equipment.' }] });
    if (endDate < locked.fromDate || (endDate.getTime() === locked.fromDate.getTime() && endMinute <= locked.fromMinute)) {
      throw new ValidationError({ fieldErrors: [{ field: 'endDate', message: 'endDate cannot precede the assignment start date.' }] });
    }
    if (locked.toDate && (endDate > locked.toDate || (endDate.getTime() === locked.toDate.getTime() && locked.toMinute !== null && endMinute > locked.toMinute))) {
      throw new ValidationError({ fieldErrors: [{ field: 'endDate', message: 'endDate cannot extend the assignment beyond its existing end date.' }] });
    }
    const latestUsageDate = await repository.findLatestUsageDate(equipmentId, assignmentId);
    if (latestUsageDate && endDate < latestUsageDate) {
      throw new ValidationError({ fieldErrors: [{ field: 'endDate', message: 'endDate cannot precede posted Equipment usage.' }] });
    }

    const quantity = datedQuantity(locked.quantity, rateUnit, locked.fromDate, locked.fromMinute, endDate, endMinute);
    const amount = calculateAmount(quantity, locked.rate);
    const currentExpense = sumExpenseActuals(await repository.listAssignmentExpenseActuals(equipmentId, assignmentId));
    const usage = await repository.createUsage({ assignmentId, usageDate: endDate, quantity, rate: locked.rate.toString(), amount, enteredBy: requireRequestSecurityContext().actorUserId, status: POSTED });
    const actual = await repository.createAssignmentExpenseActual({
      projectId: locked.projectId,
      stageId: locked.stageId,
      assignmentId,
      sourceType: 'equipment_assignment_completion',
      sourceKeySuffix: 'completed',
      postingDate: endDate,
      amount: minorUnitsToMoney(moneyToMinorUnits(amount) - currentExpense)
    });
    const usageResult = usageResponse(usage, locked, actual.id);
    await recordAudit(tx, { action: 'equipment.usage_posted', entityType: 'equipment_usage', entityId: usage.id, projectId: locked.projectId, stageId: locked.stageId, after: usageResult });
    await recordOutboxEvent(tx, { eventType: 'equipment.usage_posted', resourceType: 'equipment_usage', resourceId: usage.id, payload: usageResult });

    const updated = await repository.endAssignment(equipmentId, assignmentId, endDate, endMinute);
    if (!updated || token(updated.status) !== ENDED) throw createModule12Error('EQUIPMENT_NOT_AVAILABLE');
    const response = assignmentResponse(updated);
    await recordAudit(tx, { action: 'equipment.assignment_ended', entityType: 'equipment_assignment', entityId: assignmentId, projectId: updated.projectId, stageId: updated.stageId, before: assignmentResponse(locked), after: response });
    await recordOutboxEvent(tx, { eventType: 'equipment.assignment_ended', resourceType: 'equipment_assignment', resourceId: assignmentId, payload: response });
    return { statusCode: 200, body: response };
  }

  /** Reverse one wrong assignment and compensate all of its Equipment Expense entries. */
  async reverseAssignment(equipmentId: string, assignmentId: string, input: ReverseEquipmentAssignmentBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'equipment.assignment.reverse', idempotencyKey, fingerprintInput: { equipmentId, assignmentId, input }
    }, async (tx) => {
      const repository = new EquipmentRepository(tx);
      const current = await repository.findAssignment(equipmentId, assignmentId);
      if (!current) throw createModule12Error('EQUIPMENT_NOT_AVAILABLE');
      const users = new AdministrationRepository(tx);
      await this.requireProjectPermission(users, current.projectId, 'equipment.assign', new Date());
      await this.requireProjectPermission(users, current.projectId, 'equipment.usage.create', new Date());
      if (!(await repository.lockEquipmentForWrite(equipmentId))) throw createModule12Error('EQUIPMENT_NOT_FOUND');
      const locked = await repository.lockAssignmentForWrite(equipmentId, assignmentId);
      if (!locked || ![ACTIVE, ENDED].includes(token(locked.status))) throw createModule12Error('EQUIPMENT_NOT_AVAILABLE');
      if (!(await repository.hasPostedUsage(equipmentId, assignmentId))) {
        throw new ValidationError({ message: 'Only Equipment assignments with posted completion or usage expense can be reversed.' });
      }

      const reversalDate = inputDate(input.reversalDate);
      const expenseRows = await repository.listAssignmentExpenseActuals(equipmentId, assignmentId);
      const latestPostingDate = expenseRows.reduce<Date | null>((latest, row) => latest === null || row.postingDate > latest ? row.postingDate : latest, null);
      if (reversalDate < locked.fromDate || (latestPostingDate !== null && reversalDate < latestPostingDate)) {
        throw new ValidationError({ fieldErrors: [{ field: 'reversalDate', message: 'Reversal date cannot precede the assignment or its latest Equipment Expense entry.' }] });
      }
      const reversedAmount = minorUnitsToMoney(-sumExpenseActuals(expenseRows));
      await repository.createAssignmentExpenseActual({
        projectId: locked.projectId,
        stageId: locked.stageId,
        assignmentId,
        sourceType: 'equipment_assignment_reversal',
        sourceKeySuffix: 'reversed',
        postingDate: reversalDate,
        amount: reversedAmount
      });
      const updated = await repository.reverseAssignment(equipmentId, assignmentId);
      if (!updated || token(updated.status) !== REVERSED) throw createModule12Error('EQUIPMENT_NOT_AVAILABLE');
      const response = assignmentResponse(updated);
      const reversal = { ...response, reversalDate: input.reversalDate, reason: input.reason.trim(), reversedExpenseAmount: reversedAmount };
      await recordAudit(tx, { action: 'equipment.assignment_reversed', entityType: 'equipment_assignment', entityId: assignmentId, projectId: updated.projectId, stageId: updated.stageId, before: assignmentResponse(locked), after: reversal });
      await recordOutboxEvent(tx, { eventType: 'equipment.assignment_reversed', resourceType: 'equipment_assignment', resourceId: assignmentId, payload: reversal });
      return { statusCode: 200, body: response };
    });
    return result.response.body;
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
    const costActualByUsageId = new Map(result.costActuals.filter((row) => row.sourceType === 'equipment_usage').map((row) => [row.sourceId, row.id]));
    const usage = result.usage.map((row) => usageResponse(row, row.assignment, costActualByUsageId.get(row.id) ?? null));
    const maintenance = result.maintenance.map(maintenanceResponse);
    const totals = new Map<string, { projectId: string; stageId: string | null; minorUnits: bigint }>();
    for (const row of result.costActuals) {
      const key = `${row.projectId}:${row.stageId ?? ''}`;
      const current = totals.get(key) ?? { projectId: row.projectId, stageId: row.stageId, minorUnits: 0n };
      current.minorUnits += moneyToMinorUnits(row.amount);
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
