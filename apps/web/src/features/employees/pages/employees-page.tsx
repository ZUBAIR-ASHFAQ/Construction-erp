import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { usePermission } from '../../administration/hooks/auth.js';
import { EmployeeDetailsPanel } from '../components/employee-details-panel.js';
import { useCreateEmployee, useEmployees } from '../hooks/employees.js';
import type { EmployeeStatus } from '../api/employees-api.js';

const createEmployeeSchema = z.object({
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

type CreateEmployeeValues = z.infer<typeof createEmployeeSchema>;

/** Return one readable form or request error message. */
function errorMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return null;
}

/** Render the Final-21 Employee master and salary foundation workspace. */
export function EmployeesPage() {
  const canRead = usePermission('employees.read');
  const canCreate = usePermission('employees.create');
  const canUpdate = usePermission('employees.update');
  const canManageCompensation = usePermission('employees.compensation.manage');
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<EmployeeStatus | ''>('');
  const [page, setPage] = useState(1);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
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
      employeeNo: '', userId: '', name: '', cnicOrId: '', phone: '', email: '', department: '',
      jobTitle: '', employeeType: '', joiningDate: ''
    }
  });

  if (!canRead) {
    return (
      <section className="admin-card">
        <h1>Employee & Labour Management</h1>
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

  /** Create one active Employee master and select it for salary setup. */
  async function handleCreate(values: CreateEmployeeValues): Promise<void> {
    const employee = await createMutation.mutateAsync({
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
    createForm.reset();
    setSelectedEmployeeId(employee.id);
  }

  return (
    <section className="admin-stack" aria-labelledby="employees-title">
      <div className="section-heading">
        <p className="eyebrow">People</p>
        <h1 id="employees-title">Employee & Labour Management</h1>
        <p className="muted">Maintain Employee identity, employment status and effective-dated monthly salary, daily wage or hourly rate. Attendance and Payroll calculation remain in the later Payroll module.</p>
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
              <thead><tr><th>Employee</th><th>Type</th><th>Department</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id} className={employee.id === selectedEmployeeId ? 'selected-row' : undefined}>
                    <td><strong>{employee.name}</strong><span>{employee.employeeNo} · {employee.jobTitle}</span></td>
                    <td>{employee.employeeType}</td>
                    <td>{employee.department}</td>
                    <td>{employee.status}</td>
                    <td><button type="button" className="link-button" onClick={() => setSelectedEmployeeId(employee.id)}>Open</button></td>
                  </tr>
                ))}
                {employees.length === 0 && <tr><td colSpan={5} className="muted">No Employees found.</td></tr>}
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

      {canCreate && (
        <section className="admin-card">
          <h2>Create Employee</h2>
          <form className="admin-form" onSubmit={createForm.handleSubmit(handleCreate)} noValidate>
            <div className="module14b-form-grid">
              <label>Employee no.<input {...createForm.register('employeeNo')} /></label>
              <label>Login user ID (optional)<input {...createForm.register('userId')} placeholder="User UUID" /></label>
              <label>Name<input {...createForm.register('name')} /></label>
              <label>CNIC / ID<input {...createForm.register('cnicOrId')} /></label>
              <label>Phone<input {...createForm.register('phone')} /></label>
              <label>Email<input type="email" {...createForm.register('email')} /></label>
              <label>Department<input {...createForm.register('department')} /></label>
              <label>Job title<input {...createForm.register('jobTitle')} /></label>
              <label>Employee type<input {...createForm.register('employeeType')} placeholder="STAFF, LABOUR, SECURITY…" /></label>
              <label>Joining date<input type="date" {...createForm.register('joiningDate')} /></label>
            </div>
            {Object.values(createForm.formState.errors).map((error, index) => (
              <span className="field-error" key={index}>{errorMessage(error)}</span>
            ))}
            {errorMessage(createMutation.error) && <div className="form-error" role="alert">{errorMessage(createMutation.error)}</div>}
            <button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Creating…' : 'Create Employee'}</button>
          </form>
        </section>
      )}

      <EmployeeDetailsPanel
        employeeId={selectedEmployeeId}
        canUpdate={canUpdate}
        canManageCompensation={canManageCompensation}
      />
    </section>
  );
}
