import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
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
  employeeNo: z.string().trim().min(1, 'Employee number is required.').max(100),
  userId: z.union([z.string().trim().uuid('Use a valid User UUID.'), z.literal('')]),
  name: z.string().trim().min(1, 'Name is required.').max(200),
  cnicOrId: z.string().trim().max(100),
  phone: z.string().trim().max(50),
  email: z.string().trim().max(320),
  department: z.string().trim().min(1, 'Department is required.').max(160),
  jobTitle: z.string().trim().min(1, 'Job title is required.').max(160),
  employeeType: z.string().trim().min(1, 'Employee type is required.').max(64),
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
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

type EmployeeDetailsPanelProps = Readonly<{
  employeeId: string | null;
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

/** Render Employee detail, editable master fields, lifecycle status and salary history. */
export function EmployeeDetailsPanel(props: EmployeeDetailsPanelProps) {
  const detailQuery = useEmployee(props.employeeId, props.employeeId !== null);
  const employee = detailQuery.data?.employee ?? null;
  const updateMutation = useUpdateEmployee(props.employeeId ?? '');
  const statusMutation = useUpdateEmployeeStatus(props.employeeId ?? '');
  const compensationMutation = useCreateEmployeeCompensation(props.employeeId ?? '');
  const updateForm = useForm<UpdateEmployeeValues>({
    resolver: zodResolver(updateEmployeeSchema),
    defaultValues: {
      employeeNo: '', userId: '', name: '', cnicOrId: '', phone: '', email: '', department: '',
      jobTitle: '', employeeType: '', joiningDate: ''
    }
  });
  const compensationForm = useForm<CompensationValues>({
    resolver: zodResolver(compensationSchema),
    defaultValues: { payType: 'SALARY', amount: '', effectiveFrom: '' }
  });
  const payType = compensationForm.watch('payType');

  /** Reset the edit form whenever another Employee is selected. */
  useEffect(() => {
    if (!employee) return;
    updateForm.reset({
      employeeNo: employee.employeeNo,
      userId: employee.userId ?? '',
      name: employee.name,
      cnicOrId: employee.cnicOrId ?? '',
      phone: employee.phone ?? '',
      email: employee.email ?? '',
      department: employee.department,
      jobTitle: employee.jobTitle,
      employeeType: employee.employeeType,
      joiningDate: employee.joiningDate
    });
  }, [employee, updateForm]);

  if (!props.employeeId) return null;

  /** Persist the editable Employee master fields without changing salary or status. */
  async function handleUpdate(values: UpdateEmployeeValues): Promise<void> {
    await updateMutation.mutateAsync({
      employeeNo: values.employeeNo,
      userId: values.userId || null,
      name: values.name,
      cnicOrId: values.cnicOrId || null,
      phone: values.phone || null,
      email: values.email || null,
      department: values.department,
      jobTitle: values.jobTitle,
      employeeType: values.employeeType,
      joiningDate: values.joiningDate
    });
  }

  /** Append one new effective salary/wage/rate record instead of overwriting history. */
  async function handleCompensation(values: CompensationValues): Promise<void> {
    await compensationMutation.mutateAsync(values.payType === 'HOURLY'
      ? { payType: 'HOURLY', hourlyRate: values.amount, effectiveFrom: values.effectiveFrom }
      : { payType: values.payType, baseSalaryOrWage: values.amount, effectiveFrom: values.effectiveFrom });
    compensationForm.reset({ payType: values.payType, amount: '', effectiveFrom: '' });
  }

  /** Toggle Employee active status through the explicit lifecycle command. */
  async function handleStatusChange(): Promise<void> {
    if (!employee) return;
    await statusMutation.mutateAsync({
      status: employee.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      reason: employee.status === 'ACTIVE' ? 'Deactivated from Employee Management.' : 'Reactivated from Employee Management.'
    });
  }

  return (
    <section className="admin-card" aria-labelledby="employee-detail-title">
      <h2 id="employee-detail-title">Employee detail</h2>
      {detailQuery.isPending && <p>Loading Employee…</p>}
      {errorMessage(detailQuery.error) && <div className="form-error" role="alert">{errorMessage(detailQuery.error)}</div>}

      {employee && (
        <>
          <div className="module14b-summary-grid">
            <div><dt>Employee ID</dt><dd>{employee.id}</dd></div>
            <div><dt>Employee</dt><dd>{employee.employeeNo} · {employee.name}</dd></div>
            <div><dt>Status</dt><dd>{employee.status}</dd></div>
            <div><dt>Type</dt><dd>{employee.employeeType}</dd></div>
            <div><dt>Department</dt><dd>{employee.department}</dd></div>
            <div><dt>Job title</dt><dd>{employee.jobTitle}</dd></div>
            <div><dt>Joining date</dt><dd>{employee.joiningDate}</dd></div>
            <div><dt>User link</dt><dd>{employee.userId ?? 'Not linked'}</dd></div>
            <div><dt>CNIC / ID</dt><dd>{employee.cnicOrId ?? '—'}</dd></div>
            <div><dt>Phone</dt><dd>{employee.phone ?? '—'}</dd></div>
            <div><dt>Email</dt><dd>{employee.email ?? '—'}</dd></div>
          </div>

          {props.canUpdate && (
            <form className="admin-form module14b-subsection" onSubmit={updateForm.handleSubmit(handleUpdate)} noValidate>
              <h3>Edit Employee</h3>
              <div className="module14b-form-grid">
                <label>Employee no.<input {...updateForm.register('employeeNo')} /></label>
                <label>Login user ID (optional)<input {...updateForm.register('userId')} placeholder="User UUID" /></label>
                <label>Name<input {...updateForm.register('name')} /></label>
                <label>CNIC / ID<input {...updateForm.register('cnicOrId')} /></label>
                <label>Phone<input {...updateForm.register('phone')} /></label>
                <label>Email<input type="email" {...updateForm.register('email')} /></label>
                <label>Department<input {...updateForm.register('department')} /></label>
                <label>Job title<input {...updateForm.register('jobTitle')} /></label>
                <label>Employee type<input {...updateForm.register('employeeType')} /></label>
                <label>Joining date<input type="date" {...updateForm.register('joiningDate')} /></label>
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

          <section className="module14b-subsection" aria-labelledby="employee-compensation-title">
            <h3 id="employee-compensation-title">Salary & compensation history</h3>
            {!props.canManageCompensation && <p className="muted">Your role cannot view or change Employee salary history.</p>}
            {props.canManageCompensation && detailQuery.data?.compensationHistory && (
              <div className="table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Compensation ID</th><th>Employee ID</th><th>Effective from</th><th>Effective to</th><th>Pay type</th><th>Base salary / wage</th><th>Hourly rate</th></tr></thead>
                  <tbody>
                    {detailQuery.data.compensationHistory.map((compensation) => (
                      <tr key={compensation.id}>
                        <td>{compensation.id}</td>
                        <td>{compensation.employeeId}</td>
                        <td>{compensation.effectiveFrom}</td>
                        <td>{compensation.effectiveTo ?? 'Current'}</td>
                        <td>{compensation.payType}</td>
                        <td>{compensation.baseSalaryOrWage ?? '—'}</td>
                        <td>{compensation.hourlyRate ?? '—'}</td>
                      </tr>
                    ))}
                    {detailQuery.data.compensationHistory.length === 0 && (
                      <tr><td colSpan={7} className="muted">No compensation history yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {props.canManageCompensation && employee.status === 'ACTIVE' && (
              <form className="admin-form" onSubmit={compensationForm.handleSubmit(handleCompensation)} noValidate>
                <div className="module14b-form-grid">
                  <label>
                    Pay type
                    <select {...compensationForm.register('payType')}>
                      <option value="SALARY">Monthly salary</option>
                      <option value="DAILY">Daily wage</option>
                      <option value="HOURLY">Hourly rate</option>
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
                <button type="submit" disabled={compensationMutation.isPending}>{compensationMutation.isPending ? 'Saving…' : 'Add compensation'}</button>
              </form>
            )}
            {props.canManageCompensation && employee.status === 'INACTIVE' && (
              <p className="muted">Inactive Employees keep their salary history but cannot receive new compensation.</p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
