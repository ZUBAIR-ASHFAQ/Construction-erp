import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';
import { LABOUR_PAYROLL_MAX_PAGE_SIZE, type AttendanceStatus } from './labour-payroll.schema.js';

type RepositoryClient = DatabaseClient | TransactionClient;
export type LabourPayrollPageWindow = Readonly<{ skip: number; take: number }>;
export type LabourPayrollProjectVisibility = Readonly<{ allowedProjectIds: readonly string[] | null }>;

const attendanceInclude = {
  employee: { select: { employeeNo: true, name: true, employmentType: true } },
  project: { select: { projectCode: true, name: true } },
  stage: { select: { name: true } },
  enteredByUser: { select: { name: true } }
} as const;

const payrollPaymentInclude = {
  employee: { select: { employeeNo: true, name: true } },
  payrollLine: { select: { payrollRunId: true, payrollRun: { select: { periodStart: true, periodEnd: true } } } },
  cashBankAccount: { select: { name: true, code: true, accountType: true, accountReference: true, glAccountId: true, status: true } },
  creator: { select: { name: true } }
} as const;

const employeeAdvanceInclude = {
  employee: { select: { employeeNo: true, name: true } },
  project: { select: { projectCode: true, name: true } },
  stage: { select: { name: true } },
  cashBankAccount: { select: { name: true, glAccountId: true, status: true, accountType: true } },
  creator: { select: { name: true } },
  recoveries: { select: { amount: true, payrollLineId: true }, orderBy: { createdAt: 'asc' as const } }
} as const;

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
      this.db.attendanceEntry.findMany({ where, include: attendanceInclude, orderBy: [{ workDate: 'desc' }, { employeeId: 'asc' }, { id: 'asc' }], skip: input.skip, take: input.take }),
      this.db.attendanceEntry.count({ where })
    ]);
    return { items, total };
  }

  /** Find one attendance row inside the authenticated Company. */
  async findAttendanceById(attendanceId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.attendanceEntry.findFirst({ where: scope.where({ id: attendanceId }), include: attendanceInclude });
  }

  /** Find a duplicate Employee/Project/Stage/work-date attendance row. */
  async findAttendanceByNaturalKey(employeeId: string, projectId: string, stageId: string | null, workDate: Date, excludeId?: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.attendanceEntry.findFirst({
      where: scope.where({ employeeId, projectId, stageId, workDate, ...(excludeId ? { id: { not: excludeId } } : {}) })
    });
  }

  /** Lock one Company Employee so lifecycle and same-day hour checks are concurrency-safe. */
  async lockEmployeeForAttendance(employeeId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{ id: string; status: string; joinDate: Date }>>`
      SELECT id, status, joining_date AS "joinDate"
      FROM employees
      WHERE id = ${employeeId}::uuid
        AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Sum this Employee's existing regular and overtime hours across all Projects on one work date. */
  async sumAttendanceHoursForEmployeeDate(employeeId: string, workDate: Date, excludeAttendanceId?: string) {
    const scope = requireCompanyRepositoryScope();
    const totals = await this.db.attendanceEntry.aggregate({
      where: scope.where({
        employeeId,
        workDate,
        ...(excludeAttendanceId ? { id: { not: excludeAttendanceId } } : {})
      }),
      _sum: { hours: true, overtimeHours: true }
    });
    return {
      hours: totals._sum.hours?.toString() ?? '0',
      overtimeHours: totals._sum.overtimeHours?.toString() ?? '0'
    };
  }

  /** Find the Employee compensation authority effective on one attendance work date. */
  async findEffectiveEmployeeCompensation(employeeId: string, workDate: Date) {
    const scope = requireCompanyRepositoryScope();
    return this.db.employeeCompensation.findFirst({
      where: scope.where({
        employeeId,
        effectiveFrom: { lte: workDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: workDate } }]
      }),
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }]
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
          ...(stageId ? [{ OR: [{ stageId }, { stageId: null }] }] : [{ stageId: null }])
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
    return this.db.attendanceEntry.create({ data: scope.createData(input), include: attendanceInclude });
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
      this.db.payrollRun.findMany({ where, include: { creator: { select: { name: true } } }, orderBy: [{ periodStart: 'desc' }, { id: 'asc' }], skip: input.skip, take: input.take }),
      this.db.payrollRun.count({ where })
    ]);
    return { items, total };
  }

  /** Find one Payroll Run and its calculated lines/payslips inside the Company. */
  async findPayrollRunById(payrollRunId: string) {
    const scope = requireCompanyRepositoryScope();
    const run = await this.db.payrollRun.findFirst({
      where: scope.where({ id: payrollRunId }),
      include: {
        creator: { select: { name: true } },
        lines: {
          include: {
            payslip: true,
            employee: { select: { employeeNo: true, name: true, employmentType: true } },
            payments: { where: { status: 'POSTED' }, select: { amount: true } }
          },
          orderBy: [{ employeeId: 'asc' }, { id: 'asc' }]
        }
      }
    });
    if (!run) return null;
    const policy = await this.db.$queryRaw<Array<{ overtimeMultiplier: { toString(): string } | null }>>`
      SELECT overtime_multiplier AS "overtimeMultiplier"
      FROM payroll_runs
      WHERE id = ${payrollRunId}::uuid AND company_id = ${scope.companyId}::uuid
    `;
    return { ...run, overtimeMultiplier: policy[0]?.overtimeMultiplier ?? null };
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
      overtimeMultiplier: { toString(): string } | null;
    }>>`
      SELECT id, period_start AS "periodStart", period_end AS "periodEnd", status,
             overtime_multiplier AS "overtimeMultiplier", created_by AS "createdBy", finalized_at AS "finalizedAt"
      FROM payroll_runs
      WHERE id = ${payrollRunId}::uuid AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Create one Company-owned DRAFT Payroll Run. */
  async createPayrollRun(input: Readonly<{ periodStart: Date; periodEnd: Date; status: string; createdBy: string }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.payrollRun.create({ data: scope.createData({ ...input, finalizedAt: null }), include: { creator: { select: { name: true } } } });
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

  /** Read all attendance states so salaried absence proration includes fully absent Employees. */
  async listPayrollAttendance(periodStart: Date, periodEnd: Date) {
    const scope = requireCompanyRepositoryScope();
    return this.db.attendanceEntry.findMany({
      where: scope.where({ workDate: { gte: periodStart, lte: periodEnd } }),
      include: { employee: { select: { id: true, employmentType: true, joinDate: true } } },
      orderBy: [{ employeeId: 'asc' }, { workDate: 'asc' }, { projectId: 'asc' }, { id: 'asc' }]
    });
  }

  /** Persist the explicit overtime multiplier for one mutable Payroll Run. */
  async updatePayrollRunOvertimeMultiplier(payrollRunId: string, overtimeMultiplier: string) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.$executeRaw`
      UPDATE payroll_runs
      SET overtime_multiplier = ${overtimeMultiplier}::decimal
      WHERE id = ${payrollRunId}::uuid
        AND company_id = ${scope.companyId}::uuid
        AND status IN ('DRAFT', 'CALCULATED')
    `;
    return updated === 1;
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
    salaryBeforeAbsence: string;
    absenceDeduction: string;
    advanceDeduction: string;
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
    const updated = finalizedAt === undefined
      ? await this.db.$queryRaw<Array<{ id: string }>>`
          UPDATE payroll_runs
          SET status = ${status}
          WHERE id = ${payrollRunId}::uuid
            AND company_id = ${scope.companyId}::uuid
            AND status = ${expectedStatus}
          RETURNING id
        `
      : await this.db.$queryRaw<Array<{ id: string }>>`
          UPDATE payroll_runs
          SET status = ${status}, finalized_at = ${finalizedAt}
          WHERE id = ${payrollRunId}::uuid
            AND company_id = ${scope.companyId}::uuid
            AND status = ${expectedStatus}
          RETURNING id
        `;
    if (updated.length !== 1) return null;
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

  /** Read the active Employee Advance asset account. */
  async findEmployeeAdvanceAccount(accountCode: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.glAccount.findFirst({ where: scope.where({ accountCode, status: 'ACTIVE' }) });
  }

  /** Ensure the minimal Payroll journal sequence and posting accounts exist for the Company. */
  async ensurePayrollPostingSetup(): Promise<void> {
    const scope = requireCompanyRepositoryScope();
    await this.db.numberSequence.upsert({
      where: { companyId_sequenceKey: { companyId: scope.companyId, sequenceKey: 'finance.journal' } },
      create: { companyId: scope.companyId, sequenceKey: 'finance.journal', prefix: 'JE-', suffix: '', padWidth: 6, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      update: {}
    });
    for (const account of [
      { accountCode: 'PAYROLL-LABOUR-EXPENSE', name: 'Employee Salary Expense', accountType: 'EXPENSE' },
      { accountCode: 'PAYROLL-PAYABLE', name: 'Payroll Payable', accountType: 'LIABILITY' },
      { accountCode: 'EMPLOYEE-SALARY-ADVANCE', name: 'Employee Salary Advances', accountType: 'ASSET' }
    ] as const) {
      await this.db.glAccount.upsert({
        where: { companyId_accountCode: { companyId: scope.companyId, accountCode: account.accountCode } },
        create: scope.createData({ ...account, parentId: null, status: 'ACTIVE' }),
        update: { name: account.name }
      });
    }
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

  /** Lock one finalized Payroll line before deriving its outstanding salary. */
  async lockFinalizedPayrollLine(payrollLineId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{
      id: string;
      employeeId: string;
      payrollRunId: string;
      netAmount: { toString(): string };
      periodStart: Date;
      periodEnd: Date;
    }>>`
      SELECT line.id,
             line.employee_id AS "employeeId",
             line.payroll_run_id AS "payrollRunId",
             line.net_amount AS "netAmount",
             run.period_start AS "periodStart",
             run.period_end AS "periodEnd"
      FROM payroll_lines line
      JOIN payroll_runs run ON run.id = line.payroll_run_id
      WHERE line.id = ${payrollLineId}::uuid
        AND run.company_id = ${scope.companyId}::uuid
        AND run.status = 'FINALIZED'
      FOR UPDATE OF line
    `;
    return rows[0] ?? null;
  }

  /** Sum active settlement rows for one Payroll line. */
  async sumPostedPayrollPayments(payrollLineId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.payrollPayment.aggregate({
      where: scope.where({ payrollLineId, status: 'POSTED' }),
      _sum: { amount: true }
    });
  }

  /** Find one active same-Company Cash/Bank settlement account with its mapped GL account. */
  async findPayrollCashBankAccount(cashBankAccountId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.cashBankAccount.findFirst({
      where: scope.where({ id: cashBankAccountId }),
      include: { glAccount: true }
    });
  }

  /** Ensure the server-owned salary-payment number sequence exists for this Company. */
  async ensurePayrollPaymentSequence() {
    const scope = requireCompanyRepositoryScope();
    return this.db.numberSequence.upsert({
      where: { companyId_sequenceKey: { companyId: scope.companyId, sequenceKey: 'payroll-payment' } },
      create: { companyId: scope.companyId, sequenceKey: 'payroll-payment', prefix: 'SAL-', suffix: '', padWidth: 6, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      update: {}
    });
  }

  /** Ensure the server-owned salary-advance number sequence exists for this Company. */
  async ensureEmployeeAdvanceSequence() {
    const scope = requireCompanyRepositoryScope();
    return this.db.numberSequence.upsert({
      where: { companyId_sequenceKey: { companyId: scope.companyId, sequenceKey: 'employee-advance' } },
      create: { companyId: scope.companyId, sequenceKey: 'employee-advance', prefix: 'ADV-', suffix: '', padWidth: 6, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      update: {}
    });
  }

  /** Validate one active Employee and assigned Project/Stage advance destination. */
  async findEmployeeAdvanceDestination(employeeId: string, projectId: string, stageId: string | null, advanceDate: Date) {
    const scope = requireCompanyRepositoryScope();
    const employee = await this.db.employee.findFirst({ where: scope.where({ id: employeeId, status: 'ACTIVE', joinDate: { lte: advanceDate } }) });
    if (!employee) return null;
    const project = await this.db.project.findFirst({ where: scope.where({ id: projectId, status: 'ACTIVE' }) });
    if (!project) return null;
    if (stageId && !(await this.findStage(projectId, stageId))) return null;
    const assignment = await this.db.projectTeamAssignment.findFirst({
      where: scope.where({
        employeeId,
        projectId,
        status: 'ACTIVE',
        fromDate: { lte: advanceDate },
        AND: [
          { OR: [{ toDate: null }, { toDate: { gte: advanceDate } }] },
          ...(stageId ? [{ OR: [{ stageId }, { stageId: null }] }] : [])
        ]
      })
    });
    return assignment ? { employee, project } : null;
  }

  /** Create one posted Employee advance inside the accounting transaction. */
  async createEmployeeAdvance(input: Readonly<{
    employeeId: string; projectId: string; stageId: string | null; advanceNo: string; advanceDate: Date;
    amount: string; cashBankAccountId: string; reason: string; reference: string | null; createdBy: string;
  }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.employeeAdvance.create({
      data: scope.createData({ ...input, status: 'POSTED', reversalDate: null, reversedAt: null }),
      include: employeeAdvanceInclude
    });
  }

  /** List Employee advances with source-derived recovery balances. */
  async listEmployeeAdvances(input: Readonly<{ employeeId?: string; projectId?: string; projectIds?: readonly string[]; status?: 'POSTED' | 'REVERSED' }> & LabourPayrollPageWindow) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(!input.projectId && input.projectIds ? { projectId: { in: [...input.projectIds] } } : {}),
      ...(input.status ? { status: input.status } : {})
    });
    const [items, total] = await Promise.all([
      this.db.employeeAdvance.findMany({ where, include: employeeAdvanceInclude, orderBy: [{ advanceDate: 'desc' }, { advanceNo: 'desc' }], skip: input.skip, take: input.take }),
      this.db.employeeAdvance.count({ where })
    ]);
    return { items, total };
  }

  /** List posted advances still available for FIFO recovery through the period end. */
  async listRecoverableEmployeeAdvances(employeeId: string, periodEnd: Date) {
    const scope = requireCompanyRepositoryScope();
    return this.db.employeeAdvance.findMany({
      where: scope.where({ employeeId, status: 'POSTED', advanceDate: { lte: periodEnd } }),
      include: { recoveries: { select: { amount: true } } },
      orderBy: [{ advanceDate: 'asc' }, { advanceNo: 'asc' }, { id: 'asc' }]
    });
  }

  /** Persist one immutable advance recovery during Payroll finalization. */
  async createAdvanceRecovery(input: Readonly<{ payrollLineId: string; employeeAdvanceId: string; amount: string }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.payrollAdvanceRecovery.create({ data: scope.createData(input) });
  }

  /** Lock one advance before reversal and include finalized recoveries. */
  async lockEmployeeAdvance(advanceId: string) {
    const scope = requireCompanyRepositoryScope();
    await this.db.$queryRaw`SELECT id FROM employee_advances WHERE id = ${advanceId}::uuid AND company_id = ${scope.companyId}::uuid FOR UPDATE`;
    return this.db.employeeAdvance.findFirst({ where: scope.where({ id: advanceId }), include: employeeAdvanceInclude });
  }

  /** Retain the advance record while marking its compensating reversal. */
  async markEmployeeAdvanceReversed(advanceId: string, reversalDate: Date, reversedAt: Date) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.employeeAdvance.updateMany({ where: scope.where({ id: advanceId, status: 'POSTED' }), data: { status: 'REVERSED', reversalDate, reversedAt } });
    if (updated.count !== 1) return null;
    return this.db.employeeAdvance.findFirst({ where: scope.where({ id: advanceId }), include: employeeAdvanceInclude });
  }

  /** Persist one POSTED Employee salary payment inside the Finance posting transaction. */
  async createPayrollPayment(input: Readonly<{
    payrollLineId: string;
    employeeId: string;
    paymentNo: string;
    paymentDate: Date;
    amount: string;
    cashBankAccountId: string;
    reference: string | null;
    createdBy: string;
  }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.payrollPayment.create({
      data: scope.createData({ ...input, status: 'POSTED', reversalDate: null, reversedAt: null }),
      include: payrollPaymentInclude
    });
  }

  /** List bounded Employee salary payments with readable Employee and account labels. */
  async listPayrollPayments(input: Readonly<{
    employeeId?: string;
    payrollRunId?: string;
    status?: 'POSTED' | 'REVERSED';
  }> & LabourPayrollPageWindow) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      ...(input.payrollRunId ? { payrollLine: { payrollRunId: input.payrollRunId } } : {}),
      ...(input.status ? { status: input.status } : {})
    });
    const [items, total] = await Promise.all([
      this.db.payrollPayment.findMany({ where, include: payrollPaymentInclude, orderBy: [{ paymentDate: 'desc' }, { paymentNo: 'desc' }, { id: 'desc' }], skip: input.skip, take: input.take }),
      this.db.payrollPayment.count({ where })
    ]);
    return { items, total };
  }

  /** List active Employee assignments that may receive attendance on one work date. */
  async listEffectiveAttendanceAssignments(
    employeeId: string,
    workDate: Date,
    visibility: LabourPayrollProjectVisibility
  ) {
    const scope = requireCompanyRepositoryScope();
    return this.db.projectTeamAssignment.findMany({
      where: scope.where({
        ...projectVisibilityWhere(visibility),
        employeeId,
        status: 'ACTIVE',
        fromDate: { lte: workDate },
        OR: [{ toDate: null }, { toDate: { gte: workDate } }]
      }),
      select: {
        id: true,
        projectId: true,
        stageId: true,
        fromDate: true,
        toDate: true,
        project: { select: { projectCode: true, name: true } },
        stage: { select: { code: true, name: true } }
      },
      orderBy: [{ project: { projectCode: 'asc' } }, { stageId: 'asc' }, { fromDate: 'desc' }, { id: 'asc' }]
    });
  }

  /** Lock one posted salary payment before a compensating Finance reversal. */
  async lockPayrollPayment(paymentId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{ id: string; paymentDate: Date; paymentNo: string; status: string }>>`
      SELECT id, payment_date AS "paymentDate", payment_no AS "paymentNo", status
      FROM payroll_payments
      WHERE id = ${paymentId}::uuid AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    if (!rows[0]) return null;
    return this.db.payrollPayment.findFirst({ where: scope.where({ id: paymentId }), include: payrollPaymentInclude });
  }

  /** Mark a POSTED salary payment REVERSED without deleting its settlement history. */
  async markPayrollPaymentReversed(paymentId: string, reversalDate: Date, reversedAt: Date) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.payrollPayment.updateMany({
      where: scope.where({ id: paymentId, status: 'POSTED' }),
      data: { status: 'REVERSED', reversalDate, reversedAt }
    });
    if (updated.count !== 1) return null;
    return this.db.payrollPayment.findFirst({ where: scope.where({ id: paymentId }), include: payrollPaymentInclude });
  }

  /** Read finalized salary accruals and all payment history for one Employee ledger. */
  async getEmployeeSalaryLedgerSources(employeeId: string, projectId?: string) {
    const scope = requireCompanyRepositoryScope();
    const employee = await this.db.employee.findFirst({ where: scope.where({ id: employeeId }), select: { id: true, employeeNo: true, name: true } });
    if (!employee) return null;
    const lines = await this.db.payrollLine.findMany({
      where: { employeeId, payrollRun: { companyId: scope.companyId, status: 'FINALIZED' } },
      include: {
        payrollRun: { select: { id: true, periodStart: true, periodEnd: true } },
        payments: { orderBy: [{ paymentDate: 'asc' }, { id: 'asc' }] },
        advanceRecoveries: { include: { employeeAdvance: { include: { project: { select: { name: true } }, stage: { select: { name: true } } } } } }
      },
      orderBy: [{ payrollRun: { periodEnd: 'asc' } }, { id: 'asc' }]
    });
    const advances = await this.db.employeeAdvance.findMany({
      where: scope.where({ employeeId, ...(projectId ? { projectId } : {}) }),
      include: employeeAdvanceInclude,
      orderBy: [{ advanceDate: 'asc' }, { id: 'asc' }]
    });
    const visibleLines = projectId
      ? lines.filter((line) => {
        const allocations = Array.isArray(line.projectAllocationJson) ? line.projectAllocationJson : [];
        return allocations.some((item) => item && typeof item === 'object' && 'projectId' in item && item.projectId === projectId);
      })
      : lines;
    const allocationProjectIds = visibleLines.flatMap((line) => {
      const allocations = Array.isArray(line.projectAllocationJson) ? line.projectAllocationJson : [];
      return allocations.flatMap((item) => item && typeof item === 'object' && 'projectId' in item && typeof item.projectId === 'string' ? [item.projectId] : []);
    });
    const projects = await this.db.project.findMany({
      where: scope.where({ id: { in: [...new Set(allocationProjectIds)] } }),
      select: { id: true, name: true }
    });
    return { employee, lines: visibleLines, advances, projects };
  }
}
