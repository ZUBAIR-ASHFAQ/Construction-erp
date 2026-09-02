import { recordAudit } from '@construction-erp/audit';
import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { AuthorizationError, ValidationError } from '@construction-erp/errors';
import { executeIdempotentCommand } from '@construction-erp/idempotency';
import { recordOutboxEvent } from '@construction-erp/outbox';
import { requireRequestSecurityContext } from '@construction-erp/request-context';
import { AdministrationRepository } from '../administration/administration.repository.js';
import { FinanceService } from '../finance/finance.service.js';
import { LabourPayrollRepository, type LabourPayrollProjectVisibility } from './labour-payroll.repository.js';
import {
  createLabourPayrollError,
  type CreateAttendanceBody,
  type CreatePayrollRunBody,
  type LabourPayrollPermissionCode,
  type ListAttendanceQuery,
  type ListPayrollRunsQuery,
  type UpdateAttendanceBody
} from './labour-payroll.schema.js';

const ACTIVE = 'ACTIVE';
const PAYROLL_DRAFT = 'DRAFT';
const PAYROLL_CALCULATED = 'CALCULATED';
const PAYROLL_FINALIZED = 'FINALIZED';
const ZERO_MONEY = '0.00';
const LABOUR_EXPENSE_ACCOUNT_CODE = 'PAYROLL-LABOUR-EXPENSE';
const PAYROLL_PAYABLE_ACCOUNT_CODE = 'PAYROLL-PAYABLE';
const SCALE_4 = 10_000n;
const MAX_MONEY_CENTS = 99_999_999_999_999_999n;

type DecimalLike = string | Readonly<{ toString(): string }>;
type CompensationLike = Readonly<{
  id: string;
  payType: string;
  baseSalary: DecimalLike | null;
  hourlyRate: DecimalLike | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}>;
type AttendanceLike = Readonly<{
  id: string;
  employeeId: string;
  projectId: string;
  stageId: string | null;
  workDate: Date;
  status: string;
  hours: DecimalLike | null;
  overtimeHours: DecimalLike | null;
  enteredBy: string;
  employee?: Readonly<{ id: string; employmentType: string }>;
}>;
type PayrollAllocation = Readonly<{ projectId: string; stageId: string | null; category: 'labour' | 'security'; amount: string }>;
type PayrollDraftLine = Readonly<{ employeeId: string; grossAmount: string; deductions: string; netAmount: string; projectAllocation: readonly PayrollAllocation[] }>;

/** Parse one validated date-only API value for database persistence. */
function inputDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Serialize one database date as YYYY-MM-DD. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Convert one exact decimal to four-decimal integer units. */
function decimal4Units(value: DecimalLike | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  const text = value.toString();
  const [whole = '0', fraction = ''] = text.split('.');
  return (BigInt(whole) * SCALE_4) + BigInt(`${fraction}0000`.slice(0, 4));
}

/** Convert one exact money value to integer cents. */
function moneyCents(value: DecimalLike): bigint {
  const text = value.toString();
  const [whole = '0', fraction = ''] = text.split('.');
  return (BigInt(whole) * 100n) + BigInt(`${fraction}00`.slice(0, 2));
}

/** Serialize non-negative money cents without floating-point loss. */
function moneyString(cents: bigint): string {
  if (cents < 0n || cents > MAX_MONEY_CENTS) throw new ValidationError({ message: 'Payroll amount exceeds the supported money range.' });
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}

/** Multiply four-decimal quantity and rate values and half-up round to cents. */
function multiplyToCents(quantityUnits: bigint, rateUnits: bigint): bigint {
  const product = quantityUnits * rateUnits;
  return (product + 500_000n) / 1_000_000n;
}

/** Return whether one Payroll period is exactly one complete calendar month. */
function isFullCalendarMonth(start: Date, end: Date): boolean {
  if (start.getUTCDate() !== 1 || start.getUTCFullYear() !== end.getUTCFullYear() || start.getUTCMonth() !== end.getUTCMonth()) return false;
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  return end.getUTCDate() === lastDay;
}

/** Return the compensation record effective on one attendance date. */
function compensationForDate(compensations: readonly CompensationLike[], workDate: Date): CompensationLike | null {
  return compensations.find((item) => item.effectiveFrom <= workDate && (!item.effectiveTo || item.effectiveTo >= workDate)) ?? null;
}

/** Map Employee type to the simple Final-21 labour/security cost categories. */
function labourCategory(employeeType: string): 'labour' | 'security' {
  return employeeType.trim().toUpperCase().includes('SECURITY') ? 'security' : 'labour';
}

/** Return attendance work weight used only to allocate fixed daily/monthly pay across Projects/Stages. */
function attendanceWeight(attendance: AttendanceLike): bigint {
  const worked = decimal4Units(attendance.hours) + decimal4Units(attendance.overtimeHours);
  return worked > 0n ? worked : SCALE_4;
}

/** Allocate exact cents across rows by positive work weight while preserving the exact total. */
function allocateCents(totalCents: bigint, rows: readonly AttendanceLike[]): bigint[] {
  if (rows.length === 0) return [];
  const weights = rows.map(attendanceWeight);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0n);
  if (totalWeight <= 0n) throw createLabourPayrollError('PAYROLL_NOT_READY');
  let assigned = 0n;
  return rows.map((_, index) => {
    if (index === rows.length - 1) return totalCents - assigned;
    const amount = (totalCents * (weights[index] ?? 0n)) / totalWeight;
    assigned += amount;
    return amount;
  });
}

/** Aggregate one exact payroll amount into a Project/Stage cost destination. */
function addAllocation(
  map: Map<string, { projectId: string; stageId: string | null; category: 'labour' | 'security'; cents: bigint }>,
  attendance: AttendanceLike,
  category: 'labour' | 'security',
  cents: bigint
): void {
  const key = `${attendance.projectId}:${attendance.stageId ?? ''}:${category}`;
  const existing = map.get(key);
  if (existing) existing.cents += cents;
  else map.set(key, { projectId: attendance.projectId, stageId: attendance.stageId, category, cents });
}

/** Build one deterministic page window from validated pagination. */
function pageWindow(query: Readonly<{ page?: number | undefined; pageSize?: number | undefined }>) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 50;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Serialize one attendance row to the Final-21 API response. */
function attendanceResponse(row: AttendanceLike) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    projectId: row.projectId,
    stageId: row.stageId,
    workDate: dateOnly(row.workDate),
    status: row.status,
    hours: row.hours === null ? null : row.hours.toString(),
    overtimeHours: row.overtimeHours === null ? null : row.overtimeHours.toString(),
    enteredBy: row.enteredBy
  };
}

/** Safely normalize server-owned Payroll allocation JSON for API readback. */
function allocationResponse(value: unknown): PayrollAllocation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (typeof record.projectId !== 'string' || (record.stageId !== null && typeof record.stageId !== 'string')) return [];
    if (record.category !== 'labour' && record.category !== 'security') return [];
    if (typeof record.amount !== 'string') return [];
    return [{ projectId: record.projectId, stageId: record.stageId as string | null, category: record.category, amount: record.amount }];
  });
}

/** Serialize one Payroll Run with optional calculated lines. */
function payrollRunResponse(run: Readonly<{
  id: string;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  createdBy: string;
  finalizedAt: Date | null;
  lines?: readonly Readonly<{
    id: string;
    employeeId: string;
    grossAmount: DecimalLike;
    deductions: DecimalLike;
    netAmount: DecimalLike;
    projectAllocationJson: unknown;
    payslip?: Readonly<{ id: string; documentId: string | null; generatedAt: Date | null }> | null;
  }>[];
}>) {
  return {
    id: run.id,
    periodStart: dateOnly(run.periodStart),
    periodEnd: dateOnly(run.periodEnd),
    status: run.status,
    createdBy: run.createdBy,
    finalizedAt: run.finalizedAt?.toISOString() ?? null,
    lines: (run.lines ?? []).map((line) => ({
      id: line.id,
      employeeId: line.employeeId,
      grossAmount: line.grossAmount.toString(),
      deductions: line.deductions.toString(),
      netAmount: line.netAmount.toString(),
      projectAllocation: allocationResponse(line.projectAllocationJson),
      payslip: line.payslip ? { id: line.payslip.id, documentId: line.payslip.documentId, generatedAt: line.payslip.generatedAt?.toISOString() ?? null } : null
    }))
  };
}

/** Compare calculated Payroll lines by stable Employee and allocation content before final posting. */
function payrollDraftFingerprint(lines: readonly PayrollDraftLine[]): string {
  return JSON.stringify([...lines]
    .map((line) => ({ ...line, projectAllocation: [...line.projectAllocation].sort((a, b) => `${a.projectId}:${a.stageId ?? ''}`.localeCompare(`${b.projectId}:${b.stageId ?? ''}`)) }))
    .sort((a, b) => a.employeeId.localeCompare(b.employeeId)));
}

/** Final Module 13 Attendance and Payroll business logic. */
export class LabourPayrollService {
  /** Bind Labour/Payroll behavior to the application database. */
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

  /** Require one Company-level Labour/Payroll permission. */
  private async requireCompanyPermission(repository: AdministrationRepository, permission: LabourPayrollPermissionCode, asOf: Date): Promise<void> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw new AuthorizationError();
    if (!(await this.hasCompanyPermission(repository, permission, asOf))) throw new AuthorizationError();
  }

  /** Require one attendance permission for one Project in trusted scope. */
  private async requireProjectPermission(repository: AdministrationRepository, projectId: string, permission: LabourPayrollPermissionCode, asOf: Date): Promise<void> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw new AuthorizationError();
    if (security.projectScope.kind === 'restricted' && !security.projectScope.projectIds.includes(projectId)) throw new AuthorizationError();
    const permissions = await repository.findEffectivePermissionCodesForProject(projectId, {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ACTIVE],
      roleStatuses: [ACTIVE]
    });
    if (permissions === null || !permissions.includes(permission)) throw new AuthorizationError();
  }

  /** Resolve attendance read visibility without widening Project scope. */
  private attendanceVisibility(): LabourPayrollProjectVisibility {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw new AuthorizationError();
    return { allowedProjectIds: security.projectScope.kind === 'restricted' ? [...security.projectScope.projectIds] : null };
  }

  /** Validate Stage and active Project Team assignment for one attendance destination. */
  private async requireAttendanceAssignment(repository: LabourPayrollRepository, employeeId: string, projectId: string, stageId: string | null, workDate: Date): Promise<void> {
    if (stageId && !(await repository.findStage(projectId, stageId))) throw createLabourPayrollError('EMPLOYEE_NOT_ASSIGNED');
    if (!(await repository.findActiveAssignment(employeeId, projectId, stageId, workDate))) throw createLabourPayrollError('EMPLOYEE_NOT_ASSIGNED');
  }

  /** List attendance by allowed Project/Employee/date filters. */
  async listAttendance(query: ListAttendanceQuery) {
    const admin = new AdministrationRepository(this.db);
    if (query.projectId) await this.requireProjectPermission(admin, query.projectId, 'attendance.read', new Date());
    else await this.requireCompanyPermission(admin, 'attendance.read', new Date());
    const window = pageWindow(query);
    const result = await new LabourPayrollRepository(this.db).listAttendance({
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.fromDate ? { fromDate: inputDate(query.fromDate) } : {}),
      ...(query.toDate ? { toDate: inputDate(query.toDate) } : {}),
      visibility: this.attendanceVisibility(),
      skip: window.skip,
      take: window.take
    });
    return { items: result.items.map(attendanceResponse), total: result.total, page: window.page, pageSize: window.pageSize };
  }

  /** Create one daily attendance record exactly once. */
  async createAttendance(input: CreateAttendanceBody, idempotencyKey: string) {
    try {
      const result = await executeIdempotentCommand(this.db, {
        operation: 'attendance.create', idempotencyKey, fingerprintInput: input
      }, async (tx) => this.createAttendanceOnce(tx, input));
      return result.response.body;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw createLabourPayrollError('ATTENDANCE_DUPLICATE');
      throw error;
    }
  }

  /** Validate assignment and persist one attendance record with audit/outbox evidence. */
  private async createAttendanceOnce(tx: TransactionClient, input: CreateAttendanceBody) {
    await this.requireProjectPermission(new AdministrationRepository(tx), input.projectId, 'attendance.create', new Date());
    const repository = new LabourPayrollRepository(tx);
    const workDate = inputDate(input.workDate);
    const stageId = input.stageId ?? null;
    await this.requireAttendanceAssignment(repository, input.employeeId, input.projectId, stageId, workDate);
    if (await repository.findAttendanceByNaturalKey(input.employeeId, input.projectId, workDate)) throw createLabourPayrollError('ATTENDANCE_DUPLICATE');
    const security = requireRequestSecurityContext();
    const created = await repository.createAttendance({
      employeeId: input.employeeId,
      projectId: input.projectId,
      stageId,
      workDate,
      status: input.status,
      hours: input.hours ?? null,
      overtimeHours: input.overtimeHours ?? null,
      enteredBy: security.actorUserId
    });
    const response = attendanceResponse(created);
    await recordAudit(tx, { action: 'attendance.recorded', entityType: 'attendance_entry', entityId: created.id, projectId: created.projectId, stageId: created.stageId, after: response });
    await recordOutboxEvent(tx, { eventType: 'attendance.recorded', resourceType: 'attendance_entry', resourceId: created.id, payload: response });
    return { statusCode: 201, body: response };
  }

  /** Correct one attendance row only before finalized Payroll locks its work date. */
  async updateAttendance(attendanceId: string, input: UpdateAttendanceBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'attendance.correct', idempotencyKey, fingerprintInput: { attendanceId, input }
    }, async (tx) => {
      const repository = new LabourPayrollRepository(tx);
      const before = await repository.findAttendanceById(attendanceId);
      if (!before) throw createLabourPayrollError('EMPLOYEE_NOT_ASSIGNED');
      await this.requireProjectPermission(new AdministrationRepository(tx), before.projectId, 'attendance.correct', new Date());
      if (await repository.isAttendanceLockedByFinalizedPayroll(before.employeeId, before.workDate)) throw createLabourPayrollError('PAYROLL_LOCKED');
      const stageId = input.stageId === undefined ? before.stageId : input.stageId;
      await this.requireAttendanceAssignment(repository, before.employeeId, before.projectId, stageId, before.workDate);
      const status = input.status ?? before.status;
      const hours = input.hours === undefined ? before.hours?.toString() ?? null : input.hours;
      const overtimeHours = input.overtimeHours === undefined ? before.overtimeHours?.toString() ?? null : input.overtimeHours;
      if (decimal4Units(hours) + decimal4Units(overtimeHours) > 24n * SCALE_4) {
        throw new ValidationError({ fieldErrors: [{ field: 'hours', message: 'hours plus overtimeHours cannot exceed 24.' }] });
      }
      if (status === 'ABSENT' && (decimal4Units(hours) > 0n || decimal4Units(overtimeHours) > 0n)) {
        throw new ValidationError({ fieldErrors: [{ field: 'status', message: 'ABSENT attendance cannot contain worked hours.' }] });
      }
      const updated = await repository.updateAttendance(attendanceId, {
        ...(input.stageId === undefined ? {} : { stageId }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.hours === undefined ? {} : { hours: input.hours }),
        ...(input.overtimeHours === undefined ? {} : { overtimeHours: input.overtimeHours })
      });
      if (!updated) throw createLabourPayrollError('EMPLOYEE_NOT_ASSIGNED');
      const response = attendanceResponse(updated);
      await recordAudit(tx, { action: 'attendance.corrected', entityType: 'attendance_entry', entityId: attendanceId, projectId: updated.projectId, stageId: updated.stageId, before: attendanceResponse(before), after: response });
      return { statusCode: 200, body: response };
    });
    return result.response.body;
  }

  /** List Company Payroll Run history for authorized Payroll users. */
  async listPayrollRuns(query: ListPayrollRunsQuery) {
    await this.requireCompanyPermission(new AdministrationRepository(this.db), 'payroll.read', new Date());
    const window = pageWindow(query);
    const result = await new LabourPayrollRepository(this.db).listPayrollRuns({ skip: window.skip, take: window.take });
    return {
      items: result.items.map((item) => {
        const response = payrollRunResponse(item);
        return { id: response.id, periodStart: response.periodStart, periodEnd: response.periodEnd, status: response.status, createdBy: response.createdBy, finalizedAt: response.finalizedAt };
      }),
      total: result.total,
      page: window.page,
      pageSize: window.pageSize
    };
  }

  /** Create one DRAFT Payroll Run exactly once. */
  async createPayrollRun(input: CreatePayrollRunBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'payroll.create', idempotencyKey, fingerprintInput: input
    }, async (tx) => {
      await this.requireCompanyPermission(new AdministrationRepository(tx), 'payroll.create', new Date());
      const repository = new LabourPayrollRepository(tx);
      const periodStart = inputDate(input.periodStart);
      const periodEnd = inputDate(input.periodEnd);
      if (await repository.findOverlappingFinalizedPayrollRun(periodStart, periodEnd)) throw createLabourPayrollError('PAYROLL_NOT_READY');
      const created = await repository.createPayrollRun({ periodStart, periodEnd, status: PAYROLL_DRAFT, createdBy: requireRequestSecurityContext().actorUserId });
      const response = payrollRunResponse(created);
      await recordAudit(tx, { action: 'payroll.created', entityType: 'payroll_run', entityId: created.id, after: response });
      await recordOutboxEvent(tx, { eventType: 'payroll.created', resourceType: 'payroll_run', resourceId: created.id, payload: response });
      return { statusCode: 201, body: response };
    });
    return result.response.body;
  }

  /** Calculate server-owned Employee lines from attendance plus effective compensation. */
  private async calculateDraftLines(repository: LabourPayrollRepository, periodStart: Date, periodEnd: Date): Promise<PayrollDraftLine[]> {
    const attendance = await repository.listPayrollAttendance(periodStart, periodEnd);
    if (attendance.length === 0) throw createLabourPayrollError('PAYROLL_NOT_READY');
    const employeeIds = [...new Set(attendance.map((item) => item.employeeId))];
    const drafts: PayrollDraftLine[] = [];

    for (const employeeId of employeeIds) {
      const rows = attendance.filter((item) => item.employeeId === employeeId);
      const employmentType = rows[0]?.employee?.employmentType ?? 'LABOUR';
      const category = labourCategory(employmentType);
      const compensations = await repository.listEmployeeCompensationForPeriod(employeeId, periodStart, periodEnd);
      if (compensations.length === 0) throw createLabourPayrollError('PAYROLL_NOT_READY');
      const payTypes = new Set(rows.map((row) => compensationForDate(compensations, row.workDate)?.payType ?? 'MISSING'));
      if (payTypes.has('MISSING') || payTypes.size !== 1) throw createLabourPayrollError('PAYROLL_NOT_READY');
      const payType = [...payTypes][0];
      const allocationMap = new Map<string, { projectId: string; stageId: string | null; category: 'labour' | 'security'; cents: bigint }>();
      let grossCents = 0n;

      if (payType === 'SALARY') {
        if (!isFullCalendarMonth(periodStart, periodEnd)) throw createLabourPayrollError('PAYROLL_NOT_READY');
        const startComp = compensationForDate(compensations, periodStart);
        const endComp = compensationForDate(compensations, periodEnd);
        if (!startComp || !endComp || startComp.id !== endComp.id || startComp.payType !== 'SALARY' || !startComp.baseSalary) throw createLabourPayrollError('PAYROLL_NOT_READY');
        grossCents = moneyCents(startComp.baseSalary);
        const allocated = allocateCents(grossCents, rows);
        rows.forEach((row, index) => addAllocation(allocationMap, row, category, allocated[index] ?? 0n));
      } else if (payType === 'DAILY') {
        const byDate = new Map<string, AttendanceLike[]>();
        for (const row of rows) {
          const key = dateOnly(row.workDate);
          const group = byDate.get(key) ?? [];
          group.push(row);
          byDate.set(key, group);
        }
        for (const dayRows of byDate.values()) {
          const compensation = compensationForDate(compensations, dayRows[0]?.workDate ?? periodStart);
          if (!compensation || compensation.payType !== 'DAILY' || !compensation.baseSalary) throw createLabourPayrollError('PAYROLL_NOT_READY');
          const dayCents = moneyCents(compensation.baseSalary);
          grossCents += dayCents;
          const allocated = allocateCents(dayCents, dayRows);
          dayRows.forEach((row, index) => addAllocation(allocationMap, row, category, allocated[index] ?? 0n));
        }
      } else if (payType === 'HOURLY') {
        for (const row of rows) {
          const compensation = compensationForDate(compensations, row.workDate);
          if (!compensation || compensation.payType !== 'HOURLY' || !compensation.hourlyRate) throw createLabourPayrollError('PAYROLL_NOT_READY');
          const quantity = decimal4Units(row.hours) + decimal4Units(row.overtimeHours);
          if (quantity <= 0n) continue;
          const amount = multiplyToCents(quantity, decimal4Units(compensation.hourlyRate));
          grossCents += amount;
          addAllocation(allocationMap, row, category, amount);
        }
      } else {
        throw createLabourPayrollError('PAYROLL_NOT_READY');
      }

      if (grossCents <= 0n || allocationMap.size === 0) throw createLabourPayrollError('PAYROLL_NOT_READY');
      const grossAmount = moneyString(grossCents);
      drafts.push({
        employeeId,
        grossAmount,
        deductions: ZERO_MONEY,
        netAmount: grossAmount,
        projectAllocation: [...allocationMap.values()].map((item) => ({ projectId: item.projectId, stageId: item.stageId, category: item.category, amount: moneyString(item.cents) }))
      });
    }

    return drafts.sort((a, b) => a.employeeId.localeCompare(b.employeeId));
  }

  /** Recalculate one DRAFT/CALCULATED Payroll Run and replace its preview lines. */
  async calculatePayrollRun(payrollRunId: string, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'payroll.calculate', idempotencyKey, fingerprintInput: { payrollRunId }
    }, async (tx) => {
      await this.requireCompanyPermission(new AdministrationRepository(tx), 'payroll.calculate', new Date());
      const repository = new LabourPayrollRepository(tx);
      const locked = await repository.lockPayrollRunForWrite(payrollRunId);
      if (!locked) throw createLabourPayrollError('PAYROLL_NOT_FOUND');
      if (locked.status === PAYROLL_FINALIZED) throw createLabourPayrollError('PAYROLL_LOCKED');
      if (![PAYROLL_DRAFT, PAYROLL_CALCULATED].includes(locked.status)) throw createLabourPayrollError('PAYROLL_NOT_READY');
      const drafts = await this.calculateDraftLines(repository, locked.periodStart, locked.periodEnd);
      await repository.clearPayrollCalculation(payrollRunId);
      for (const line of drafts) {
        await repository.createPayrollLine({
          payrollRunId,
          employeeId: line.employeeId,
          grossAmount: line.grossAmount,
          deductions: line.deductions,
          netAmount: line.netAmount,
          projectAllocationJson: [...line.projectAllocation]
        });
      }
      if (locked.status === PAYROLL_DRAFT && !(await repository.updatePayrollRunStatus(payrollRunId, PAYROLL_DRAFT, PAYROLL_CALCULATED))) throw createLabourPayrollError('PAYROLL_NOT_READY');
      const snapshot = await repository.findPayrollRunById(payrollRunId);
      if (!snapshot) throw createLabourPayrollError('PAYROLL_NOT_FOUND');
      const response = payrollRunResponse(snapshot);
      await recordAudit(tx, { action: 'payroll.calculated', entityType: 'payroll_run', entityId: payrollRunId, after: { ...response, lineCount: response.lines.length } });
      await recordOutboxEvent(tx, { eventType: 'payroll.calculated', resourceType: 'payroll_run', resourceId: payrollRunId, payload: { payrollRunId, lineCount: response.lines.length } });
      return { statusCode: 200, body: response };
    });
    return result.response.body;
  }

  /** Finalize Payroll atomically with Project/Stage labour cost and Finance payable posting. */
  async finalizePayrollRun(payrollRunId: string, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'payroll.finalize', idempotencyKey, fingerprintInput: { payrollRunId }
    }, async (tx) => {
      await this.requireCompanyPermission(new AdministrationRepository(tx), 'payroll.finalize', new Date());
      const repository = new LabourPayrollRepository(tx);
      const locked = await repository.lockPayrollRunForWrite(payrollRunId);
      if (!locked) throw createLabourPayrollError('PAYROLL_NOT_FOUND');
      if (locked.status === PAYROLL_FINALIZED) {
        const existing = await repository.findPayrollRunById(payrollRunId);
        if (!existing) throw createLabourPayrollError('PAYROLL_NOT_FOUND');
        return { statusCode: 200, body: payrollRunResponse(existing) };
      }
      if (locked.status !== PAYROLL_CALCULATED) throw createLabourPayrollError('PAYROLL_NOT_READY');
      if (await repository.findOverlappingFinalizedPayrollRun(locked.periodStart, locked.periodEnd, payrollRunId)) throw createLabourPayrollError('PAYROLL_NOT_READY');

      const snapshot = await repository.findPayrollRunById(payrollRunId);
      if (!snapshot || snapshot.lines.length === 0) throw createLabourPayrollError('PAYROLL_NOT_READY');
      const recalculated = await this.calculateDraftLines(repository, locked.periodStart, locked.periodEnd);
      const persistedDrafts: PayrollDraftLine[] = snapshot.lines.map((line) => ({
        employeeId: line.employeeId,
        grossAmount: line.grossAmount.toString(),
        deductions: line.deductions.toString(),
        netAmount: line.netAmount.toString(),
        projectAllocation: allocationResponse(line.projectAllocationJson)
      }));
      if (payrollDraftFingerprint(recalculated) !== payrollDraftFingerprint(persistedDrafts)) throw createLabourPayrollError('PAYROLL_NOT_READY');

      const accounts = await repository.findPayrollPostingAccounts(LABOUR_EXPENSE_ACCOUNT_CODE, PAYROLL_PAYABLE_ACCOUNT_CODE);
      if (!accounts.expense || !accounts.payable) throw createLabourPayrollError('PAYROLL_NOT_READY');
      const postingDate = locked.periodEnd;
      let totalCents = 0n;
      const debitLines: Array<{ accountId: string; projectId: string; stageId: string | null; debit: string; credit: string; description: string }> = [];

      for (const line of snapshot.lines) {
        const allocations = allocationResponse(line.projectAllocationJson);
        for (const allocation of allocations) {
          const sourceKey = `payroll:${payrollRunId}:${line.id}:${allocation.projectId}:${allocation.stageId ?? 'project'}`;
          await repository.upsertPayrollCostActual({
            projectId: allocation.projectId,
            stageId: allocation.stageId,
            category: allocation.category,
            sourceId: line.id,
            sourceKey,
            postingDate,
            amount: allocation.amount
          });
          totalCents += moneyCents(allocation.amount);
          debitLines.push({
            accountId: accounts.expense.id,
            projectId: allocation.projectId,
            stageId: allocation.stageId,
            debit: allocation.amount,
            credit: ZERO_MONEY,
            description: `Payroll labour cost ${payrollRunId}`
          });
        }
      }
      if (totalCents <= 0n) throw createLabourPayrollError('PAYROLL_NOT_READY');

      await new FinanceService(this.db).postSourceJournalInTransaction(tx, {
        sourceType: 'payroll',
        sourceId: payrollRunId,
        sourceKey: `payroll_run:${payrollRunId}`,
        postingDate,
        description: `Payroll ${dateOnly(locked.periodStart)} to ${dateOnly(locked.periodEnd)}`,
        lines: [
          ...debitLines,
          { accountId: accounts.payable.id, projectId: null, stageId: null, debit: ZERO_MONEY, credit: moneyString(totalCents), description: `Payroll payable ${payrollRunId}` }
        ]
      });

      const finalizedAt = new Date();
      for (const line of snapshot.lines) await repository.createPayslip(line.id, finalizedAt);
      const finalized = await repository.updatePayrollRunStatus(payrollRunId, PAYROLL_CALCULATED, PAYROLL_FINALIZED, finalizedAt);
      if (!finalized) throw createLabourPayrollError('PAYROLL_NOT_READY');
      const response = payrollRunResponse(finalized);
      await recordAudit(tx, { action: 'payroll.finalized', entityType: 'payroll_run', entityId: payrollRunId, before: { status: PAYROLL_CALCULATED }, after: { status: PAYROLL_FINALIZED, finalizedAt: response.finalizedAt, financeSourceKey: `payroll_run:${payrollRunId}` } });
      await recordOutboxEvent(tx, { eventType: 'payroll.posted', resourceType: 'payroll_run', resourceId: payrollRunId, payload: { payrollRunId, amount: moneyString(totalCents), financeSourceKey: `payroll_run:${payrollRunId}` } });
      await recordOutboxEvent(tx, { eventType: 'payroll.finalized', resourceType: 'payroll_run', resourceId: payrollRunId, payload: { payrollRunId, finalizedAt: response.finalizedAt } });
      return { statusCode: 200, body: response };
    });
    return result.response.body;
  }

  /** Get one calculated/finalized Payroll Run detail. */
  async getPayrollRun(payrollRunId: string) {
    await this.requireCompanyPermission(new AdministrationRepository(this.db), 'payroll.read', new Date());
    const run = await new LabourPayrollRepository(this.db).findPayrollRunById(payrollRunId);
    if (!run) throw createLabourPayrollError('PAYROLL_NOT_FOUND');
    return payrollRunResponse(run);
  }
}
