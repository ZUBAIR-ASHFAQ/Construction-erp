import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { usePermission } from '../../administration/hooks/auth.js';
import { useEmployees } from '../../employees/hooks/employees.js';
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

type AssignmentFormValues = z.infer<typeof assignmentSchema>;
type EditAssignmentFormValues = z.infer<typeof editAssignmentSchema>;
type EndAssignmentFormValues = z.infer<typeof endAssignmentSchema>;

export type ProjectTeamWorkspaceProps = Readonly<{
  canRead: boolean;
  canManage: boolean;
}>;

/** Return a readable request failure without coupling the UI to backend internals. */
function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

/** Render Project Team setup and history using readable source-module selectors instead of raw identifiers. */
export function ProjectTeamWorkspace(props: ProjectTeamWorkspaceProps) {
  const canReadProjects = usePermission('projects.read');
  const canReadEmployees = usePermission('employees.read');
  const canReadStages = usePermission('stages.read');
  const projectsQuery = useProjects({ page: 1, pageSize: 100 }, canReadProjects && props.canRead);
  const employeesQuery = useEmployees({ status: 'ACTIVE', page: 1, pageSize: 100 }, canReadEmployees && props.canManage);
  const [projectId, setProjectId] = useState('');
  const stagesQuery = useProjectStages(projectId || null, canReadStages && projectId !== '');
  const teamQuery = useProjectTeam(projectId, props.canRead && projectId !== '');
  const createMutation = useCreateProjectTeamAssignment();
  const updateMutation = useUpdateProjectTeamAssignment();
  const endMutation = useEndProjectTeamAssignment();
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

  /** Change the active Project and clear dependent create/edit/end state. */
  function selectProject(nextProjectId: string): void {
    setProjectId(nextProjectId);
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
  }

  /** Open the readable assignment editor without asking the user to type a Stage UUID. */
  function startEdit(assignment: ProjectTeamAssignment): void {
    setEndingAssignmentId(null);
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
  }

  /** Open the explicit assignment-end form with the backend-supported optional note. */
  function startEnd(assignment: ProjectTeamAssignment): void {
    setEditingAssignmentId(null);
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
    endForm.reset({ endDate: '', note: '' });
  }

  const projects = projectsQuery.data?.items ?? [];
  const employees = employeesQuery.data?.items ?? [];
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

      {canCreateWithSelectors && (
        <section className="admin-card">
          <h2>Assign Employee</h2>
          <form className="admin-form" onSubmit={createForm.handleSubmit((values) => void handleCreate(values))}>
            <label>Employee
              <select {...createForm.register('employeeId')}>
                <option value="">Select active Employee</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeNo} · {employee.name}</option>)}
              </select>
            </label>
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
            {Object.values(createForm.formState.errors).map((error, index) => <p className="field-error" key={index}>{error?.message}</p>)}
            {errorMessage(createMutation.error) && <div className="form-error" role="alert">{errorMessage(createMutation.error)}</div>}
            <button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Assigning…' : 'Assign Employee'}</button>
          </form>
        </section>
      )}

      {editingAssignmentId && (
        <section className="admin-card">
          <h2>Edit Assignment</h2>
          <form className="admin-form" onSubmit={editForm.handleSubmit((values) => void handleEdit(values))}>
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
            {Object.values(editForm.formState.errors).map((error, index) => <p className="field-error" key={index}>{error?.message}</p>)}
            {errorMessage(updateMutation.error) && <div className="form-error" role="alert">{errorMessage(updateMutation.error)}</div>}
            <div className="button-row">
              <button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? 'Saving…' : 'Save Assignment'}</button>
              <button type="button" className="secondary-button" onClick={() => setEditingAssignmentId(null)}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      {endingAssignmentId && (
        <section className="admin-card">
          <h2>End Assignment</h2>
          <form className="admin-form" onSubmit={endForm.handleSubmit((values) => void handleEnd(values))}>
            <label>End date<input type="date" {...endForm.register('endDate')} /></label>
            <label>End note (optional)<textarea rows={3} maxLength={2000} {...endForm.register('note')} /></label>
            {Object.values(endForm.formState.errors).map((error, index) => <p className="field-error" key={index}>{error?.message}</p>)}
            {errorMessage(endMutation.error) && <div className="form-error" role="alert">{errorMessage(endMutation.error)}</div>}
            <div className="button-row">
              <button type="submit" disabled={endMutation.isPending}>{endMutation.isPending ? 'Ending…' : 'End Assignment'}</button>
              <button type="button" className="secondary-button" onClick={() => setEndingAssignmentId(null)}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      <section className="admin-card">
        <h2>Project Team</h2>
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
    </section>
  );
}
