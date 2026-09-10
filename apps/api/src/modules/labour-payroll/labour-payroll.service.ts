import { recordAudit } from '@construction-erp/audit';
import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { AuthorizationError, ValidationError } from '@construction-erp/errors';
import { executeIdempotentCommand } from '@construction-erp/idempotency';
import { allocateCompanyNumber } from '@construction-erp/numbering';
import { recordOutboxEvent } from '@construction-erp/outbox';
import { requireRequestSecurityContext } from '@construction-erp/request-context';
import { AdministrationRepository } from '../administration/administration.repository.js';
import { FinanceRepository } from '../finance/finance.repository.js';
import { FinanceService } from '../finance/finance.service.js';
import { LabourPayrollRepository, type LabourPayrollProjectVisibility } from './labour-payroll.repository.js';
import {
  createLabourPayrollError,
  type CreateAttendanceBody,
  type CreatePayrollRunBody,
  type CreatePayrollPaymentBody,
  type CreateEmployeeAdvanceBody,
  type CalculatePayrollRunBody,
  type LabourPayrollPermissionCode,
  type ListAttendanceAssignmentsQuery,
  type ListAttendanceQuery,
  type ListPayrollRunsQuery,
  type ListPayrollPaymentsQuery,
  type ListEmployeeAdvancesQuery,
  type EmployeeSalaryLedgerQuery,
  type ReverseEmployeeAdvanceBody,
  type ReversePayrollPaymentBody,
  type UpdateAttendanceBody
} from './labour-payroll.schema.js';

const ACTIVE = 'ACTIVE';
const PAYROLL_DRAFT = 'DRAFT';
const PAYROLL_CALCULATED = 'CALCULATED';
const PAYROLL_FINALIZED = 'FINALIZED';
const ZERO_MONEY = '0.00';
const LABOUR_EXPENSE_ACCOUNT_CODE = 'PAYROLL-LABOUR-EXPENSE';
const PAYROLL_PAYABLE_ACCOUNT_CODE = 'PAYROLL-PAYABLE';
const PAYROLL_PAYMENT_SEQUENCE_KEY = 'payroll-payment';
const PAYROLL_PAYMENT_SOURCE_TYPE = 'payroll_payment';
const PAYROLL_PAYMENT_REVERSAL_SOURCE_TYPE = 'payroll_payment_reversal';
const EMPLOYEE_ADVANCE_ACCOUNT_CODE = 'EMPLOYEE-SALARY-ADVANCE';
const EMPLOYEE_ADVANCE_SEQUENCE_KEY = 'employee-advance';
const EMPLOYEE_ADVANCE_SOURCE_TYPE = 'employee_advance';
const EMPLOYEE_ADVANCE_REVERSAL_SOURCE_TYPE = 'employee_advance_reversal';
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
  employee?: Readonly<{ id?: string; employeeNo?: string; name?: string; employmentType: string; joinDate?: Date }>;
  project?: Readonly<{ projectCode: string; name: string }>;
  stage?: Readonly<{ name: string }> | null;
  enteredByUser?: Readonly<{ name: string }>;
}>;
type PayrollAllocation = Readonly<{ projectId: string; stageId: string | null; category: 'labour' | 'security'; amount: string }>;
type AdvanceRecovery = Readonly<{ advanceId: string; projectId: string; stageId: string | null; amount: string }>;
type PayrollDraftLine = Readonly<{
  employeeId: string; salaryBeforeAbsence: string; absenceDeduction: string; grossAmount: string;
  advanceDeduction: string; deductions: string; netAmount: string;
  projectAllocation: readonly PayrollAllocation[]; advanceRecoveries: readonly AdvanceRecovery[];
}>;

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

/** Multiply four-decimal quantity, rate and multiplier values and half-up round to cents. */
function multiplyWithMultiplierToCents(quantityUnits: bigint, rateUnits: bigint, multiplierUnits: bigint): bigint {
  const product = quantityUnits * rateUnits * multiplierUnits;
  return (product + 5_000_000_000n) / 10_000_000_000n;
}

/** Prorate exact money cents by a calendar-period day ratio using half-up rounding. */
function prorateCents(totalCents: bigint, earnedDays: bigint, periodDays: bigint): bigint {
  if (earnedDays <= 0n || periodDays <= 0n || earnedDays > periodDays) throw createLabourPayrollError('PAYROLL_NOT_READY');
  return ((totalCents * earnedDays) + (periodDays / 2n)) / periodDays;
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
    employeeNo: row.employee?.employeeNo ?? row.employeeId,
    employeeName: row.employee?.name ?? 'Employee',
    projectId: row.projectId,
    projectCode: row.project?.projectCode ?? row.projectId,
    projectName: row.project?.name ?? 'Project',
    stageId: row.stageId,
    stageName: row.stage?.name ?? null,
    workDate: dateOnly(row.workDate),
    status: row.status,
    hours: row.hours === null ? null : row.hours.toString(),
    overtimeHours: row.overtimeHours === null ? null : row.overtimeHours.toString(),
    enteredBy: row.enteredBy,
    enteredByName: row.enteredByUser?.name ?? 'System user'
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
  overtimeMultiplier?: DecimalLike | null;
  creator?: Readonly<{ name: string }>;
  lines?: readonly Readonly<{
    id: string;
    employeeId: string;
    grossAmount: DecimalLike;
    salaryBeforeAbsence: DecimalLike;
    absenceDeduction: DecimalLike;
    advanceDeduction: DecimalLike;
    deductions: DecimalLike;
    netAmount: DecimalLike;
    projectAllocationJson: unknown;
    employee?: Readonly<{ employeeNo: string; name: string; employmentType: string }>;
    payslip?: Readonly<{ id: string; documentId: string | null; generatedAt: Date | null }> | null;
    payments?: readonly Readonly<{ amount: DecimalLike }>[];
  }>[];
}>) {
  return {
    id: run.id,
    periodStart: dateOnly(run.periodStart),
    periodEnd: dateOnly(run.periodEnd),
    status: run.status,
    createdBy: run.createdBy,
    createdByName: run.creator?.name ?? 'System user',
    finalizedAt: run.finalizedAt?.toISOString() ?? null,
    overtimeMultiplier: run.overtimeMultiplier?.toString() ?? null,
    lines: (run.lines ?? []).map((line) => {
      const net = moneyCents(line.netAmount);
      const paid = (line.payments ?? []).reduce((sum, payment) => sum + moneyCents(payment.amount), 0n);
      return {
      id: line.id,
      employeeId: line.employeeId,
      employeeNo: line.employee?.employeeNo ?? line.employeeId,
      employeeName: line.employee?.name ?? 'Employee',
      salaryBeforeAbsence: line.salaryBeforeAbsence.toString(),
      absenceDeduction: line.absenceDeduction.toString(),
      advanceDeduction: line.advanceDeduction.toString(),
      grossAmount: line.grossAmount.toString(),
      deductions: line.deductions.toString(),
      netAmount: line.netAmount.toString(),
      paidAmount: moneyString(paid),
      outstandingAmount: moneyString(net > paid ? net - paid : 0n),
      projectAllocation: allocationResponse(line.projectAllocationJson),
      payslip: line.payslip ? { id: line.payslip.id, documentId: line.payslip.documentId, generatedAt: line.payslip.generatedAt?.toISOString() ?? null } : null
      };
    })
  };
}

/** Count inclusive UTC calendar days between two date-only values. */
function inclusiveDays(start: Date, end: Date): bigint {
  return BigInt(Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

type PayrollPaymentLike = Readonly<{
  id: string;
  payrollLineId: string;
  employeeId: string;
  paymentNo: string;
  paymentDate: Date;
  amount: DecimalLike;
  cashBankAccountId: string;
  reference: string | null;
  status: string;
  reversalDate: Date | null;
  createdAt: Date;
  employee: Readonly<{ employeeNo: string; name: string }>;
  payrollLine: Readonly<{ payrollRunId: string; payrollRun: Readonly<{ periodStart: Date; periodEnd: Date }> }>;
  cashBankAccount: Readonly<{ name: string }>;
  creator: Readonly<{ name: string }>;
}>;

/** Serialize one immutable Employee salary-payment row with readable labels. */
function payrollPaymentResponse(row: PayrollPaymentLike) {
  return {
    id: row.id,
    payrollLineId: row.payrollLineId,
    payrollRunId: row.payrollLine.payrollRunId,
    employeeId: row.employeeId,
    employeeNo: row.employee.employeeNo,
    employeeName: row.employee.name,
    paymentNo: row.paymentNo,
    paymentDate: dateOnly(row.paymentDate),
    payrollPeriod: `${dateOnly(row.payrollLine.payrollRun.periodStart)} to ${dateOnly(row.payrollLine.payrollRun.periodEnd)}`,
    amount: row.amount.toString(),
    cashBankAccountId: row.cashBankAccountId,
    cashBankAccountName: row.cashBankAccount.name,
    reference: row.reference,
    status: row.status,
    reversalDate: row.reversalDate ? dateOnly(row.reversalDate) : null,
    createdByName: row.creator.name,
    createdAt: row.createdAt.toISOString()
  };
}

type EmployeeAdvanceLike = Readonly<{
  id: string; employeeId: string; projectId: string; stageId: string | null; advanceNo: string; advanceDate: Date;
  amount: DecimalLike; cashBankAccountId: string; reason: string; reference: string | null; status: string;
  reversalDate: Date | null; createdAt: Date;
  employee: Readonly<{ employeeNo: string; name: string }>;
  project: Readonly<{ projectCode: string; name: string }>;
  stage: Readonly<{ name: string }> | null;
  cashBankAccount: Readonly<{ name: string }>;
  creator: Readonly<{ name: string }>;
  recoveries: readonly Readonly<{ amount: DecimalLike }>[];
}>;

/** Serialize an advance with recovery and outstanding amounts derived from immutable sources. */
function employeeAdvanceResponse(row: EmployeeAdvanceLike) {
  const amount = moneyCents(row.amount);
  const recovered = row.recoveries.reduce((sum, recovery) => sum + moneyCents(recovery.amount), 0n);
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeNo: row.employee.employeeNo,
    employeeName: row.employee.name,
    projectId: row.projectId,
    projectCode: row.project.projectCode,
    projectName: row.project.name,
    stageId: row.stageId,
    stageName: row.stage?.name ?? null,
    advanceNo: row.advanceNo,
    advanceDate: dateOnly(row.advanceDate),
    amount: row.amount.toString(),
    recoveredAmount: moneyString(recovered),
    outstandingAmount: moneyString(row.status === 'POSTED' && amount > recovered ? amount - recovered : 0n),
    cashBankAccountId: row.cashBankAccountId,
    cashBankAccountName: row.cashBankAccount.name,
    reason: row.reason,
    reference: row.reference,
    status: row.status,
    reversalDate: row.reversalDate ? dateOnly(row.reversalDate) : null,
    createdByName: row.creator.name,
    createdAt: row.createdAt.toISOString()
  };
}

/** Compare calculated Payroll lines by stable Employee and allocation content before final posting. */
function payrollDraftFingerprint(lines: readonly PayrollDraftLine[]): string {
  return JSON.stringify([...lines]
    .map((line) => ({
      ...line,
      projectAllocation: [...line.projectAllocation].sort((a, b) => `${a.projectId}:${a.stageId ?? ''}`.localeCompare(`${b.projectId}:${b.stageId ?? ''}`)),
      advanceRecoveries: [...line.advanceRecoveries].sort((a, b) => a.advanceId.localeCompare(b.advanceId))
    }))
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

  /** Enforce Employee lifecycle, overtime authority and the cross-Project daily-hours ceiling under one Employee lock. */
  private async requireAttendanceEmployeeIntegrity(
    repository: LabourPayrollRepository,
    employeeId: string,
    workDate: Date,
    hours: DecimalLike | null | undefined,
    overtimeHours: DecimalLike | null | undefined,
    excludeAttendanceId?: string
  ): Promise<void> {
    const employee = await repository.lockEmployeeForAttendance(employeeId);
    if (!employee) throw createLabourPayrollError('EMPLOYEE_NOT_ASSIGNED');
    if (employee.status !== ACTIVE) throw createLabourPayrollError('EMPLOYEE_INACTIVE');
    if (workDate < employee.joinDate) throw createLabourPayrollError('ATTENDANCE_BEFORE_JOINING_DATE');
    if (decimal4Units(overtimeHours) > 0n) {
      const compensation = await repository.findEffectiveEmployeeCompensation(employeeId, workDate);
      if (!compensation || compensation.payType !== 'HOURLY' || !compensation.hourlyRate) {
        throw createLabourPayrollError('OVERTIME_REQUIRES_HOURLY_COMPENSATION');
      }
    }

    const existing = await repository.sumAttendanceHoursForEmployeeDate(employeeId, workDate, excludeAttendanceId);
    const totalUnits = decimal4Units(existing.hours)
      + decimal4Units(existing.overtimeHours)
      + decimal4Units(hours)
      + decimal4Units(overtimeHours);
    if (totalUnits > 24n * SCALE_4) throw createLabourPayrollError('ATTENDANCE_DAILY_HOURS_EXCEEDED');
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

  /** List only effective Project/Stage destinations the selected Employee may use for attendance. */
  async listAttendanceAssignments(query: ListAttendanceAssignmentsQuery) {
    await this.requireCompanyPermission(new AdministrationRepository(this.db), 'attendance.create', new Date());
    const assignments = await new LabourPayrollRepository(this.db).listEffectiveAttendanceAssignments(
      query.employeeId,
      inputDate(query.workDate),
      this.attendanceVisibility()
    );
    return assignments.map((assignment) => ({
      id: assignment.id,
      projectId: assignment.projectId,
      projectCode: assignment.project.projectCode,
      projectName: assignment.project.name,
      stageId: assignment.stageId,
      stageCode: assignment.stage?.code ?? null,
      stageName: assignment.stage?.name ?? null,
      fromDate: dateOnly(assignment.fromDate),
      toDate: assignment.toDate ? dateOnly(assignment.toDate) : null
    }));
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
    await this.requireAttendanceEmployeeIntegrity(repository, input.employeeId, workDate, input.hours, input.overtimeHours);
    if (await repository.findAttendanceByNaturalKey(input.employeeId, input.projectId, stageId, workDate)) throw createLabourPayrollError('ATTENDANCE_DUPLICATE');
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
      await this.requireAttendanceEmployeeIntegrity(repository, before.employeeId, before.workDate, hours, overtimeHours, attendanceId);
      if (await repository.findAttendanceByNaturalKey(before.employeeId, before.projectId, stageId, before.workDate, attendanceId)) {
        throw createLabourPayrollError('ATTENDANCE_DUPLICATE');
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
        const { lines: _lines, ...summary } = response;
        return summary;
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
  private async calculateDraftLines(repository: LabourPayrollRepository, periodStart: Date, periodEnd: Date, overtimeMultiplier: DecimalLike | null): Promise<PayrollDraftLine[]> {
    const attendance = await repository.listPayrollAttendance(periodStart, periodEnd);
    if (attendance.length === 0) throw createLabourPayrollError('PAYROLL_NO_ATTENDANCE');
    const employeeIds = [...new Set(attendance.map((item) => item.employeeId))];
    const drafts: PayrollDraftLine[] = [];

    for (const employeeId of employeeIds) {
      const rows = attendance.filter((item) => item.employeeId === employeeId);
      const presentRows = rows.filter((item) => item.status === 'PRESENT');
      const employmentType = rows[0]?.employee?.employmentType ?? 'LABOUR';
      const category = labourCategory(employmentType);
      const compensations = await repository.listEmployeeCompensationForPeriod(employeeId, periodStart, periodEnd);
      if (compensations.length === 0) throw createLabourPayrollError('PAYROLL_COMPENSATION_MISSING');
      const payTypes = new Set(rows.map((row) => compensationForDate(compensations, row.workDate)?.payType ?? 'MISSING'));
      if (payTypes.has('MISSING') || payTypes.size !== 1) throw createLabourPayrollError('PAYROLL_COMPENSATION_MISSING');
      const payType = [...payTypes][0];
      if (payType !== 'HOURLY' && rows.some((row) => decimal4Units(row.overtimeHours) > 0n)) {
        throw createLabourPayrollError('OVERTIME_REQUIRES_HOURLY_COMPENSATION');
      }
      const allocationMap = new Map<string, { projectId: string; stageId: string | null; category: 'labour' | 'security'; cents: bigint }>();
      let grossCents = 0n;
      let salaryBeforeAbsenceCents = 0n;
      let absenceDeductionCents = 0n;

      if (payType === 'SALARY') {
        if (!isFullCalendarMonth(periodStart, periodEnd)) throw createLabourPayrollError('PAYROLL_SALARY_PERIOD_INVALID');
        const salaryCompensations = rows.map((row) => compensationForDate(compensations, row.workDate));
        const salaryCompensation = salaryCompensations[0] ?? null;
        if (!salaryCompensation
          || salaryCompensation.payType !== 'SALARY'
          || !salaryCompensation.baseSalary
          || salaryCompensations.some((compensation) => compensation?.id !== salaryCompensation.id)) {
          throw createLabourPayrollError('PAYROLL_COMPENSATION_MISSING');
        }
        const presentDates = new Set(rows.filter((item) => item.status === 'PRESENT').map((item) => dateOnly(item.workDate)));
        if (presentDates.size === 0) continue;
        const periodDays = BigInt(periodEnd.getUTCDate());
        const eligibleStart = rows[0]?.employee?.joinDate && rows[0].employee.joinDate > periodStart
          ? rows[0].employee.joinDate
          : periodStart;
        const compensationEnd = salaryCompensation.effectiveTo && salaryCompensation.effectiveTo < periodEnd
          ? salaryCompensation.effectiveTo
          : periodEnd;
        const eligibleDays = inclusiveDays(eligibleStart, compensationEnd);
        salaryBeforeAbsenceCents = prorateCents(moneyCents(salaryCompensation.baseSalary), eligibleDays, periodDays);
        grossCents = prorateCents(moneyCents(salaryCompensation.baseSalary), BigInt(presentDates.size), periodDays);
        absenceDeductionCents = salaryBeforeAbsenceCents > grossCents ? salaryBeforeAbsenceCents - grossCents : 0n;
        const allocated = allocateCents(grossCents, presentRows);
        presentRows.forEach((row, index) => addAllocation(allocationMap, row, category, allocated[index] ?? 0n));
      } else if (payType === 'DAILY') {
        const byDate = new Map<string, AttendanceLike[]>();
        for (const row of presentRows) {
          const key = dateOnly(row.workDate);
          const group = byDate.get(key) ?? [];
          group.push(row);
          byDate.set(key, group);
        }
        for (const dayRows of byDate.values()) {
          const compensation = compensationForDate(compensations, dayRows[0]?.workDate ?? periodStart);
          if (!compensation || compensation.payType !== 'DAILY' || !compensation.baseSalary) throw createLabourPayrollError('PAYROLL_COMPENSATION_MISSING');
          const dayCents = moneyCents(compensation.baseSalary);
          grossCents += dayCents;
          const allocated = allocateCents(dayCents, dayRows);
          dayRows.forEach((row, index) => addAllocation(allocationMap, row, category, allocated[index] ?? 0n));
        }
      } else if (payType === 'HOURLY') {
        for (const row of presentRows) {
          const compensation = compensationForDate(compensations, row.workDate);
          if (!compensation || compensation.payType !== 'HOURLY' || !compensation.hourlyRate) throw createLabourPayrollError('PAYROLL_COMPENSATION_MISSING');
          const regularHours = decimal4Units(row.hours);
          const overtimeHours = decimal4Units(row.overtimeHours);
          if (regularHours <= 0n && overtimeHours <= 0n) continue;
          const rate = decimal4Units(compensation.hourlyRate);
          const regularAmount = multiplyToCents(regularHours, rate);
          if (overtimeHours > 0n && !overtimeMultiplier) throw createLabourPayrollError('OVERTIME_MULTIPLIER_REQUIRED');
          const overtimeAmount = overtimeHours > 0n
            ? multiplyWithMultiplierToCents(overtimeHours, rate, decimal4Units(overtimeMultiplier))
            : 0n;
          const amount = regularAmount + overtimeAmount;
          grossCents += amount;
          addAllocation(allocationMap, row, category, amount);
        }
      } else {
        throw createLabourPayrollError('PAYROLL_COMPENSATION_MISSING');
      }

      if (grossCents <= 0n || allocationMap.size === 0) throw createLabourPayrollError('PAYROLL_NO_EARNINGS');
      if (salaryBeforeAbsenceCents === 0n) salaryBeforeAbsenceCents = grossCents;
      let remainingRecoverable = grossCents;
      const advanceRecoveries: AdvanceRecovery[] = [];
      for (const advance of await repository.listRecoverableEmployeeAdvances(employeeId, periodEnd)) {
        const recovered = advance.recoveries.reduce((sum, item) => sum + moneyCents(item.amount), 0n);
        const outstanding = moneyCents(advance.amount) - recovered;
        if (outstanding <= 0n || remainingRecoverable <= 0n) continue;
        const recovery = outstanding < remainingRecoverable ? outstanding : remainingRecoverable;
        advanceRecoveries.push({ advanceId: advance.id, projectId: advance.projectId, stageId: advance.stageId, amount: moneyString(recovery) });
        remainingRecoverable -= recovery;
      }
      const advanceDeductionCents = grossCents - remainingRecoverable;
      const grossAmount = moneyString(grossCents);
      drafts.push({
        employeeId,
        salaryBeforeAbsence: moneyString(salaryBeforeAbsenceCents),
        absenceDeduction: moneyString(absenceDeductionCents),
        grossAmount,
        advanceDeduction: moneyString(advanceDeductionCents),
        deductions: moneyString(advanceDeductionCents),
        netAmount: moneyString(remainingRecoverable),
        projectAllocation: [...allocationMap.values()].map((item) => ({ projectId: item.projectId, stageId: item.stageId, category: item.category, amount: moneyString(item.cents) })),
        advanceRecoveries
      });
    }

    return drafts.sort((a, b) => a.employeeId.localeCompare(b.employeeId));
  }

  /** Recalculate one DRAFT/CALCULATED Payroll Run and replace its preview lines. */
  async calculatePayrollRun(payrollRunId: string, input: CalculatePayrollRunBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'payroll.calculate', idempotencyKey, fingerprintInput: { payrollRunId, input }
    }, async (tx) => {
      await this.requireCompanyPermission(new AdministrationRepository(tx), 'payroll.calculate', new Date());
      const repository = new LabourPayrollRepository(tx);
      const locked = await repository.lockPayrollRunForWrite(payrollRunId);
      if (!locked) throw createLabourPayrollError('PAYROLL_NOT_FOUND');
      if (locked.status === PAYROLL_FINALIZED) throw createLabourPayrollError('PAYROLL_LOCKED');
      if (![PAYROLL_DRAFT, PAYROLL_CALCULATED].includes(locked.status)) throw createLabourPayrollError('PAYROLL_NOT_READY');
      const overtimeMultiplier = input.overtimeMultiplier ?? locked.overtimeMultiplier?.toString() ?? null;
      if (input.overtimeMultiplier && input.overtimeMultiplier !== locked.overtimeMultiplier?.toString()) {
        if (!(await repository.updatePayrollRunOvertimeMultiplier(payrollRunId, input.overtimeMultiplier))) throw createLabourPayrollError('PAYROLL_NOT_READY');
      }
      const drafts = await this.calculateDraftLines(repository, locked.periodStart, locked.periodEnd, overtimeMultiplier);
      await repository.clearPayrollCalculation(payrollRunId);
      for (const line of drafts) {
        await repository.createPayrollLine({
          payrollRunId,
          employeeId: line.employeeId,
          salaryBeforeAbsence: line.salaryBeforeAbsence,
          absenceDeduction: line.absenceDeduction,
          advanceDeduction: line.advanceDeduction,
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

  /** Finalize Payroll atomically with Project/Stage Employee Salary cost and Finance payable posting. */
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
      if (inputDate(dateOnly(new Date())) < locked.periodEnd) throw createLabourPayrollError('PAYROLL_PERIOD_OPEN');
      if (await repository.findOverlappingFinalizedPayrollRun(locked.periodStart, locked.periodEnd, payrollRunId)) throw createLabourPayrollError('PAYROLL_NOT_READY');

      const snapshot = await repository.findPayrollRunById(payrollRunId);
      if (!snapshot || snapshot.lines.length === 0) throw createLabourPayrollError('PAYROLL_NOT_READY');
      const recalculated = await this.calculateDraftLines(repository, locked.periodStart, locked.periodEnd, locked.overtimeMultiplier);
      const persistedDrafts: PayrollDraftLine[] = snapshot.lines.map((line) => ({
        employeeId: line.employeeId,
        salaryBeforeAbsence: line.salaryBeforeAbsence.toString(),
        absenceDeduction: line.absenceDeduction.toString(),
        advanceDeduction: line.advanceDeduction.toString(),
        grossAmount: line.grossAmount.toString(),
        deductions: line.deductions.toString(),
        netAmount: line.netAmount.toString(),
        projectAllocation: allocationResponse(line.projectAllocationJson),
        advanceRecoveries: recalculated.find((item) => item.employeeId === line.employeeId)?.advanceRecoveries ?? []
      }));
      if (payrollDraftFingerprint(recalculated) !== payrollDraftFingerprint(persistedDrafts)) throw createLabourPayrollError('PAYROLL_NOT_READY');

      await repository.ensurePayrollPostingSetup();
      const accounts = await repository.findPayrollPostingAccounts(LABOUR_EXPENSE_ACCOUNT_CODE, PAYROLL_PAYABLE_ACCOUNT_CODE);
      const advanceAccount = await repository.findEmployeeAdvanceAccount(EMPLOYEE_ADVANCE_ACCOUNT_CODE);
      if (!accounts.expense || accounts.expense.accountType !== 'EXPENSE'
        || !accounts.payable || accounts.payable.accountType !== 'LIABILITY'
        || !advanceAccount || advanceAccount.accountType !== 'ASSET') throw createLabourPayrollError('PAYROLL_POSTING_SETUP_INVALID');
      const postingDate = locked.periodEnd;
      let totalCents = 0n;
      let totalAdvanceRecoveryCents = 0n;
      const debitLines: Array<{ accountId: string; projectId: string; stageId: string | null; debit: string; credit: string; description: string }> = [];
      const advanceCreditLines: Array<{ accountId: string; projectId: string; stageId: string | null; debit: string; credit: string; description: string }> = [];

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
            description: `Employee Salary cost ${payrollRunId}`
          });
        }
        const draft = recalculated.find((item) => item.employeeId === line.employeeId);
        if (!draft) throw createLabourPayrollError('PAYROLL_NOT_READY');
        for (const recovery of draft.advanceRecoveries) {
          await repository.createAdvanceRecovery({ payrollLineId: line.id, employeeAdvanceId: recovery.advanceId, amount: recovery.amount });
          totalAdvanceRecoveryCents += moneyCents(recovery.amount);
          advanceCreditLines.push({
            accountId: advanceAccount.id,
            projectId: recovery.projectId,
            stageId: recovery.stageId,
            debit: ZERO_MONEY,
            credit: recovery.amount,
            description: `Employee advance recovered in Payroll ${payrollRunId}`
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
          ...advanceCreditLines,
          ...(totalCents > totalAdvanceRecoveryCents
            ? [{ accountId: accounts.payable.id, projectId: null, stageId: null, debit: ZERO_MONEY, credit: moneyString(totalCents - totalAdvanceRecoveryCents), description: `Payroll payable ${payrollRunId}` }]
            : [])
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

  /** List active Cash/Bank accounts for an authorized Employee salary-payment selector. */
  async listPayrollCashBankAccounts() {
    const security = requireRequestSecurityContext();
    const admin = new AdministrationRepository(this.db);
    const asOf = new Date();
    if (security.projectScope.kind === 'not-resolved'
      || (!(await this.hasCompanyPermission(admin, 'payroll.payments.create', asOf))
        && !(await this.hasCompanyPermission(admin, 'payroll.advances.create', asOf)))) throw new AuthorizationError();
    const result = await new FinanceRepository(this.db).listCashBankAccounts({
      skip: 0,
      take: 100,
      status: ACTIVE,
      journalStatuses: ['POSTED', 'REVERSED']
    });
    return result.items
      .filter((account) => account.accountType === 'CASH' || account.accountType === 'BANK')
      .map((account) => ({
        id: account.id,
        code: account.code,
        name: account.name,
        accountType: account.accountType as 'CASH' | 'BANK',
        accountNumber: account.accountReference,
        balance: account.balance
      }));
  }

  /** List bounded salary-payment history without changing Payroll or Finance state. */
  async listPayrollPayments(query: ListPayrollPaymentsQuery) {
    await this.requireCompanyPermission(new AdministrationRepository(this.db), 'payroll.read', new Date());
    const window = pageWindow(query);
    const result = await new LabourPayrollRepository(this.db).listPayrollPayments({
      skip: window.skip,
      take: window.take,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.payrollRunId ? { payrollRunId: query.payrollRunId } : {}),
      ...(query.status ? { status: query.status } : {})
    });
    return { items: result.items.map((row) => payrollPaymentResponse(row)), total: result.total, page: window.page, pageSize: window.pageSize };
  }

  /** List Employee advances with recovered and outstanding balances. */
  async listEmployeeAdvances(query: ListEmployeeAdvancesQuery) {
    await this.requireCompanyPermission(new AdministrationRepository(this.db), 'payroll.read', new Date());
    const security = requireRequestSecurityContext();
    if (query.projectId && security.projectScope.kind === 'restricted' && !security.projectScope.projectIds.includes(query.projectId)) throw new AuthorizationError();
    const window = pageWindow(query);
    const result = await new LabourPayrollRepository(this.db).listEmployeeAdvances({
      skip: window.skip,
      take: window.take,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(!query.projectId && security.projectScope.kind === 'restricted' ? { projectIds: security.projectScope.projectIds } : {}),
      ...(query.status ? { status: query.status } : {})
    });
    return { items: result.items.map(employeeAdvanceResponse), total: result.total, page: window.page, pageSize: window.pageSize };
  }

  /** Pay one Employee advance immediately from Cash/Bank and record it as an asset, not Project cost. */
  async createEmployeeAdvance(input: CreateEmployeeAdvanceBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'payroll.advances.create', idempotencyKey, fingerprintInput: input
    }, async (tx) => {
      const admin = new AdministrationRepository(tx);
      await this.requireProjectPermission(admin, input.projectId, 'payroll.advances.create', new Date());
      const repository = new LabourPayrollRepository(tx);
      const advanceDate = inputDate(input.advanceDate);
      if (!(await repository.findEmployeeAdvanceDestination(input.employeeId, input.projectId, input.stageId ?? null, advanceDate))) {
        throw createLabourPayrollError('EMPLOYEE_ADVANCE_INVALID');
      }
      const cashBank = await repository.findPayrollCashBankAccount(input.cashBankAccountId);
      if (!cashBank || cashBank.status !== ACTIVE || !['CASH', 'BANK'].includes(cashBank.accountType)
        || cashBank.glAccount.status !== ACTIVE || cashBank.glAccount.accountType !== cashBank.accountType) {
        throw createLabourPayrollError('PAYROLL_CASH_BANK_INVALID');
      }
      await repository.ensurePayrollPostingSetup();
      await repository.ensureEmployeeAdvanceSequence();
      const advanceAccount = await repository.findEmployeeAdvanceAccount(EMPLOYEE_ADVANCE_ACCOUNT_CODE);
      if (!advanceAccount || advanceAccount.accountType !== 'ASSET') throw createLabourPayrollError('PAYROLL_POSTING_SETUP_INVALID');
      const advanceNo = (await allocateCompanyNumber(tx, { sequenceKey: EMPLOYEE_ADVANCE_SEQUENCE_KEY })).formatted;
      const created = await repository.createEmployeeAdvance({
        employeeId: input.employeeId,
        projectId: input.projectId,
        stageId: input.stageId ?? null,
        advanceNo,
        advanceDate,
        amount: input.amount,
        cashBankAccountId: input.cashBankAccountId,
        reason: input.reason,
        reference: input.reference ?? null,
        createdBy: requireRequestSecurityContext().actorUserId
      });
      await new FinanceService(this.db).postSourceJournalInTransaction(tx, {
        sourceType: EMPLOYEE_ADVANCE_SOURCE_TYPE,
        sourceId: created.id,
        sourceKey: `employee_advance:${created.id}`,
        postingDate: advanceDate,
        description: `Employee salary advance ${advanceNo}`,
        lines: [
          { accountId: advanceAccount.id, projectId: input.projectId, stageId: input.stageId ?? null, debit: input.amount, credit: ZERO_MONEY, description: `Employee advance ${advanceNo}` },
          { accountId: cashBank.glAccount.id, projectId: input.projectId, stageId: input.stageId ?? null, debit: ZERO_MONEY, credit: input.amount, description: `Cash/Bank advance ${advanceNo}` }
        ]
      });
      const response = employeeAdvanceResponse(created);
      await recordAudit(tx, { action: 'payroll.advance_posted', entityType: 'employee_advance', entityId: created.id, after: response });
      await recordOutboxEvent(tx, { eventType: 'payroll.advance_posted', resourceType: 'employee_advance', resourceId: created.id, payload: response });
      return { statusCode: 201, body: response };
    });
    return result.response.body;
  }

  /** Reverse one unrecovered Employee advance with a compensating Finance journal. */
  async reverseEmployeeAdvance(advanceId: string, input: ReverseEmployeeAdvanceBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'payroll.advances.reverse', idempotencyKey, fingerprintInput: { advanceId, input }
    }, async (tx) => {
      await this.requireCompanyPermission(new AdministrationRepository(tx), 'payroll.advances.reverse', new Date());
      const repository = new LabourPayrollRepository(tx);
      const advance = await repository.lockEmployeeAdvance(advanceId);
      if (!advance || advance.status !== 'POSTED') throw createLabourPayrollError('EMPLOYEE_ADVANCE_INVALID');
      if (advance.recoveries.length > 0) throw createLabourPayrollError('EMPLOYEE_ADVANCE_ALREADY_RECOVERED');
      const reversalDate = inputDate(input.reversalDate);
      if (reversalDate < advance.advanceDate) {
        throw new ValidationError({ fieldErrors: [{ field: 'reversalDate', message: 'Reversal date cannot precede the advance date.' }] });
      }
      await new FinanceService(this.db).postSourceReversalInTransaction(tx, {
        originalSourceType: EMPLOYEE_ADVANCE_SOURCE_TYPE,
        originalSourceId: advance.id,
        originalSourceKey: `employee_advance:${advance.id}`,
        reversalSourceType: EMPLOYEE_ADVANCE_REVERSAL_SOURCE_TYPE,
        reversalSourceId: advance.id,
        reversalSourceKey: `employee_advance_reversal:${advance.id}`,
        postingDate: reversalDate,
        description: `Reverse Employee advance ${advance.advanceNo}`,
        lineDescription: `Employee advance ${advance.advanceNo} reversal`
      });
      const reversed = await repository.markEmployeeAdvanceReversed(advance.id, reversalDate, new Date());
      if (!reversed) throw createLabourPayrollError('EMPLOYEE_ADVANCE_INVALID');
      const response = employeeAdvanceResponse(reversed);
      await recordAudit(tx, { action: 'payroll.advance_reversed', entityType: 'employee_advance', entityId: advance.id, before: { status: 'POSTED' }, after: response });
      await recordOutboxEvent(tx, { eventType: 'payroll.advance_reversed', resourceType: 'employee_advance', resourceId: advance.id, payload: response });
      return { statusCode: 200, body: response };
    });
    return result.response.body;
  }

  /** Create and post one partial or full Employee salary payment atomically. */
  async createPayrollPayment(input: CreatePayrollPaymentBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'payroll.payments.create', idempotencyKey, fingerprintInput: input
    }, async (tx) => {
      await this.requireCompanyPermission(new AdministrationRepository(tx), 'payroll.payments.create', new Date());
      const repository = new LabourPayrollRepository(tx);
      const line = await repository.lockFinalizedPayrollLine(input.payrollLineId);
      if (!line) throw createLabourPayrollError('PAYROLL_PAYMENT_INVALID');
      const paymentDate = inputDate(input.paymentDate);
      if (paymentDate < line.periodEnd) {
        throw new ValidationError({ fieldErrors: [{ field: 'paymentDate', message: 'Payment date cannot precede the finalized Payroll period end.' }] });
      }
      const totals = await repository.sumPostedPayrollPayments(line.id);
      const paid = moneyCents(totals._sum.amount ?? ZERO_MONEY);
      const net = moneyCents(line.netAmount);
      const amount = moneyCents(input.amount);
      if (amount <= 0n || paid + amount > net) throw createLabourPayrollError('PAYROLL_PAYMENT_EXCEEDS_OUTSTANDING');

      const cashBank = await repository.findPayrollCashBankAccount(input.cashBankAccountId);
      if (!cashBank
        || cashBank.status !== ACTIVE
        || !['CASH', 'BANK'].includes(cashBank.accountType)
        || cashBank.glAccount.status !== ACTIVE
        || cashBank.glAccount.accountType !== cashBank.accountType) {
        throw createLabourPayrollError('PAYROLL_CASH_BANK_INVALID');
      }
      await repository.ensurePayrollPostingSetup();
      await repository.ensurePayrollPaymentSequence();
      const accounts = await repository.findPayrollPostingAccounts(LABOUR_EXPENSE_ACCOUNT_CODE, PAYROLL_PAYABLE_ACCOUNT_CODE);
      if (!accounts.payable || accounts.payable.accountType !== 'LIABILITY') throw createLabourPayrollError('PAYROLL_NOT_READY');
      const paymentNo = (await allocateCompanyNumber(tx, { sequenceKey: PAYROLL_PAYMENT_SEQUENCE_KEY })).formatted;
      const created = await repository.createPayrollPayment({
        payrollLineId: line.id,
        employeeId: line.employeeId,
        paymentNo,
        paymentDate,
        amount: input.amount,
        cashBankAccountId: input.cashBankAccountId,
        reference: input.reference ?? null,
        createdBy: requireRequestSecurityContext().actorUserId
      });
      await new FinanceService(this.db).postSourceJournalInTransaction(tx, {
        sourceType: PAYROLL_PAYMENT_SOURCE_TYPE,
        sourceId: created.id,
        sourceKey: `payroll_payment:${created.id}`,
        postingDate: paymentDate,
        description: `Employee salary payment ${paymentNo}`,
        lines: [
          { accountId: accounts.payable.id, projectId: null, stageId: null, debit: input.amount, credit: ZERO_MONEY, description: `Payroll payable settlement ${paymentNo}` },
          { accountId: cashBank.glAccount.id, projectId: null, stageId: null, debit: ZERO_MONEY, credit: input.amount, description: `Cash/Bank salary payment ${paymentNo}` }
        ]
      });
      const response = payrollPaymentResponse(created);
      await recordAudit(tx, { action: 'payroll.payment_posted', entityType: 'payroll_payment', entityId: created.id, after: response });
      await recordOutboxEvent(tx, { eventType: 'payroll.payment_posted', resourceType: 'payroll_payment', resourceId: created.id, payload: response });
      return { statusCode: 201, body: response };
    });
    return result.response.body;
  }

  /** Reverse one posted salary payment with a compensating Journal while preserving its history. */
  async reversePayrollPayment(paymentId: string, input: ReversePayrollPaymentBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'payroll.payments.reverse', idempotencyKey, fingerprintInput: { paymentId, input }
    }, async (tx) => {
      await this.requireCompanyPermission(new AdministrationRepository(tx), 'payroll.payments.reverse', new Date());
      const repository = new LabourPayrollRepository(tx);
      const payment = await repository.lockPayrollPayment(paymentId);
      if (!payment || payment.status !== 'POSTED') throw createLabourPayrollError('PAYROLL_PAYMENT_INVALID');
      const reversalDate = inputDate(input.reversalDate);
      if (reversalDate < payment.paymentDate) {
        throw new ValidationError({ fieldErrors: [{ field: 'reversalDate', message: 'Reversal date cannot precede the original payment date.' }] });
      }
      await new FinanceService(this.db).postSourceReversalInTransaction(tx, {
        originalSourceType: PAYROLL_PAYMENT_SOURCE_TYPE,
        originalSourceId: payment.id,
        originalSourceKey: `payroll_payment:${payment.id}`,
        reversalSourceType: PAYROLL_PAYMENT_REVERSAL_SOURCE_TYPE,
        reversalSourceId: payment.id,
        reversalSourceKey: `payroll_payment_reversal:${payment.id}`,
        postingDate: reversalDate,
        description: `Reverse Employee salary payment ${payment.paymentNo}`,
        lineDescription: `Salary payment ${payment.paymentNo} reversal`
      });
      const reversed = await repository.markPayrollPaymentReversed(payment.id, reversalDate, new Date());
      if (!reversed) throw createLabourPayrollError('PAYROLL_PAYMENT_INVALID');
      const response = payrollPaymentResponse(reversed);
      await recordAudit(tx, { action: 'payroll.payment_reversed', entityType: 'payroll_payment', entityId: payment.id, before: { status: 'POSTED' }, after: response });
      await recordOutboxEvent(tx, { eventType: 'payroll.payment_reversed', resourceType: 'payroll_payment', resourceId: payment.id, payload: response });
      return { statusCode: 200, body: response };
    });
    return result.response.body;
  }

  /** Build one Employee salary ledger from finalized Payroll and immutable payment history. */
  async getEmployeeSalaryLedger(employeeId: string, query: EmployeeSalaryLedgerQuery = {}) {
    await this.requireCompanyPermission(new AdministrationRepository(this.db), 'payroll.read', new Date());
    const sources = await new LabourPayrollRepository(this.db).getEmployeeSalaryLedgerSources(employeeId, query.projectId);
    if (!sources) throw createLabourPayrollError('PAYROLL_PAYMENT_INVALID');
    const projectNames = new Map(sources.projects.map((project) => [project.id, project.name]));
    const entries: Array<{
      id: string; entryDate: string; entryType: 'SALARY_DUE' | 'PAYMENT' | 'PAYMENT_REVERSAL' | 'ADVANCE' | 'ADVANCE_REVERSAL' | 'ADVANCE_RECOVERY'; reference: string;
      debit: string; credit: string; balance: string; projectId: string | null; projectName: string | null; stageName: string | null;
      payrollRunId: string | null; payrollLineId: string | null; advanceId: string | null; paymentId: string | null; sortOrder: number;
    }> = [];
    let totalSalary = 0n;
    let totalPaid = 0n;
    let totalAdvances = 0n;
    let totalAdvanceRecovered = 0n;
    for (const line of sources.lines) {
      const allocations = allocationResponse(line.projectAllocationJson);
      const visibleAllocations = query.projectId ? allocations.filter((allocation) => allocation.projectId === query.projectId) : allocations;
      const salaryCents = visibleAllocations.reduce((sum, allocation) => sum + moneyCents(allocation.amount), 0n);
      totalSalary += salaryCents;
      const primaryProjectId = visibleAllocations[0]?.projectId ?? null;
      entries.push({ id: `salary:${line.id}`, entryDate: dateOnly(line.payrollRun.periodEnd), entryType: 'SALARY_DUE', reference: `Payroll ${dateOnly(line.payrollRun.periodStart)} to ${dateOnly(line.payrollRun.periodEnd)}`, debit: moneyString(salaryCents), credit: ZERO_MONEY, balance: ZERO_MONEY, projectId: primaryProjectId, projectName: primaryProjectId ? projectNames.get(primaryProjectId) ?? 'Project' : null, stageName: null, payrollRunId: line.payrollRun.id, payrollLineId: line.id, advanceId: null, paymentId: null, sortOrder: 0 });
      for (const payment of line.payments) {
        entries.push({ id: `payment:${payment.id}`, entryDate: dateOnly(payment.paymentDate), entryType: 'PAYMENT', reference: payment.paymentNo, debit: ZERO_MONEY, credit: payment.amount.toString(), balance: ZERO_MONEY, projectId: primaryProjectId, projectName: primaryProjectId ? projectNames.get(primaryProjectId) ?? 'Project' : null, stageName: null, payrollRunId: line.payrollRun.id, payrollLineId: line.id, advanceId: null, paymentId: payment.id, sortOrder: 2 });
        if (payment.status === 'POSTED') totalPaid += moneyCents(payment.amount);
        if (payment.status === 'REVERSED' && payment.reversalDate) {
          entries.push({ id: `reversal:${payment.id}`, entryDate: dateOnly(payment.reversalDate), entryType: 'PAYMENT_REVERSAL', reference: `${payment.paymentNo} reversed`, debit: payment.amount.toString(), credit: ZERO_MONEY, balance: ZERO_MONEY, projectId: primaryProjectId, projectName: primaryProjectId ? projectNames.get(primaryProjectId) ?? 'Project' : null, stageName: null, payrollRunId: line.payrollRun.id, payrollLineId: line.id, advanceId: null, paymentId: payment.id, sortOrder: 3 });
        }
      }
      for (const recovery of line.advanceRecoveries) {
        if (query.projectId && recovery.employeeAdvance.projectId !== query.projectId) continue;
        totalAdvanceRecovered += moneyCents(recovery.amount);
        entries.push({ id: `recovery:${recovery.id}`, entryDate: dateOnly(line.payrollRun.periodEnd), entryType: 'ADVANCE_RECOVERY', reference: `${recovery.employeeAdvance.advanceNo} recovered in Payroll`, debit: ZERO_MONEY, credit: ZERO_MONEY, balance: ZERO_MONEY, projectId: recovery.employeeAdvance.projectId, projectName: recovery.employeeAdvance.project.name, stageName: recovery.employeeAdvance.stage?.name ?? null, payrollRunId: line.payrollRun.id, payrollLineId: line.id, advanceId: recovery.employeeAdvanceId, paymentId: null, sortOrder: 1 });
      }
    }
    for (const advance of sources.advances) {
      if (advance.status === 'POSTED') totalAdvances += moneyCents(advance.amount);
      entries.push({ id: `advance:${advance.id}`, entryDate: dateOnly(advance.advanceDate), entryType: 'ADVANCE', reference: `${advance.advanceNo} · ${advance.reason}`, debit: ZERO_MONEY, credit: advance.amount.toString(), balance: ZERO_MONEY, projectId: advance.projectId, projectName: advance.project.name, stageName: advance.stage?.name ?? null, payrollRunId: null, payrollLineId: null, advanceId: advance.id, paymentId: null, sortOrder: 0 });
      if (advance.status === 'REVERSED' && advance.reversalDate) {
        entries.push({ id: `advance-reversal:${advance.id}`, entryDate: dateOnly(advance.reversalDate), entryType: 'ADVANCE_REVERSAL', reference: `${advance.advanceNo} reversed`, debit: advance.amount.toString(), credit: ZERO_MONEY, balance: ZERO_MONEY, projectId: advance.projectId, projectName: advance.project.name, stageName: advance.stage?.name ?? null, payrollRunId: null, payrollLineId: null, advanceId: advance.id, paymentId: null, sortOrder: 4 });
      }
    }
    entries.sort((left, right) => left.entryDate.localeCompare(right.entryDate) || left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
    let balance = 0n;
    const ledgerEntries = entries.map(({ sortOrder: _sortOrder, ...entry }) => {
      balance += moneyCents(entry.debit) - moneyCents(entry.credit);
      return { ...entry, balance: moneyString(balance) };
    });
    return {
      employee: sources.employee,
      totalSalary: moneyString(totalSalary),
      totalPaid: moneyString(totalPaid),
      totalAdvances: moneyString(totalAdvances),
      totalAdvanceRecovered: moneyString(totalAdvanceRecovered),
      advanceOutstanding: moneyString(totalAdvances > totalAdvanceRecovered ? totalAdvances - totalAdvanceRecovered : 0n),
      outstanding: moneyString(balance > 0n ? balance : 0n),
      entries: ledgerEntries
    };
  }
}
