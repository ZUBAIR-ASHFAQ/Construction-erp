import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { usePermission } from '../../administration/hooks/auth.js';
import { EmployeeDetailsPanel } from '../components/employee-details-panel.js';
import { useCreateEmployee, useEmployees } from '../hooks/employees.js';
import type { EmployeeStatus } from '../api/employees-api.js';

const createEmployeeSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200),
  cnicOrId: z.string().trim().max(100),
  phone: z.string().trim().max(50),
  email: z.string().trim().max(320),
  jobTitle: z.string().trim().min(1, 'Job title is required.').max(160),
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
  employmentEndDate: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')])
}).refine((value) => !value.employmentEndDate || value.employmentEndDate >= value.joiningDate, {
  path: ['employmentEndDate'], message: 'Employment end date cannot precede joining date.'
});

type CreateEmployeeValues = z.infer<typeof createEmployeeSchema>;
type EmployeeDialog = Readonly<{ kind: 'open' | 'edit'; employeeId: string }>;

/** Return one readable form or request error message. */
function errorMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return null;
}

export type EmployeesPageView = 'list' | 'create';

/** Render the Employee register with focused create, detail and edit dialogs. */
export function EmployeesPage({ view = 'list' }: Readonly<{ view?: EmployeesPageView }>) {
  const canRead = usePermission('employees.read');
  const canCreate = usePermission('employees.create');
  const canUpdate = usePermission('employees.update');
  const canManageCompensation = usePermission('employees.compensation.manage');
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<EmployeeStatus | ''>('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(view === 'create');
  const [dialog, setDialog] = useState<EmployeeDialog | null>(null);
  const employeesQuery = useEmployees({
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
    page,
    pageSize: 25
  }, canRead);
  const createMutation = useCreateEmployee();
  const createForm = useForm<CreateEmployeeValues>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: {
      name: '', cnicOrId: '', phone: '', email: '', jobTitle: '', joiningDate: '', employmentEndDate: ''
    }
  });

  useEffect(() => {
    if (view === 'create' && canCreate) setCreateOpen(true);
  }, [view, canCreate]);

  useEffect(() => {
    if (!createOpen) return undefined;

    /** Close the create dialog with the standard Escape-key interaction. */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setCreateOpen(false);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createOpen]);

  if (!canRead) {
    return (
      <section className="admin-card">
        <h1>Employee List</h1>
        <p className="muted">Your current role does not include Employee read access.</p>
      </section>
    );
  }

  const employees = employeesQuery.data?.items ?? [];
  const pageCount = employeesQuery.data ? Math.max(1, Math.ceil(employeesQuery.data.total / employeesQuery.data.pageSize)) : 1;

  /** Apply Employee search/status filters and restart pagination. */
  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSearch(searchText.trim());
    setPage(1);
  }

  /** Close the Employee create dialog and clear transient form/request state. */
  function closeCreateDialog(): void {
    setCreateOpen(false);
    createMutation.reset();
    createForm.reset();
  }

  /** Create one active Employee master and open its details for initial salary setup. */
  async function handleCreate(values: CreateEmployeeValues): Promise<void> {
    const employee = await createMutation.mutateAsync({
      name: values.name,
      cnicOrId: values.cnicOrId || null,
      phone: values.phone || null,
      email: values.email || null,
      jobTitle: values.jobTitle,
      joiningDate: values.joiningDate,
      employmentEndDate: values.employmentEndDate || null
    });
    createForm.reset();
    setCreateOpen(false);
    setDialog({ kind: 'open', employeeId: employee.id });
  }

  return (
    <section className="admin-stack employee-management-page" aria-labelledby="employees-title">
      <div className="section-heading employee-page-heading">
        <div>
          <p className="eyebrow">People</p>
          <h1 id="employees-title">Employee List</h1>
          <p className="muted">Search Employee records, review Project ownership, update details and maintain effective salary history without mixing attendance or payment work into this screen.</p>
        </div>
        {canCreate && (
          <button type="button" className="employee-primary-action" onClick={() => setCreateOpen(true)}>
            <span aria-hidden="true">+</span>
            Add Employee
          </button>
        )}
      </div>

      <section className="admin-card">
        <form className="client-filter-row" onSubmit={handleSearch}>
          <label>Search Employees<input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="No., name, CNIC, email or phone" /></label>
          <label>
            Status
            <select value={status} onChange={(event) => { setStatus(event.target.value as EmployeeStatus | ''); setPage(1); }}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>
          <button type="submit">Search</button>
        </form>

        {employeesQuery.isPending && <p>Loading Employees…</p>}
        {employeesQuery.error instanceof Error && <div className="form-error" role="alert">{employeesQuery.error.message}</div>}
        {employeesQuery.data && (
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Employee</th><th>Work category</th><th>Payment basis</th><th>Department</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id} className={employee.id === dialog?.employeeId ? 'selected-row' : undefined}>
                    <td><strong>{employee.name}</strong><span>{employee.employeeNo} · {employee.jobTitle}</span></td>
                    <td>{employee.employeeType}</td>
                    <td>{employee.currentPayType === 'SALARY' ? 'Monthly' : employee.currentPayType === 'DAILY' ? 'Daily' : employee.currentPayType === 'HOURLY' ? 'Daily / hourly (legacy)' : 'Not configured'}</td>
                    <td>{employee.department}</td>
                    <td>{employee.status}</td>
                    <td>
                      <div className="employee-row-actions">
                        <button type="button" className="link-button" onClick={() => setDialog({ kind: 'open', employeeId: employee.id })}>Open</button>
                        {(canUpdate || canManageCompensation) && (
                          <button type="button" className="secondary-button employee-edit-button" onClick={() => setDialog({ kind: 'edit', employeeId: employee.id })}>Edit</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {employees.length === 0 && <tr><td colSpan={6} className="muted">No Employees found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        <div className="pagination-row">
          <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
          <span>Page {page} of {pageCount}</span>
          <button type="button" className="secondary-button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
        </div>
      </section>

      {createOpen && canCreate && (
        <div className="finance-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreateDialog(); }}>
          <section className="finance-modal employee-create-modal" role="dialog" aria-modal="true" aria-labelledby="employee-create-title">
            <header className="finance-modal-header">
              <div>
                <p className="eyebrow">Employee master</p>
                <h2 id="employee-create-title">Add Employee</h2>
                <p className="muted">Create the Employee record. Employee code is generated automatically by the server.</p>
              </div>
              <button type="button" className="finance-modal-close" onClick={closeCreateDialog} aria-label="Close Add Employee">×</button>
            </header>
            <div className="finance-modal-body">
              <form className="admin-form employee-create-form" onSubmit={createForm.handleSubmit(handleCreate)} noValidate>
                <div className="employee-create-grid">
                  <label>
                    Name
                    <input autoFocus {...createForm.register('name')} />
                    {createForm.formState.errors.name && <span className="field-error">{createForm.formState.errors.name.message}</span>}
                  </label>
                  <label>
                    CNIC / ID
                    <input {...createForm.register('cnicOrId')} />
                    {createForm.formState.errors.cnicOrId && <span className="field-error">{createForm.formState.errors.cnicOrId.message}</span>}
                  </label>
                  <label>
                    Phone
                    <input {...createForm.register('phone')} />
                    {createForm.formState.errors.phone && <span className="field-error">{createForm.formState.errors.phone.message}</span>}
                  </label>
                  <label>
                    Email
                    <input type="email" {...createForm.register('email')} />
                    {createForm.formState.errors.email && <span className="field-error">{createForm.formState.errors.email.message}</span>}
                  </label>
                  <label>
                    Job title
                    <input {...createForm.register('jobTitle')} />
                    {createForm.formState.errors.jobTitle && <span className="field-error">{createForm.formState.errors.jobTitle.message}</span>}
                  </label>
                  <label>
                    Joining date
                    <input type="date" {...createForm.register('joiningDate')} />
                    {createForm.formState.errors.joiningDate && <span className="field-error">{createForm.formState.errors.joiningDate.message}</span>}
                  </label>
                  <label>
                    Employment end date (optional)
                    <input type="date" min={createForm.watch('joiningDate') || undefined} {...createForm.register('employmentEndDate')} />
                    {createForm.formState.errors.employmentEndDate && <span className="field-error">{createForm.formState.errors.employmentEndDate.message}</span>}
                  </label>
                </div>
                {errorMessage(createMutation.error) && <div className="form-error" role="alert">{errorMessage(createMutation.error)}</div>}
                <div className="employee-create-actions">
                  <button type="button" className="secondary-button" onClick={closeCreateDialog}>Cancel</button>
                  <button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Creating…' : 'Create Employee'}</button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}

      {dialog && (
        <div className="finance-modal-backdrop" role="presentation">
          <section className="finance-modal finance-modal-wide employee-detail-modal" role="dialog" aria-modal="true" aria-labelledby="employee-record-title">
            <header className="finance-modal-header">
              <div>
                <p className="eyebrow">Employee record</p>
                <h2 id="employee-record-title">{dialog.kind === 'edit' ? 'Edit employee & salary' : 'Employee details'}</h2>
              </div>
              <button type="button" className="finance-modal-close" onClick={() => setDialog(null)} aria-label="Close Employee dialog">×</button>
            </header>
            <div className="finance-modal-body">
              <EmployeeDetailsPanel
                employeeId={dialog.employeeId}
                mode={dialog.kind === 'edit' ? 'edit' : 'details'}
                canUpdate={canUpdate}
                canManageCompensation={canManageCompensation}
              />
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
