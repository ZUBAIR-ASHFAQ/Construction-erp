import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useEmployees } from '../../employees/hooks/employees.js';
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
const payrollFormSchema = z.object({ periodStart: dateSchema, periodEnd: dateSchema }).refine((value) => value.periodEnd >= value.periodStart, {
  path: ['periodEnd'], message: 'Period end must be on or after period start.'
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

export type LabourPayrollWorkspaceProps = Readonly<{
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
function currentPayrollPeriod(): Readonly<{ periodStart: string; periodEnd: string }> {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const date = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { periodStart: date(1), periodEnd: date(new Date(year, month + 1, 0).getDate()) };
}

/** Render a centered partial/full salary-payment form for one finalized Payroll line. */
function SalaryPaymentModal({ line, run, accounts, onClose }: Readonly<{
  line: PayrollLine;
  run: PayrollRun;
  accounts: readonly PayrollCashBankAccount[];
  onClose: () => void;
}>) {
  const mutation = useCreatePayrollPayment();
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: { paymentDate: new Date().toISOString().slice(0, 10) > run.periodEnd ? new Date().toISOString().slice(0, 10) : run.periodEnd, amount: line.outstandingAmount, cashBankAccountId: '', reference: '' }
  });

  /** Post the entered settlement against this finalized Employee Payroll line. */
  async function submit(values: PaymentFormValues): Promise<void> {
    await mutation.mutateAsync({ payrollLineId: line.id, ...values, reference: values.reference || null });
    onClose();
  }

  return <div className="finance-modal-backdrop" role="presentation"><section className="finance-modal" role="dialog" aria-modal="true" aria-labelledby="salary-payment-title"><header className="finance-modal-header"><div><p className="eyebrow">Employee salary settlement</p><h2 id="salary-payment-title">Pay {line.employeeName}</h2><p>{run.periodStart} to {run.periodEnd} · Outstanding <Money value={line.outstandingAmount} /></p></div><button type="button" className="finance-modal-close" onClick={onClose} aria-label="Close salary payment">×</button></header><div className="finance-modal-body"><form className="admin-form" onSubmit={form.handleSubmit(submit)}><div className="form-grid"><label>Payment date<input type="date" min={run.periodEnd} {...form.register('paymentDate')} /><span className="field-error">{form.formState.errors.paymentDate?.message}</span></label><label>Amount<input inputMode="decimal" {...form.register('amount')} /><span className="field-error">{form.formState.errors.amount?.message}</span></label><label>Cash / Bank account<select {...form.register('cashBankAccountId')}><option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}{account.accountNumber ? ` · ${account.accountNumber}` : ''} · Balance ${account.balance}</option>)}</select><span className="field-error">{form.formState.errors.cashBankAccountId?.message}</span></label><label>Reference (optional)<input {...form.register('reference')} /></label></div><p className="muted">This reduces Payroll Payable and the selected Cash/Bank balance. It does not add Project cost again.</p>{errorMessage(mutation.error) && <p className="field-error">{errorMessage(mutation.error)}</p>}<div className="form-actions"><button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Posting…' : 'Post salary payment'}</button><button type="button" className="secondary-button" onClick={onClose}>Cancel</button></div></form></div></section></div>;
}

/** Render an immediate advance-payment dialog for an Employee in an open Payroll Run. */
function OpenPayrollAdvanceModal({ line, projects, accounts, onClose }: Readonly<{
  line: PayrollLine;
  projects: readonly Readonly<{ id: string; projectCode: string; name: string }>[];
  accounts: readonly PayrollCashBankAccount[];
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
  const destinationKey = `${form.watch('projectId')}:${form.watch('stageId')}`;
  /** Keep Project and Stage together when the user changes the Payroll cost destination. */
  function selectDestination(key: string): void {
    const destination = destinations.find((item) => item.key === key);
    if (!destination) return;
    form.setValue('projectId', destination.projectId);
    form.setValue('stageId', destination.stageId ?? '');
  }
  /** Post the advance without pretending the open Payroll Run is finalized. */
  async function submit(values: AdvanceFormValues): Promise<void> {
    await mutation.mutateAsync({ ...values, stageId: values.stageId || null, reference: values.reference || null });
    onClose();
  }
  return <div className="finance-modal-backdrop" role="presentation"><section className="finance-modal" role="dialog" aria-modal="true" aria-labelledby="open-payroll-advance-title"><header className="finance-modal-header"><div><p className="eyebrow">Open payroll period</p><h2 id="open-payroll-advance-title">Pay advance to {line.employeeName}</h2><p>Earned so far {line.grossAmount} · Current net preview {line.netAmount}</p></div><button type="button" className="finance-modal-close" onClick={onClose} aria-label="Close advance payment">×</button></header><div className="finance-modal-body"><form className="admin-form" onSubmit={form.handleSubmit(submit)}><input type="hidden" {...form.register('employeeId')} /><input type="hidden" {...form.register('projectId')} /><input type="hidden" {...form.register('stageId')} /><div className="form-grid"><label>Project / Stage<select value={destinationKey} onChange={(event) => selectDestination(event.target.value)}>{destinations.map((destination) => <option key={destination.key} value={destination.key}>{destination.label}</option>)}</select><span className="field-error">{form.formState.errors.projectId?.message}</span></label><label>Advance date<input type="date" {...form.register('advanceDate')} /><span className="field-error">{form.formState.errors.advanceDate?.message}</span></label><label>Advance amount<input inputMode="decimal" {...form.register('amount')} placeholder="2000.00" /><span className="field-error">{form.formState.errors.amount?.message}</span></label><label>Cash / Bank account<select {...form.register('cashBankAccountId')}><option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}{account.accountNumber ? ` · ${account.accountNumber}` : ''} · Balance {account.balance}</option>)}</select><span className="field-error">{form.formState.errors.cashBankAccountId?.message}</span></label><label>Reason<input {...form.register('reason')} /><span className="field-error">{form.formState.errors.reason?.message}</span></label><label>Reference (optional)<input {...form.register('reference')} /></label></div><p className="muted">The month is still open, so this is recorded as a salary advance. It reduces Cash/Bank now and is automatically recovered when this Payroll is finalized.</p>{errorMessage(mutation.error) && <p className="field-error">{errorMessage(mutation.error)}</p>}<div className="form-actions"><button type="submit" disabled={mutation.isPending || destinations.length === 0}>{mutation.isPending ? 'Posting…' : 'Pay advance from account'}</button><button type="button" className="secondary-button" onClick={onClose}>Cancel</button></div></form></div></section></div>;
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
  const employees = useEmployees({ status: 'ACTIVE', pageSize: 100 }, props.canCreateAttendance || props.canReadAttendance || props.canCreateEmployeeAdvance || props.canReadPayroll);
  const projects = useProjects({ status: 'ACTIVE', pageSize: 100 }, props.canCreateAttendance || props.canReadAttendance || props.canCreateEmployeeAdvance || props.canReadPayroll);
  const attendance = useAttendance({ pageSize: 100 }, props.canReadAttendance);
  const runs = usePayrollRuns(props.canReadPayroll);
  const cashBankAccounts = usePayrollCashBankAccounts(props.canCreatePayrollPayment || props.canCreateEmployeeAdvance);
  const payments = usePayrollPayments({}, props.canReadPayroll);
  const advances = useEmployeeAdvances({}, props.canReadPayroll);
  const createAttendanceMutation = useCreateAttendance();
  const createRunMutation = useCreatePayrollRun();
  const createAdvanceMutation = useCreateEmployeeAdvance();
  const [selectedAttendance, setSelectedAttendance] = useState<AttendanceEntry | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [overtimeMultiplier, setOvertimeMultiplier] = useState('');
  const [paymentLine, setPaymentLine] = useState<PayrollLine | null>(null);
  const [advanceLine, setAdvanceLine] = useState<PayrollLine | null>(null);
  const [ledgerEmployeeId, setLedgerEmployeeId] = useState<string | null>(null);
  const [reversalPayment, setReversalPayment] = useState<PayrollPayment | null>(null);
  const [reversalAdvance, setReversalAdvance] = useState<EmployeeAdvance | null>(null);
  const selectedRun = usePayrollRun(selectedRunId, props.canReadPayroll);
  const overtimeMultiplierValid = overtimeMultiplier === ''
    || (/^(?:[1-9]\d{0,2})(?:\.\d{1,4})?$/.test(overtimeMultiplier) && Number(overtimeMultiplier) <= 10);
  const selectedPayrollPeriodClosed = Boolean(selectedRun.data && new Date().toISOString().slice(0, 10) >= selectedRun.data.periodEnd);

  useEffect(() => {
    setOvertimeMultiplier(selectedRun.data?.overtimeMultiplier ?? '');
  }, [selectedRun.data?.id, selectedRun.data?.overtimeMultiplier]);

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
    defaultValues: currentPayrollPeriod()
  });
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

  /** Pay an immediate Employee salary advance against one assigned Project. */
  async function submitAdvance(values: AdvanceFormValues): Promise<void> {
    await createAdvanceMutation.mutateAsync({ ...values, stageId: values.stageId || null, reference: values.reference || null });
    advanceForm.reset({ ...values, stageId: '', amount: '', reason: '', reference: '' });
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

  /** Confirm the irreversible accounting and Project-cost posting before finalization. */
  function confirmFinalize(): void {
    if (!selectedRun.data || !window.confirm(`Finalize payroll for ${selectedRun.data.periodStart} to ${selectedRun.data.periodEnd}? This posts Finance and Project costs and cannot be edited afterward.`)) return;
    finalizeMutation.mutate();
  }

  return (
    <div className="stack">
      <section className="admin-card">
        <p className="eyebrow">Module 13</p>
        <h1>Labour / Attendance & Payroll</h1>
        <p className="muted">Attendance is validated against Project Team assignments. Payroll uses effective Employee compensation, then finalization posts Employee Salary cost to the selected Project/Stage and Finance accounting atomically.</p>
      </section>

      {props.canCreateAttendance && (
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

      {props.canReadAttendance && (
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

      {selectedAttendance && props.canCorrectAttendance && (
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

      {props.canCreateEmployeeAdvance && (
        <section className="admin-card">
          <h2>Pay Employee salary advance</h2>
          <p className="muted">Use this for money requested before month-end. Cash/Bank is reduced immediately, the advance is linked to the selected Project, and finalized Payroll recovers it automatically without adding Employee Salary cost twice.</p>
          <form className="form-grid" onSubmit={advanceForm.handleSubmit(submitAdvance)}>
            <label>Employee<select {...advanceForm.register('employeeId')}><option value="">Select Employee</option>{(employees.data?.items ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeNo} · {employee.name}</option>)}</select><span className="field-error">{advanceForm.formState.errors.employeeId?.message}</span></label>
            <label>Project<select {...advanceForm.register('projectId')}><option value="">Select Project</option>{(projects.data?.items ?? []).map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}</select><span className="field-error">{advanceForm.formState.errors.projectId?.message}</span></label>
            <label>Stage (optional)<select {...advanceForm.register('stageId')} disabled={!advanceProjectId}><option value="">Project level</option>{(advanceStages.data?.items ?? []).map((stage) => <option key={stage.id} value={stage.id}>{stage.code} · {stage.name}</option>)}</select></label>
            <label>Advance date<input type="date" {...advanceForm.register('advanceDate')} /><span className="field-error">{advanceForm.formState.errors.advanceDate?.message}</span></label>
            <label>Amount<input inputMode="decimal" {...advanceForm.register('amount')} placeholder="2000.00" /><span className="field-error">{advanceForm.formState.errors.amount?.message}</span></label>
            <label>Cash / Bank account<select {...advanceForm.register('cashBankAccountId')}><option value="">Select account</option>{(cashBankAccounts.data ?? []).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}{account.accountNumber ? ` · ${account.accountNumber}` : ''} · Balance {account.balance}</option>)}</select><span className="field-error">{advanceForm.formState.errors.cashBankAccountId?.message}</span></label>
            <label>Reason<input {...advanceForm.register('reason')} placeholder="Urgent personal advance" /><span className="field-error">{advanceForm.formState.errors.reason?.message}</span></label>
            <label>Reference (optional)<input {...advanceForm.register('reference')} /></label>
            <div className="form-actions"><button type="submit" disabled={createAdvanceMutation.isPending}>{createAdvanceMutation.isPending ? 'Posting…' : 'Pay advance'}</button></div>
          </form>
          {errorMessage(createAdvanceMutation.error) && <p className="field-error">{errorMessage(createAdvanceMutation.error)}</p>}
        </section>
      )}

      {props.canReadPayroll && (
        <section className="admin-card">
          <h2>Employee advance register <small className="muted">({advances.data?.total ?? 0} records)</small></h2>
          <div className="table-scroll"><table><thead><tr><th>Advance</th><th>Date</th><th>Employee</th><th>Project / Stage</th><th>Account</th><th>Amount</th><th>Recovered</th><th>Outstanding</th><th>Status</th><th>Action</th></tr></thead><tbody>{(advances.data?.items ?? []).map((advance) => <tr key={advance.id}><td><strong>{advance.advanceNo}</strong><br /><small>{advance.reason}</small></td><td>{advance.advanceDate}</td><td>{advance.employeeName}<br /><small>{advance.employeeNo}</small></td><td>{advance.projectCode} · {advance.projectName}{advance.stageName ? <><br /><small>{advance.stageName}</small></> : null}</td><td>{advance.cashBankAccountName}</td><td>{advance.amount}</td><td>{advance.recoveredAmount}</td><td><strong>{advance.outstandingAmount}</strong></td><td>{advance.status}</td><td><div className="button-row"><button type="button" className="secondary-button" onClick={() => setLedgerEmployeeId(advance.employeeId)}>Ledger</button>{props.canReverseEmployeeAdvance && advance.status === 'POSTED' && advance.recoveredAmount === '0.00' && <button type="button" className="secondary-button" onClick={() => setReversalAdvance(advance)}>Reverse</button>}</div></td></tr>)}{(advances.data?.items.length ?? 0) === 0 && <tr><td colSpan={10} className="muted">No Employee salary advances have been posted.</td></tr>}</tbody></table></div>
        </section>
      )}

      {props.canCreatePayroll && (
        <section className="admin-card">
          <h2>Create payroll run</h2>
          <p className="muted">Use a full calendar month for salaried Employees. Hourly Employees may use a shorter closed period.</p>
          <form className="form-grid" onSubmit={payrollForm.handleSubmit(submitPayrollRun)}>
            <label>Period start<input type="date" {...payrollForm.register('periodStart')} /><span className="field-error">{payrollForm.formState.errors.periodStart?.message}</span></label>
            <label>Period end<input type="date" {...payrollForm.register('periodEnd')} /><span className="field-error">{payrollForm.formState.errors.periodEnd?.message}</span></label>
            <div className="form-actions"><button type="submit" disabled={createRunMutation.isPending}>Create run</button></div>
          </form>
          {errorMessage(createRunMutation.error) && <p className="field-error">{errorMessage(createRunMutation.error)}</p>}
        </section>
      )}

      {props.canReadPayroll && (
        <section className="admin-card">
          <h2>Payroll runs <small className="muted">({runs.data?.total ?? 0} total · page {runs.data?.page ?? 1} · {runs.data?.pageSize ?? 50} per page)</small></h2>
          {errorMessage(runs.error) && <p className="field-error">{errorMessage(runs.error)}</p>}
          <div className="table-scroll"><table><thead><tr><th>Period</th><th>Status</th><th>Created by</th><th>Finalized</th><th>Detail</th></tr></thead><tbody>
            {(runs.data?.items ?? []).map((run) => <tr key={run.id}><td>{run.periodStart} → {run.periodEnd}</td><td>{run.status}</td><td>{run.createdByName}</td><td>{run.finalizedAt ?? '—'}</td><td><button type="button" className="secondary-button" onClick={() => chooseRun(run.id)}>Open</button></td></tr>)}
            {(runs.data?.items.length ?? 0) === 0 && <tr><td colSpan={5} className="muted">No Payroll Runs.</td></tr>}
          </tbody></table></div>
        </section>
      )}

      {selectedRunId && selectedRun.data && (
        <section className="admin-card">
          <h2>Payroll calculation preview</h2>
          <p><strong>{selectedRun.data.periodStart} → {selectedRun.data.periodEnd}</strong> · {selectedRun.data.status} · Created by {selectedRun.data.createdByName} · Finalized {selectedRun.data.finalizedAt ?? '—'}</p>
          <p><strong>Salary before absence:</strong> {sumMoney(selectedRun.data.lines.map((line) => line.salaryBeforeAbsence))} · <strong>Absence deduction:</strong> {sumMoney(selectedRun.data.lines.map((line) => line.absenceDeduction))} · <strong>Earned salary:</strong> {sumMoney(selectedRun.data.lines.map((line) => line.grossAmount))} · <strong>Advance recovery:</strong> {sumMoney(selectedRun.data.lines.map((line) => line.advanceDeduction))} · <strong>Net payroll:</strong> {sumMoney(selectedRun.data.lines.map((line) => line.netAmount))}</p>
          {props.canCalculatePayroll && selectedRun.data.status !== 'FINALIZED' && (
            <label>Hourly overtime multiplier (optional)<input type="number" inputMode="decimal" min="1" max="10" step="0.0001" value={overtimeMultiplier} onChange={(event) => setOvertimeMultiplier(event.target.value)} placeholder="Example: 1.5" /><small className="muted">Only enter this when an hourly-paid Employee has overtime. Enter 1.5 for 150% pay—not an hourly rate or percentage.</small>{!overtimeMultiplierValid && <span className="field-error">Enter a multiplier between 1 and 10.</span>}</label>
          )}
          <div className="form-actions">
            {props.canCalculatePayroll && selectedRun.data.status !== 'FINALIZED' && <button type="button" onClick={() => calculateMutation.mutate(overtimeMultiplier ? { overtimeMultiplier } : {})} disabled={calculateMutation.isPending || !overtimeMultiplierValid}>Calculate</button>}
            {props.canFinalizePayroll && selectedRun.data.status === 'CALCULATED' && <button type="button" onClick={confirmFinalize} disabled={finalizeMutation.isPending || !selectedPayrollPeriodClosed}>Finalize & post</button>}
          </div>
          {selectedRun.data.status === 'CALCULATED' && !selectedPayrollPeriodClosed && <p className="muted">This is an open Payroll period. It can be reviewed now and finalized on or after {selectedRun.data.periodEnd}.</p>}
          {errorMessage(calculateMutation.error) && <p className="field-error">{errorMessage(calculateMutation.error)}</p>}
          {errorMessage(finalizeMutation.error) && <p className="field-error">{errorMessage(finalizeMutation.error)}</p>}
          <div className="table-scroll"><table><thead><tr><th>Employee</th><th>Salary before absence</th><th>Absence deduction</th><th>Earned salary</th><th>Advance recovery</th><th>Net</th><th>Paid</th><th>Outstanding</th><th>Project / Stage Employee Salary cost</th><th>Payslip</th><th>Action</th></tr></thead><tbody>
            {selectedRun.data.lines.map((line) => <tr key={line.id}><td><strong>{line.employeeName}</strong><br /><small className="muted">{line.employeeNo}</small></td><td><Money value={line.salaryBeforeAbsence} /></td><td><Money value={line.absenceDeduction} /></td><td><Money value={line.grossAmount} /></td><td><Money value={line.advanceDeduction} /></td><td><Money value={line.netAmount} /></td><td><Money value={line.paidAmount} /></td><td><strong><Money value={line.outstandingAmount} /></strong></td><td>{line.projectAllocation.length === 0 ? 'Historical allocation unavailable' : line.projectAllocation.map((allocation) => <div key={`${allocation.projectId}:${allocation.stageId ?? ''}:${allocation.category}`}>{projectNames.get(allocation.projectId) ?? 'Project'} / {allocation.stageId ? 'Selected stage' : 'Project level'} · {allocation.category === 'security' ? 'Security Employee Salary' : 'Employee Salary'} · <Money value={allocation.amount} /></div>)}</td><td>{line.payslip ? <>Generated {line.payslip.generatedAt ?? '—'}</> : 'Not generated'}</td><td><div className="button-row">{Number(line.outstandingAmount) > 0 && ((selectedRun.data.status === 'FINALIZED' && props.canCreatePayrollPayment) || (selectedRun.data.status !== 'FINALIZED' && props.canCreateEmployeeAdvance)) && <button type="button" title={selectedRun.data.status === 'FINALIZED' ? 'Pay finalized salary from a Cash or Bank account' : 'Pay an advance now; it will be recovered at month-end'} onClick={() => selectedRun.data.status === 'FINALIZED' ? setPaymentLine(line) : setAdvanceLine(line)}>{selectedRun.data.status === 'FINALIZED' ? 'Pay salary from account' : 'Pay advance now'}</button>}<button type="button" className="secondary-button" onClick={() => setLedgerEmployeeId(line.employeeId)}>Ledger</button></div></td></tr>)}
            {selectedRun.data.lines.length === 0 && <tr><td colSpan={11} className="muted">Calculate this run to create Employee Payroll lines.</td></tr>}
          </tbody></table></div>
        </section>
      )}

      {props.canReadPayroll && (
        <section className="admin-card">
          <h2>Employee salary payments <small className="muted">({payments.data?.total ?? 0} records)</small></h2>
          <p className="muted">Payments settle finalized Payroll Payable from Cash/Bank. Reversed payments remain visible for audit history.</p>
          {payments.isPending && <p>Loading salary payments…</p>}
          {errorMessage(payments.error) && <p className="field-error">{errorMessage(payments.error)}</p>}
          <div className="table-scroll"><table><thead><tr><th>Payment</th><th>Date</th><th>Employee</th><th>Payroll period</th><th>Account</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>{(payments.data?.items ?? []).map((payment) => <tr key={payment.id}><td><strong>{payment.paymentNo}</strong><br /><small>{payment.reference ?? 'No reference'}</small></td><td>{payment.paymentDate}</td><td><strong>{payment.employeeName}</strong><br /><small>{payment.employeeNo}</small></td><td>{payment.payrollPeriod}</td><td>{payment.cashBankAccountName}</td><td>{payment.amount}</td><td>{payment.status}</td><td><div className="button-row"><button type="button" className="secondary-button" onClick={() => setLedgerEmployeeId(payment.employeeId)}>Ledger</button>{props.canReversePayrollPayment && payment.status === 'POSTED' && <button type="button" className="secondary-button" onClick={() => setReversalPayment(payment)}>Reverse</button>}</div></td></tr>)}{(payments.data?.items.length ?? 0) === 0 && <tr><td colSpan={8} className="muted">No Employee salary payments have been posted.</td></tr>}</tbody></table></div>
        </section>
      )}

      {paymentLine && selectedRun.data && <SalaryPaymentModal line={paymentLine} run={selectedRun.data} accounts={cashBankAccounts.data ?? []} onClose={() => setPaymentLine(null)} />}
      {advanceLine && <OpenPayrollAdvanceModal line={advanceLine} projects={projects.data?.items ?? []} accounts={cashBankAccounts.data ?? []} onClose={() => setAdvanceLine(null)} />}
      {ledgerEmployeeId && <SalaryLedgerModal employeeId={ledgerEmployeeId} projects={projects.data?.items ?? []} onClose={() => setLedgerEmployeeId(null)} />}
      {reversalPayment && <SalaryPaymentReversalModal payment={reversalPayment} onClose={() => setReversalPayment(null)} />}
      {reversalAdvance && <AdvanceReversalModal advance={reversalAdvance} onClose={() => setReversalAdvance(null)} />}
    </div>
  );
}
