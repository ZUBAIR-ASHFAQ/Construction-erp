import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  useCreateEmployeeCompensation,
  useEmployee,
  useUpdateEmployee,
  useUpdateEmployeeStatus
} from '../hooks/employees.js';
import type { EmployeePayType } from '../api/employees-api.js';

const updateEmployeeSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200),
  cnicOrId: z.string().trim().max(100),
  phone: z.string().trim().max(50),
  email: z.string().trim().max(320),
  department: z.string().trim().min(1, 'Department is required.').max(160),
  jobTitle: z.string().trim().min(1, 'Job title is required.').max(160),
  employeeType: z.string().trim().min(1, 'Work category is required.').max(64),
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
  employmentEndDate: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')])
}).refine((value) => !value.employmentEndDate || value.employmentEndDate >= value.joiningDate, {
  path: ['employmentEndDate'], message: 'Employment end date cannot precede joining date.'
});

const compensationSchema = z.object({
  payType: z.enum(['SALARY', 'DAILY', 'HOURLY']),
  amount: z.string().trim(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
}).superRefine((value, context) => {
  const pattern = value.payType === 'HOURLY'
    ? /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/
    : /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;
  if (!pattern.test(value.amount) || Number(value.amount) <= 0) {
    context.addIssue({
      code: 'custom',
      path: ['amount'],
      message: value.payType === 'HOURLY'
        ? 'Enter a positive hourly rate with up to 4 decimal places.'
        : 'Enter a positive salary/wage with up to 2 decimal places.'
    });
  }
});

type UpdateEmployeeValues = z.infer<typeof updateEmployeeSchema>;
type CompensationValues = z.infer<typeof compensationSchema>;

export type EmployeeDetailsPanelProps = Readonly<{
  employeeId: string | null;
  mode?: 'details' | 'edit';
  canUpdate: boolean;
  canManageCompensation: boolean;
}>;

/** Return one readable request error without exposing backend internals. */
function errorMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return null;
}

/** Return the user-facing label for one compensation pay type. */
function compensationLabel(payType: EmployeePayType): string {
  if (payType === 'SALARY') return 'Monthly salary';
  if (payType === 'DAILY') return 'Daily wage';
  return 'Hourly rate';
}

/** Render Employee detail or the dedicated Employee/salary editor. */
export function EmployeeDetailsPanel({
  employeeId,
  mode = 'details',
  canUpdate,
  canManageCompensation
}: EmployeeDetailsPanelProps) {
  const detailQuery = useEmployee(employeeId, employeeId !== null);
  const employee = detailQuery.data?.employee ?? null;
  const compensationHistory = detailQuery.data?.compensationHistory ?? null;
  const hasCompensation = (compensationHistory?.length ?? 0) > 0;
  const updateMutation = useUpdateEmployee(employeeId ?? '');
  const statusMutation = useUpdateEmployeeStatus(employeeId ?? '');
  const compensationMutation = useCreateEmployeeCompensation(employeeId ?? '');
  const [salaryEditorOpen, setSalaryEditorOpen] = useState(false);
  const updateForm = useForm<UpdateEmployeeValues>({
    resolver: zodResolver(updateEmployeeSchema),
    defaultValues: {
      name: '', cnicOrId: '', phone: '', email: '', department: '', jobTitle: '', employeeType: '',
      joiningDate: '', employmentEndDate: ''
    }
  });
  const compensationForm = useForm<CompensationValues>({
    resolver: zodResolver(compensationSchema),
    defaultValues: { payType: 'SALARY', amount: '', effectiveFrom: '' }
  });
  const payType = compensationForm.watch('payType');

  /** Reset the Employee editor whenever another Employee is selected. */
  useEffect(() => {
    if (!employee) return;
    updateForm.reset({
      name: employee.name,
      cnicOrId: employee.cnicOrId ?? '',
      phone: employee.phone ?? '',
      email: employee.email ?? '',
      department: employee.department,
      jobTitle: employee.jobTitle,
      employeeType: employee.employeeType,
      joiningDate: employee.joiningDate,
      employmentEndDate: employee.employmentEndDate ?? ''
    });
  }, [employee, updateForm]);

  /** Close transient salary editing when switching Employee or dialog mode. */
  useEffect(() => {
    setSalaryEditorOpen(false);
    compensationForm.reset({ payType: 'SALARY', amount: '', effectiveFrom: '' });
  }, [employeeId, mode, compensationForm]);

  if (!employeeId) return null;

  /** Persist the editable Employee master fields without changing salary or status. */
  async function handleUpdate(values: UpdateEmployeeValues): Promise<void> {
    await updateMutation.mutateAsync({
      name: values.name,
      cnicOrId: values.cnicOrId || null,
      phone: values.phone || null,
      email: values.email || null,
      department: values.department,
      jobTitle: values.jobTitle,
      employeeType: values.employeeType,
      joiningDate: values.joiningDate,
      employmentEndDate: values.employmentEndDate || null
    });
  }

  /** Append one new effective salary/wage/rate record instead of overwriting Payroll history. */
  async function handleCompensation(values: CompensationValues): Promise<void> {
    await compensationMutation.mutateAsync(values.payType === 'HOURLY'
      ? { payType: 'HOURLY', hourlyRate: values.amount, effectiveFrom: values.effectiveFrom }
      : { payType: values.payType, baseSalaryOrWage: values.amount, effectiveFrom: values.effectiveFrom });
    compensationForm.reset({ payType: values.payType, amount: '', effectiveFrom: '' });
    if (mode === 'edit') setSalaryEditorOpen(false);
  }

  /** Open the salary-change form with the current supported payment basis preselected. */
  function openSalaryEditor(): void {
    const latest = compensationHistory?.[compensationHistory.length - 1];
    const editablePayType = latest?.payType === 'SALARY' || latest?.payType === 'DAILY' ? latest.payType : 'SALARY';
    compensationForm.reset({
      payType: editablePayType,
      amount: latest?.payType === editablePayType ? (latest.baseSalaryOrWage ?? '') : '',
      effectiveFrom: ''
    });
    setSalaryEditorOpen(true);
  }

  /** Toggle Employee active status through the explicit lifecycle command. */
  async function handleStatusChange(): Promise<void> {
    if (!employee) return;
    await statusMutation.mutateAsync({
      status: employee.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      reason: employee.status === 'ACTIVE' ? 'Deactivated from Employee Management.' : 'Reactivated from Employee Management.'
    });
  }

  /** Render the shared effective-dated salary form for initial setup or a later change. */
  function renderCompensationForm(submitLabel: string) {
    return (
      <form className="admin-form employee-salary-form" onSubmit={compensationForm.handleSubmit(handleCompensation)} noValidate>
        <div className="module14b-form-grid">
          <label>
            Pay type
            <select {...compensationForm.register('payType')}>
              <option value="SALARY">Monthly employee</option>
              <option value="DAILY">Daily-paid worker</option>
            </select>
          </label>
          <label>
            {compensationLabel(payType)}
            <input inputMode="decimal" {...compensationForm.register('amount')} />
          </label>
          <label>Effective from<input type="date" {...compensationForm.register('effectiveFrom')} /></label>
        </div>
        {Object.values(compensationForm.formState.errors).map((error, index) => (
          <span className="field-error" key={index}>{errorMessage(error)}</span>
        ))}
        {errorMessage(compensationMutation.error) && <div className="form-error" role="alert">{errorMessage(compensationMutation.error)}</div>}
        <div className="button-row">
          <button type="submit" disabled={compensationMutation.isPending}>{compensationMutation.isPending ? 'Saving…' : submitLabel}</button>
          {mode === 'edit' && (
            <button type="button" className="secondary-button" onClick={() => setSalaryEditorOpen(false)}>Cancel</button>
          )}
        </div>
      </form>
    );
  }

  return (
    <section className="employee-record-panel" aria-label={mode === 'edit' ? 'Edit employee' : 'Employee details'}>
      {detailQuery.isPending && <p>Loading Employee…</p>}
      {errorMessage(detailQuery.error) && <div className="form-error" role="alert">{errorMessage(detailQuery.error)}</div>}

      {employee && (
        <>
          {mode === 'details' && (
            <div className="module14b-summary-grid">
              <div><dt>Employee ID</dt><dd>{employee.id}</dd></div>
              <div><dt>Employee</dt><dd>{employee.employeeNo} · {employee.name}</dd></div>
              <div><dt>Status</dt><dd>{employee.status}</dd></div>
              <div><dt>Type</dt><dd>{employee.employeeType}</dd></div>
              <div><dt>Department</dt><dd>{employee.department}</dd></div>
              <div><dt>Job title</dt><dd>{employee.jobTitle}</dd></div>
              <div><dt>Joining date</dt><dd>{employee.joiningDate}</dd></div>
              <div><dt>Employment end</dt><dd>{employee.employmentEndDate ?? 'Open-ended'}</dd></div>
              <div><dt>User link</dt><dd>{employee.userId ?? 'Not linked'}</dd></div>
              <div><dt>CNIC / ID</dt><dd>{employee.cnicOrId ?? '—'}</dd></div>
              <div><dt>Phone</dt><dd>{employee.phone ?? '—'}</dd></div>
              <div><dt>Email</dt><dd>{employee.email ?? '—'}</dd></div>
            </div>
          )}

          {mode === 'edit' && canUpdate && (
            <form className="admin-form module14b-subsection" onSubmit={updateForm.handleSubmit(handleUpdate)} noValidate>
              <h3>Employee information</h3>
              <div className="module14b-form-grid">
                <label>Name<input {...updateForm.register('name')} /></label>
                <label>CNIC / ID<input {...updateForm.register('cnicOrId')} /></label>
                <label>Phone<input {...updateForm.register('phone')} /></label>
                <label>Email<input type="email" {...updateForm.register('email')} /></label>
                <label>Department<input {...updateForm.register('department')} /></label>
                <label>Job title<input {...updateForm.register('jobTitle')} /></label>
                <label>Work category<input {...updateForm.register('employeeType')} /></label>
                <label>Joining date<input type="date" {...updateForm.register('joiningDate')} /></label>
                <label>Employment end date (optional)<input type="date" min={updateForm.watch('joiningDate') || undefined} {...updateForm.register('employmentEndDate')} /></label>
              </div>
              {Object.values(updateForm.formState.errors).map((error, index) => (
                <span className="field-error" key={index}>{errorMessage(error)}</span>
              ))}
              {errorMessage(updateMutation.error) && <div className="form-error" role="alert">{errorMessage(updateMutation.error)}</div>}
              <div className="button-row">
                <button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? 'Saving…' : 'Save Employee'}</button>
                <button type="button" className="secondary-button" disabled={statusMutation.isPending} onClick={() => void handleStatusChange()}>
                  {statusMutation.isPending ? 'Updating…' : employee.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                </button>
              </div>
              {errorMessage(statusMutation.error) && <div className="form-error" role="alert">{errorMessage(statusMutation.error)}</div>}
            </form>
          )}

          {mode === 'details' && canManageCompensation && compensationHistory?.length === 0 && employee.status === 'ACTIVE' && (
            <section className="module14b-subsection" aria-labelledby="employee-initial-salary-title">
              <h3 id="employee-initial-salary-title">Set salary</h3>
              {renderCompensationForm('Set salary')}
            </section>
          )}

          {mode === 'edit' && canManageCompensation && hasCompensation && compensationHistory && (
            <section className="module14b-subsection" aria-labelledby="employee-compensation-title">
              <div className="employee-compensation-heading">
                <div>
                  <h3 id="employee-compensation-title">Salary & compensation history</h3>
                  <p className="muted">Salary changes stay effective-dated so finalized and historical Payroll remains traceable.</p>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={employee.status !== 'ACTIVE' || salaryEditorOpen}
                  onClick={openSalaryEditor}
                >
                  Edit salary
                </button>
              </div>

              <div className="table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Effective from</th><th>Effective to</th><th>Pay type</th><th>Base salary / wage</th><th>Hourly rate</th></tr></thead>
                  <tbody>
                    {compensationHistory.map((compensation) => (
                      <tr key={compensation.id}>
                        <td>{compensation.effectiveFrom}</td>
                        <td>{compensation.effectiveTo ?? 'Current'}</td>
                        <td>{compensation.payType}</td>
                        <td>{compensation.baseSalaryOrWage ?? '—'}</td>
                        <td>{compensation.hourlyRate ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {salaryEditorOpen && (
                <div className="employee-salary-editor">
                  <h4>Edit salary</h4>
                  <p className="muted">Choose the date the new salary starts. The current rate is closed automatically the day before.</p>
                  {renderCompensationForm('Save salary change')}
                </div>
              )}
              {employee.status === 'INACTIVE' && (
                <p className="muted">Inactive Employees keep their salary history but cannot receive a new compensation rate.</p>
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}
