import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { usePermission } from '../../administration/hooks/auth.js';
import { useCreateEmployee, useEmployees } from '../../employees/hooks/employees.js';
import type { Employee } from '../../employees/api/employees-api.js';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useProjects } from '../../projects/hooks/projects.js';
import type { ProjectTeamAssignment } from '../api/project-team-api.js';
import {
  useCreateProjectTeamAssignment,
  useEndProjectTeamAssignment,
  useProjectTeam,
  useUpdateProjectTeamAssignment
} from '../hooks/project-team.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

const assignmentBaseSchema = z.object({
  employeeId: z.string().uuid('Select an Employee.'),
  projectRole: z.string().trim().min(1, 'Project role is required.').max(160),
  allocationPercent: z.string().regex(/^(?:0|[1-9]\d?|100)(?:\.\d{1,4})?$/, 'Use a percentage above 0 and at most 100.').refine((value) => Number(value) > 0 && Number(value) <= 100, 'Allocation must be greater than 0 and at most 100.'),
  stageId: z.union([z.literal(''), z.string().uuid('Select a Stage.')]),
  fromDate: dateSchema,
  toDate: z.union([z.literal(''), dateSchema])
});

/** Check whether the assignment date range is valid. */
function hasValidAssignmentDateRange(value: { fromDate: string; toDate: string }): boolean {
  return value.toDate === '' || value.toDate >= value.fromDate;
}

const assignmentSchema = assignmentBaseSchema.refine(hasValidAssignmentDateRange, {
  path: ['toDate'],
  message: 'End date must be on or after the start date.'
});

const editAssignmentSchema = assignmentBaseSchema
  .omit({ employeeId: true })
  .refine(hasValidAssignmentDateRange, {
    path: ['toDate'],
    message: 'End date must be on or after the start date.'
  });

const endAssignmentSchema = z.object({
  endDate: dateSchema,
  note: z.string().trim().max(2000, 'End note must be at most 2000 characters.')
});

const quickEmployeeSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200),
  cnicOrId: z.string().trim().max(100),
  phone: z.string().trim().max(50),
  email: z.string().trim().max(320),
  jobTitle: z.string().trim().min(1, 'Job title is required.').max(160),
  joiningDate: dateSchema,
  employmentEndDate: z.union([z.literal(''), dateSchema])
}).refine((value) => !value.employmentEndDate || value.employmentEndDate >= value.joiningDate, {
  path: ['employmentEndDate'],
  message: 'Employment end date cannot precede joining date.'
});

type AssignmentFormValues = z.infer<typeof assignmentSchema>;
type EditAssignmentFormValues = z.infer<typeof editAssignmentSchema>;
type EndAssignmentFormValues = z.infer<typeof endAssignmentSchema>;
type QuickEmployeeFormValues = z.infer<typeof quickEmployeeSchema>;

export type ProjectTeamWorkspaceProps = Readonly<{
  canRead: boolean;
  canManage: boolean;
}>;

/** Return a readable request failure without coupling the UI to backend internals. */
function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

/** Return today's browser-local date for the Employee create form when no assignment start date is entered yet. */
function localToday(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Render Project Team setup and history using readable source-module selectors instead of raw identifiers. */
export function ProjectTeamWorkspace(props: ProjectTeamWorkspaceProps) {
  const canReadProjects = usePermission('projects.read');
  const canReadEmployees = usePermission('employees.read');
  const canCreateEmployees = usePermission('employees.create');
  const canReadStages = usePermission('stages.read');
  const projectsQuery = useProjects({ page: 1, pageSize: 100 }, canReadProjects && props.canRead);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const employeesQuery = useEmployees({
    status: 'ACTIVE',
    ...(employeeSearch.trim() ? { search: employeeSearch.trim() } : {}),
    page: 1,
    pageSize: 100
  }, canReadEmployees && props.canManage);
  const [projectId, setProjectId] = useState('');
  const stagesQuery = useProjectStages(projectId || null, canReadStages && projectId !== '');
  const teamQuery = useProjectTeam(projectId, props.canRead && projectId !== '');
  const createMutation = useCreateProjectTeamAssignment();
  const updateMutation = useUpdateProjectTeamAssignment();
  const endMutation = useEndProjectTeamAssignment();
  const quickEmployeeMutation = useCreateEmployee();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [quickEmployeeDialogOpen, setQuickEmployeeDialogOpen] = useState(false);
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  const [selectedEmployeeOption, setSelectedEmployeeOption] = useState<Employee | null>(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [endingAssignmentId, setEndingAssignmentId] = useState<string | null>(null);
  const createForm = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: { employeeId: '', projectRole: '', allocationPercent: '100', stageId: '', fromDate: '', toDate: '' }
  });
  const editForm = useForm<EditAssignmentFormValues>({
    resolver: zodResolver(editAssignmentSchema),
    defaultValues: { projectRole: '', allocationPercent: '100', stageId: '', fromDate: '', toDate: '' }
  });
  const endForm = useForm<EndAssignmentFormValues>({
    resolver: zodResolver(endAssignmentSchema),
    defaultValues: { endDate: '', note: '' }
  });
  const quickEmployeeForm = useForm<QuickEmployeeFormValues>({
    resolver: zodResolver(quickEmployeeSchema),
    defaultValues: {
      name: '', cnicOrId: '', phone: '', email: '', jobTitle: '', joiningDate: '', employmentEndDate: ''
    }
  });

  /** Change the active Project and clear dependent create/edit/end state. */
  function selectProject(nextProjectId: string): void {
    setProjectId(nextProjectId);
    setCreateDialogOpen(false);
    setQuickEmployeeDialogOpen(false);
    setEmployeePickerOpen(false);
    setSelectedEmployeeOption(null);
    setEmployeeSearch('');
    setEditingAssignmentId(null);
    setEndingAssignmentId(null);
    createForm.reset({ employeeId: '', projectRole: '', allocationPercent: '100', stageId: '', fromDate: '', toDate: '' });
    endForm.reset({ endDate: '', note: '' });
  }

  /** Create one Employee Project/Stage assignment with server-owned lifecycle state. */
  async function handleCreate(values: AssignmentFormValues): Promise<void> {
    if (!projectId) return;
    await createMutation.mutateAsync({
      projectId,
      input: {
        employeeId: values.employeeId,
        projectRole: values.projectRole.trim(),
        allocationPercent: values.allocationPercent,
        ...(values.stageId ? { stageId: values.stageId } : {}),
        fromDate: values.fromDate,
        ...(values.toDate ? { toDate: values.toDate } : {})
      }
    });
    createForm.reset({ employeeId: '', projectRole: '', allocationPercent: '100', stageId: '', fromDate: '', toDate: '' });
    setEmployeePickerOpen(false);
    setSelectedEmployeeOption(null);
    setEmployeeSearch('');
    setCreateDialogOpen(false);
  }

  /** Open a fresh Employee assignment dialog for the selected Project. */
  function startCreate(): void {
    if (!canCreateWithSelectors) return;
    createMutation.reset();
    setEditingAssignmentId(null);
    setEndingAssignmentId(null);
    setQuickEmployeeDialogOpen(false);
    setEmployeePickerOpen(false);
    setSelectedEmployeeOption(null);
    setEmployeeSearch('');
    createForm.reset({ employeeId: '', projectRole: '', allocationPercent: '100', stageId: '', fromDate: '', toDate: '' });
    setCreateDialogOpen(true);
  }

  /** Open the full Employee creator without closing the assignment being prepared. */
  function startQuickEmployeeCreate(): void {
    quickEmployeeMutation.reset();
    quickEmployeeForm.reset({
      name: employeeSearch.trim(),
      cnicOrId: '',
      phone: '',
      email: '',
      jobTitle: createForm.getValues('projectRole').trim(),
      joiningDate: createForm.getValues('fromDate') || localToday(),
      employmentEndDate: ''
    });
    setEmployeePickerOpen(false);
    setQuickEmployeeDialogOpen(true);
  }

  /** Create a full Employee master and immediately select it in the pending Project assignment. */
  async function handleQuickEmployeeCreate(values: QuickEmployeeFormValues): Promise<void> {
    const employee = await quickEmployeeMutation.mutateAsync({
      name: values.name,
      cnicOrId: values.cnicOrId || null,
      phone: values.phone || null,
      email: values.email || null,
      jobTitle: values.jobTitle,
      joiningDate: values.joiningDate,
      employmentEndDate: values.employmentEndDate || null
    });
    setSelectedEmployeeOption(employee);
    setEmployeeSearch('');
    setEmployeePickerOpen(false);
    createForm.setValue('employeeId', employee.id, { shouldDirty: true, shouldValidate: true });
    quickEmployeeForm.reset({
      name: '', cnicOrId: '', phone: '', email: '', jobTitle: '', joiningDate: '', employmentEndDate: ''
    });
    setQuickEmployeeDialogOpen(false);
  }

  /** Select one searched Employee without rendering a second select field. */
  function handleEmployeeSelection(employee: Employee): void {
    setSelectedEmployeeOption(employee);
    setEmployeeSearch('');
    setEmployeePickerOpen(false);
    createForm.setValue('employeeId', employee.id, { shouldDirty: true, shouldValidate: true });
  }

  /** Start a new search and clear the previous selection only after the user actually types. */
  function handleEmployeeSearchChange(value: string): void {
    if (selectedEmployeeOption) {
      setSelectedEmployeeOption(null);
      createForm.setValue('employeeId', '', { shouldDirty: true, shouldValidate: true });
    }
    setEmployeeSearch(value);
    setEmployeePickerOpen(true);
  }

  /** Open the readable assignment editor without asking the user to type a Stage UUID. */
  function startEdit(assignment: ProjectTeamAssignment): void {
    setCreateDialogOpen(false);
    setEndingAssignmentId(null);
    updateMutation.reset();
    setEditingAssignmentId(assignment.id);
    editForm.reset({
      projectRole: assignment.projectRole,
      allocationPercent: assignment.allocationPercent,
      stageId: assignment.stageId ?? '',
      fromDate: assignment.fromDate,
      toDate: assignment.toDate ?? ''
    });
  }

  /** Save the editable role, allocation, Stage and effective dates for one active assignment. */
  async function handleEdit(values: EditAssignmentFormValues): Promise<void> {
    if (!projectId || !editingAssignmentId) return;
    await updateMutation.mutateAsync({
      projectId,
      assignmentId: editingAssignmentId,
      input: {
        projectRole: values.projectRole.trim(),
        allocationPercent: values.allocationPercent,
        ...(canReadStages ? { stageId: values.stageId || null } : {}),
        fromDate: values.fromDate,
        toDate: values.toDate || null
      }
    });
    setEditingAssignmentId(null);
    updateMutation.reset();
  }

  /** Open the explicit assignment-end form with the backend-supported optional note. */
  function startEnd(assignment: ProjectTeamAssignment): void {
    setCreateDialogOpen(false);
    setEditingAssignmentId(null);
    endMutation.reset();
    setEndingAssignmentId(assignment.id);
    endForm.reset({ endDate: assignment.toDate ?? '', note: '' });
  }

  /** End one assignment with its effective date and optional persisted history note. */
  async function handleEnd(values: EndAssignmentFormValues): Promise<void> {
    if (!projectId || !endingAssignmentId) return;
    const note = values.note.trim();
    await endMutation.mutateAsync({
      projectId,
      assignmentId: endingAssignmentId,
      endDate: values.endDate,
      ...(note ? { note } : {})
    });
    setEndingAssignmentId(null);
    endMutation.reset();
    endForm.reset({ endDate: '', note: '' });
  }

  const projects = projectsQuery.data?.items ?? [];
  const employees = employeesQuery.data?.items ?? [];
  const employeeOptions = selectedEmployeeOption && !employees.some((employee) => employee.id === selectedEmployeeOption.id)
    ? [selectedEmployeeOption, ...employees]
    : employees;
  const selectedEmployeeLabel = selectedEmployeeOption
    ? `${selectedEmployeeOption.employeeNo} · ${selectedEmployeeOption.name}`
    : '';
  const stages = stagesQuery.data?.items ?? [];
  const canCreateWithSelectors = props.canManage && projectId !== '' && canReadEmployees;

  return (
    <section className="admin-stack">
      <section className="admin-card">
        <h2>Select Project</h2>
        {canReadProjects ? (
          <label>Project
            <select value={projectId} onChange={(event) => selectProject(event.target.value)}>
              <option value="">Select Project</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}
            </select>
          </label>
        ) : (
          <p className="muted"><code>projects.read</code> is required for the safe Project selector. Raw Project IDs are not accepted by this screen.</p>
        )}
        {!props.canRead && <p className="muted"><code>project_team.read</code> is required.</p>}
        {errorMessage(projectsQuery.error) && <div className="form-error" role="alert">{errorMessage(projectsQuery.error)}</div>}
      </section>

      {props.canManage && projectId && !canReadEmployees && (
        <section className="admin-card"><p className="muted"><code>employees.read</code> is required to assign an Employee through the safe selector.</p></section>
      )}

      <section className="admin-card">
        <div className="client-page-heading">
          <div>
            <h2>Project Team</h2>
            <p className="muted">Assign active Employees to the selected Project and maintain role, allocation, Stage and effective dates.</p>
          </div>
          {props.canManage && (
            <button type="button" className="client-primary-action" aria-haspopup="dialog" disabled={!canCreateWithSelectors} onClick={startCreate}>
              <span aria-hidden="true">+</span> Assign employee
            </button>
          )}
        </div>
        {teamQuery.isPending && projectId && <p>Loading assignments…</p>}
        {!projectId && <p className="muted">Select a Project to load its Team.</p>}
        {errorMessage(teamQuery.error) && <div className="form-error" role="alert">{errorMessage(teamQuery.error)}</div>}
        {errorMessage(employeesQuery.error) && <div className="form-error" role="alert">{errorMessage(employeesQuery.error)}</div>}
        {errorMessage(stagesQuery.error) && <div className="form-error" role="alert">{errorMessage(stagesQuery.error)}</div>}
        {teamQuery.data && (
          <>
            <p className="muted">Project Team Project ID: <code>{teamQuery.data.projectId}</code></p>
            <div className="table-scroll">
              <table>
              <thead><tr><th>References</th><th>Employee</th><th>Role</th><th>Allocation</th><th>Stage</th><th>Dates</th><th>Status</th><th>History</th><th>Actions</th></tr></thead>
              <tbody>
                {teamQuery.data.items.map((assignment) => (
                  <tr key={assignment.id}>
                    <td>Assignment: <code>{assignment.id}</code><br />Project: <code>{assignment.projectId}</code><br />Employee: <code>{assignment.employeeId}</code><br />Stage: <code>{assignment.stageId ?? 'Project level'}</code></td>
                    <td>{assignment.employeeName ?? 'Employee'}<br /><small>{assignment.employeeNo ?? 'Employee record'}</small></td>
                    <td>{assignment.projectRole}</td>
                    <td>{assignment.allocationPercent}%</td>
                    <td>{assignment.stage ? <>{assignment.stage.code} · {assignment.stage.name}<br /><small>Stage object ID: <code>{assignment.stage.id}</code></small></> : 'Project level'}</td>
                    <td>{assignment.fromDate} → {assignment.toDate ?? 'Open'}</td>
                    <td>{assignment.status}</td>
                    <td>
                      <details>
                        <summary>{assignment.history.length} event(s)</summary>
                        {assignment.history.map((event) => <div key={event.id}>{event.action} · {event.changedAt} · by {event.changedBy} · {event.note ?? 'No note'} · {event.id}</div>)}
                      </details>
                    </td>
                    <td>
                      {props.canManage && assignment.status === 'ACTIVE' && (
                        <div className="button-row">
                          <button type="button" className="secondary-button" onClick={() => startEdit(assignment)}>Edit</button>
                          <button type="button" className="secondary-button" onClick={() => startEnd(assignment)}>End</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {teamQuery.data.items.length === 0 && <tr><td colSpan={9} className="muted">No Project Team assignments.</td></tr>}
              </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {createDialogOpen && canCreateWithSelectors && (
        <div className="client-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateDialogOpen(false); }}>
          <section className="client-modal client-modal-wide" role="dialog" aria-modal="true" aria-labelledby="project-team-create-title">
            <header className="client-modal-header">
              <div><p className="eyebrow">Project team</p><h2 id="project-team-create-title">Assign Employee</h2></div>
              <button type="button" className="client-modal-close" aria-label="Close assignment form" onClick={() => setCreateDialogOpen(false)}><span aria-hidden="true">×</span></button>
            </header>
            <div className="client-modal-body">
              <form className="admin-form client-modal-form" onSubmit={createForm.handleSubmit((values) => void handleCreate(values))}>
                <div className="client-form-grid">
                  <div className="project-team-employee-picker" onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEmployeePickerOpen(false);
                  }}>
                    <div className="project-team-employee-field-row">
                      <label>Employee
                        <input
                          role="combobox"
                          aria-expanded={employeePickerOpen}
                          aria-controls="project-team-employee-options"
                          aria-autocomplete="list"
                          value={employeePickerOpen ? employeeSearch : (selectedEmployeeLabel || employeeSearch)}
                          onFocus={() => {
                            if (selectedEmployeeOption) setEmployeeSearch('');
                            setEmployeePickerOpen(true);
                          }}
                          onChange={(event) => handleEmployeeSearchChange(event.target.value)}
                          onKeyDown={(event) => { if (event.key === 'Escape') setEmployeePickerOpen(false); }}
                          placeholder="Search active Employees by name, employee no. or phone"
                          autoComplete="off"
                        />
                      </label>
                      {canCreateEmployees && (
                        <button type="button" className="secondary-button project-team-employee-add" onClick={startQuickEmployeeCreate}>+ Add employee</button>
                      )}
                    </div>
                    <input type="hidden" {...createForm.register('employeeId')} />
                    {employeePickerOpen && (
                      <div className="project-team-employee-options" id="project-team-employee-options" role="listbox" aria-label="Active Employees">
                        {employeesQuery.isPending && <p className="muted">Searching Employees…</p>}
                        {!employeesQuery.isPending && employeeOptions.map((employee) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected={selectedEmployeeOption?.id === employee.id}
                            className="secondary-button project-team-employee-option"
                            key={employee.id}
                            onClick={() => handleEmployeeSelection(employee)}
                          >
                            <strong>{employee.employeeNo} · {employee.name}</strong>
                            {employee.phone && <span>{employee.phone}</span>}
                          </button>
                        ))}
                        {!employeesQuery.isPending && employeeOptions.length === 0 && <p className="muted">No active Employees match this search.</p>}
                      </div>
                    )}
                    {errorMessage(employeesQuery.error) && <p className="field-error">Could not load Employees: {errorMessage(employeesQuery.error)}</p>}
                  </div>
                  <label>Project role<input {...createForm.register('projectRole')} /></label>
                  <label>Allocation %<input {...createForm.register('allocationPercent')} /></label>
                  <label>Stage (optional)
                    <select {...createForm.register('stageId')} disabled={!canReadStages}>
                      <option value="">{canReadStages ? 'Project level' : 'Project level · Stage read permission required'}</option>
                      {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.code} · {stage.name}</option>)}
                    </select>
                  </label>
                  <label>From date<input type="date" {...createForm.register('fromDate')} /></label>
                  <label>To date (optional)<input type="date" {...createForm.register('toDate')} /></label>
                </div>
                {Object.values(createForm.formState.errors).map((error, index) => <p className="field-error" key={index}>{error?.message}</p>)}
                {errorMessage(createMutation.error) && <div className="form-error" role="alert">{errorMessage(createMutation.error)}</div>}
                <div className="client-modal-actions">
                  <button type="button" className="secondary-button" onClick={() => setCreateDialogOpen(false)}>Cancel</button>
                  <button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Assigning…' : 'Assign Employee'}</button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}

      {quickEmployeeDialogOpen && createDialogOpen && canCreateEmployees && (
        <div className="finance-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setQuickEmployeeDialogOpen(false); }}>
          <section className="finance-modal employee-create-modal" role="dialog" aria-modal="true" aria-labelledby="project-team-quick-employee-title">
            <header className="finance-modal-header">
              <div>
                <p className="eyebrow">Employee master</p>
                <h2 id="project-team-quick-employee-title">Add Employee</h2>
                <p className="muted">Create the Employee record. Employee code is generated automatically by the server.</p>
              </div>
              <button type="button" className="finance-modal-close" aria-label="Close Add Employee" onClick={() => setQuickEmployeeDialogOpen(false)}>×</button>
            </header>
            <div className="finance-modal-body">
              <form className="admin-form employee-create-form" onSubmit={quickEmployeeForm.handleSubmit((values) => void handleQuickEmployeeCreate(values))} noValidate>
                <div className="employee-create-grid">
                  <label>
                    Name
                    <input autoFocus {...quickEmployeeForm.register('name')} />
                    {quickEmployeeForm.formState.errors.name && <span className="field-error">{quickEmployeeForm.formState.errors.name.message}</span>}
                  </label>
                  <label>
                    CNIC / ID
                    <input {...quickEmployeeForm.register('cnicOrId')} />
                    {quickEmployeeForm.formState.errors.cnicOrId && <span className="field-error">{quickEmployeeForm.formState.errors.cnicOrId.message}</span>}
                  </label>
                  <label>
                    Phone
                    <input {...quickEmployeeForm.register('phone')} />
                    {quickEmployeeForm.formState.errors.phone && <span className="field-error">{quickEmployeeForm.formState.errors.phone.message}</span>}
                  </label>
                  <label>
                    Email
                    <input type="email" {...quickEmployeeForm.register('email')} />
                    {quickEmployeeForm.formState.errors.email && <span className="field-error">{quickEmployeeForm.formState.errors.email.message}</span>}
                  </label>
                  <label>
                    Job title
                    <input {...quickEmployeeForm.register('jobTitle')} />
                    {quickEmployeeForm.formState.errors.jobTitle && <span className="field-error">{quickEmployeeForm.formState.errors.jobTitle.message}</span>}
                  </label>
                  <label>
                    Joining date
                    <input type="date" {...quickEmployeeForm.register('joiningDate')} />
                    {quickEmployeeForm.formState.errors.joiningDate && <span className="field-error">{quickEmployeeForm.formState.errors.joiningDate.message}</span>}
                  </label>
                  <label>
                    Employment end date (optional)
                    <input type="date" min={quickEmployeeForm.watch('joiningDate') || undefined} {...quickEmployeeForm.register('employmentEndDate')} />
                    {quickEmployeeForm.formState.errors.employmentEndDate && <span className="field-error">{quickEmployeeForm.formState.errors.employmentEndDate.message}</span>}
                  </label>
                </div>
                {errorMessage(quickEmployeeMutation.error) && <div className="form-error" role="alert">{errorMessage(quickEmployeeMutation.error)}</div>}
                <div className="employee-create-actions">
                  <button type="button" className="secondary-button" onClick={() => setQuickEmployeeDialogOpen(false)}>Cancel</button>
                  <button type="submit" disabled={quickEmployeeMutation.isPending}>{quickEmployeeMutation.isPending ? 'Creating…' : 'Create & select Employee'}</button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}

      {editingAssignmentId && (
        <div className="client-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingAssignmentId(null); }}>
          <section className="client-modal client-modal-wide" role="dialog" aria-modal="true" aria-labelledby="project-team-edit-title">
            <header className="client-modal-header">
              <div><p className="eyebrow">Project team</p><h2 id="project-team-edit-title">Edit Assignment</h2></div>
              <button type="button" className="client-modal-close" aria-label="Close assignment editor" onClick={() => setEditingAssignmentId(null)}><span aria-hidden="true">×</span></button>
            </header>
            <div className="client-modal-body">
              <form className="admin-form client-modal-form" onSubmit={editForm.handleSubmit((values) => void handleEdit(values))}>
                <div className="client-form-grid">
                  <label>Project role<input {...editForm.register('projectRole')} /></label>
                  <label>Allocation %<input {...editForm.register('allocationPercent')} /></label>
                  <label>Stage
                    <select {...editForm.register('stageId')} disabled={!canReadStages}>
                      <option value="">Project level</option>
                      {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.code} · {stage.name}</option>)}
                    </select>
                  </label>
                  <label>From date<input type="date" {...editForm.register('fromDate')} /></label>
                  <label>To date (optional)<input type="date" {...editForm.register('toDate')} /></label>
                </div>
                {Object.values(editForm.formState.errors).map((error, index) => <p className="field-error" key={index}>{error?.message}</p>)}
                {errorMessage(updateMutation.error) && <div className="form-error" role="alert">{errorMessage(updateMutation.error)}</div>}
                <div className="client-modal-actions">
                  <button type="button" className="secondary-button" onClick={() => setEditingAssignmentId(null)}>Cancel</button>
                  <button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? 'Saving…' : 'Save Assignment'}</button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}

      {endingAssignmentId && (
        <div className="client-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEndingAssignmentId(null); }}>
          <section className="client-modal" role="dialog" aria-modal="true" aria-labelledby="project-team-end-title">
            <header className="client-modal-header">
              <div><p className="eyebrow">Project team</p><h2 id="project-team-end-title">End Assignment</h2></div>
              <button type="button" className="client-modal-close" aria-label="Close end assignment" onClick={() => setEndingAssignmentId(null)}><span aria-hidden="true">×</span></button>
            </header>
            <div className="client-modal-body">
              <form className="admin-form client-modal-form" onSubmit={endForm.handleSubmit((values) => void handleEnd(values))}>
                <div className="client-form-grid">
                  <label>End date<input type="date" {...endForm.register('endDate')} /></label>
                  <label>End note (optional)<textarea rows={3} maxLength={2000} {...endForm.register('note')} /></label>
                </div>
                {Object.values(endForm.formState.errors).map((error, index) => <p className="field-error" key={index}>{error?.message}</p>)}
                {errorMessage(endMutation.error) && <div className="form-error" role="alert">{errorMessage(endMutation.error)}</div>}
                <div className="client-modal-actions">
                  <button type="button" className="secondary-button" onClick={() => setEndingAssignmentId(null)}>Cancel</button>
                  <button type="submit" disabled={endMutation.isPending}>{endMutation.isPending ? 'Ending…' : 'End Assignment'}</button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
