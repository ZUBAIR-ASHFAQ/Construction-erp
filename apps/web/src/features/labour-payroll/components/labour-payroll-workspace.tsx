import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useEmployees } from '../../employees/hooks/employees.js';
import { ProjectAccountCreateModal } from '../../finance/components/project-account-create-modal.js';
import { PaymentProofActions, savePaymentProof } from '../../documents-audit/components/payment-proof-actions.js';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useProjects } from '../../projects/hooks/projects.js';
import type { AttendanceEntry, EmployeeAdvance, EmployeeSalaryLedger, PayrollCashBankAccount, PayrollLine, PayrollPayment, PayrollRun } from '../api/labour-payroll-api.js';
import {
  useAttendance,
  useAttendanceAssignments,
  useCalculatePayrollRun,
  useCreateAttendance,
  useCreateEmployeeAdvance,
  useCreatePayrollRun,
  useDeleteDailyPayrollRun,
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
  useUpdateAttendance,
  useUpdateDailyPayrollRun
} from '../hooks/labour-payroll.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM.');
const hoursSchema = z.union([z.literal(''), z.string().regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/, 'Use up to 4 decimals.')]);
const attendanceFormSchema = z.object({
  employeeId: z.string().uuid('Select an Employee.'),
  projectId: z.string().uuid('Select a Project.'),
  stageId: z.string(),
  workDate: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  status: z.enum(['PRESENT', 'ABSENT']),
  hours: hoursSchema,
  overtimeHours: hoursSchema
}).superRefine((value, ctx) => {
  if (value.startTime === value.endTime) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'End time must differ from start time.' });
  const total = Number(value.hours || '0') + Number(value.overtimeHours || '0');
  if (total > 24) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hours'], message: 'Daily hours cannot exceed 24.' });
  if (value.status === 'ABSENT' && total > 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'Absent attendance cannot contain worked hours.' });
});
const correctionFormSchema = z.object({
  stageId: z.string(),
  startTime: timeSchema,
  endTime: timeSchema,
  status: z.enum(['PRESENT', 'ABSENT']),
  hours: hoursSchema,
  overtimeHours: hoursSchema
}).superRefine((value, ctx) => {
  if (value.startTime === value.endTime) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'End time must differ from start time.' });
  const total = Number(value.hours || '0') + Number(value.overtimeHours || '0');
  if (total > 24) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hours'], message: 'Daily hours cannot exceed 24.' });
  if (value.status === 'ABSENT' && total > 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'Absent attendance cannot contain worked hours.' });
});
/** Return one complete current calendar month as the safe default monthly Payroll date range. */
function currentPayrollPeriod(): Readonly<{ payCycle: 'MONTHLY'; periodStart: string; periodEnd: string; fromTime: string; toTime: string }> {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthValue = `${year}-${String(month + 1).padStart(2, '0')}`;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return { payCycle: 'MONTHLY', periodStart: `${monthValue}-01`, periodEnd: `${monthValue}-${String(lastDay).padStart(2, '0')}`, fromTime: '08:00', toTime: '17:00' };
}

const payrollFormSchema = z.object({
  payCycle: z.enum(['DAILY', 'MONTHLY']),
  periodStart: dateSchema,
  periodEnd: dateSchema,
  fromTime: timeSchema,
  toTime: timeSchema
}).superRefine((value, context) => {
  if (value.periodEnd < value.periodStart) context.addIssue({ code: 'custom', path: ['periodEnd'], message: 'Period end must be on or after period start.' });
  if (value.fromTime === value.toTime) context.addIssue({ code: 'custom', path: ['toTime'], message: 'To time must differ from from time.' });
  if (value.payCycle === 'DAILY' && value.periodStart !== value.periodEnd) context.addIssue({ code: 'custom', path: ['periodEnd'], message: 'Daily settlement uses one work date.' });
  if (value.payCycle === 'MONTHLY' && value.periodStart.slice(0, 7) !== value.periodEnd.slice(0, 7)) {
    context.addIssue({ code: 'custom', path: ['periodEnd'], message: 'Monthly payroll date range must stay within one calendar month.' });
  }
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
  canReadDocuments: boolean;
  canUploadDocuments: boolean;
  canLinkDocuments: boolean;
  canVersionDocuments: boolean;
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

/** Return a readable settlement-cycle label, including immutable historical runs. */
function payCycleLabel(payCycle: PayrollRun['payCycle']): string {
  if (payCycle === 'DAILY') return 'Daily settlement';
  if (payCycle === 'MONTHLY') return 'Monthly payroll';
  return 'Legacy payroll';
}

/** Render the persisted date/time window, while keeping legacy untimed history readable. */
function payrollWindowLabel(run: Pick<PayrollRun, 'periodStart' | 'periodEnd' | 'fromTime' | 'toTime'>): string {
  const dates = run.periodStart === run.periodEnd ? run.periodStart : `${run.periodStart} → ${run.periodEnd}`;
  return run.fromTime && run.toTime ? `${dates} · ${run.fromTime} → ${run.toTime}` : dates;
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

  return <div className="finance-modal-backdrop" role="presentation"><section className="finance-modal" role="dialog" aria-modal="true" aria-labelledby="salary-payment-title"><header className="finance-modal-header"><div><p className="eyebrow">Employee salary settlement</p><h2 id="salary-payment-title">Pay {line.employeeName}</h2><p>{payrollWindowLabel(run)} · Outstanding <Money value={line.outstandingAmount} /></p></div><button type="button" className="finance-modal-close" onClick={onClose} aria-label="Close salary payment">×</button></header><div className="finance-modal-body"><form className="admin-form" onSubmit={form.handleSubmit(submit)}><div className="form-grid"><label>Payment date<input type="date" min={run.periodEnd} {...form.register('paymentDate')} /><span className="field-error">{form.formState.errors.paymentDate?.message}</span></label><label>Amount<input inputMode="decimal" {...form.register('amount')} /><span className="field-error">{form.formState.errors.amount?.message}</span></label><label>Cash / Bank account<select {...form.register('cashBankAccountId')}><option value="">Select account</option>{eligibleAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}{account.accountNumber ? ` · ${account.accountNumber}` : ''} · Balance ${account.balance}</option>)}</select><span className="field-error">{form.formState.errors.cashBankAccountId?.message}</span></label><label>Reference (optional)<input {...form.register('reference')} /></label></div>{projectId && eligibleAccounts.length === 0 && canManageAccounts && <div className="form-actions"><button type="button" className="secondary-button" onClick={() => onAddAccount(projectId)}>Add Cash / Bank account</button></div>}{!projectId && <p className="muted">This salary spans multiple Projects and must be settled by an administrator using a Company account.</p>}<p className="muted">This reduces Payroll Payable and the selected Cash/Bank balance, and the posted payment appears automatically in the Employee Ledger. A second payment for this Employee and Payroll on the same date is blocked.</p>{errorMessage(mutation.error) && <p className="field-error">{errorMessage(mutation.error)}</p>}<div className="form-actions"><button type="submit" disabled={mutation.isPending || eligibleAccounts.length === 0}>{mutation.isPending ? 'Posting…' : 'Post salary payment'}</button><button type="button" className="secondary-button" onClick={onClose}>Cancel</button></div></form></div></section></div>;
}

/** Render an immediate advance-payment dialog for an Employee in an open Payroll Run. */
function OpenPayrollAdvanceModal({ line, run, projects, accounts, canManageAccounts, canCalculatePayroll, canUploadDocuments, canLinkDocuments, onAddAccount, onCompleted, onClose }: Readonly<{
  line: PayrollLine;
  run: PayrollRun;
  projects: readonly Readonly<{ id: string; projectCode: string; name: string }>[];
  accounts: readonly PayrollCashBankAccount[];
  canManageAccounts: boolean;
  canCalculatePayroll: boolean;
  canUploadDocuments: boolean;
  canLinkDocuments: boolean;
  onAddAccount: (projectId: string) => void;
  onCompleted: (message: string) => void;
  onClose: () => void;
}>) {
  const mutation = useCreateEmployeeAdvance();
  const recalculate = useCalculatePayrollRun(run.id);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
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
  /** Post the advance, refresh this Employee's open Payroll preview, and store optional proof independently. */
  async function submit(values: AdvanceFormValues): Promise<void> {
    setSubmitting(true);
    try {
      const created = await mutation.mutateAsync({ ...values, stageId: values.stageId || null, reference: values.reference || null });
      let message = `Advance ${created.advanceNo} was posted successfully.`;
      if (canCalculatePayroll) {
        try {
          await recalculate.mutateAsync({ projectId: values.projectId, employeeId: line.employeeId });
          message += ' The calculated Employee row was refreshed with the new advance recovery and net amount.';
        } catch (error) {
          message += ` The advance is posted, but the Payroll preview could not be recalculated automatically: ${errorMessage(error) ?? 'Recalculate the Employee before finalizing.'}`;
        }
      }
      if (proofFile) {
        try {
          await savePaymentProof({
            id: created.id,
            paymentNo: created.advanceNo,
            projectId: created.projectId,
            resourceType: 'employee_advance',
            titlePrefix: 'Employee salary advance proof',
            category: 'employee_salary_advance_proof'
          }, proofFile);
          message += ` Optional proof ${proofFile.name} was saved.`;
        } catch (error) {
          message += ` The optional proof could not be stored: ${errorMessage(error) ?? 'Upload failed.'} Use Edit proof on the Salary Advances page to retry.`;
        }
      }
      onCompleted(message);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }
  return <div className="finance-modal-backdrop" role="presentation"><section className="finance-modal" role="dialog" aria-modal="true" aria-labelledby="open-payroll-advance-title"><header className="finance-modal-header"><div><p className="eyebrow">Open payroll period</p><h2 id="open-payroll-advance-title">Pay advance to {line.employeeName}</h2><p>Earned so far {line.grossAmount} · Current net preview {line.netAmount}</p></div><button type="button" className="finance-modal-close" disabled={submitting} onClick={onClose} aria-label="Close advance payment">×</button></header><div className="finance-modal-body"><form className="admin-form" onSubmit={form.handleSubmit(submit)}><input type="hidden" {...form.register('employeeId')} /><input type="hidden" {...form.register('projectId')} /><input type="hidden" {...form.register('stageId')} /><div className="form-grid"><label>Project / Stage<select value={destinationKey} onChange={(event) => selectDestination(event.target.value)}>{destinations.map((destination) => <option key={destination.key} value={destination.key}>{destination.label}</option>)}</select><span className="field-error">{form.formState.errors.projectId?.message}</span></label><label>Advance date<input type="date" {...form.register('advanceDate')} /><span className="field-error">{form.formState.errors.advanceDate?.message}</span></label><label>Advance amount<input inputMode="decimal" {...form.register('amount')} placeholder="2000.00" /><span className="field-error">{form.formState.errors.amount?.message}</span></label><label>Cash / Bank account<select {...form.register('cashBankAccountId')}><option value="">Select account</option>{eligibleAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}{account.accountNumber ? ` · ${account.accountNumber}` : ''} · Balance {account.balance}</option>)}</select><span className="field-error">{form.formState.errors.cashBankAccountId?.message}</span></label><label>Reason<input {...form.register('reason')} /><span className="field-error">{form.formState.errors.reason?.message}</span></label><label>Reference (optional)<input {...form.register('reference')} /></label><label>Employee salary proof (optional)<input type="file" accept="image/jpeg,image/png,application/pdf" disabled={!canUploadDocuments || !canLinkDocuments || submitting} onChange={(event) => setProofFile(event.target.files?.[0] ?? null)} /><small className="muted">Attach a signed receipt, bank slip, image or PDF. The advance can still be posted without proof.</small></label></div>{projectId && eligibleAccounts.length === 0 && canManageAccounts && <div className="form-actions"><button type="button" className="secondary-button" onClick={() => onAddAccount(projectId)}>Add Cash / Bank account</button></div>}<p className="muted">The month is still open, so this is recorded as a salary advance. It reduces Cash/Bank now and is automatically recovered when this Payroll is finalized.</p>{errorMessage(mutation.error) && <p className="field-error">{errorMessage(mutation.error)}</p>}<div className="form-actions"><button type="submit" disabled={submitting || destinations.length === 0 || eligibleAccounts.length === 0}>{submitting ? 'Posting…' : 'Pay advance from account'}</button><button type="button" className="secondary-button" disabled={submitting} onClick={onClose}>Cancel</button></div></form></div></section></div>;
}

type SalarySlip = NonNullable<EmployeeSalaryLedger['entries'][number]['salarySlip']>;
type FinalPayslip = NonNullable<EmployeeSalaryLedger['entries'][number]['payslip']>;

/** Escape untrusted labels before placing them into the downloadable salary-slip HTML. */
function escapeSalarySlipHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

/** Download the final payslip generated from one immutable finalized Payroll line. */
function downloadFinalPayrollPayslip(run: PayrollRun, line: PayrollLine, projectNames: ReadonlyMap<string, string>): void {
  if (!line.payslip || run.status !== 'FINALIZED') return;
  const allocationText = line.projectAllocation.length === 0
    ? 'Historical allocation unavailable'
    : line.projectAllocation.map((allocation) => `${projectNames.get(allocation.projectId) ?? 'Project'} / ${allocation.stageId ? 'Selected stage' : 'Project level'} · ${allocation.category === 'security' ? 'Security Employee Salary' : 'Employee Salary'} · ${allocation.amount}`).join('; ');
  const fields: Array<readonly [string, string]> = [
    ['Employee', `${line.employeeNo} · ${line.employeeName}`],
    ['Payroll', payCycleLabel(run.payCycle)],
    ['Payroll window', payrollWindowLabel(run)],
    ['Generated at', line.payslip.generatedAt ?? run.finalizedAt ?? '—']
  ];
  if (run.payCycle === 'MONTHLY') fields.push(['Salary before absence', line.salaryBeforeAbsence], ['Absence deduction', line.absenceDeduction]);
  fields.push(
    [run.payCycle === 'DAILY' ? 'Gross earnings' : 'Earned salary', line.grossAmount],
    ['Advance recovery', line.advanceDeduction],
    ['Net payable', line.netAmount],
    ['Paid to date', line.paidAmount],
    ['Outstanding', line.outstandingAmount],
    ['Payment history', line.settlements.length > 0 ? line.settlements.map((payment) => `${payment.paymentDate} · ${payment.paymentNo} · ${payment.amount}`).join('; ') : 'Not paid'],
    ['Project / Stage Employee Salary cost', allocationText],
    ['Settlement status', Number(line.outstandingAmount) === 0 ? 'PAID' : Number(line.paidAmount) > 0 ? 'PARTIALLY PAID' : 'UNPAID'],
    ['Payroll status', 'FINALIZED']
  );
  const rows = fields.map(([label, value]) => `<tr><th>${escapeSalarySlipHtml(label)}</th><td>${escapeSalarySlipHtml(value)}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Payslip ${escapeSalarySlipHtml(line.employeeNo)}</title><style>body{font:14px Arial,sans-serif;color:#172033;margin:40px}.slip{max-width:760px;margin:auto;border:1px solid #d9e1ec;border-radius:12px;padding:28px}h1{margin:0 0 6px}p{color:#607087}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:10px;border-bottom:1px solid #e7edf5;text-align:left;vertical-align:top}th{width:42%;color:#52627a}@media print{body{margin:0}.slip{border:0}}</style></head><body><main class="slip"><h1>Final Employee Payslip</h1><p>System-generated from the finalized Payroll snapshot. Salary-payment receipts remain available in the Employee Ledger.</p><table>${rows}</table></main></body></html>`;
  const objectUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const anchor = window.document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `payslip-${line.employeeNo}-${run.periodEnd}.html`;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

/** Download a print-ready salary slip regenerated from immutable Payroll and payment data. */
function downloadSalarySlip(employee: EmployeeSalaryLedger['employee'], projectName: string, slip: SalarySlip): void {
  const fields = [
    ['Employee', `${employee.employeeNo} · ${employee.name}`],
    ['Project', projectName],
    ['Payroll period', `${slip.payrollPeriodStart} to ${slip.payrollPeriodEnd}`],
    ['Payment', slip.paymentNo],
    ['Payment date', slip.paymentDate],
    ['Salary before absence', slip.salaryBeforeAbsence],
    ['Absence deduction', slip.absenceDeduction],
    ['Earned salary', slip.earnedSalary],
    ['Advance recovery', slip.advanceRecovery],
    ['Net salary', slip.netSalary],
    ['Amount paid', slip.paymentAmount],
    ['Paid from', slip.cashBankAccountName],
    ['Status', slip.status]
  ] as const;
  const rows = fields.map(([label, value]) => `<tr><th>${escapeSalarySlipHtml(label)}</th><td>${escapeSalarySlipHtml(value)}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Salary slip ${escapeSalarySlipHtml(slip.paymentNo)}</title><style>body{font:14px Arial,sans-serif;color:#172033;margin:40px}.slip{max-width:760px;margin:auto;border:1px solid #d9e1ec;border-radius:12px;padding:28px}h1{margin:0 0 6px}p{color:#607087}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:10px;border-bottom:1px solid #e7edf5;text-align:left}th{width:42%;color:#52627a}@media print{body{margin:0}.slip{border:0}}</style></head><body><main class="slip"><h1>Employee Salary Slip</h1><p>System-generated from posted Payroll and salary-payment records.</p><table>${rows}</table></main></body></html>`;
  const objectUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const anchor = window.document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `salary-slip-${slip.paymentNo}.html`;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

/** Download the finalized Payroll payslip stored against the Employee ledger salary entry. */
function downloadLedgerPayslip(employee: EmployeeSalaryLedger['employee'], projectName: string, payslip: FinalPayslip): void {
  const dates = payslip.payrollPeriodStart === payslip.payrollPeriodEnd
    ? payslip.payrollPeriodStart
    : `${payslip.payrollPeriodStart} to ${payslip.payrollPeriodEnd}`;
  const payrollWindow = payslip.payrollFromTime && payslip.payrollToTime
    ? `${dates} · ${payslip.payrollFromTime} to ${payslip.payrollToTime}`
    : dates;
  const fields = [
    ['Employee', `${employee.employeeNo} · ${employee.name}`],
    ['Project', projectName],
    ['Payroll', payCycleLabel(payslip.payCycle)],
    ['Payroll window', payrollWindow],
    ['Salary before absence', payslip.salaryBeforeAbsence],
    ['Absence deduction', payslip.absenceDeduction],
    ['Earned salary', payslip.earnedSalary],
    ['Advance recovery', payslip.advanceRecovery],
    ['Net payable', payslip.netSalary],
    ['Paid to date', payslip.paidAmount],
    ['Outstanding', payslip.outstandingAmount],
    ['Payment history', payslip.settlements.length > 0 ? payslip.settlements.map((payment) => `${payment.paymentDate} · ${payment.paymentNo} · ${payment.amount}`).join('; ') : 'Not paid'],
    ['Generated at', payslip.generatedAt],
    ['Settlement status', Number(payslip.outstandingAmount) === 0 ? 'PAID' : Number(payslip.paidAmount) > 0 ? 'PARTIALLY PAID' : 'UNPAID'],
    ['Payroll status', 'FINALIZED']
  ] as const;
  const rows = fields.map(([label, value]) => `<tr><th>${escapeSalarySlipHtml(label)}</th><td>${escapeSalarySlipHtml(value)}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Payslip ${escapeSalarySlipHtml(employee.employeeNo)}</title><style>body{font:14px Arial,sans-serif;color:#172033;margin:40px}.slip{max-width:760px;margin:auto;border:1px solid #d9e1ec;border-radius:12px;padding:28px}h1{margin:0 0 6px}p{color:#607087}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:10px;border-bottom:1px solid #e7edf5;text-align:left}th{width:42%;color:#52627a}@media print{body{margin:0}.slip{border:0}}</style></head><body><main class="slip"><h1>Final Employee Payslip</h1><p>System-generated from the immutable finalized Payroll record.</p><table>${rows}</table></main></body></html>`;
  const objectUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const anchor = window.document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `payslip-${employee.employeeNo}-${payslip.payrollPeriodEnd}.html`;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

/** Render the source-derived salary ledger for one Employee. */
function SalaryLedgerModal({ employeeId, projects, onClose }: Readonly<{ employeeId: string; projects: readonly Readonly<{ id: string; projectCode: string; name: string }>[]; onClose: () => void }>) {
  const [projectId, setProjectId] = useState('');
  const [selectedSlip, setSelectedSlip] = useState<Readonly<{ slip: SalarySlip; projectName: string }> | null>(null);
  const ledger = useEmployeeSalaryLedger(employeeId, projectId || undefined);
  const entryLabel = (type: string) => ({ SALARY_DUE: 'Salary earned', PAYMENT: 'Salary payment', PAYMENT_REVERSAL: 'Payment reversal', ADVANCE: 'Salary advance', ADVANCE_REVERSAL: 'Advance reversal', ADVANCE_RECOVERY: 'Advance recovered' }[type] ?? type);

  return (
    <div className="finance-modal-backdrop" role="presentation">
      <section className="finance-modal finance-modal-wide" role="dialog" aria-modal="true" aria-labelledby="salary-ledger-title">
        <header className="finance-modal-header">
          <div><p className="eyebrow">Employee account</p><h2 id="salary-ledger-title">Project-wise Employee Ledger</h2>{ledger.data && <p>{ledger.data.employee.employeeNo} · {ledger.data.employee.name}</p>}</div>
          <button type="button" className="finance-modal-close" onClick={onClose} aria-label="Close salary ledger">×</button>
        </header>
        <div className="finance-modal-body">
          <label>Project filter<select value={projectId} onChange={(event) => { setProjectId(event.target.value); setSelectedSlip(null); }}><option value="">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}</select></label>
          {ledger.isPending && <p>Loading Employee ledger…</p>}
          {errorMessage(ledger.error) && <p className="field-error">{errorMessage(ledger.error)}</p>}
          {ledger.data && <div className="admin-stack">
            <div className="equipment-ledger-summary"><span><small>Salary earned</small><strong>{ledger.data.totalSalary}</strong></span><span><small>Salary paid</small><strong>{ledger.data.totalPaid}</strong></span><span><small>Advances paid</small><strong>{ledger.data.totalAdvances}</strong></span><span><small>Advances recovered</small><strong>{ledger.data.totalAdvanceRecovered}</strong></span><span><small>Advance outstanding</small><strong>{ledger.data.advanceOutstanding}</strong></span><span><small>Salary outstanding</small><strong>{ledger.data.outstanding}</strong></span></div>
            <div className="table-scroll"><table><thead><tr><th>Date</th><th>Entry</th><th>Project / Stage</th><th>Reference</th><th>Earned / reversal</th><th>Paid / advance</th><th>Balance</th><th>Documents</th></tr></thead><tbody>{ledger.data.entries.map((entry) => <tr key={entry.id}><td>{entry.entryDate}</td><td>{entryLabel(entry.entryType)}</td><td>{entry.projectName ?? 'Company level'}{entry.stageName ? ` / ${entry.stageName}` : ''}</td><td>{entry.reference}</td><td>{entry.debit}</td><td>{entry.credit}</td><td><strong>{entry.balance}</strong></td><td><div className="button-row">{entry.payslip && <button type="button" className="secondary-button" onClick={() => downloadLedgerPayslip(ledger.data.employee, entry.projectName ?? 'Company level', entry.payslip as FinalPayslip)}>Download payslip</button>}{entry.salarySlip && <button type="button" className="secondary-button" onClick={() => setSelectedSlip({ slip: entry.salarySlip as SalarySlip, projectName: entry.projectName ?? 'Company level' })}>View payment slip</button>}{!entry.payslip && !entry.salarySlip ? '—' : null}</div></td></tr>)}{ledger.data.entries.length === 0 && <tr><td colSpan={8} className="muted">No salary, advance, or payment history exists for this selection.</td></tr>}</tbody></table></div>
            {selectedSlip && <section className="admin-card" aria-labelledby="salary-slip-preview-title"><div className="section-heading compact-heading"><div><p className="eyebrow">{selectedSlip.slip.paymentNo}</p><h3 id="salary-slip-preview-title">Salary slip</h3></div><button type="button" className="secondary-button" onClick={() => setSelectedSlip(null)}>Close preview</button></div><dl className="summary-grid"><div><dt>Payroll period</dt><dd>{selectedSlip.slip.payrollPeriodStart} to {selectedSlip.slip.payrollPeriodEnd}</dd></div><div><dt>Payment date</dt><dd>{selectedSlip.slip.paymentDate}</dd></div><div><dt>Project</dt><dd>{selectedSlip.projectName}</dd></div><div><dt>Salary before absence</dt><dd>{selectedSlip.slip.salaryBeforeAbsence}</dd></div><div><dt>Absence deduction</dt><dd>{selectedSlip.slip.absenceDeduction}</dd></div><div><dt>Earned salary</dt><dd>{selectedSlip.slip.earnedSalary}</dd></div><div><dt>Advance recovery</dt><dd>{selectedSlip.slip.advanceRecovery}</dd></div><div><dt>Net salary</dt><dd>{selectedSlip.slip.netSalary}</dd></div><div><dt>Amount paid</dt><dd>{selectedSlip.slip.paymentAmount}</dd></div><div><dt>Paid from</dt><dd>{selectedSlip.slip.cashBankAccountName}</dd></div><div><dt>Status</dt><dd>{selectedSlip.slip.status}</dd></div></dl><button type="button" onClick={() => downloadSalarySlip(ledger.data.employee, selectedSlip.projectName, selectedSlip.slip)}>Download print-ready slip</button></section>}
          </div>}
        </div>
      </section>
    </div>
  );
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
  const cashBankAccounts = usePayrollCashBankAccounts(
    (showPayrollRuns && props.canCreatePayrollPayment)
    || ((showAdvances || showPayrollCreation) && props.canCreateEmployeeAdvance)
  );
  const payments = usePayrollPayments({}, showPayments && props.canReadPayroll);
  const advances = useEmployeeAdvances({}, showAdvances && props.canReadPayroll);
  const createAttendanceMutation = useCreateAttendance();
  const createRunMutation = useCreatePayrollRun();
  const updateDailyRunMutation = useUpdateDailyPayrollRun();
  const deleteDailyRunMutation = useDeleteDailyPayrollRun();
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
  const [advanceProof, setAdvanceProof] = useState<File | null>(null);
  const [advanceProofInputKey, setAdvanceProofInputKey] = useState(0);
  const [advanceResultMessage, setAdvanceResultMessage] = useState<string | null>(null);
  const [payrollResultMessage, setPayrollResultMessage] = useState<string | null>(null);
  const [payrollDialogOpen, setPayrollDialogOpen] = useState(false);
  const [editingDailyRun, setEditingDailyRun] = useState<Omit<PayrollRun, 'lines'> | null>(null);
  const [deletingDailyRun, setDeletingDailyRun] = useState<Omit<PayrollRun, 'lines'> | null>(null);
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
    defaultValues: { employeeId: '', projectId: '', stageId: '', workDate: new Date().toISOString().slice(0, 10), startTime: '08:00', endTime: '17:00', status: 'PRESENT', hours: '8', overtimeHours: '' }
  });
  const correctionForm = useForm<CorrectionFormValues>({
    resolver: zodResolver(correctionFormSchema),
    defaultValues: { stageId: '', startTime: '08:00', endTime: '17:00', status: 'PRESENT', hours: '', overtimeHours: '' }
  });
  const payrollForm = useForm<PayrollFormValues>({
    resolver: zodResolver(payrollFormSchema),
    defaultValues: props.view === 'daily-payroll'
      ? { payCycle: 'DAILY', periodStart: new Date().toISOString().slice(0, 10), periodEnd: new Date().toISOString().slice(0, 10), fromTime: '08:00', toTime: '17:00' }
      : currentPayrollPeriod()
  });
  const payrollPayCycle = payrollForm.watch('payCycle');
  const advanceForm = useForm<AdvanceFormValues>({
    resolver: zodResolver(advanceFormSchema),
    defaultValues: { employeeId: '', projectId: '', stageId: '', advanceDate: new Date().toISOString().slice(0, 10), amount: '', cashBankAccountId: '', reason: '', reference: '' }
  });
  const advanceEmployeeId = advanceForm.watch('employeeId');
  const advanceProjectId = advanceForm.watch('projectId');
  const advanceStageId = advanceForm.watch('stageId');
  const advanceDate = advanceForm.watch('advanceDate');
  const advanceStages = useProjectStages(advanceProjectId || null, Boolean(advanceProjectId));
  const advanceAssignments = useAttendanceAssignments(
    advanceEmployeeId,
    advanceDate,
    (showAdvances || showPayrollCreation) && props.canCreateEmployeeAdvance && advanceDialogOpen
  );
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

  const advanceEligibleProjectIds = useMemo(
    () => new Set((advanceAssignments.data ?? []).map((assignment) => assignment.projectId)),
    [advanceAssignments.data]
  );
  const advanceProjects = useMemo(
    () => (projects.data?.items ?? []).filter((project) => advanceEligibleProjectIds.has(project.id)),
    [advanceEligibleProjectIds, projects.data?.items]
  );
  const advanceEligibleAssignments = useMemo(
    () => (advanceAssignments.data ?? []).filter((assignment) => assignment.projectId === advanceProjectId),
    [advanceAssignments.data, advanceProjectId]
  );
  const advanceHasProjectLevelAssignment = advanceEligibleAssignments.some((assignment) => assignment.stageId === null);
  const advanceEligibleStageIds = useMemo(
    () => new Set(advanceEligibleAssignments.flatMap((assignment) => assignment.stageId ? [assignment.stageId] : [])),
    [advanceEligibleAssignments]
  );
  const advanceEligibleStages = useMemo(
    () => advanceHasProjectLevelAssignment
      ? (advanceStages.data?.items ?? [])
      : (advanceStages.data?.items ?? []).filter((stage) => advanceEligibleStageIds.has(stage.id)),
    [advanceEligibleStageIds, advanceHasProjectLevelAssignment, advanceStages.data?.items]
  );
  const advanceDestinationValid = Boolean(
    advanceEmployeeId
    && advanceProjectId
    && advanceDate
    && (advanceStageId ? advanceHasProjectLevelAssignment || advanceEligibleStageIds.has(advanceStageId) : advanceHasProjectLevelAssignment)
  );

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

  /** Keep an advance inside the Employee's effective Project/Stage assignment on its payment date. */
  useEffect(() => {
    if (!advanceDialogOpen || !advanceEmployeeId || !advanceDate || advanceAssignments.isPending) return;
    if (advanceProjectId && !advanceEligibleProjectIds.has(advanceProjectId)) {
      advanceForm.setValue('projectId', '');
      advanceForm.setValue('stageId', '');
      advanceForm.setValue('cashBankAccountId', '');
      return;
    }
    if (!advanceProjectId || advanceStages.isPending) return;
    if (advanceHasProjectLevelAssignment) {
      if (advanceStageId && !(advanceStages.data?.items ?? []).some((stage) => stage.id === advanceStageId)) {
        advanceForm.setValue('stageId', '');
      }
      return;
    }
    if (!advanceEligibleStageIds.has(advanceStageId)) advanceForm.setValue('stageId', advanceEligibleStages[0]?.id ?? '');
  }, [advanceAssignments.isPending, advanceDate, advanceDialogOpen, advanceEligibleProjectIds, advanceEligibleStageIds, advanceEligibleStages, advanceEmployeeId, advanceForm, advanceHasProjectLevelAssignment, advanceProjectId, advanceStageId, advanceStages.data?.items, advanceStages.isPending]);

  /** Synchronize correction fields when the user selects an attendance row. */
  useEffect(() => {
    if (!selectedAttendance) return;
    correctionForm.reset({
      stageId: selectedAttendance.stageId ?? '',
      status: selectedAttendance.status,
      startTime: selectedAttendance.startTime ?? '',
      endTime: selectedAttendance.endTime ?? '',
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
      startTime: values.startTime,
      endTime: values.endTime,
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
      startTime: values.startTime,
      endTime: values.endTime,
      status: values.status,
      hours: values.hours || null,
      overtimeHours: values.overtimeHours || null
    });
    setSelectedAttendance(null);
  }

  /** Create one DRAFT Payroll period for later calculation. */
  async function submitPayrollRun(values: PayrollFormValues): Promise<void> {
    if (editingDailyRun) {
      const updated = await updateDailyRunMutation.mutateAsync({ payrollRunId: editingDailyRun.id, values: { periodStart: values.periodStart, periodEnd: values.periodEnd, fromTime: values.fromTime, toTime: values.toTime } });
      if (selectedRunId === updated.id) setSelectedRunId(updated.id);
      setEditingDailyRun(null);
      setPayrollDialogOpen(false);
      return;
    }
    const created = await createRunMutation.mutateAsync(values);
    setSelectedRunId(created.id);
    setPayrollDialogOpen(false);
  }

  /** Open the daily/monthly Payroll creation dialog with safe defaults for this page. */
  function openPayrollDialog(): void {
    createRunMutation.reset();
    updateDailyRunMutation.reset();
    setEditingDailyRun(null);
    payrollForm.reset(props.view === 'daily-payroll'
      ? { payCycle: 'DAILY', periodStart: new Date().toISOString().slice(0, 10), periodEnd: new Date().toISOString().slice(0, 10), fromTime: '08:00', toTime: '17:00' }
      : currentPayrollPeriod());
    setPayrollDialogOpen(true);
  }

  /** Open one DRAFT Daily Settlement in the same form used for creation. */
  function openDailyRunEdit(run: Omit<PayrollRun, 'lines'>): void {
    if (props.view !== 'daily-payroll' || run.payCycle !== 'DAILY' || run.status !== 'DRAFT') return;
    createRunMutation.reset();
    updateDailyRunMutation.reset();
    setEditingDailyRun(run);
    payrollForm.reset({ payCycle: 'DAILY', periodStart: run.periodStart, periodEnd: run.periodEnd, fromTime: run.fromTime ?? '08:00', toTime: run.toTime ?? '17:00' });
    setPayrollDialogOpen(true);
  }

  /** Close Payroll creation/editing without changing any existing run. */
  function closePayrollDialog(): void {
    createRunMutation.reset();
    updateDailyRunMutation.reset();
    setEditingDailyRun(null);
    setPayrollDialogOpen(false);
  }

  /** Permanently remove one DRAFT Daily Settlement after explicit confirmation. */
  async function confirmDeleteDailyRun(): Promise<void> {
    if (!deletingDailyRun) return;
    await deleteDailyRunMutation.mutateAsync(deletingDailyRun.id);
    if (selectedRunId === deletingDailyRun.id) setSelectedRunId(null);
    setDeletingDailyRun(null);
  }

  /** Pay an immediate Employee salary advance against one assigned Project and store optional proof independently. */
  async function submitAdvance(values: AdvanceFormValues): Promise<void> {
    const created = await createAdvanceMutation.mutateAsync({ ...values, stageId: values.stageId || null, reference: values.reference || null });
    let message = `Advance ${created.advanceNo} was posted successfully.`;
    if (advanceProof) {
      try {
        await savePaymentProof({
          id: created.id,
          paymentNo: created.advanceNo,
          projectId: created.projectId,
          resourceType: 'employee_advance',
          titlePrefix: 'Employee salary advance proof',
          category: 'employee_salary_advance_proof'
        }, advanceProof);
        message += ` Optional proof ${advanceProof.name} was saved.`;
      } catch (error) {
        message += ` The optional proof could not be stored: ${errorMessage(error) ?? 'Upload failed.'} Use Edit proof in the advance row to retry.`;
      }
    }
    setAdvanceResultMessage(message);
    advanceForm.reset({ employeeId: '', projectId: '', stageId: '', advanceDate: new Date().toISOString().slice(0, 10), amount: '', cashBankAccountId: '', reason: '', reference: '' });
    setAdvanceProof(null);
    setAdvanceProofInputKey((value) => value + 1);
    setAdvanceDialogOpen(false);
  }

  /** Open a fresh salary-advance dialog without carrying values or errors from the previous entry. */
  function openAdvanceDialog(): void {
    createAdvanceMutation.reset();
    advanceForm.reset({ employeeId: '', projectId: '', stageId: '', advanceDate: new Date().toISOString().slice(0, 10), amount: '', cashBankAccountId: '', reason: '', reference: '' });
    setAdvanceProof(null);
    setAdvanceProofInputKey((value) => value + 1);
    setAdvanceDialogOpen(true);
  }

  /** Close the salary-advance dialog and clear transient validation/API state. */
  function closeAdvanceDialog(): void {
    createAdvanceMutation.reset();
    advanceForm.reset({ employeeId: '', projectId: '', stageId: '', advanceDate: new Date().toISOString().slice(0, 10), amount: '', cashBankAccountId: '', reason: '', reference: '' });
    setAdvanceProof(null);
    setAdvanceProofInputKey((value) => value + 1);
    setAdvanceDialogOpen(false);
  }

  /** Select a Payroll Run while keeping button callbacks simple. */
  function chooseRun(runId: string): void {
    setPayrollResultMessage(null);
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
    if (!selectedRun.data || !window.confirm(`Finalize payroll for ${payrollWindowLabel(selectedRun.data)}? This posts Finance and Project costs and cannot be edited afterward.`)) return;
    setPayrollResultMessage(null);
    finalizeMutation.mutate(undefined, {
      onSuccess: (finalizedRun) => setPayrollResultMessage(
        `Payroll finalized and posted successfully. ${finalizedRun.lines.length} Employee payslip${finalizedRun.lines.length === 1 ? '' : 's'} generated and added to the Employee ledger.`
      )
    });
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
      ) : showPayrollCreation ? (
        <div className="section-heading client-page-heading">
          <div>
            <p className="eyebrow">{activePageCopy.eyebrow}</p>
            <h1>{activePageCopy.title}</h1>
            <p className="muted">{activePageCopy.description}</p>
          </div>
          <div className="button-row">
            {props.canCreateEmployeeAdvance && <button type="button" className="secondary-button" aria-haspopup="dialog" onClick={openAdvanceDialog}>Pay advance</button>}
            {props.canCreatePayroll && (
              <button type="button" className="client-primary-action" aria-haspopup="dialog" onClick={openPayrollDialog}>
                <span aria-hidden="true">+</span> {props.view === 'daily-payroll' ? 'Add settlement' : 'Add payroll'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="section-heading">
          <p className="eyebrow">{activePageCopy.eyebrow}</p>
          <h1>{activePageCopy.title}</h1>
          <p className="muted">{activePageCopy.description}</p>
        </div>
      )}

      {advanceResultMessage && (showAdvances || showPayrollCreation) && <p className="muted" role="status">{advanceResultMessage}</p>}

      {showAttendance && props.canCreateAttendance && (
        <section className="admin-card">
          <h2>Mark attendance</h2>
          <form className="form-grid" onSubmit={attendanceForm.handleSubmit(submitAttendance)}>
            <label>Employee<select {...attendanceForm.register('employeeId')}><option value="">Select Employee</option>{(employees.data?.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.employeeNo} · {item.name}</option>)}</select><span className="field-error">{attendanceForm.formState.errors.employeeId?.message}</span></label>
            <label>Project<select {...attendanceForm.register('projectId')} disabled={!selectedEmployeeId || !selectedWorkDate || attendanceAssignments.isPending}><option value="">Select assigned Project</option>{attendanceProjects.map((item) => <option key={item.id} value={item.id}>{item.projectCode} · {item.name}</option>)}</select><span className="field-error">{attendanceForm.formState.errors.projectId?.message}</span></label>
            <label>Stage<select {...attendanceForm.register('stageId')} disabled={!selectedProjectId || attendanceAssignments.isPending}><option value="" disabled={!hasProjectLevelAssignment}>Project level</option>{eligibleStages.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
            <label>Work date<input type="date" {...attendanceForm.register('workDate')} /><span className="field-error">{attendanceForm.formState.errors.workDate?.message}</span></label>
            <label>Shift from<input type="time" {...attendanceForm.register('startTime')} /><span className="field-error">{attendanceForm.formState.errors.startTime?.message}</span></label>
            <label>Shift to<input type="time" {...attendanceForm.register('endTime')} /><span className="field-error">{attendanceForm.formState.errors.endTime?.message}</span></label>
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
          <div className="table-scroll"><table><thead><tr><th>Date</th><th>Shift</th><th>Employee</th><th>Project</th><th>Stage</th><th>Status</th><th>Hours</th><th>Overtime</th><th>Entered by</th>{props.canCorrectAttendance && <th>Action</th>}</tr></thead><tbody>
            {(attendance.data?.items ?? []).map((row) => <tr key={row.id}><td>{row.workDate}</td><td>{row.startTime && row.endTime ? `${row.startTime} → ${row.endTime}` : 'Legacy / shift not set'}</td><td><strong>{row.employeeName}</strong><br /><small className="muted">{row.employeeNo}</small></td><td><strong>{row.projectName}</strong><br /><small className="muted">{row.projectCode}</small></td><td>{row.stageName ?? 'Project level'}</td><td>{row.status}</td><td>{row.hours ?? '0'}</td><td>{row.overtimeHours ?? '0'}</td><td>{row.enteredByName}</td>{props.canCorrectAttendance && <td><button type="button" className="secondary-button" onClick={() => chooseAttendance(row)}>Correct</button></td>}</tr>)}
            {(attendance.data?.items.length ?? 0) === 0 && <tr><td colSpan={props.canCorrectAttendance ? 10 : 9} className="muted">No attendance records.</td></tr>}
          </tbody></table></div>
        </section>
      )}

      {showAttendance && selectedAttendance && props.canCorrectAttendance && (
        <section className="admin-card">
          <h2>Correct attendance</h2>
          <p className="muted">Employee and Project remain fixed. Finalized Payroll locks the source attendance history.</p>
          <form className="form-grid" onSubmit={correctionForm.handleSubmit(submitCorrection)}>
            <label>Stage<select {...correctionForm.register('stageId')}><option value="">Project level</option>{(correctionStages.data?.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
            <label>Shift from<input type="time" {...correctionForm.register('startTime')} /><span className="field-error">{correctionForm.formState.errors.startTime?.message}</span></label>
            <label>Shift to<input type="time" {...correctionForm.register('endTime')} /><span className="field-error">{correctionForm.formState.errors.endTime?.message}</span></label>
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
          <div className="table-scroll"><table><thead><tr><th>Advance</th><th>Date</th><th>Employee</th><th>Project / Stage</th><th>Account</th><th>Amount</th><th>Recovered</th><th>Outstanding</th><th>Status</th><th>Action</th></tr></thead><tbody>{(advances.data?.items ?? []).map((advance) => <tr key={advance.id}><td><strong>{advance.advanceNo}</strong><br /><small>{advance.reason}</small></td><td>{advance.advanceDate}</td><td>{advance.employeeName}<br /><small>{advance.employeeNo}</small></td><td>{advance.projectCode} · {advance.projectName}{advance.stageName ? <><br /><small>{advance.stageName}</small></> : null}</td><td>{advance.cashBankAccountName}</td><td>{advance.amount}</td><td>{advance.recoveredAmount}</td><td><strong>{advance.outstandingAmount}</strong></td><td>{advance.status}</td><td><div className="button-row"><button type="button" className="secondary-button" onClick={() => setLedgerEmployeeId(advance.employeeId)}>Ledger</button><PaymentProofActions id={advance.id} paymentNo={advance.advanceNo} projectId={advance.projectId} resourceType="employee_advance" titlePrefix="Employee salary advance proof" category="employee_salary_advance_proof" canRead={props.canReadDocuments} canEdit={props.canUploadDocuments && props.canLinkDocuments && props.canVersionDocuments} />{props.canReverseEmployeeAdvance && advance.status === 'POSTED' && advance.recoveredAmount === '0.00' && <button type="button" className="secondary-button" onClick={() => setReversalAdvance(advance)}>Reverse</button>}</div></td></tr>)}{(advances.data?.items.length ?? 0) === 0 && <tr><td colSpan={10} className="muted">No Employee salary advances have been posted.</td></tr>}</tbody></table></div>
        </section>
      )}

      {showPayrollRuns && canAccessPayrollRuns && (
        <section className="admin-card">
          <h2>{showPayments ? 'Finalized payroll available for payment' : `${props.view === 'daily-payroll' ? 'Daily settlement' : 'Monthly payroll'} runs`} <small className="muted">({visibleRuns.length} shown)</small></h2>
          {errorMessage(runs.error) && <p className="field-error">{errorMessage(runs.error)}</p>}
          <div className="table-scroll"><table><thead><tr><th>Schedule</th><th>Period</th><th>Status</th><th>Created by</th><th>Finalized</th><th>Action</th></tr></thead><tbody>
            {visibleRuns.map((run) => <tr key={run.id}><td><span className={`payroll-cycle-badge payroll-cycle-badge-${run.payCycle.toLowerCase()}`}>{payCycleLabel(run.payCycle)}</span></td><td>{payrollWindowLabel(run)}</td><td>{run.status}</td><td>{run.createdByName}</td><td>{run.finalizedAt ?? '—'}</td><td><div className="button-row"><button type="button" className="secondary-button" onClick={() => chooseRun(run.id)}>Open</button>{props.view === 'daily-payroll' && run.payCycle === 'DAILY' && run.status === 'DRAFT' && props.canCreatePayroll && <><button type="button" className="secondary-button" onClick={() => openDailyRunEdit(run)}>Edit</button><button type="button" className="danger-button" onClick={() => { deleteDailyRunMutation.reset(); setDeletingDailyRun(run); }}>Delete</button></>}</div></td></tr>)}
            {visibleRuns.length === 0 && <tr><td colSpan={6} className="muted">{showPayments ? 'No finalized Payroll is available for payment.' : 'No Payroll Runs for this schedule.'}</td></tr>}
          </tbody></table></div>
          {errorMessage(deleteDailyRunMutation.error) && !deletingDailyRun && <p className="field-error">{errorMessage(deleteDailyRunMutation.error)}</p>}
        </section>
      )}

      {showPayrollRuns && selectedRunId && selectedRun.data && (
        <section className="admin-card payroll-preview-card">
          <div className="payroll-preview-header">
            <div>
              <p className="eyebrow">Payroll calculation preview</p>
              <h2>{payCycleLabel(selectedRun.data.payCycle)} · {payrollWindowLabel(selectedRun.data)}</h2>
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
            {props.canFinalizePayroll && selectedRun.data.status === 'CALCULATED' && <button type="button" className="secondary-button" onClick={confirmFinalize} disabled={finalizeMutation.isPending}>Finalize & post</button>}
          </div>
          {selectedRun.data.status === 'CALCULATED' && <p className="muted payroll-period-note">Finalization is validated by the server against the selected end hour in the Company time zone.</p>}
          {errorMessage(calculateMutation.error) && <p className="field-error">{errorMessage(calculateMutation.error)}</p>}
          {errorMessage(finalizeMutation.error) && <p className="field-error">{errorMessage(finalizeMutation.error)}</p>}
          {payrollResultMessage && <p className="muted" role="status">{payrollResultMessage}</p>}

          <div className="payroll-results-heading">
            <div><h3>Calculated Employees</h3><p className="muted">{selectedRun.data.payCycle === 'DAILY' ? 'Calculate one present daily/hourly Employee at a time; previously calculated workers stay in this settlement.' : 'Each calculation updates only the selected Employee and keeps previously calculated Employees in this run.'}</p></div>
            <span>{selectedRun.data.lines.length} employee{selectedRun.data.lines.length === 1 ? '' : 's'}</span>
          </div>
          <div className="table-scroll payroll-results-table"><table><thead><tr><th>Employee</th>{selectedRun.data.payCycle === 'DAILY' ? <><th>Gross earnings</th><th>Advance recovery</th><th>Net payable</th><th>Paid</th><th>Outstanding</th></> : <><th>Salary before absence</th><th>Absence deduction</th><th>Earned salary</th><th>Advance recovery</th><th>Net</th><th>Paid</th><th>Outstanding</th></>}<th>Project / Stage Employee Salary cost</th><th>Final payslip</th><th>Action</th></tr></thead><tbody>
            {selectedRun.data.lines.map((line) => <tr key={line.id}><td><strong>{line.employeeName}</strong><br /><small className="muted">{line.employeeNo}</small></td>{selectedRun.data.payCycle === 'DAILY' ? <><td><Money value={line.grossAmount} /></td><td><Money value={line.advanceDeduction} /></td><td><strong><Money value={line.netAmount} /></strong></td><td><Money value={line.paidAmount} /></td><td><strong><Money value={line.outstandingAmount} /></strong></td></> : <><td><Money value={line.salaryBeforeAbsence} /></td><td><Money value={line.absenceDeduction} /></td><td><Money value={line.grossAmount} /></td><td><Money value={line.advanceDeduction} /></td><td><strong><Money value={line.netAmount} /></strong></td><td><Money value={line.paidAmount} /></td><td><strong><Money value={line.outstandingAmount} /></strong></td></>}<td>{line.projectAllocation.length === 0 ? 'Historical allocation unavailable' : line.projectAllocation.map((allocation) => <div className="payroll-allocation-line" key={`${allocation.projectId}:${allocation.stageId ?? ''}:${allocation.category}`}>{projectNames.get(allocation.projectId) ?? 'Project'} / {allocation.stageId ? 'Selected stage' : 'Project level'} · {allocation.category === 'security' ? 'Security Employee Salary' : 'Employee Salary'} · <Money value={allocation.amount} /></div>)}</td><td>{line.payslip ? <div className="button-row"><span>Generated {line.payslip.generatedAt ?? '—'}</span>{selectedRun.data.status === 'FINALIZED' && <button type="button" className="secondary-button" title="Download the final payslip generated when this Payroll was finalized" onClick={() => downloadFinalPayrollPayslip(selectedRun.data as PayrollRun, line, projectNames)}>Download payslip</button>}</div> : selectedRun.data.status === 'FINALIZED' ? 'Not generated' : 'Generated after finalization'}</td><td><div className="button-row">{Number(line.outstandingAmount) > 0 && selectedRun.data.status === 'FINALIZED' && props.canCreatePayrollPayment && <button type="button" title="Pay finalized salary from a Cash or Bank account" onClick={() => setPaymentLine(line)}>Pay salary from account</button>}{showPayrollCreation && Number(line.outstandingAmount) > 0 && selectedRun.data.status !== 'FINALIZED' && props.canCreateEmployeeAdvance && <button type="button" className="secondary-button" title="Record an advance against this open Payroll" onClick={() => setAdvanceLine(line)}>Pay advance</button>}{props.canReadPayroll && <button type="button" className="secondary-button" onClick={() => setLedgerEmployeeId(line.employeeId)}>Ledger</button>}</div></td></tr>)}
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

      {showPayrollCreation && payrollDialogOpen && props.canCreatePayroll && (
        <div className="client-modal-backdrop" role="presentation" onMouseDown={closePayrollDialog}>
          <section className="client-modal client-modal-wide" role="dialog" aria-modal="true" aria-labelledby="payroll-create-title" onMouseDown={(event) => event.stopPropagation()}>
            <header className="client-modal-header">
              <div>
                <p className="eyebrow">{props.view === 'daily-payroll' ? 'Daily-paid workers' : 'Monthly employees'}</p>
                <h2 id="payroll-create-title">{editingDailyRun ? 'Edit daily settlement' : `Create ${props.view === 'daily-payroll' ? 'daily settlement' : 'monthly payroll'}`}</h2>
                <p className="muted">{editingDailyRun ? 'Only a DRAFT Daily Settlement can be edited. Once calculated, its period is locked.' : 'The server includes only active Employees whose effective compensation belongs to this payment schedule.'}</p>
              </div>
              <button type="button" className="client-modal-close" onClick={closePayrollDialog} aria-label="Close payroll creation form"><span aria-hidden="true">×</span></button>
            </header>
            <div className="client-modal-body">
              <form className="client-modal-form" onSubmit={payrollForm.handleSubmit(submitPayrollRun)}>
                <div className="client-form-grid">
                  <input type="hidden" {...payrollForm.register('payCycle')} />
                  <label>{payrollPayCycle === 'DAILY' ? 'Work / settlement date' : 'From date'}<input type="date" {...payrollForm.register('periodStart', payrollPayCycle === 'DAILY' ? { onChange: (event) => payrollForm.setValue('periodEnd', event.target.value, { shouldValidate: true }) } : {})} /><span className="field-error">{payrollForm.formState.errors.periodStart?.message}</span></label>
                  {payrollPayCycle === 'DAILY' ? <input type="hidden" {...payrollForm.register('periodEnd')} /> : <label>To date<input type="date" {...payrollForm.register('periodEnd')} /><span className="field-error">{payrollForm.formState.errors.periodEnd?.message}</span></label>}
                  <label>From hour<input type="time" {...payrollForm.register('fromTime')} /><span className="field-error">{payrollForm.formState.errors.fromTime?.message}</span></label>
                  <label>To hour<input type="time" {...payrollForm.register('toTime')} /><span className="field-error">{payrollForm.formState.errors.toTime?.message}</span></label>
                </div>
                <div className="payroll-cycle-guidance"><strong>{payrollPayCycle === 'DAILY' ? 'Daily shift settlement' : 'Payroll window'}</strong><span>{payrollPayCycle === 'DAILY' ? 'Only attendance whose shift overlaps this hour-to-hour window is included; overnight windows such as 20:00 → 05:00 are supported. Legacy attendance needs a shift before timed settlement.' : 'Choose the date range and day/night hour window. Only matching attendance with a recorded shift is included; monthly salary remains prorated against the calendar month.'}</span></div>
                {errorMessage(editingDailyRun ? updateDailyRunMutation.error : createRunMutation.error) && <p className="field-error" role="alert">{errorMessage(editingDailyRun ? updateDailyRunMutation.error : createRunMutation.error)}</p>}
                <div className="client-modal-actions">
                  <button type="button" className="secondary-button" onClick={closePayrollDialog}>Cancel</button>
                  <button type="submit" disabled={editingDailyRun ? updateDailyRunMutation.isPending : createRunMutation.isPending}>{editingDailyRun ? (updateDailyRunMutation.isPending ? 'Saving…' : 'Save changes') : (createRunMutation.isPending ? 'Creating…' : `Create ${payrollPayCycle === 'DAILY' ? 'daily settlement' : 'monthly payroll'}`)}</button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}

      {(showAdvances || showPayrollCreation) && advanceDialogOpen && props.canCreateEmployeeAdvance && (
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
                  <label>Employee<select {...advanceForm.register('employeeId', { onChange: () => { advanceForm.setValue('projectId', ''); advanceForm.setValue('stageId', ''); advanceForm.setValue('cashBankAccountId', ''); } })}><option value="">Select Employee</option>{(employees.data?.items ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeNo} · {employee.name}</option>)}</select><span className="field-error">{advanceForm.formState.errors.employeeId?.message}</span></label>
                  <label>Project<select {...advanceForm.register('projectId', { onChange: () => { advanceForm.setValue('stageId', ''); advanceForm.setValue('cashBankAccountId', ''); } })} disabled={!advanceEmployeeId || !advanceDate || advanceAssignments.isPending}><option value="">Select assigned Project</option>{advanceProjects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}</select><span className="field-error">{advanceForm.formState.errors.projectId?.message}</span></label>
                  <label>Stage (optional)<select {...advanceForm.register('stageId')} disabled={!advanceProjectId || advanceAssignments.isPending}><option value="" disabled={!advanceHasProjectLevelAssignment}>Project level</option>{advanceEligibleStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.code} · {stage.name}</option>)}</select></label>
                  <label>Advance date<input type="date" {...advanceForm.register('advanceDate', { onChange: () => { advanceForm.setValue('projectId', ''); advanceForm.setValue('stageId', ''); advanceForm.setValue('cashBankAccountId', ''); } })} /><span className="field-error">{advanceForm.formState.errors.advanceDate?.message}</span></label>
                  <label>Amount<input inputMode="decimal" {...advanceForm.register('amount')} placeholder="2000.00" /><span className="field-error">{advanceForm.formState.errors.amount?.message}</span></label>
                  <label>Cash / Bank account<select {...advanceForm.register('cashBankAccountId')}><option value="">Select account</option>{advanceAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}{account.accountNumber ? ` · ${account.accountNumber}` : ''} · Balance {account.balance}</option>)}</select><span className="field-error">{advanceForm.formState.errors.cashBankAccountId?.message}</span></label>
                  <label>Reason<input {...advanceForm.register('reason')} placeholder="Urgent personal advance" /><span className="field-error">{advanceForm.formState.errors.reason?.message}</span></label>
                  <label>Reference (optional)<input {...advanceForm.register('reference')} /></label>
                  <label>Employee salary proof (optional)<input key={advanceProofInputKey} type="file" accept="image/jpeg,image/png,application/pdf" disabled={!props.canUploadDocuments || !props.canLinkDocuments} onChange={(event) => setAdvanceProof(event.target.files?.[0] ?? null)} /><small className="muted">Attach a signed receipt, bank slip, image or PDF. You can also attach proof later from the advance row.</small></label>
                </div>
                {advanceAssignments.isPending && advanceEmployeeId && <p className="muted">Checking this Employee's effective Project/Stage assignments…</p>}
                {errorMessage(advanceAssignments.error) && <p className="field-error">Could not verify the Employee assignment: {errorMessage(advanceAssignments.error)}</p>}
                {!advanceAssignments.isPending && advanceEmployeeId && advanceDate && (advanceAssignments.data?.length ?? 0) === 0 && <p className="field-error">This Employee has no active Project/Stage assignment on {advanceDate}. Assign the Employee in Project Team / Assignment before paying an advance.</p>}
                {!advanceAssignments.isPending && advanceEligibleAssignments.length > 0 && !advanceHasProjectLevelAssignment && <p className="muted">The advance is limited to the Employee's assigned Stage for this date.</p>}
                {advanceProjectId && advanceAccounts.length === 0 && props.canManageAccounts && <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setAccountProjectId(advanceProjectId)}>Add Cash / Bank account</button></div>}
                {errorMessage(createAdvanceMutation.error) && <p className="field-error" role="alert">{errorMessage(createAdvanceMutation.error)}</p>}
                <div className="client-modal-actions">
                  <button type="button" className="secondary-button" onClick={closeAdvanceDialog}>Cancel</button>
                  <button type="submit" disabled={createAdvanceMutation.isPending || advanceAssignments.isPending || !advanceDestinationValid || advanceAccounts.length === 0}>{createAdvanceMutation.isPending ? 'Posting…' : 'Pay advance'}</button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}

      {deletingDailyRun && (
        <div className="client-modal-backdrop" role="presentation" onMouseDown={() => { if (!deleteDailyRunMutation.isPending) setDeletingDailyRun(null); }}>
          <section className="client-modal" role="dialog" aria-modal="true" aria-labelledby="daily-settlement-delete-title" onMouseDown={(event) => event.stopPropagation()}>
            <header className="client-modal-header">
              <div>
                <p className="eyebrow">Draft daily settlement</p>
                <h2 id="daily-settlement-delete-title">Delete daily settlement?</h2>
                <p className="muted">This permanently deletes the DRAFT settlement for {deletingDailyRun.periodStart}. Calculated or finalized settlements cannot be deleted.</p>
              </div>
              <button type="button" className="client-modal-close" disabled={deleteDailyRunMutation.isPending} onClick={() => setDeletingDailyRun(null)} aria-label="Close delete daily settlement dialog"><span aria-hidden="true">×</span></button>
            </header>
            <div className="client-modal-body">
              {errorMessage(deleteDailyRunMutation.error) && <p className="field-error" role="alert">{errorMessage(deleteDailyRunMutation.error)}</p>}
              <div className="client-modal-actions">
                <button type="button" className="secondary-button" disabled={deleteDailyRunMutation.isPending} onClick={() => setDeletingDailyRun(null)}>Cancel</button>
                <button type="button" className="danger-button" disabled={deleteDailyRunMutation.isPending} onClick={() => void confirmDeleteDailyRun()}>{deleteDailyRunMutation.isPending ? 'Deleting…' : 'Delete draft'}</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {paymentLine && selectedRun.data && <SalaryPaymentModal line={paymentLine} run={selectedRun.data} accounts={cashBankAccounts.data ?? []} canManageAccounts={props.canManageAccounts} onAddAccount={setAccountProjectId} onClose={() => setPaymentLine(null)} />}
      {advanceLine && selectedRun.data && <OpenPayrollAdvanceModal line={advanceLine} run={selectedRun.data} projects={projects.data?.items ?? []} accounts={cashBankAccounts.data ?? []} canManageAccounts={props.canManageAccounts} canCalculatePayroll={props.canCalculatePayroll} canUploadDocuments={props.canUploadDocuments} canLinkDocuments={props.canLinkDocuments} onAddAccount={setAccountProjectId} onCompleted={setAdvanceResultMessage} onClose={() => setAdvanceLine(null)} />}
      {ledgerEmployeeId && props.canReadPayroll && <SalaryLedgerModal employeeId={ledgerEmployeeId} projects={projects.data?.items ?? []} onClose={() => setLedgerEmployeeId(null)} />}
      {accountProjectId && <ProjectAccountCreateModal projectId={accountProjectId} projectLabel={projectNames.get(accountProjectId) ?? 'Project'} onCreated={async () => { await cashBankAccounts.refetch(); }} onClose={() => setAccountProjectId(null)} />}
      {reversalPayment && <SalaryPaymentReversalModal payment={reversalPayment} onClose={() => setReversalPayment(null)} />}
      {reversalAdvance && <AdvanceReversalModal advance={reversalAdvance} onClose={() => setReversalAdvance(null)} />}
    </div>
  );
}
