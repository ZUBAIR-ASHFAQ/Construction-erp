import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useEmployees } from '../../employees/hooks/employees.js';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useProjects } from '../../projects/hooks/projects.js';
import type { AttendanceEntry } from '../api/labour-payroll-api.js';
import {
  useAttendance,
  useCalculatePayrollRun,
  useCreateAttendance,
  useCreatePayrollRun,
  useFinalizePayrollRun,
  usePayrollRun,
  usePayrollRuns,
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

type AttendanceFormValues = z.infer<typeof attendanceFormSchema>;
type CorrectionFormValues = z.infer<typeof correctionFormSchema>;
type PayrollFormValues = z.infer<typeof payrollFormSchema>;

export type LabourPayrollWorkspaceProps = Readonly<{
  canReadAttendance: boolean;
  canCreateAttendance: boolean;
  canCorrectAttendance: boolean;
  canReadPayroll: boolean;
  canCreatePayroll: boolean;
  canCalculatePayroll: boolean;
  canFinalizePayroll: boolean;
}>;

/** Return one readable request error without exposing backend internals. */
function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

/** Render one amount consistently in the Payroll workspace. */
function Money({ value }: Readonly<{ value: string }>) {
  return <span>{value}</span>;
}

/** Render the final Attendance and Payroll workflows without duplicating Employee or Project ownership. */
export function LabourPayrollWorkspace(props: LabourPayrollWorkspaceProps) {
  const employees = useEmployees({ status: 'ACTIVE', pageSize: 100 }, props.canCreateAttendance || props.canReadAttendance);
  const projects = useProjects({ status: 'ACTIVE', pageSize: 100 }, props.canCreateAttendance || props.canReadAttendance);
  const attendance = useAttendance({ pageSize: 100 }, props.canReadAttendance);
  const runs = usePayrollRuns(props.canReadPayroll);
  const createAttendanceMutation = useCreateAttendance();
  const createRunMutation = useCreatePayrollRun();
  const [selectedAttendance, setSelectedAttendance] = useState<AttendanceEntry | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const selectedRun = usePayrollRun(selectedRunId, props.canReadPayroll);

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
    defaultValues: { periodStart: '', periodEnd: '' }
  });
  const selectedProjectId = attendanceForm.watch('projectId');
  const createStages = useProjectStages(selectedProjectId || null, Boolean(selectedProjectId));
  const correctionStages = useProjectStages(selectedAttendance?.projectId ?? null, Boolean(selectedAttendance));
  const correctionMutation = useUpdateAttendance(selectedAttendance?.id ?? '00000000-0000-0000-0000-000000000000');
  const calculateMutation = useCalculatePayrollRun(selectedRunId ?? '00000000-0000-0000-0000-000000000000');
  const finalizeMutation = useFinalizePayrollRun(selectedRunId ?? '00000000-0000-0000-0000-000000000000');

  const employeeNames = useMemo(() => new Map((employees.data?.items ?? []).map((item) => [item.id, `${item.employeeNo} · ${item.name}`])), [employees.data]);
  const projectNames = useMemo(() => new Map((projects.data?.items ?? []).map((item) => [item.id, `${item.projectCode} · ${item.name}`])), [projects.data]);

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

  return (
    <div className="stack">
      <section className="admin-card">
        <p className="eyebrow">Module 13</p>
        <h1>Labour / Attendance & Payroll</h1>
        <p className="muted">Attendance is validated against Project Team assignments. Payroll uses effective Employee compensation, then finalization posts Project/Stage labour cost and Finance accounting atomically.</p>
      </section>

      {props.canCreateAttendance && (
        <section className="admin-card">
          <h2>Mark attendance</h2>
          <form className="form-grid" onSubmit={attendanceForm.handleSubmit(submitAttendance)}>
            <label>Employee<select {...attendanceForm.register('employeeId')}><option value="">Select Employee</option>{(employees.data?.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.employeeNo} · {item.name}</option>)}</select><span className="field-error">{attendanceForm.formState.errors.employeeId?.message}</span></label>
            <label>Project<select {...attendanceForm.register('projectId')}><option value="">Select Project</option>{(projects.data?.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.projectCode} · {item.name}</option>)}</select><span className="field-error">{attendanceForm.formState.errors.projectId?.message}</span></label>
            <label>Stage<select {...attendanceForm.register('stageId')}><option value="">Project level</option>{(createStages.data?.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
            <label>Work date<input type="date" {...attendanceForm.register('workDate')} /><span className="field-error">{attendanceForm.formState.errors.workDate?.message}</span></label>
            <label>Status<select {...attendanceForm.register('status')}><option value="PRESENT">Present</option><option value="ABSENT">Absent</option></select></label>
            <label>Hours<input inputMode="decimal" {...attendanceForm.register('hours')} /><span className="field-error">{attendanceForm.formState.errors.hours?.message}</span></label>
            <label>Overtime hours<input inputMode="decimal" {...attendanceForm.register('overtimeHours')} /><span className="field-error">{attendanceForm.formState.errors.overtimeHours?.message}</span></label>
            <div className="form-actions"><button type="submit" disabled={createAttendanceMutation.isPending}>Save attendance</button></div>
          </form>
          {errorMessage(createAttendanceMutation.error) && <p className="field-error">{errorMessage(createAttendanceMutation.error)}</p>}
        </section>
      )}

      {props.canReadAttendance && (
        <section className="admin-card">
          <h2>Attendance register <small className="muted">({attendance.data?.total ?? 0} total · page {attendance.data?.page ?? 1})</small></h2>
          {attendance.isLoading && <p className="muted">Loading attendance…</p>}
          {errorMessage(attendance.error) && <p className="field-error">{errorMessage(attendance.error)}</p>}
          <div className="table-scroll"><table><thead><tr><th>Date</th><th>Employee</th><th>Project</th><th>Stage</th><th>Status</th><th>Hours</th><th>Overtime</th><th>Entered by</th>{props.canCorrectAttendance && <th>Action</th>}</tr></thead><tbody>
            {(attendance.data?.items ?? []).map((row) => <tr key={row.id}><td>{row.workDate}</td><td>{employeeNames.get(row.employeeId) ?? row.employeeId}</td><td>{projectNames.get(row.projectId) ?? row.projectId}</td><td>{row.stageId ?? 'Project'}</td><td>{row.status}</td><td>{row.hours ?? '0'}</td><td>{row.overtimeHours ?? '0'}</td><td>{row.enteredBy}</td>{props.canCorrectAttendance && <td><button type="button" className="secondary-button" onClick={() => chooseAttendance(row)}>Correct</button></td>}</tr>)}
            {(attendance.data?.items.length ?? 0) === 0 && <tr><td colSpan={8} className="muted">No attendance records.</td></tr>}
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
            <label>Overtime hours<input {...correctionForm.register('overtimeHours')} /></label>
            <div className="form-actions"><button type="submit" disabled={correctionMutation.isPending}>Save correction</button><button type="button" className="secondary-button" onClick={cancelCorrection}>Cancel</button></div>
          </form>
          {errorMessage(correctionMutation.error) && <p className="field-error">{errorMessage(correctionMutation.error)}</p>}
        </section>
      )}

      {props.canCreatePayroll && (
        <section className="admin-card">
          <h2>Create payroll run</h2>
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
          <h2>Payroll runs <small className="muted">({runs.data?.total ?? 0} total · page {runs.data?.page ?? 1})</small></h2>
          {errorMessage(runs.error) && <p className="field-error">{errorMessage(runs.error)}</p>}
          <div className="table-scroll"><table><thead><tr><th>Period</th><th>Status</th><th>Created by</th><th>Finalized</th><th>Detail</th></tr></thead><tbody>
            {(runs.data?.items ?? []).map((run) => <tr key={run.id}><td>{run.periodStart} → {run.periodEnd}</td><td>{run.status}</td><td>{run.createdBy}</td><td>{run.finalizedAt ?? '—'}</td><td><button type="button" className="secondary-button" onClick={() => chooseRun(run.id)}>Open</button></td></tr>)}
            {(runs.data?.items.length ?? 0) === 0 && <tr><td colSpan={4} className="muted">No Payroll Runs.</td></tr>}
          </tbody></table></div>
        </section>
      )}

      {selectedRunId && selectedRun.data && (
        <section className="admin-card">
          <h2>Payroll calculation preview</h2>
          <p><strong>{selectedRun.data.periodStart} → {selectedRun.data.periodEnd}</strong> · {selectedRun.data.status} · Created by {selectedRun.data.createdBy} · Finalized {selectedRun.data.finalizedAt ?? '—'}</p>
          <div className="form-actions">
            {props.canCalculatePayroll && selectedRun.data.status !== 'FINALIZED' && <button type="button" onClick={() => calculateMutation.mutate()} disabled={calculateMutation.isPending}>Calculate</button>}
            {props.canFinalizePayroll && selectedRun.data.status === 'CALCULATED' && <button type="button" onClick={() => finalizeMutation.mutate()} disabled={finalizeMutation.isPending}>Finalize & post</button>}
          </div>
          {errorMessage(calculateMutation.error) && <p className="field-error">{errorMessage(calculateMutation.error)}</p>}
          {errorMessage(finalizeMutation.error) && <p className="field-error">{errorMessage(finalizeMutation.error)}</p>}
          <div className="table-scroll"><table><thead><tr><th>Employee</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Project / Stage labour cost</th><th>Payslip</th></tr></thead><tbody>
            {selectedRun.data.lines.map((line) => <tr key={line.id}><td>{employeeNames.get(line.employeeId) ?? line.employeeId}</td><td><Money value={line.grossAmount} /></td><td><Money value={line.deductions} /></td><td><Money value={line.netAmount} /></td><td>{line.projectAllocation.length === 0 ? 'Historical allocation unavailable' : line.projectAllocation.map((allocation) => <div key={`${allocation.projectId}:${allocation.stageId ?? ''}:${allocation.category}`}>{projectNames.get(allocation.projectId) ?? allocation.projectId} / {allocation.stageId ?? 'Project'} · {allocation.category} · <Money value={allocation.amount} /></div>)}</td><td>{line.payslip ? <>Generated {line.payslip.generatedAt ?? '—'}<br /><small>Payslip {line.payslip.id} · Document {line.payslip.documentId ?? '—'}</small></> : 'Not generated'}</td></tr>)}
            {selectedRun.data.lines.length === 0 && <tr><td colSpan={6} className="muted">Calculate this run to create Employee Payroll lines.</td></tr>}
          </tbody></table></div>
        </section>
      )}
    </div>
  );
}
