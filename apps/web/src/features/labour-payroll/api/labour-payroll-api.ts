import { authenticatedRequest } from '../../administration/api/auth-api.js';

export type AttendanceStatus = 'PRESENT' | 'ABSENT';
export type PayrollRunStatus = 'DRAFT' | 'CALCULATED' | 'FINALIZED';

export type AttendanceEntry = Readonly<{
  id: string;
  employeeId: string;
  projectId: string;
  stageId: string | null;
  workDate: string;
  status: AttendanceStatus;
  hours: string | null;
  overtimeHours: string | null;
  enteredBy: string;
}>;

export type AttendancePage = Readonly<{ items: AttendanceEntry[]; total: number; page: number; pageSize: number }>;

export type PayrollAllocation = Readonly<{
  projectId: string;
  stageId: string | null;
  category: 'labour' | 'security';
  amount: string;
}>;

export type PayrollLine = Readonly<{
  id: string;
  employeeId: string;
  grossAmount: string;
  deductions: string;
  netAmount: string;
  projectAllocation: PayrollAllocation[];
  payslip: Readonly<{ id: string; documentId: string | null; generatedAt: string | null }> | null;
}>;

export type PayrollRun = Readonly<{
  id: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollRunStatus;
  createdBy: string;
  finalizedAt: string | null;
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
export function calculatePayrollRun(payrollRunId: string): Promise<PayrollRun> {
  return authenticatedRequest<PayrollRun>(`payroll/runs/${payrollRunId}/calculate`, { method: 'POST', headers: commandHeaders(), body: JSON.stringify({}) });
}

/** Finalize Payroll and post Project cost plus Finance accounting atomically. */
export function finalizePayrollRun(payrollRunId: string): Promise<PayrollRun> {
  return authenticatedRequest<PayrollRun>(`payroll/runs/${payrollRunId}/finalize`, { method: 'POST', headers: commandHeaders(), body: JSON.stringify({}) });
}

/** Load one Payroll Run with its calculated Employee lines. */
export function getPayrollRun(payrollRunId: string): Promise<PayrollRun> {
  return authenticatedRequest<PayrollRun>(`payroll/runs/${payrollRunId}`);
}
