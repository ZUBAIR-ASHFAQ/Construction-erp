import { authenticatedRequest } from '../../administration/api/auth-api.js';

export type AttendanceStatus = 'PRESENT' | 'ABSENT';
export type PayrollRunStatus = 'DRAFT' | 'CALCULATED' | 'FINALIZED';

export type AttendanceEntry = Readonly<{
  id: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  stageId: string | null;
  stageName: string | null;
  workDate: string;
  status: AttendanceStatus;
  hours: string | null;
  overtimeHours: string | null;
  enteredBy: string;
  enteredByName: string;
}>;

export type AttendancePage = Readonly<{ items: AttendanceEntry[]; total: number; page: number; pageSize: number }>;
export type AttendanceAssignment = Readonly<{
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  stageId: string | null;
  stageCode: string | null;
  stageName: string | null;
  fromDate: string;
  toDate: string | null;
}>;

export type PayrollAllocation = Readonly<{
  projectId: string;
  stageId: string | null;
  category: 'labour' | 'security';
  amount: string;
}>;

export type PayrollLine = Readonly<{
  id: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  grossAmount: string;
  salaryBeforeAbsence: string;
  absenceDeduction: string;
  advanceDeduction: string;
  deductions: string;
  netAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  projectAllocation: PayrollAllocation[];
  payslip: Readonly<{ id: string; documentId: string | null; generatedAt: string | null }> | null;
}>;

export type PayrollRun = Readonly<{
  id: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollRunStatus;
  createdBy: string;
  createdByName: string;
  finalizedAt: string | null;
  overtimeMultiplier: string | null;
  lines: PayrollLine[];
}>;

export type PayrollRunPage = Readonly<{
  items: ReadonlyArray<Omit<PayrollRun, 'lines'>>;
  total: number;
  page: number;
  pageSize: number;
}>;

export type ListAttendanceInput = Readonly<{
  projectId?: string;
  employeeId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}>;
export type CreateAttendanceInput = Readonly<{
  employeeId: string;
  projectId: string;
  stageId?: string | null;
  workDate: string;
  status: AttendanceStatus;
  hours?: string | null;
  overtimeHours?: string | null;
}>;
export type UpdateAttendanceInput = Readonly<{
  stageId?: string | null;
  status?: AttendanceStatus;
  hours?: string | null;
  overtimeHours?: string | null;
}>;
export type CreatePayrollRunInput = Readonly<{ periodStart: string; periodEnd: string }>;
export type CalculatePayrollRunInput = Readonly<{ overtimeMultiplier?: string }>;
export type PayrollCashBankAccount = Readonly<{ id: string; code: string; name: string; accountType: 'CASH' | 'BANK'; accountNumber: string | null; balance: string }>;
export type PayrollPaymentStatus = 'POSTED' | 'REVERSED';
export type PayrollPayment = Readonly<{
  id: string; payrollLineId: string; payrollRunId: string; employeeId: string; employeeNo: string; employeeName: string;
  paymentNo: string; paymentDate: string; payrollPeriod: string; amount: string; cashBankAccountId: string;
  cashBankAccountName: string; reference: string | null; status: PayrollPaymentStatus; reversalDate: string | null;
  createdByName: string; createdAt: string;
}>;
export type PayrollPaymentPage = Readonly<{ items: PayrollPayment[]; total: number; page: number; pageSize: number }>;
export type CreatePayrollPaymentInput = Readonly<{ payrollLineId: string; paymentDate: string; amount: string; cashBankAccountId: string; reference?: string | null }>;
export type EmployeeAdvance = Readonly<{
  id: string; employeeId: string; employeeNo: string; employeeName: string; projectId: string; projectCode: string; projectName: string;
  stageId: string | null; stageName: string | null; advanceNo: string; advanceDate: string; amount: string; recoveredAmount: string;
  outstandingAmount: string; cashBankAccountId: string; cashBankAccountName: string; reason: string; reference: string | null;
  status: PayrollPaymentStatus; reversalDate: string | null; createdByName: string; createdAt: string;
}>;
export type EmployeeAdvancePage = Readonly<{ items: EmployeeAdvance[]; total: number; page: number; pageSize: number }>;
export type CreateEmployeeAdvanceInput = Readonly<{
  employeeId: string; projectId: string; stageId?: string | null; advanceDate: string; amount: string;
  cashBankAccountId: string; reason: string; reference?: string | null;
}>;
export type EmployeeSalaryLedger = Readonly<{
  employee: Readonly<{ id: string; employeeNo: string; name: string }>;
  totalSalary: string; totalPaid: string; totalAdvances: string; totalAdvanceRecovered: string; advanceOutstanding: string; outstanding: string;
  entries: ReadonlyArray<Readonly<{
    id: string; entryDate: string; entryType: 'SALARY_DUE' | 'PAYMENT' | 'PAYMENT_REVERSAL' | 'ADVANCE' | 'ADVANCE_REVERSAL' | 'ADVANCE_RECOVERY'; reference: string;
    debit: string; credit: string; balance: string; projectId: string | null; projectName: string | null; stageName: string | null;
    payrollRunId: string | null; payrollLineId: string | null; advanceId: string | null; paymentId: string | null;
  }>>;
}>;

/** Build one bounded attendance query without browser-owned Company scope. */
function attendanceQuery(input: ListAttendanceInput): string {
  const query = new URLSearchParams();
  if (input.projectId) query.set('projectId', input.projectId);
  if (input.employeeId) query.set('employeeId', input.employeeId);
  if (input.fromDate) query.set('fromDate', input.fromDate);
  if (input.toDate) query.set('toDate', input.toDate);
  if (input.page !== undefined) query.set('page', String(input.page));
  if (input.pageSize !== undefined) query.set('pageSize', String(input.pageSize));
  return query.size > 0 ? `?${query.toString()}` : '';
}

/** Build the Foundation retry key required by Labour/Payroll writes. */
function commandHeaders(): HeadersInit {
  return { 'Idempotency-Key': crypto.randomUUID() };
}

/** Load bounded attendance history. */
export function listAttendance(input: ListAttendanceInput = {}): Promise<AttendancePage> {
  return authenticatedRequest<AttendancePage>(`attendance${attendanceQuery(input)}`);
}

/** Load effective Project/Stage destinations for one Employee attendance date. */
export function listAttendanceAssignments(employeeId: string, workDate: string): Promise<AttendanceAssignment[]> {
  const query = new URLSearchParams({ employeeId, workDate });
  return authenticatedRequest<AttendanceAssignment[]>(`attendance/assignments?${query}`);
}

/** Create one authoritative daily attendance record. */
export function createAttendance(input: CreateAttendanceInput): Promise<AttendanceEntry> {
  return authenticatedRequest<AttendanceEntry>('attendance', { method: 'POST', headers: commandHeaders(), body: JSON.stringify(input) });
}

/** Correct one attendance record that is not locked by finalized Payroll. */
export function updateAttendance(attendanceId: string, input: UpdateAttendanceInput): Promise<AttendanceEntry> {
  return authenticatedRequest<AttendanceEntry>(`attendance/${attendanceId}`, { method: 'PATCH', headers: commandHeaders(), body: JSON.stringify(input) });
}

/** Load bounded Payroll Run history. */
export function listPayrollRuns(page = 1, pageSize = 50): Promise<PayrollRunPage> {
  return authenticatedRequest<PayrollRunPage>(`payroll/runs?page=${page}&pageSize=${pageSize}`);
}

/** Create one DRAFT Payroll Run. */
export function createPayrollRun(input: CreatePayrollRunInput): Promise<PayrollRun> {
  return authenticatedRequest<PayrollRun>('payroll/runs', { method: 'POST', headers: commandHeaders(), body: JSON.stringify(input) });
}

/** Recalculate one DRAFT/CALCULATED Payroll Run from attendance and compensation. */
export function calculatePayrollRun(payrollRunId: string, input: CalculatePayrollRunInput = {}): Promise<PayrollRun> {
  return authenticatedRequest<PayrollRun>(`payroll/runs/${payrollRunId}/calculate`, { method: 'POST', headers: commandHeaders(), body: JSON.stringify(input) });
}

/** Finalize Payroll and post Project cost plus Finance accounting atomically. */
export function finalizePayrollRun(payrollRunId: string): Promise<PayrollRun> {
  return authenticatedRequest<PayrollRun>(`payroll/runs/${payrollRunId}/finalize`, { method: 'POST', headers: commandHeaders(), body: JSON.stringify({}) });
}

/** Load one Payroll Run with its calculated Employee lines. */
export function getPayrollRun(payrollRunId: string): Promise<PayrollRun> {
  return authenticatedRequest<PayrollRun>(`payroll/runs/${payrollRunId}`);
}

/** Load active Cash/Bank accounts available for Employee salary settlement. */
export function listPayrollCashBankAccounts(): Promise<PayrollCashBankAccount[]> {
  return authenticatedRequest<PayrollCashBankAccount[]>('payroll/cash-bank-accounts');
}

/** Load bounded Employee salary-payment history. */
export function listPayrollPayments(input: Readonly<{ employeeId?: string; payrollRunId?: string; status?: PayrollPaymentStatus }> = {}): Promise<PayrollPaymentPage> {
  const query = new URLSearchParams({ page: '1', pageSize: '100' });
  if (input.employeeId) query.set('employeeId', input.employeeId);
  if (input.payrollRunId) query.set('payrollRunId', input.payrollRunId);
  if (input.status) query.set('status', input.status);
  return authenticatedRequest<PayrollPaymentPage>(`payroll/payments?${query}`);
}

/** Post one partial or full payment against a finalized Employee Payroll line. */
export function createPayrollPayment(input: CreatePayrollPaymentInput): Promise<PayrollPayment> {
  return authenticatedRequest<PayrollPayment>('payroll/payments', { method: 'POST', headers: commandHeaders(), body: JSON.stringify(input) });
}

/** Reverse one posted salary payment through a compensating Finance journal. */
export function reversePayrollPayment(paymentId: string, reversalDate: string): Promise<PayrollPayment> {
  return authenticatedRequest<PayrollPayment>(`payroll/payments/${paymentId}/reverse`, { method: 'POST', headers: commandHeaders(), body: JSON.stringify({ reversalDate }) });
}

/** Load bounded Employee salary-advance history. */
export function listEmployeeAdvances(input: Readonly<{ employeeId?: string; projectId?: string }> = {}): Promise<EmployeeAdvancePage> {
  const query = new URLSearchParams({ page: '1', pageSize: '100' });
  if (input.employeeId) query.set('employeeId', input.employeeId);
  if (input.projectId) query.set('projectId', input.projectId);
  return authenticatedRequest<EmployeeAdvancePage>(`payroll/advances?${query}`);
}

/** Pay one Employee salary advance from Cash/Bank. */
export function createEmployeeAdvance(input: CreateEmployeeAdvanceInput): Promise<EmployeeAdvance> {
  return authenticatedRequest<EmployeeAdvance>('payroll/advances', { method: 'POST', headers: commandHeaders(), body: JSON.stringify(input) });
}

/** Reverse one unrecovered Employee advance. */
export function reverseEmployeeAdvance(advanceId: string, reversalDate: string): Promise<EmployeeAdvance> {
  return authenticatedRequest<EmployeeAdvance>(`payroll/advances/${advanceId}/reverse`, { method: 'POST', headers: commandHeaders(), body: JSON.stringify({ reversalDate }) });
}

/** Load one source-derived Employee salary ledger. */
export function getEmployeeSalaryLedger(employeeId: string, projectId?: string): Promise<EmployeeSalaryLedger> {
  const query = projectId ? `?${new URLSearchParams({ projectId })}` : '';
  return authenticatedRequest<EmployeeSalaryLedger>(`payroll/employees/${employeeId}/ledger${query}`);
}
