import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useEmployees } from '../../employees/hooks/employees.js';
import { ProjectAccountCreateModal } from '../../finance/components/project-account-create-modal.js';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useProjects } from '../../projects/hooks/projects.js';
import type { AttendanceEntry, EmployeeAdvance, PayrollCashBankAccount, PayrollLine, PayrollPayment, PayrollRun } from '../api/labour-payroll-api.js';
import {
  useAttendance,
  useAttendanceAssignments,
  useCalculatePayrollRun,
  useCreateAttendance,
  useCreateEmployeeAdvance,
  useCreatePayrollRun,
  useCreatePayrollPayment,
  useEmployeeSalaryLedger,
  useEmployeeAdvances,
  useFinalizePayrollRun,
  usePayrollRun,
  usePayrollEligibleEmployees,
  usePayrollRuns,
  usePayrollCashBankAccounts,
  usePayrollPayments,
  useReversePayrollPayment,
  useReverseEmployeeAdvance,
  useUpdateAttendance
} from '../hooks/labour-payroll.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
const hoursSchema = z.union([z.literal(''), z.string().regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/, 'Use up to 4 decimals.')]);
const attendanceFormSchema = z.object({
  employeeId: z.string().uuid('Select an Employee.'),
  projectId: z.string().uuid('Select a Project.'),
  stageId: z.string(),
  workDate: dateSchema,
  status: z.enum(['PRESENT', 'ABSENT']),
  hours: hoursSchema,
  overtimeHours: hoursSchema
}).superRefine((value, ctx) => {
  const total = Number(value.hours || '0') + Number(value.overtimeHours || '0');
  if (total > 24) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hours'], message: 'Daily hours cannot exceed 24.' });
  if (value.status === 'ABSENT' && total > 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'Absent attendance cannot contain worked hours.' });
});
const correctionFormSchema = z.object({
  stageId: z.string(),
  status: z.enum(['PRESENT', 'ABSENT']),
  hours: hoursSchema,
  overtimeHours: hoursSchema
}).superRefine((value, ctx) => {
  const total = Number(value.hours || '0') + Number(value.overtimeHours || '0');
  if (total > 24) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hours'], message: 'Daily hours cannot exceed 24.' });
  if (value.status === 'ABSENT' && total > 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'Absent attendance cannot contain worked hours.' });
});
const payrollFormSchema = z.object({ payCycle: z.enum(['DAILY', 'MONTHLY']), periodStart: dateSchema, periodEnd: dateSchema }).superRefine((value, context) => {
  if (value.periodEnd < value.periodStart) context.addIssue({ code: 'custom', path: ['periodEnd'], message: 'Period end must be on or after period start.' });
  if (value.payCycle === 'DAILY' && value.periodStart !== value.periodEnd) context.addIssue({ code: 'custom', path: ['periodEnd'], message: 'Daily settlement uses one work date.' });
});
const paymentFormSchema = z.object({
  paymentDate: dateSchema,
  amount: z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/, 'Enter a valid amount.').refine((value) => Number(value) > 0, 'Amount must be greater than zero.'),
  cashBankAccountId: z.string().uuid('Select a Cash or Bank account.'),
  reference: z.string().trim().max(200)
});
const advanceFormSchema = z.object({
  employeeId: z.string().uuid('Select an Employee.'),
  projectId: z.string().uuid('Select a Project.'),
  stageId: z.string(),
  advanceDate: dateSchema,
  amount: z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/, 'Enter a valid amount.').refine((value) => Number(value) > 0, 'Amount must be greater than zero.'),
  cashBankAccountId: z.string().uuid('Select a Cash or Bank account.'),
  reason: z.string().trim().min(1, 'Reason is required.').max(500),
  reference: z.string().trim().max(200)
});

type AttendanceFormValues = z.infer<typeof attendanceFormSchema>;
type CorrectionFormValues = z.infer<typeof correctionFormSchema>;
type PayrollFormValues = z.infer<typeof payrollFormSchema>;
type PaymentFormValues = z.infer<typeof paymentFormSchema>;
type AdvanceFormValues = z.infer<typeof advanceFormSchema>;

export type LabourPayrollWorkspaceView = 'attendance' | 'advances' | 'daily-payroll' | 'monthly-payroll' | 'payments' | 'ledger';

export type LabourPayrollWorkspaceProps = Readonly<{
  view: LabourPayrollWorkspaceView;
  canReadAttendance: boolean;
  canCreateAttendance: boolean;
  canCorrectAttendance: boolean;
  canReadPayroll: boolean;
  canCreatePayroll: boolean;
  canCalculatePayroll: boolean;
  canFinalizePayroll: boolean;
  canCreatePayrollPayment: boolean;
  canReversePayrollPayment: boolean;
  canCreateEmployeeAdvance: boolean;
  canReverseEmployeeAdvance: boolean;
  canManageAccounts: boolean;
}>;

/** Return one readable request error without exposing backend internals. */
function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

/** Render one amount consistently in the Payroll workspace. */
function Money({ value }: Readonly<{ value: string }>) {
  return <span>{value}</span>;
}

/** Add API money strings exactly for Payroll preview totals. */
function sumMoney(values: readonly string[]): string {
  const cents = values.reduce((sum, value) => {
    const [whole = '0', fraction = ''] = value.split('.');
    return sum + (BigInt(whole) * 100n) + BigInt(`${fraction}00`.slice(0, 2));
  }, 0n);
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}

/** Return the current calendar month used as the safe default Payroll period. */
function currentPayrollPeriod(): Readonly<{ payCycle: 'MONTHLY'; periodStart: string; periodEnd: string }> {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const date = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { payCycle: 'MONTHLY', periodStart: date(1), periodEnd: date(new Date(year, month + 1, 0).getDate()) };
}

/** Return a readable settlement-cycle label, including immutable historical runs. */
function payCycleLabel(payCycle: PayrollRun['payCycle']): string {
  if (payCycle === 'DAILY') return 'Daily settlement';
  if (payCycle === 'MONTHLY') return 'Monthly payroll';
  return 'Legacy payroll';
}

/** Render a centered partial/full salary-payment form for one finalized Payroll line. */
function SalaryPaymentModal({ line, run, accounts, canManageAccounts, onAddAccount, onClose }: Readonly<{
  line: PayrollLine;
  run: PayrollRun;
  accounts: readonly PayrollCashBankAccount[];
  canManageAccounts: boolean;
  onAddAccount: (projectId: string) => void;
  onClose: () => void;
}>) {
  const mutation = useCreatePayrollPayment();
  const projectIds = [...new Set(line.projectAllocation.map((allocation) => allocation.projectId))];
  const projectId = projectIds.length === 1 ? projectIds[0] as string : null;
  const eligibleAccounts = accounts.filter((account) => projectId ? account.projectId === projectId || account.projectId === null : account.projectId === null);
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: { paymentDate: new Date().toISOString().slice(0, 10) > run.periodEnd ? new Date().toISOString().slice(0, 10) : run.periodEnd, amount: line.outstandingAmount, cashBankAccountId: '', reference: '' }
  });

  /** Post the entered settlement against this finalized Employee Payroll line. */
  async function submit(values: PaymentFormValues): Promise<void> {
    await mutation.mutateAsync({ payrollLineId: line.id, ...values, reference: values.reference || null });
    onClose();
  }

  return <div className="finance-modal-backdrop" role="presentation"><section className="finance-modal" role="dialog" aria-modal="true" aria-labelledby="salary-payment-title"><header className="finance-modal-header"><div><p className="eyebrow">Employee salary settlement</p><h2 id="salary-payment-title">Pay {line.employeeName}</h2><p>{run.periodStart} to {run.periodEnd} · Outstanding <Money value={line.outstandingAmount} /></p></div><button type="button" className="finance-modal-close" onClick={onClose} aria-label="Close salary payment">×</button></header><div className="finance-modal-body"><form className="admin-form" onSubmit={form.handleSubmit(submit)}><div className="form-grid"><label>Payment date<input type="date" min={run.periodEnd} {...form.register('paymentDate')} /><span className="field-error">{form.formState.errors.paymentDate?.message}</span></label><label>Amount<input inputMode="decimal" {...form.register('amount')} /><span className="field-error">{form.formState.errors.amount?.message}</span></label><label>Cash / Bank account<select {...form.register('cashBankAccountId')}><option value="">Select account</option>{eligibleAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}{account.accountNumber ? ` · ${account.accountNumber}` : ''} · Balance ${account.balance}</option>)}</select><span className="field-error">{form.formState.errors.cashBankAccountId?.message}</span></label><label>Reference (optional)<input {...form.register('reference')} /></label></div>{projectId && eligibleAccounts.length === 0 && canManageAccounts && <div className="form-actions"><button type="button" className="secondary-button" onClick={() => onAddAccount(projectId)}>Add Cash / Bank account</button></div>}{!projectId && <p className="muted">This salary spans multiple Projects and must be settled by an administrator using a Company account.</p>}<p className="muted">This reduces Payroll Payable and the selected Cash/Bank balance, and the posted payment appears automatically in the Employee Ledger. A second payment for this Employee and Payroll on the same date is blocked.</p>{errorMessage(mutation.error) && <p className="field-error">{errorMessage(mutation.error)}</p>}<div className="form-actions"><button type="submit" disabled={mutation.isPending || eligibleAccounts.length === 0}>{mutation.isPending ? 'Posting…' : 'Post salary payment'}</button><button type="button" className="secondary-button" onClick={onClose}>Cancel</button></div></form></div></section></div>;
}

/** Render an immediate advance-payment dialog for an Employee in an open Payroll Run. */
function OpenPayrollAdvanceModal({ line, projects, accounts, canManageAccounts, onAddAccount, onClose }: Readonly<{
  line: PayrollLine;
  projects: readonly Readonly<{ id: string; projectCode: string; name: string }>[];
  accounts: readonly PayrollCashBankAccount[];
  canManageAccounts: boolean;
  onAddAccount: (projectId: string) => void;
  onClose: () => void;
}>) {
  const mutation = useCreateEmployeeAdvance();
  const destinations = useMemo(() => {
    const labels = new Map(projects.map((project) => [project.id, `${project.projectCode} · ${project.name}`]));
    return line.projectAllocation.filter((allocation, index, all) => all.findIndex((item) => item.projectId === allocation.projectId && item.stageId === allocation.stageId) === index)
      .map((allocation) => ({ ...allocation, key: `${allocation.projectId}:${allocation.stageId ?? ''}`, label: `${labels.get(allocation.projectId) ?? 'Project'} / ${allocation.stageId ? 'Assigned stage' : 'Project level'}` }));
  }, [line.projectAllocation, projects]);
  const form = useForm<AdvanceFormValues>({
    resolver: zodResolver(advanceFormSchema),
    defaultValues: { employeeId: line.employeeId, projectId: destinations[0]?.projectId ?? '', stageId: destinations[0]?.stageId ?? '', advanceDate: new Date().toISOString().slice(0, 10), amount: '', cashBankAccountId: '', reason: 'Salary advance before month-end', reference: '' }
  });
  const projectId = form.watch('projectId');
  const destinationKey = `${projectId}:${form.watch('stageId')}`;
  const eligibleAccounts = accounts.filter((account) => account.projectId === projectId || account.projectId === null);
  /** Keep Project and Stage together when the user changes the Payroll cost destination. */
  function selectDestination(key: string): void {
    const destination = destinations.find((item) => item.key === key);
    if (!destination) return;
    form.setValue('projectId', destination.projectId);
    form.setValue('stageId', destination.stageId ?? '');
    form.setValue('cashBankAccountId', '');
  }
  /** Post the advance without pretending the open Payroll Run is finalized. */
  async function submit(values: AdvanceFormValues): Promise<void> {
    await mutation.mutateAsync({ ...values, stageId: values.stageId || null, reference: values.reference || null });
    onClose();
  }
  return <div className="finance-modal-backdrop" role="presentation"><section className="finance-modal" role="dialog" aria-modal="true" aria-labelledby="open-payroll-advance-title"><header className="finance-modal-header"><div><p className="eyebrow">Open payroll period</p><h2 id="open-payroll-advance-title">Pay advance to {line.employeeName}</h2><p>Earned so far {line.grossAmount} · Current net preview {line.netAmount}</p></div><button type="button" className="finance-modal-close" onClick={onClose} aria-label="Close advance payment">×</button></header><div className="finance-modal-body"><form className="admin-form" onSubmit={form.handleSubmit(submit)}><input type="hidden" {...form.register('employeeId')} /><input type="hidden" {...form.register('projectId')} /><input type="hidden" {...form.register('stageId')} /><div className="form-grid"><label>Project / Stage<select value={destinationKey} onChange={(event) => selectDestination(event.target.value)}>{destinations.map((destination) => <option key={destination.key} value={destination.key}>{destination.label}</option>)}</select><span className="field-error">{form.formState.errors.projectId?.message}</span></label><label>Advance date<input type="date" {...form.register('advanceDate')} /><span className="field-error">{form.formState.errors.advanceDate?.message}</span></label><label>Advance amount<input inputMode="decimal" {...form.register('amount')} placeholder="2000.00" /><span className="field-error">{form.formState.errors.amount?.message}</span></label><label>Cash / Bank account<select {...form.register('cashBankAccountId')}><option value="">Select account</option>{eligibleAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}{account.accountNumber ? ` · ${account.accountNumber}` : ''} · Balance {account.balance}</option>)}</select><span className="field-error">{form.formState.errors.cashBankAccountId?.message}</span></label><label>Reason<input {...form.register('reason')} /><span className="field-error">{form.formState.errors.reason?.message}</span></label><label>Reference (optional)<input {...form.register('reference')} /></label></div>{projectId && eligibleAccounts.length === 0 && canManageAccounts && <div className="form-actions"><button type="button" className="secondary-button" onClick={() => onAddAccount(projectId)}>Add Cash / Bank account</button></div>}<p className="muted">The month is still open, so this is recorded as a salary advance. It reduces Cash/Bank now and is automatically recovered when this Payroll is finalized.</p>{errorMessage(mutation.error) && <p className="field-error">{errorMessage(mutation.error)}</p>}<div className="form-actions"><button type="submit" disabled={mutation.isPending || destinations.length === 0 || eligibleAccounts.length === 0}>{mutation.isPending ? 'Posting…' : 'Pay advance from account'}</button><button type="button" className="secondary-button" onClick={onClose}>Cancel</button></div></form></div></section></div>;
}

/** Render the source-derived salary ledger for one Employee. */
function SalaryLedgerModal({ employeeId, projects, onClose }: Readonly<{ employeeId: string; projects: readonly Readonly<{ id: string; projectCode: string; name: string }>[]; onClose: () => void }>) {
  const [projectId, setProjectId] = useState('');
  const ledger = useEmployeeSalaryLedger(employeeId, projectId || undefined);
  const entryLabel = (type: string) => ({ SALARY_DUE: 'Salary earned', PAYMENT: 'Salary payment', PAYMENT_REVERSAL: 'Payment reversal', ADVANCE: 'Salary advance', ADVANCE_REVERSAL: 'Advance reversal', ADVANCE_RECOVERY: 'Advance recovered' }[type] ?? type);
  return <div className="finance-modal-backdrop" role="presentation"><section className="finance-modal finance-modal-wide" role="dialog" aria-modal="true" aria-labelledby="salary-ledger-title"><header className="finance-modal-header"><div><p className="eyebrow">Employee account</p><h2 id="salary-ledger-title">Project-wise Employee Ledger</h2>{ledger.data && <p>{ledger.data.employee.employeeNo} · {ledger.data.employee.name}</p>}</div><button type="button" className="finance-modal-close" onClick={onClose} aria-label="Close salary ledger">×</button></header><div className="finance-modal-body"><label>Project filter<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}</select></label>{ledger.isPending && <p>Loading Employee ledger…</p>}{errorMessage(ledger.error) && <p className="field-error">{errorMessage(ledger.error)}</p>}{ledger.data && <div className="admin-stack"><div className="equipment-ledger-summary"><span><small>Salary earned</small><strong>{ledger.data.totalSalary}</strong></span><span><small>Salary paid</small><strong>{ledger.data.totalPaid}</strong></span><span><small>Advances paid</small><strong>{ledger.data.totalAdvances}</strong></span><span><small>Advances recovered</small><strong>{ledger.data.totalAdvanceRecovered}</strong></span><span><small>Advance outstanding</small><strong>{ledger.data.advanceOutstanding}</strong></span><span><small>Salary outstanding</small><strong>{ledger.data.outstanding}</strong></span></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Entry</th><th>Project / Stage</th><th>Reference</th><th>Earned / reversal</th><th>Paid / advance</th><th>Balance</th></tr></thead><tbody>{ledger.data.entries.map((entry) => <tr key={entry.id}><td>{entry.entryDate}</td><td>{entryLabel(entry.entryType)}</td><td>{entry.projectName ?? 'Company level'}{entry.stageName ? ` / ${entry.stageName}` : ''}</td><td>{entry.reference}</td><td>{entry.debit}</td><td>{entry.credit}</td><td><strong>{entry.balance}</strong></td></tr>)}{ledger.data.entries.length === 0 && <tr><td colSpan={7} className="muted">No salary, advance, or payment history exists for this selection.</td></tr>}</tbody></table></div></div>}</div></section></div>;
}

/** Confirm reversal of an unrecovered salary advance. */
function AdvanceReversalModal({ advance, onClose }: Readonly<{ advance: EmployeeAdvance; onClose: () => void }>) {
  const mutation = useReverseEmployeeAdvance();
  const [reversalDate, setReversalDate] = useState(() => new Date().toISOString().slice(0, 10) > advance.advanceDate ? new Date().toISOString().slice(0, 10) : advance.advanceDate);
  /** Post the selected compensating advance reversal. */
  async function reverse(): Promise<void> {
    await mutation.mutateAsync({ advanceId: advance.id, reversalDate });
    onClose();
  }
  return <div className="finance-modal-backdrop" role="presentation"><section className="finance-modal" role="dialog" aria-modal="true" aria-labelledby="advance-reversal-title"><header className="finance-modal-header"><div><p className="eyebrow">{advance.advanceNo}</p><h2 id="advance-reversal-title">Reverse Salary Advance</h2><p>{advance.employeeName} · {advance.amount}</p></div><button type="button" className="finance-modal-close" onClick={onClose} aria-label="Close">×</button></header><div className="finance-modal-body"><label>Reversal date<input type="date" min={advance.advanceDate} value={reversalDate} onChange={(event) => setReversalDate(event.target.value)} /></label><p className="muted">This restores the selected Cash/Bank balance. An advance already recovered by finalized Payroll cannot be reversed.</p>{errorMessage(mutation.error) && <p className="field-error">{errorMessage(mutation.error)}</p>}<div className="form-actions"><button type="button" disabled={mutation.isPending} onClick={() => void reverse()}>{mutation.isPending ? 'Reversing…' : 'Reverse advance'}</button><button type="button" className="secondary-button" onClick={onClose}>Cancel</button></div></div></section></div>;
}

/** Confirm an append-only salary-payment reversal in a centered dialog. */
function SalaryPaymentReversalModal({ payment, onClose }: Readonly<{ payment: PayrollPayment; onClose: () => void }>) {
  const mutation = useReversePayrollPayment();
  const [reversalDate, setReversalDate] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    return today > payment.paymentDate ? today : payment.paymentDate;
  });
  /** Post the compensating payment reversal selected by the user. */
  async function reverse(): Promise<void> {
    await mutation.mutateAsync({ paymentId: payment.id, reversalDate });
    onClose();
  }
  return <div className="finance-modal-backdrop" role="presentation"><section className="finance-modal" role="dialog" aria-modal="true" aria-labelledby="salary-reversal-title"><header className="finance-modal-header"><div><p className="eyebrow">{payment.paymentNo}</p><h2 id="salary-reversal-title">Reverse Salary Payment</h2><p>{payment.employeeName} · {payment.amount} · {payment.cashBankAccountName}</p></div><button type="button" className="finance-modal-close" onClick={onClose} aria-label="Close payment reversal">×</button></header><div className="finance-modal-body"><label>Reversal date<input type="date" min={payment.paymentDate} value={reversalDate} onChange={(event) => setReversalDate(event.target.value)} /></label><p className="muted">A compensating journal restores Payroll Payable and the Cash/Bank balance. The original payment remains visible in history.</p>{errorMessage(mutation.error) && <p className="field-error">{errorMessage(mutation.error)}</p>}<div className="form-actions"><button type="button" disabled={!reversalDate || mutation.isPending} onClick={() => void reverse()}>{mutation.isPending ? 'Reversing…' : 'Reverse payment'}</button><button type="button" className="secondary-button" onClick={onClose}>Cancel</button></div></div></section></div>;
}

/** Render the final Attendance and Payroll workflows without duplicating Employee or Project ownership. */
export function LabourPayrollWorkspace(props: LabourPayrollWorkspaceProps) {
  const showAttendance = props.view === 'attendance';
  const showAdvances = props.view === 'advances';
  const showPayrollRuns = props.view === 'daily-payroll' || props.view === 'monthly-payroll' || props.view === 'payments';
  const showPayrollCreation = props.view === 'daily-payroll' || props.view === 'monthly-payroll';
  const showPayments = props.view === 'payments';
  const showLedger = props.view === 'ledger';
  const canAccessPayrollRuns = props.canReadPayroll
    || props.canCreatePayroll
    || props.canCalculatePayroll
    || props.canFinalizePayroll
    || props.canCreatePayrollPayment;
  const activeEmployees = useEmployees({ status: 'ACTIVE', pageSize: 100 }, !showLedger && (showAttendance || showAdvances || showPayrollRuns));
  const ledgerEmployees = useEmployees({ pageSize: 100 }, showLedger);
  const employees = showLedger ? ledgerEmployees : activeEmployees;
  const projects = useProjects({ status: 'ACTIVE', pageSize: 100 }, showAttendance || showAdvances || showLedger || showPayrollRuns);
  const attendance = useAttendance({ pageSize: 100 }, showAttendance && props.canReadAttendance);
  const runs = usePayrollRuns(showPayrollRuns && canAccessPayrollRuns);
  const cashBankAccounts = usePayrollCashBankAccounts((showPayments && props.canCreatePayrollPayment) || ((showAdvances || showPayrollCreation) && props.canCreateEmployeeAdvance));
  const payments = usePayrollPayments({}, showPayments && props.canReadPayroll);
  const advances = useEmployeeAdvances({}, showAdvances && props.canReadPayroll);
  const createAttendanceMutation = useCreateAttendance();
  const createRunMutation = useCreatePayrollRun();
  const createAdvanceMutation = useCreateEmployeeAdvance();
  const [selectedAttendance, setSelectedAttendance] = useState<AttendanceEntry | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedPayrollProjectId, setSelectedPayrollProjectId] = useState('');
  const [selectedPayrollEmployeeId, setSelectedPayrollEmployeeId] = useState('');
  const [overtimeMultiplier, setOvertimeMultiplier] = useState('');
  const [paymentLine, setPaymentLine] = useState<PayrollLine | null>(null);
  const [advanceLine, setAdvanceLine] = useState<PayrollLine | null>(null);
  const [ledgerEmployeeId, setLedgerEmployeeId] = useState<string | null>(null);
  const [reversalPayment, setReversalPayment] = useState<PayrollPayment | null>(null);
  const [reversalAdvance, setReversalAdvance] = useState<EmployeeAdvance | null>(null);
  const [advanceDialogOpen, setAdvanceDialogOpen] = useState(false);
  const [accountProjectId, setAccountProjectId] = useState<string | null>(null);
  const selectedRun = usePayrollRun(selectedRunId, canAccessPayrollRuns);
  const eligiblePayrollEmployees = usePayrollEligibleEmployees(
    selectedRunId,
    selectedPayrollProjectId,
    showPayrollCreation
      && props.canCalculatePayroll
      && (selectedRun.data?.payCycle === 'MONTHLY' || selectedRun.data?.payCycle === 'DAILY')
      && selectedRun.data.status !== 'FINALIZED'
      && selectedPayrollProjectId.length > 0
  );
  const overtimeMultiplierValid = overtimeMultiplier === ''
    || (/^(?:[1-9]\d{0,2})(?:\.\d{1,4})?$/.test(overtimeMultiplier) && Number(overtimeMultiplier) <= 10);
  const selectedPayrollPeriodClosed = Boolean(selectedRun.data && new Date().toISOString().slice(0, 10) >= selectedRun.data.periodEnd);

  useEffect(() => {
    setOvertimeMultiplier(selectedRun.data?.overtimeMultiplier ?? '');
  }, [selectedRun.data?.id, selectedRun.data?.overtimeMultiplier]);

  /** Reset the Employee target when a different Payroll Run opens. */
  useEffect(() => {
    setSelectedPayrollEmployeeId('');
  }, [selectedRunId]);

  /** Default the calculation Project when only one permitted Project is available. */
  useEffect(() => {
    if (!showPayrollCreation || (selectedRun.data?.payCycle !== 'MONTHLY' && selectedRun.data?.payCycle !== 'DAILY')) return;
    const availableProjects = projects.data?.items ?? [];
    if (selectedPayrollProjectId && availableProjects.some((project) => project.id === selectedPayrollProjectId)) return;
    setSelectedPayrollProjectId(availableProjects.length === 1 ? availableProjects[0]?.id ?? '' : '');
    setSelectedPayrollEmployeeId('');
  }, [projects.data?.items, selectedPayrollProjectId, selectedRun.data?.payCycle, showPayrollCreation]);

  const attendanceForm = useForm<AttendanceFormValues>({
    resolver: zodResolver(attendanceFormSchema),
    defaultValues: { employeeId: '', projectId: '', stageId: '', workDate: new Date().toISOString().slice(0, 10), status: 'PRESENT', hours: '8', overtimeHours: '' }
  });
  const correctionForm = useForm<CorrectionFormValues>({
    resolver: zodResolver(correctionFormSchema),
    defaultValues: { stageId: '', status: 'PRESENT', hours: '', overtimeHours: '' }
  });
  const payrollForm = useForm<PayrollFormValues>({
    resolver: zodResolver(payrollFormSchema),
    defaultValues: props.view === 'daily-payroll'
      ? { payCycle: 'DAILY', periodStart: new Date().toISOString().slice(0, 10), periodEnd: new Date().toISOString().slice(0, 10) }
      : currentPayrollPeriod()
  });
  const payrollPayCycle = payrollForm.watch('payCycle');
  const advanceForm = useForm<AdvanceFormValues>({
    resolver: zodResolver(advanceFormSchema),
    defaultValues: { employeeId: '', projectId: '', stageId: '', advanceDate: new Date().toISOString().slice(0, 10), amount: '', cashBankAccountId: '', reason: '', reference: '' }
  });
  const advanceProjectId = advanceForm.watch('projectId');
  const advanceStages = useProjectStages(advanceProjectId || null, Boolean(advanceProjectId));
  const selectedProjectId = attendanceForm.watch('projectId');
  const selectedEmployeeId = attendanceForm.watch('employeeId');
  const selectedStageId = attendanceForm.watch('stageId');
  const selectedWorkDate = attendanceForm.watch('workDate');
  const createStages = useProjectStages(selectedProjectId || null, Boolean(selectedProjectId));
  const attendanceAssignments = useAttendanceAssignments(selectedEmployeeId, selectedWorkDate, props.canCreateAttendance);
  const correctionStages = useProjectStages(selectedAttendance?.projectId ?? null, Boolean(selectedAttendance));
  const correctionMutation = useUpdateAttendance(selectedAttendance?.id ?? '00000000-0000-0000-0000-000000000000');
  const calculateMutation = useCalculatePayrollRun(selectedRunId ?? '00000000-0000-0000-0000-000000000000');
  const finalizeMutation = useFinalizePayrollRun(selectedRunId ?? '00000000-0000-0000-0000-000000000000');

  const projectNames = useMemo(() => new Map((projects.data?.items ?? []).map((item) => [item.id, `${item.projectCode} · ${item.name}`])), [projects.data]);
  const visibleRuns = useMemo(() => (runs.data?.items ?? []).filter((run) => {
    if (props.view === 'daily-payroll') return run.payCycle === 'DAILY';
    if (props.view === 'monthly-payroll') return run.payCycle === 'MONTHLY' || run.payCycle === 'LEGACY';
    if (props.view === 'payments') return run.status === 'FINALIZED';
    return true;
  }), [props.view, runs.data?.items]);
  const advanceAccounts = (cashBankAccounts.data ?? []).filter((account) => account.projectId === advanceProjectId || account.projectId === null);

  const eligibleProjectIds = useMemo(() => new Set((attendanceAssignments.data ?? []).map((assignment) => assignment.projectId)), [attendanceAssignments.data]);
  const attendanceProjects = useMemo(
    () => (projects.data?.items ?? []).filter((project) => eligibleProjectIds.has(project.id)),
    [eligibleProjectIds, projects.data?.items]
  );
  const eligibleAssignments = useMemo(
    () => (attendanceAssignments.data ?? []).filter((assignment) => assignment.projectId === selectedProjectId),
    [attendanceAssignments.data, selectedProjectId]
  );
  const hasProjectLevelAssignment = eligibleAssignments.some((assignment) => assignment.stageId === null);
  const eligibleStageIds = useMemo(
    () => new Set(eligibleAssignments.flatMap((assignment) => assignment.stageId ? [assignment.stageId] : [])),
    [eligibleAssignments]
  );
  const eligibleStages = useMemo(
    () => hasProjectLevelAssignment
      ? (createStages.data?.items ?? [])
      : (createStages.data?.items ?? []).filter((stage) => eligibleStageIds.has(stage.id)),
    [createStages.data?.items, eligibleStageIds, hasProjectLevelAssignment]
  );
  const attendanceDestinationValid = Boolean(
    selectedEmployeeId
    && selectedProjectId
    && selectedWorkDate
    && (selectedStageId ? hasProjectLevelAssignment || eligibleStageIds.has(selectedStageId) : hasProjectLevelAssignment)
  );

  /** Keep attendance on a destination covered by the Employee's effective Project Team assignment. */
  useEffect(() => {
    if (!selectedEmployeeId || !selectedWorkDate || attendanceAssignments.isPending) return;
    if (selectedProjectId && !eligibleProjectIds.has(selectedProjectId)) {
      attendanceForm.setValue('projectId', '');
      attendanceForm.setValue('stageId', '');
      return;
    }
    if (!selectedProjectId || createStages.isPending) return;
    if (hasProjectLevelAssignment) {
      if (selectedStageId && !(createStages.data?.items ?? []).some((stage) => stage.id === selectedStageId)) {
        attendanceForm.setValue('stageId', '');
      }
      return;
    }
    if (!eligibleStageIds.has(selectedStageId)) attendanceForm.setValue('stageId', eligibleStages[0]?.id ?? '');
  }, [attendanceAssignments.isPending, attendanceForm, createStages.data?.items, createStages.isPending, eligibleProjectIds, eligibleStageIds, eligibleStages, hasProjectLevelAssignment, selectedEmployeeId, selectedProjectId, selectedStageId, selectedWorkDate]);

  /** Synchronize correction fields when the user selects an attendance row. */
  useEffect(() => {
    if (!selectedAttendance) return;
    correctionForm.reset({
      stageId: selectedAttendance.stageId ?? '',
      status: selectedAttendance.status,
      hours: selectedAttendance.hours ?? '',
      overtimeHours: selectedAttendance.overtimeHours ?? ''
    });
  }, [correctionForm, selectedAttendance]);

  /** Create one attendance row from final Employee/Project/Stage identifiers. */
  async function submitAttendance(values: AttendanceFormValues): Promise<void> {
    await createAttendanceMutation.mutateAsync({
      employeeId: values.employeeId,
      projectId: values.projectId,
      stageId: values.stageId || null,
      workDate: values.workDate,
      status: values.status,
      hours: values.hours || null,
      overtimeHours: values.overtimeHours || null
    });
  }

  /** Save one permitted attendance correction without changing Employee or Project ownership. */
  async function submitCorrection(values: CorrectionFormValues): Promise<void> {
    if (!selectedAttendance) return;
    await correctionMutation.mutateAsync({
      stageId: values.stageId || null,
      status: values.status,
      hours: values.hours || null,
      overtimeHours: values.overtimeHours || null
    });
    setSelectedAttendance(null);
  }

  /** Create one DRAFT Payroll period for later calculation. */
  async function submitPayrollRun(values: PayrollFormValues): Promise<void> {
    const created = await createRunMutation.mutateAsync(values);
    setSelectedRunId(created.id);
  }

  /** Set safe dates whenever the operator changes between daily and monthly settlement. */
  function changePayCycle(payCycle: PayrollFormValues['payCycle']): void {
    if (payCycle === 'DAILY') {
      const today = new Date().toISOString().slice(0, 10);
      payrollForm.reset({ payCycle, periodStart: today, periodEnd: today });
      return;
    }
    payrollForm.reset(currentPayrollPeriod());
  }

  /** Pay an immediate Employee salary advance against one assigned Project. */
  async function submitAdvance(values: AdvanceFormValues): Promise<void> {
    await createAdvanceMutation.mutateAsync({ ...values, stageId: values.stageId || null, reference: values.reference || null });
    advanceForm.reset({ employeeId: '', projectId: '', stageId: '', advanceDate: new Date().toISOString().slice(0, 10), amount: '', cashBankAccountId: '', reason: '', reference: '' });
    setAdvanceDialogOpen(false);
  }

  /** Open a fresh salary-advance dialog without carrying values or errors from the previous entry. */
  function openAdvanceDialog(): void {
    createAdvanceMutation.reset();
    advanceForm.reset({ employeeId: '', projectId: '', stageId: '', advanceDate: new Date().toISOString().slice(0, 10), amount: '', cashBankAccountId: '', reason: '', reference: '' });
    setAdvanceDialogOpen(true);
  }

  /** Close the salary-advance dialog and clear transient validation/API state. */
  function closeAdvanceDialog(): void {
    createAdvanceMutation.reset();
    advanceForm.reset({ employeeId: '', projectId: '', stageId: '', advanceDate: new Date().toISOString().slice(0, 10), amount: '', cashBankAccountId: '', reason: '', reference: '' });
    setAdvanceDialogOpen(false);
  }

  /** Select a Payroll Run while keeping button callbacks simple. */
  function chooseRun(runId: string): void {
    setSelectedRunId(runId);
  }

  /** Select an attendance row for correction. */
  function chooseAttendance(row: AttendanceEntry): void {
    setSelectedAttendance(row);
  }

  /** Close the correction form without changing server state. */
  function cancelCorrection(): void {
    setSelectedAttendance(null);
  }

  /** Calculate one selected Employee for current daily/monthly runs, preserving legacy whole-run behavior. */
  function calculateSelectedRun(): void {
    const run = selectedRun.data;
    if (!run) return;
    if (run.payCycle === 'MONTHLY') {
      if (!selectedPayrollProjectId || !selectedPayrollEmployeeId) return;
      calculateMutation.mutate({ projectId: selectedPayrollProjectId, employeeId: selectedPayrollEmployeeId });
      return;
    }
    if (run.payCycle === 'DAILY') {
      if (!selectedPayrollProjectId || !selectedPayrollEmployeeId) return;
      calculateMutation.mutate({ projectId: selectedPayrollProjectId, employeeId: selectedPayrollEmployeeId, ...(overtimeMultiplier ? { overtimeMultiplier } : {}) });
      return;
    }
    calculateMutation.mutate(overtimeMultiplier ? { overtimeMultiplier } : {});
  }

  /** Confirm the irreversible accounting and Project-cost posting before finalization. */
  function confirmFinalize(): void {
    if (!selectedRun.data || !window.confirm(`Finalize payroll for ${selectedRun.data.periodStart} to ${selectedRun.data.periodEnd}? This posts Finance and Project costs and cannot be edited afterward.`)) return;
    finalizeMutation.mutate();
  }

  const pageCopy: Record<LabourPayrollWorkspaceView, Readonly<{ eyebrow: string; title: string; description: string }>> = {
    attendance: { eyebrow: 'Time & attendance', title: 'Attendance Register', description: 'Record daily presence against an active Employee Project/Stage assignment and correct unfinalized entries.' },
    advances: { eyebrow: 'Employee settlements', title: 'Salary Advances', description: 'Pay urgent Employee advances from Cash/Bank, track recovery and retain reversal history.' },
    'daily-payroll': { eyebrow: 'Daily-paid workers', title: 'Daily Settlements', description: 'Calculate one work date, finalize earned daily wages and create the Employee Salary payable.' },
    'monthly-payroll': { eyebrow: 'Monthly employees', title: 'Monthly Payroll', description: 'Calculate salary proration, absence deductions and advance recovery for the selected month.' },
    payments: { eyebrow: 'Payroll settlement', title: 'Salary Payments', description: 'Open a finalized Payroll, pay an outstanding Employee from Cash/Bank and review posted payment history.' },
    ledger: { eyebrow: 'Employee account', title: 'Employee Ledger', description: 'Choose an Employee to review Project-wise salary, advance, payment and outstanding balances.' }
  };
  const activePageCopy = pageCopy[props.view];

  return (
    <div className="stack employee-task-page">
      {showAdvances ? (
        <div className="section-heading client-page-heading">
          <div>
            <p className="eyebrow">{activePageCopy.eyebrow}</p>
            <h1>{activePageCopy.title}</h1>
            <p className="muted">{activePageCopy.description}</p>
          </div>
          {props.canCreateEmployeeAdvance && (
            <button type="button" className="client-primary-action" aria-haspopup="dialog" onClick={openAdvanceDialog}>
              <span aria-hidden="true">+</span> Add advance
            </button>
          )}
        </div>
      ) : (
        <div className="section-heading">
          <p className="eyebrow">{activePageCopy.eyebrow}</p>
          <h1>{activePageCopy.title}</h1>
          <p className="muted">{activePageCopy.description}</p>
        </div>
      )}

      {showAttendance && props.canCreateAttendance && (
        <section className="admin-card">
          <h2>Mark attendance</h2>
          <form className="form-grid" onSubmit={attendanceForm.handleSubmit(submitAttendance)}>
            <label>Employee<select {...attendanceForm.register('employeeId')}><option value="">Select Employee</option>{(employees.data?.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.employeeNo} · {item.name}</option>)}</select><span className="field-error">{attendanceForm.formState.errors.employeeId?.message}</span></label>
            <label>Project<select {...attendanceForm.register('projectId')} disabled={!selectedEmployeeId || !selectedWorkDate || attendanceAssignments.isPending}><option value="">Select assigned Project</option>{attendanceProjects.map((item) => <option key={item.id} value={item.id}>{item.projectCode} · {item.name}</option>)}</select><span className="field-error">{attendanceForm.formState.errors.projectId?.message}</span></label>
            <label>Stage<select {...attendanceForm.register('stageId')} disabled={!selectedProjectId || attendanceAssignments.isPending}><option value="" disabled={!hasProjectLevelAssignment}>Project level</option>{eligibleStages.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
            <label>Work date<input type="date" {...attendanceForm.register('workDate')} /><span className="field-error">{attendanceForm.formState.errors.workDate?.message}</span></label>
            <label>Status<select {...attendanceForm.register('status')}><option value="PRESENT">Present</option><option value="ABSENT">Absent</option></select></label>
            <label>Hours<input inputMode="decimal" {...attendanceForm.register('hours')} /><span className="field-error">{attendanceForm.formState.errors.hours?.message}</span></label>
            <label>Overtime hours (hourly-paid only)<input inputMode="decimal" {...attendanceForm.register('overtimeHours')} /><span className="field-error">{attendanceForm.formState.errors.overtimeHours?.message}</span></label>
            <div className="form-actions"><button type="submit" disabled={createAttendanceMutation.isPending || attendanceAssignments.isPending || !attendanceDestinationValid}>Save attendance</button></div>
          </form>
          {attendanceAssignments.isPending && selectedEmployeeId && <p className="muted">Checking the Employee's effective Project/Stage assignments…</p>}
          {errorMessage(attendanceAssignments.error) && <p className="field-error">Could not verify Project Team assignments: {errorMessage(attendanceAssignments.error)}</p>}
          {!attendanceAssignments.isPending && selectedEmployeeId && selectedWorkDate && (attendanceAssignments.data?.length ?? 0) === 0 && <p className="field-error">This Employee has no active Project/Stage assignment on {selectedWorkDate}. Create the assignment in Project Team / Assignment before marking attendance.</p>}
          {!attendanceAssignments.isPending && eligibleAssignments.length > 0 && !hasProjectLevelAssignment && <p className="muted">Attendance is limited to the Employee's assigned Stage for this date.</p>}
          {errorMessage(createAttendanceMutation.error) && <p className="field-error">{errorMessage(createAttendanceMutation.error)}</p>}
        </section>
      )}

      {showAttendance && props.canReadAttendance && (
        <section className="admin-card">
          <h2>Attendance register <small className="muted">({attendance.data?.total ?? 0} total · page {attendance.data?.page ?? 1} · {attendance.data?.pageSize ?? 100} per page)</small></h2>
          {attendance.isLoading && <p className="muted">Loading attendance…</p>}
          {errorMessage(attendance.error) && <p className="field-error">{errorMessage(attendance.error)}</p>}
          <div className="table-scroll"><table><thead><tr><th>Date</th><th>Employee</th><th>Project</th><th>Stage</th><th>Status</th><th>Hours</th><th>Overtime</th><th>Entered by</th>{props.canCorrectAttendance && <th>Action</th>}</tr></thead><tbody>
            {(attendance.data?.items ?? []).map((row) => <tr key={row.id}><td>{row.workDate}</td><td><strong>{row.employeeName}</strong><br /><small className="muted">{row.employeeNo}</small></td><td><strong>{row.projectName}</strong><br /><small className="muted">{row.projectCode}</small></td><td>{row.stageName ?? 'Project level'}</td><td>{row.status}</td><td>{row.hours ?? '0'}</td><td>{row.overtimeHours ?? '0'}</td><td>{row.enteredByName}</td>{props.canCorrectAttendance && <td><button type="button" className="secondary-button" onClick={() => chooseAttendance(row)}>Correct</button></td>}</tr>)}
            {(attendance.data?.items.length ?? 0) === 0 && <tr><td colSpan={props.canCorrectAttendance ? 9 : 8} className="muted">No attendance records.</td></tr>}
          </tbody></table></div>
        </section>
      )}

      {showAttendance && selectedAttendance && props.canCorrectAttendance && (
        <section className="admin-card">
          <h2>Correct attendance</h2>
          <p className="muted">Employee and Project remain fixed. Finalized Payroll locks the source attendance history.</p>
          <form className="form-grid" onSubmit={correctionForm.handleSubmit(submitCorrection)}>
            <label>Stage<select {...correctionForm.register('stageId')}><option value="">Project level</option>{(correctionStages.data?.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
            <label>Status<select {...correctionForm.register('status')}><option value="PRESENT">Present</option><option value="ABSENT">Absent</option></select></label>
            <label>Hours<input {...correctionForm.register('hours')} /><span className="field-error">{correctionForm.formState.errors.hours?.message}</span></label>
            <label>Overtime hours (hourly-paid only)<input {...correctionForm.register('overtimeHours')} /><span className="field-error">{correctionForm.formState.errors.overtimeHours?.message}</span></label>
            <div className="form-actions"><button type="submit" disabled={correctionMutation.isPending}>Save correction</button><button type="button" className="secondary-button" onClick={cancelCorrection}>Cancel</button></div>
          </form>
          {errorMessage(correctionMutation.error) && <p className="field-error">{errorMessage(correctionMutation.error)}</p>}
        </section>
      )}

      {showAdvances && props.canReadPayroll && (
        <section className="admin-card">
          <h2>Employee advance register <small className="muted">({advances.data?.total ?? 0} records)</small></h2>
          <div className="table-scroll"><table><thead><tr><th>Advance</th><th>Date</th><th>Employee</th><th>Project / Stage</th><th>Account</th><th>Amount</th><th>Recovered</th><th>Outstanding</th><th>Status</th><th>Action</th></tr></thead><tbody>{(advances.data?.items ?? []).map((advance) => <tr key={advance.id}><td><strong>{advance.advanceNo}</strong><br /><small>{advance.reason}</small></td><td>{advance.advanceDate}</td><td>{advance.employeeName}<br /><small>{advance.employeeNo}</small></td><td>{advance.projectCode} · {advance.projectName}{advance.stageName ? <><br /><small>{advance.stageName}</small></> : null}</td><td>{advance.cashBankAccountName}</td><td>{advance.amount}</td><td>{advance.recoveredAmount}</td><td><strong>{advance.outstandingAmount}</strong></td><td>{advance.status}</td><td><div className="button-row"><button type="button" className="secondary-button" onClick={() => setLedgerEmployeeId(advance.employeeId)}>Ledger</button>{props.canReverseEmployeeAdvance && advance.status === 'POSTED' && advance.recoveredAmount === '0.00' && <button type="button" className="secondary-button" onClick={() => setReversalAdvance(advance)}>Reverse</button>}</div></td></tr>)}{(advances.data?.items.length ?? 0) === 0 && <tr><td colSpan={10} className="muted">No Employee salary advances have been posted.</td></tr>}</tbody></table></div>
        </section>
      )}

      {showPayrollCreation && props.canCreatePayroll && (
        <section className="admin-card">
          <h2>Create {props.view === 'daily-payroll' ? 'daily settlement' : 'monthly payroll'}</h2>
          <p className="muted">The server includes only active Employees whose effective compensation belongs to this payment schedule.</p>
          <form className="form-grid" onSubmit={payrollForm.handleSubmit(submitPayrollRun)}>
            <label>Payment schedule<select value={payrollPayCycle} onChange={(event) => changePayCycle(event.target.value as PayrollFormValues['payCycle'])} disabled><option value="DAILY">Daily-paid workers</option><option value="MONTHLY">Monthly employees</option></select></label>
            <input type="hidden" {...payrollForm.register('payCycle')} />
            <label>{payrollPayCycle === 'DAILY' ? 'Work / settlement date' : 'Month start'}<input type="date" {...payrollForm.register('periodStart', { onChange: (event) => { if (payrollPayCycle === 'DAILY') payrollForm.setValue('periodEnd', event.target.value); } })} /><span className="field-error">{payrollForm.formState.errors.periodStart?.message}</span></label>
            <label className={payrollPayCycle === 'DAILY' ? 'payroll-hidden-period-end' : undefined}>Month end<input type="date" readOnly={payrollPayCycle === 'DAILY'} {...payrollForm.register('periodEnd')} /><span className="field-error">{payrollForm.formState.errors.periodEnd?.message}</span></label>
            <div className="payroll-cycle-guidance"><strong>{payrollPayCycle === 'DAILY' ? 'Daily close' : 'Month-end payroll'}</strong><span>{payrollPayCycle === 'DAILY' ? 'Pays one daily wage for each present worker after attendance is approved.' : 'Calculates monthly salary, joining-date proration, absence deduction and advance recovery.'}</span></div>
            <div className="form-actions"><button type="submit" disabled={createRunMutation.isPending}>{createRunMutation.isPending ? 'Creating…' : `Create ${payrollPayCycle === 'DAILY' ? 'daily settlement' : 'monthly payroll'}`}</button></div>
          </form>
          {errorMessage(createRunMutation.error) && <p className="field-error">{errorMessage(createRunMutation.error)}</p>}
        </section>
      )}

      {showPayrollRuns && canAccessPayrollRuns && (
        <section className="admin-card">
          <h2>{showPayments ? 'Finalized payroll available for payment' : `${props.view === 'daily-payroll' ? 'Daily settlement' : 'Monthly payroll'} runs`} <small className="muted">({visibleRuns.length} shown)</small></h2>
          {errorMessage(runs.error) && <p className="field-error">{errorMessage(runs.error)}</p>}
          <div className="table-scroll"><table><thead><tr><th>Schedule</th><th>Period</th><th>Status</th><th>Created by</th><th>Finalized</th><th>Detail</th></tr></thead><tbody>
            {visibleRuns.map((run) => <tr key={run.id}><td><span className={`payroll-cycle-badge payroll-cycle-badge-${run.payCycle.toLowerCase()}`}>{payCycleLabel(run.payCycle)}</span></td><td>{run.periodStart} → {run.periodEnd}</td><td>{run.status}</td><td>{run.createdByName}</td><td>{run.finalizedAt ?? '—'}</td><td><button type="button" className="secondary-button" onClick={() => chooseRun(run.id)}>Open</button></td></tr>)}
            {visibleRuns.length === 0 && <tr><td colSpan={6} className="muted">{showPayments ? 'No finalized Payroll is available for payment.' : 'No Payroll Runs for this schedule.'}</td></tr>}
          </tbody></table></div>
        </section>
      )}

      {showPayrollRuns && selectedRunId && selectedRun.data && (
        <section className="admin-card payroll-preview-card">
          <div className="payroll-preview-header">
            <div>
              <p className="eyebrow">Payroll calculation preview</p>
              <h2>{payCycleLabel(selectedRun.data.payCycle)} · {selectedRun.data.periodStart} → {selectedRun.data.periodEnd}</h2>
              <p className="muted">Created by {selectedRun.data.createdByName} · Finalized {selectedRun.data.finalizedAt ?? '—'}</p>
            </div>
            <span className={`payroll-status-pill payroll-status-${selectedRun.data.status.toLowerCase()}`}>{selectedRun.data.status}</span>
          </div>

          <div className="payroll-summary-grid" aria-label="Payroll totals">
            {selectedRun.data.payCycle === 'DAILY' ? (
              <>
                <article><span>Gross daily earnings</span><strong><Money value={sumMoney(selectedRun.data.lines.map((line) => line.grossAmount))} /></strong></article>
                <article><span>Advance recovery</span><strong><Money value={sumMoney(selectedRun.data.lines.map((line) => line.advanceDeduction))} /></strong></article>
                <article><span>Net payable</span><strong><Money value={sumMoney(selectedRun.data.lines.map((line) => line.netAmount))} /></strong></article>
                <article><span>Paid</span><strong><Money value={sumMoney(selectedRun.data.lines.map((line) => line.paidAmount))} /></strong></article>
                <article><span>Outstanding</span><strong><Money value={sumMoney(selectedRun.data.lines.map((line) => line.outstandingAmount))} /></strong></article>
              </>
            ) : (
              <>
                <article><span>Salary before absence</span><strong><Money value={sumMoney(selectedRun.data.lines.map((line) => line.salaryBeforeAbsence))} /></strong></article>
                <article><span>Absence deduction</span><strong><Money value={sumMoney(selectedRun.data.lines.map((line) => line.absenceDeduction))} /></strong></article>
                <article><span>Earned salary</span><strong><Money value={sumMoney(selectedRun.data.lines.map((line) => line.grossAmount))} /></strong></article>
                <article><span>Advance recovery</span><strong><Money value={sumMoney(selectedRun.data.lines.map((line) => line.advanceDeduction))} /></strong></article>
                <article><span>Net payroll</span><strong><Money value={sumMoney(selectedRun.data.lines.map((line) => line.netAmount))} /></strong></article>
              </>
            )}
          </div>

          {props.canCalculatePayroll && selectedRun.data.status !== 'FINALIZED' && (selectedRun.data.payCycle === 'MONTHLY' || selectedRun.data.payCycle === 'DAILY') && (
            <div className="payroll-calculation-panel">
              <div className="payroll-calculation-copy">
                <p className="eyebrow">Calculate employee</p>
                <h3>{selectedRun.data.payCycle === 'DAILY' ? 'Select the Project and daily-paid Employee' : 'Select the Project and monthly-salary Employee'}</h3>
                <p className="muted">{selectedRun.data.payCycle === 'DAILY' ? 'Only active daily/hourly Employees with present attendance in the selected Project on this settlement date are available.' : 'Only active Employees assigned to the selected Project with effective monthly salary are available.'}</p>
              </div>
              <div className="payroll-selector-grid">
                <label>Project
                  <select value={selectedPayrollProjectId} onChange={(event) => { setSelectedPayrollProjectId(event.target.value); setSelectedPayrollEmployeeId(''); }}>
                    <option value="">Select Project</option>
                    {(projects.data?.items ?? []).map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}
                  </select>
                </label>
                <label>{selectedRun.data.payCycle === 'DAILY' ? 'Daily / hourly Employee' : 'Monthly salary Employee'}
                  <select value={selectedPayrollEmployeeId} onChange={(event) => setSelectedPayrollEmployeeId(event.target.value)} disabled={!selectedPayrollProjectId || eligiblePayrollEmployees.isPending}>
                    <option value="">{eligiblePayrollEmployees.isPending ? 'Loading Employees…' : 'Select Employee'}</option>
                    {(eligiblePayrollEmployees.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeNo} · {employee.name} · {employee.payType === 'HOURLY' ? `Hourly ${employee.hourlyRate ?? '—'}` : employee.payType === 'DAILY' ? `Daily ${employee.baseSalary ?? '—'}` : `Base ${employee.baseSalary ?? '—'}`}{selectedRun.data.lines.some((line) => line.employeeId === employee.id) ? ' · calculated' : ''}</option>)}
                  </select>
                </label>
              </div>
              {errorMessage(eligiblePayrollEmployees.error) && <p className="field-error">{errorMessage(eligiblePayrollEmployees.error)}</p>}
              {!eligiblePayrollEmployees.isPending && selectedPayrollProjectId && (eligiblePayrollEmployees.data?.length ?? 0) === 0 && <p className="muted payroll-empty-note">{selectedRun.data.payCycle === 'DAILY' ? 'No present daily/hourly Employees are available in this Project for the settlement date.' : 'No active monthly-salary Employees are assigned to this Project for the Payroll period.'}</p>}
            </div>
          )}

          {props.canCalculatePayroll && selectedRun.data.status !== 'FINALIZED' && selectedRun.data.payCycle !== 'MONTHLY' && (
            <label className="payroll-overtime-field">Hourly overtime multiplier (optional)<input type="number" inputMode="decimal" min="1" max="10" step="0.0001" value={overtimeMultiplier} onChange={(event) => setOvertimeMultiplier(event.target.value)} placeholder="Example: 1.5" /><small className="muted">Only enter this when an hourly-paid Employee has overtime. Enter 1.5 for 150% pay—not an hourly rate or percentage.</small>{!overtimeMultiplierValid && <span className="field-error">Enter a multiplier between 1 and 10.</span>}</label>
          )}

          <div className="payroll-preview-actions">
            {props.canCalculatePayroll && selectedRun.data.status !== 'FINALIZED' && <button type="button" onClick={calculateSelectedRun} disabled={calculateMutation.isPending || !overtimeMultiplierValid || ((selectedRun.data.payCycle === 'MONTHLY' || selectedRun.data.payCycle === 'DAILY') && (!selectedPayrollProjectId || !selectedPayrollEmployeeId))}>{calculateMutation.isPending ? 'Calculating…' : selectedRun.data.payCycle === 'MONTHLY' ? 'Calculate employee salary' : selectedRun.data.payCycle === 'DAILY' ? 'Calculate employee pay' : 'Calculate'}</button>}
            {props.canFinalizePayroll && selectedRun.data.status === 'CALCULATED' && <button type="button" className="secondary-button" onClick={confirmFinalize} disabled={finalizeMutation.isPending || !selectedPayrollPeriodClosed}>Finalize & post</button>}
          </div>
          {selectedRun.data.status === 'CALCULATED' && !selectedPayrollPeriodClosed && <p className="muted payroll-period-note">This is an open Payroll period. It can be reviewed now and finalized on or after {selectedRun.data.periodEnd}.</p>}
          {errorMessage(calculateMutation.error) && <p className="field-error">{errorMessage(calculateMutation.error)}</p>}
          {errorMessage(finalizeMutation.error) && <p className="field-error">{errorMessage(finalizeMutation.error)}</p>}

          <div className="payroll-results-heading">
            <div><h3>Calculated Employees</h3><p className="muted">{selectedRun.data.payCycle === 'DAILY' ? 'Calculate one present daily/hourly Employee at a time; previously calculated workers stay in this settlement.' : 'Each calculation updates only the selected Employee and keeps previously calculated Employees in this run.'}</p></div>
            <span>{selectedRun.data.lines.length} employee{selectedRun.data.lines.length === 1 ? '' : 's'}</span>
          </div>
          <div className="table-scroll payroll-results-table"><table><thead><tr><th>Employee</th>{selectedRun.data.payCycle === 'DAILY' ? <><th>Gross earnings</th><th>Advance recovery</th><th>Net payable</th><th>Paid</th><th>Outstanding</th></> : <><th>Salary before absence</th><th>Absence deduction</th><th>Earned salary</th><th>Advance recovery</th><th>Net</th><th>Paid</th><th>Outstanding</th></>}<th>Project / Stage Employee Salary cost</th><th>Payslip</th><th>Action</th></tr></thead><tbody>
            {selectedRun.data.lines.map((line) => <tr key={line.id}><td><strong>{line.employeeName}</strong><br /><small className="muted">{line.employeeNo}</small></td>{selectedRun.data.payCycle === 'DAILY' ? <><td><Money value={line.grossAmount} /></td><td><Money value={line.advanceDeduction} /></td><td><strong><Money value={line.netAmount} /></strong></td><td><Money value={line.paidAmount} /></td><td><strong><Money value={line.outstandingAmount} /></strong></td></> : <><td><Money value={line.salaryBeforeAbsence} /></td><td><Money value={line.absenceDeduction} /></td><td><Money value={line.grossAmount} /></td><td><Money value={line.advanceDeduction} /></td><td><strong><Money value={line.netAmount} /></strong></td><td><Money value={line.paidAmount} /></td><td><strong><Money value={line.outstandingAmount} /></strong></td></>}<td>{line.projectAllocation.length === 0 ? 'Historical allocation unavailable' : line.projectAllocation.map((allocation) => <div className="payroll-allocation-line" key={`${allocation.projectId}:${allocation.stageId ?? ''}:${allocation.category}`}>{projectNames.get(allocation.projectId) ?? 'Project'} / {allocation.stageId ? 'Selected stage' : 'Project level'} · {allocation.category === 'security' ? 'Security Employee Salary' : 'Employee Salary'} · <Money value={allocation.amount} /></div>)}</td><td>{line.payslip ? <>Generated {line.payslip.generatedAt ?? '—'}</> : 'Not generated'}</td><td><div className="button-row">{showPayments && Number(line.outstandingAmount) > 0 && selectedRun.data.status === 'FINALIZED' && props.canCreatePayrollPayment && <button type="button" title="Pay finalized salary from a Cash or Bank account" onClick={() => setPaymentLine(line)}>Pay salary from account</button>}{showPayrollCreation && Number(line.outstandingAmount) > 0 && selectedRun.data.status !== 'FINALIZED' && props.canCreateEmployeeAdvance && <button type="button" className="secondary-button" title="Record an advance against this open Payroll" onClick={() => setAdvanceLine(line)}>Pay advance</button>}{props.canReadPayroll && <button type="button" className="secondary-button" onClick={() => setLedgerEmployeeId(line.employeeId)}>Ledger</button>}</div></td></tr>)}
            {selectedRun.data.lines.length === 0 && <tr><td colSpan={selectedRun.data.payCycle === 'DAILY' ? 9 : 11} className="payroll-empty-result">{selectedRun.data.payCycle === 'DAILY' ? 'Select a Project and present daily/hourly Employee, then calculate to create the settlement preview.' : 'Select a Project and monthly-salary Employee, then calculate to create the Payroll preview.'}</td></tr>}
          </tbody></table></div>
        </section>
      )}

      {showPayments && props.canReadPayroll && (
        <section className="admin-card">
          <h2>Employee salary payments <small className="muted">({payments.data?.total ?? 0} records)</small></h2>
          <p className="muted">Payments settle finalized Payroll Payable from Cash/Bank. Reversed payments remain visible for audit history.</p>
          {payments.isPending && <p>Loading salary payments…</p>}
          {errorMessage(payments.error) && <p className="field-error">{errorMessage(payments.error)}</p>}
          <div className="table-scroll"><table><thead><tr><th>Payment</th><th>Date</th><th>Employee</th><th>Payroll period</th><th>Account</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>{(payments.data?.items ?? []).map((payment) => <tr key={payment.id}><td><strong>{payment.paymentNo}</strong><br /><small>{payment.reference ?? 'No reference'}</small></td><td>{payment.paymentDate}</td><td><strong>{payment.employeeName}</strong><br /><small>{payment.employeeNo}</small></td><td>{payment.payrollPeriod}</td><td>{payment.cashBankAccountName}</td><td>{payment.amount}</td><td>{payment.status}</td><td><div className="button-row"><button type="button" className="secondary-button" onClick={() => setLedgerEmployeeId(payment.employeeId)}>Ledger</button>{props.canReversePayrollPayment && payment.status === 'POSTED' && <button type="button" className="secondary-button" onClick={() => setReversalPayment(payment)}>Reverse</button>}</div></td></tr>)}{(payments.data?.items.length ?? 0) === 0 && <tr><td colSpan={8} className="muted">No Employee salary payments have been posted.</td></tr>}</tbody></table></div>
        </section>
      )}

      {showLedger && props.canReadPayroll && (
        <section className="admin-card employee-ledger-launcher">
          <div>
            <h2>Open Employee ledger</h2>
            <p className="muted">The ledger is source-derived and can be filtered by Project after it opens.</p>
          </div>
          <label>Employee<select value="" onChange={(event) => setLedgerEmployeeId(event.target.value || null)}><option value="">Select Employee</option>{(employees.data?.items ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeNo} · {employee.name}</option>)}</select></label>
        </section>
      )}

      {showAdvances && advanceDialogOpen && props.canCreateEmployeeAdvance && (
        <div className="client-modal-backdrop" role="presentation" onMouseDown={closeAdvanceDialog}>
          <section className="client-modal client-modal-wide" role="dialog" aria-modal="true" aria-labelledby="salary-advance-create-title" onMouseDown={(event) => event.stopPropagation()}>
            <header className="client-modal-header">
              <div>
                <p className="eyebrow">Employee settlement</p>
                <h2 id="salary-advance-create-title">Pay Employee salary advance</h2>
                <p className="muted">Cash/Bank is reduced immediately and finalized Payroll recovers the advance automatically without adding Employee Salary cost twice.</p>
              </div>
              <button type="button" className="client-modal-close" onClick={closeAdvanceDialog} aria-label="Close salary advance form"><span aria-hidden="true">×</span></button>
            </header>
            <div className="client-modal-body">
              <form className="client-modal-form" onSubmit={advanceForm.handleSubmit(submitAdvance)}>
                <div className="client-form-grid">
                  <label>Employee<select {...advanceForm.register('employeeId')}><option value="">Select Employee</option>{(employees.data?.items ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeNo} · {employee.name}</option>)}</select><span className="field-error">{advanceForm.formState.errors.employeeId?.message}</span></label>
                  <label>Project<select {...advanceForm.register('projectId', { onChange: () => advanceForm.setValue('cashBankAccountId', '') })}><option value="">Select Project</option>{(projects.data?.items ?? []).map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}</select><span className="field-error">{advanceForm.formState.errors.projectId?.message}</span></label>
                  <label>Stage (optional)<select {...advanceForm.register('stageId')} disabled={!advanceProjectId}><option value="">Project level</option>{(advanceStages.data?.items ?? []).map((stage) => <option key={stage.id} value={stage.id}>{stage.code} · {stage.name}</option>)}</select></label>
                  <label>Advance date<input type="date" {...advanceForm.register('advanceDate')} /><span className="field-error">{advanceForm.formState.errors.advanceDate?.message}</span></label>
                  <label>Amount<input inputMode="decimal" {...advanceForm.register('amount')} placeholder="2000.00" /><span className="field-error">{advanceForm.formState.errors.amount?.message}</span></label>
                  <label>Cash / Bank account<select {...advanceForm.register('cashBankAccountId')}><option value="">Select account</option>{advanceAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}{account.accountNumber ? ` · ${account.accountNumber}` : ''} · Balance {account.balance}</option>)}</select><span className="field-error">{advanceForm.formState.errors.cashBankAccountId?.message}</span></label>
                  <label>Reason<input {...advanceForm.register('reason')} placeholder="Urgent personal advance" /><span className="field-error">{advanceForm.formState.errors.reason?.message}</span></label>
                  <label>Reference (optional)<input {...advanceForm.register('reference')} /></label>
                </div>
                {advanceProjectId && advanceAccounts.length === 0 && props.canManageAccounts && <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setAccountProjectId(advanceProjectId)}>Add Cash / Bank account</button></div>}
                {errorMessage(createAdvanceMutation.error) && <p className="field-error" role="alert">{errorMessage(createAdvanceMutation.error)}</p>}
                <div className="client-modal-actions">
                  <button type="button" className="secondary-button" onClick={closeAdvanceDialog}>Cancel</button>
                  <button type="submit" disabled={createAdvanceMutation.isPending}>{createAdvanceMutation.isPending ? 'Posting…' : 'Pay advance'}</button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}

      {paymentLine && selectedRun.data && <SalaryPaymentModal line={paymentLine} run={selectedRun.data} accounts={cashBankAccounts.data ?? []} canManageAccounts={props.canManageAccounts} onAddAccount={setAccountProjectId} onClose={() => setPaymentLine(null)} />}
      {advanceLine && <OpenPayrollAdvanceModal line={advanceLine} projects={projects.data?.items ?? []} accounts={cashBankAccounts.data ?? []} canManageAccounts={props.canManageAccounts} onAddAccount={setAccountProjectId} onClose={() => setAdvanceLine(null)} />}
      {ledgerEmployeeId && props.canReadPayroll && <SalaryLedgerModal employeeId={ledgerEmployeeId} projects={projects.data?.items ?? []} onClose={() => setLedgerEmployeeId(null)} />}
      {accountProjectId && <ProjectAccountCreateModal projectId={accountProjectId} projectLabel={projectNames.get(accountProjectId) ?? 'Project'} onCreated={async () => { await cashBankAccounts.refetch(); }} onClose={() => setAccountProjectId(null)} />}
      {reversalPayment && <SalaryPaymentReversalModal payment={reversalPayment} onClose={() => setReversalPayment(null)} />}
      {reversalAdvance && <AdvanceReversalModal advance={reversalAdvance} onClose={() => setReversalAdvance(null)} />}
    </div>
  );
}
