import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';
import { LABOUR_PAYROLL_MAX_PAGE_SIZE, type AttendanceStatus } from './labour-payroll.schema.js';

type RepositoryClient = DatabaseClient | TransactionClient;
export type LabourPayrollPageWindow = Readonly<{ skip: number; take: number }>;
export type LabourPayrollProjectVisibility = Readonly<{ allowedProjectIds: readonly string[] | null }>;

/** Reject invalid pagination before a repository query reaches Prisma. */
function assertPageWindow(input: LabourPayrollPageWindow): void {
  if (!Number.isInteger(input.skip) || input.skip < 0) throw new RangeError('Repository skip must be a non-negative integer.');
  if (!Number.isInteger(input.take) || input.take < 1 || input.take > LABOUR_PAYROLL_MAX_PAGE_SIZE) {
    throw new RangeError(`Repository take must be between 1 and ${LABOUR_PAYROLL_MAX_PAGE_SIZE}.`);
  }
}

/** Build one Project visibility condition without widening trusted request scope. */
function projectVisibilityWhere(visibility: LabourPayrollProjectVisibility) {
  return visibility.allowedProjectIds === null ? {} : { projectId: { in: [...new Set(visibility.allowedProjectIds)] } };
}

/** Final Module 13 persistence for attendance, payroll lines and source postings. */
export class LabourPayrollRepository {
  /** Bind Labour/Payroll persistence to Prisma or one active transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /** List Company attendance inside the actor's allowed Project scope. */
  async listAttendance(input: Readonly<{
    projectId?: string;
    employeeId?: string;
    fromDate?: Date;
    toDate?: Date;
    visibility: LabourPayrollProjectVisibility;
  }> & LabourPayrollPageWindow) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({
      ...projectVisibilityWhere(input.visibility),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      ...(input.fromDate || input.toDate ? { workDate: { ...(input.fromDate ? { gte: input.fromDate } : {}), ...(input.toDate ? { lte: input.toDate } : {}) } } : {})
    });
    const [items, total] = await Promise.all([
      this.db.attendanceEntry.findMany({ where, orderBy: [{ workDate: 'desc' }, { employeeId: 'asc' }, { id: 'asc' }], skip: input.skip, take: input.take }),
      this.db.attendanceEntry.count({ where })
    ]);
    return { items, total };
  }

  /** Find one attendance row inside the authenticated Company. */
  async findAttendanceById(attendanceId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.attendanceEntry.findFirst({ where: scope.where({ id: attendanceId }) });
  }

  /** Find a duplicate Employee/Project/work-date attendance row. */
  async findAttendanceByNaturalKey(employeeId: string, projectId: string, workDate: Date, excludeId?: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.attendanceEntry.findFirst({
      where: scope.where({ employeeId, projectId, workDate, ...(excludeId ? { id: { not: excludeId } } : {}) })
    });
  }

  /** Find one active Project/Stage team assignment covering the attendance date. */
  async findActiveAssignment(employeeId: string, projectId: string, stageId: string | null, workDate: Date) {
    const scope = requireCompanyRepositoryScope();
    return this.db.projectTeamAssignment.findFirst({
      where: scope.where({
        employeeId,
        projectId,
        status: 'ACTIVE',
        fromDate: { lte: workDate },
        AND: [
          { OR: [{ toDate: null }, { toDate: { gte: workDate } }] },
          ...(stageId ? [{ OR: [{ stageId }, { stageId: null }] }] : [])
        ]
      }),
      orderBy: [{ stageId: 'desc' }, { fromDate: 'desc' }, { id: 'asc' }]
    });
  }

  /** Find one Stage only when it belongs to the selected Project and Company. */
  async findStage(projectId: string, stageId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.projectStage.findFirst({ where: scope.where({ id: stageId, projectId }) });
  }

  /** Create one authorized attendance row with server-owned actor identity. */
  async createAttendance(input: Readonly<{
    employeeId: string;
    projectId: string;
    stageId: string | null;
    workDate: Date;
    status: AttendanceStatus;
    hours: string | null;
    overtimeHours: string | null;
    enteredBy: string;
  }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.attendanceEntry.create({ data: scope.createData(input) });
  }

  /** Update only correctable attendance fields inside the authenticated Company. */
  async updateAttendance(attendanceId: string, input: Readonly<{
    stageId?: string | null;
    status?: AttendanceStatus;
    hours?: string | null;
    overtimeHours?: string | null;
  }>) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.attendanceEntry.updateMany({ where: scope.where({ id: attendanceId }), data: input });
    if (updated.count !== 1) return null;
    return this.findAttendanceById(attendanceId);
  }

  /** Check whether finalized Payroll already consumes this Employee/date history. */
  async isAttendanceLockedByFinalizedPayroll(employeeId: string, workDate: Date): Promise<boolean> {
    const scope = requireCompanyRepositoryScope();
    const count = await this.db.payrollLine.count({
      where: {
        employeeId,
        payrollRun: { companyId: scope.companyId, status: 'FINALIZED', periodStart: { lte: workDate }, periodEnd: { gte: workDate } }
      }
    });
    return count > 0;
  }

  /** List Company Payroll Runs with bounded deterministic pagination. */
  async listPayrollRuns(input: LabourPayrollPageWindow) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({});
    const [items, total] = await Promise.all([
      this.db.payrollRun.findMany({ where, orderBy: [{ periodStart: 'desc' }, { id: 'asc' }], skip: input.skip, take: input.take }),
      this.db.payrollRun.count({ where })
    ]);
    return { items, total };
  }

  /** Find one Payroll Run and its calculated lines/payslips inside the Company. */
  async findPayrollRunById(payrollRunId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.payrollRun.findFirst({
      where: scope.where({ id: payrollRunId }),
      include: {
        lines: {
          include: { payslip: true, employee: { select: { employeeNo: true, name: true, employmentType: true } } },
          orderBy: [{ employeeId: 'asc' }, { id: 'asc' }]
        }
      }
    });
  }

  /** Lock one Payroll Run before recalculation or finalization. */
  async lockPayrollRunForWrite(payrollRunId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{
      id: string;
      periodStart: Date;
      periodEnd: Date;
      status: string;
      createdBy: string;
      finalizedAt: Date | null;
    }>>`
      SELECT id, period_start AS "periodStart", period_end AS "periodEnd", status,
             created_by AS "createdBy", finalized_at AS "finalizedAt"
      FROM payroll_runs
      WHERE id = ${payrollRunId}::uuid AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Create one Company-owned DRAFT Payroll Run. */
  async createPayrollRun(input: Readonly<{ periodStart: Date; periodEnd: Date; status: string; createdBy: string }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.payrollRun.create({ data: scope.createData({ ...input, finalizedAt: null }) });
  }

  /** Find any other finalized Payroll Run that overlaps the candidate period. */
  async findOverlappingFinalizedPayrollRun(periodStart: Date, periodEnd: Date, excludeId?: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.payrollRun.findFirst({
      where: scope.where({
        status: 'FINALIZED',
        ...(excludeId ? { id: { not: excludeId } } : {}),
        periodStart: { lte: periodEnd },
        periodEnd: { gte: periodStart }
      })
    });
  }

  /** Delete only recalculable DRAFT/CALCULATED Payroll lines and generated draft payslips. */
  async clearPayrollCalculation(payrollRunId: string) {
    await this.db.payslip.deleteMany({ where: { payrollLine: { payrollRunId } } });
    await this.db.payrollLine.deleteMany({ where: { payrollRunId } });
  }

  /** Read PRESENT attendance inside the Payroll period with Employee identity for calculation. */
  async listPayrollAttendance(periodStart: Date, periodEnd: Date) {
    const scope = requireCompanyRepositoryScope();
    return this.db.attendanceEntry.findMany({
      where: scope.where({ workDate: { gte: periodStart, lte: periodEnd }, status: 'PRESENT' }),
      include: { employee: { select: { id: true, employmentType: true } } },
      orderBy: [{ employeeId: 'asc' }, { workDate: 'asc' }, { projectId: 'asc' }, { id: 'asc' }]
    });
  }

  /** Read all compensation periods that can affect one Employee Payroll period. */
  async listEmployeeCompensationForPeriod(employeeId: string, periodStart: Date, periodEnd: Date) {
    const scope = requireCompanyRepositoryScope();
    return this.db.employeeCompensation.findMany({
      where: scope.where({
        employeeId,
        effectiveFrom: { lte: periodEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodStart } }]
      }),
      orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }]
    });
  }

  /** Create one server-calculated Employee Payroll line. */
  async createPayrollLine(input: Readonly<{
    payrollRunId: string;
    employeeId: string;
    grossAmount: string;
    deductions: string;
    netAmount: string;
    projectAllocationJson: Array<Readonly<{
      projectId: string;
      stageId: string | null;
      category: string;
      amount: string;
    }>>;
  }>) {
    return this.db.payrollLine.create({ data: input });
  }

  /** Change one Payroll lifecycle state only when the expected status still matches. */
  async updatePayrollRunStatus(payrollRunId: string, expectedStatus: string, status: string, finalizedAt?: Date | null) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.payrollRun.updateMany({
      where: scope.where({ id: payrollRunId, status: expectedStatus }),
      data: { status, ...(finalizedAt !== undefined ? { finalizedAt } : {}) }
    });
    if (updated.count !== 1) return null;
    return this.findPayrollRunById(payrollRunId);
  }

  /** Find configured Finance posting accounts by stable Company account codes. */
  async findPayrollPostingAccounts(expenseCode: string, payableCode: string) {
    const scope = requireCompanyRepositoryScope();
    const accounts = await this.db.glAccount.findMany({
      where: scope.where({ accountCode: { in: [expenseCode, payableCode] }, status: 'ACTIVE' }),
      orderBy: [{ accountCode: 'asc' }]
    });
    return {
      expense: accounts.find((item) => item.accountCode === expenseCode) ?? null,
      payable: accounts.find((item) => item.accountCode === payableCode) ?? null
    };
  }

  /** Upsert one idempotent Payroll actual cost for Project/Stage profitability. */
  async upsertPayrollCostActual(input: Readonly<{
    projectId: string;
    stageId: string | null;
    category: 'labour' | 'security';
    sourceId: string;
    sourceKey: string;
    postingDate: Date;
    amount: string;
  }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.costActual.upsert({
      where: { companyId_sourceKey: { companyId: scope.companyId, sourceKey: input.sourceKey } },
      update: {},
      create: scope.createData({
        projectId: input.projectId,
        stageId: input.stageId,
        category: input.category,
        sourceType: 'payroll',
        sourceId: input.sourceId,
        sourceKey: input.sourceKey,
        postingDate: input.postingDate,
        amount: input.amount
      })
    });
  }

  /** Create one Payslip metadata row after successful Payroll finalization. */
  async createPayslip(payrollLineId: string, generatedAt: Date) {
    return this.db.payslip.upsert({
      where: { payrollLineId },
      update: {},
      create: { payrollLineId, documentId: null, generatedAt }
    });
  }
}
