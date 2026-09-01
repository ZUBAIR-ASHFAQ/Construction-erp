import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { getClient } from '../../clients/api/clients-api.js';
import { useClients } from '../../clients/hooks/clients.js';
import { listUsers } from '../../administration/api/admin-api.js';
import { usePermission } from '../../administration/hooks/auth.js';
import type { ProjectDetails } from '../api/projects-api.js';
import {
  useActivateProject,
  useCloseProject,
  useCompleteProject,
  useSuspendProject,
  useProject,
  useUpdateProject
} from '../hooks/projects.js';


const editProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required.').max(300),
  clientId: z.string().uuid('Enter a valid Client ID.'),
  projectModel: z.enum(['FIXED_PRICE', 'COST_PLUS_PERCENTAGE']),
  projectValue: z.string().trim().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/, 'Enter a valid non-negative Project value with at most 2 decimals.'),
  costPlusPercent: z.string().trim(),
  currency: z.string().trim().length(3, 'Currency must use three letters.').regex(/^[A-Za-z]{3}$/, 'Currency must use letters only.'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date is required.'),
  plannedEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Planned end date is required.'),
  projectManagerUserId: z.string().trim(),
  location: z.string().trim().max(1000, 'Location is too long.')
}).superRefine((value, context) => {
  if (value.plannedEndDate < value.startDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['plannedEndDate'],
      message: 'Planned end date cannot be before the start date.'
    });
  }

  if (value.projectManagerUserId && !z.string().uuid().safeParse(value.projectManagerUserId).success) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['projectManagerUserId'],
      message: 'Project Manager must be a valid User ID when provided.'
    });
  }

  if (value.projectModel === 'COST_PLUS_PERCENTAGE') {
    const validPercent = /^(?:0|[1-9]\d{0,2}|100)(?:\.\d{1,4})?$/.test(value.costPlusPercent);
    const percent = Number(value.costPlusPercent);
    if (!validPercent || percent <= 0 || percent > 100) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['costPlusPercent'],
        message: 'Cost + Percentage requires a percent greater than 0 and at most 100.'
      });
    }
  } else if (value.costPlusPercent) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['costPlusPercent'],
      message: 'Leave Cost + Percentage empty for a Fixed Price Project.'
    });
  }
});

const projectTransitionSchema = z.object({
  reason: z.string().trim().max(5000, 'Lifecycle reason is too long.')
});

const closeProjectSchema = z.object({
  reason: z.string().trim().max(5000, 'Close reason is too long.')
});

type EditProjectValues = z.infer<typeof editProjectSchema>;
type ProjectTransitionValues = z.infer<typeof projectTransitionSchema>;
type CloseProjectValues = z.infer<typeof closeProjectSchema>;

export type ProjectDetailsPanelProps = Readonly<{
  projectId: string;
}>;

/** Load one Project detail record before rendering its edit, lifecycle and source-summary workspace. */
export function ProjectDetailsPanel({ projectId }: ProjectDetailsPanelProps) {
  const projectQuery = useProject(projectId);

  if (projectQuery.isPending) {
    return <section className="admin-card"><p>Loading Project details…</p></section>;
  }

  if (projectQuery.error instanceof Error) {
    return <section className="admin-card"><div className="form-error" role="alert">{projectQuery.error.message}</div></section>;
  }

  if (!projectQuery.data) return null;

  return (
    <ProjectDetailsContent
      key={`${projectQuery.data.project.id}-${projectQuery.data.project.updatedAt}`}
      details={projectQuery.data}
    />
  );
}

/** Render loaded Project data with permission-aware edit, lifecycle and source-summary controls. */
function ProjectDetailsContent({ details }: Readonly<{ details: ProjectDetails }>) {
  const project = details.project;
  const canUpdate = usePermission('projects.update');
  const canActivate = usePermission('projects.activate');
  const canComplete = usePermission('projects.complete');
  const canClose = usePermission('projects.close');
  const canReadClients = usePermission('clients.read');
  const canReadUsers = usePermission('admin.users.read');
  const updateMutation = useUpdateProject(project.id);
  const activateMutation = useActivateProject(project.id);
  const suspendMutation = useSuspendProject(project.id);
  const completeMutation = useCompleteProject(project.id);
  const closeMutation = useCloseProject(project.id);
  const clientQuery = useQuery({
    queryKey: ['module-2', 'clients', 'project-source-summary', project.clientId],
    queryFn: () => getClient(project.clientId),
    enabled: canReadClients
  });
  const clientOptionsQuery = useClients({ status: 'ACTIVE', page: 1, pageSize: 100 }, canReadClients && canUpdate);
  const managerOptionsQuery = useQuery({
    queryKey: ['module-24a', 'users', 'project-edit-manager-options'],
    queryFn: () => listUsers({ page: 1, pageSize: 100 }),
    enabled: canReadUsers
  });
  const editForm = useForm<EditProjectValues>({
    resolver: zodResolver(editProjectSchema),
    defaultValues: {
      name: project.name,
      clientId: project.clientId,
      projectModel: project.projectModel,
      projectValue: project.projectValue,
      costPlusPercent: project.costPlusPercent ?? '',
      currency: project.currency,
      startDate: project.startDate,
      plannedEndDate: project.plannedEndDate,
      projectManagerUserId: project.projectManagerUserId ?? '',
      location: project.location ?? ''
    }
  });
  const selectedProjectModel = editForm.watch('projectModel');
  const transitionForm = useForm<ProjectTransitionValues>({
    resolver: zodResolver(projectTransitionSchema),
    defaultValues: { reason: '' }
  });
  const closeForm = useForm<CloseProjectValues>({
    resolver: zodResolver(closeProjectSchema),
    defaultValues: { reason: '' }
  });
  const canEditProject = canUpdate && project.status !== 'CLOSED';
  const activeManagers = (managerOptionsQuery.data?.items ?? []).filter((user) => user.status === 'ACTIVE');
  const projectManager = activeManagers.find((user) => user.id === project.projectManagerUserId) ?? null;
  const lifecycleError = activateMutation.error
    ?? suspendMutation.error
    ?? completeMutation.error
    ?? closeMutation.error;

  /** Save only the editable Project master fields and keep Project code/status server-owned. */
  async function handleUpdate(values: EditProjectValues): Promise<void> {
    await updateMutation.mutateAsync({
      name: values.name,
      clientId: values.clientId,
      projectModel: values.projectModel,
      projectValue: values.projectValue,
      costPlusPercent: values.projectModel === 'COST_PLUS_PERCENTAGE' ? values.costPlusPercent : null,
      currency: values.currency.toUpperCase(),
      startDate: values.startDate,
      plannedEndDate: values.plannedEndDate,
      projectManagerUserId: values.projectManagerUserId || null,
      location: values.location || null
    });
  }

  /** Activate the selected DRAFT Project without sending a lifecycle request body. */
  async function handleActivate(): Promise<void> {
    await activateMutation.mutateAsync();
  }

  /** Suspend the selected ACTIVE Project and preserve only the optional lifecycle reason. */
  async function handleSuspend(values: ProjectTransitionValues): Promise<void> {
    await suspendMutation.mutateAsync(values.reason ? { reason: values.reason } : {});
  }

  /** Complete the selected ACTIVE Project without sending a lifecycle request body. */
  async function handleComplete(): Promise<void> {
    await completeMutation.mutateAsync();
  }

  /** Close the selected COMPLETED Project and send only the optional close reason. */
  async function handleClose(values: CloseProjectValues): Promise<void> {
    await closeMutation.mutateAsync(values.reason ? { reason: values.reason } : {});
  }

  return (
    <section className="admin-card" aria-labelledby="project-detail-title">
      <div className="project-heading">
        <div>
          <p className="eyebrow">Project detail</p>
          <h2 id="project-detail-title">{project.projectCode} · {project.name}</h2>
          <p className="muted">Project Management owns the Client link, commercial model/value, dates and lifecycle. Project team assignments belong to Final Module 8 and are intentionally not edited here.</p>
        </div>
        <strong>{project.status}</strong>
      </div>

      <dl className="project-detail-grid">
        <div><dt>Client</dt><dd>{clientQuery.data ? `${clientQuery.data.client.code} · ${clientQuery.data.client.displayName}` : 'Client linked'}</dd></div>
        <div><dt>Commercial model</dt><dd>{project.projectModel === 'FIXED_PRICE' ? 'Fixed Price' : 'Cost + Percentage'}</dd></div>
        <div><dt>Project value</dt><dd>{project.currency} {project.projectValue}</dd></div>
        <div><dt>Cost + percent</dt><dd>{project.costPlusPercent ? `${project.costPlusPercent}%` : 'Not applicable'}</dd></div>
        <div><dt>Project Manager</dt><dd>{project.projectManagerUserId ? (projectManager ? `${projectManager.name} · ${projectManager.email}` : 'Assigned') : 'Unassigned'}</dd></div>
        <div><dt>Currency</dt><dd>{project.currency}</dd></div>
        <div><dt>Start date</dt><dd>{project.startDate}</dd></div>
        <div><dt>Planned end</dt><dd>{project.plannedEndDate}</dd></div>
        <div className="project-detail-wide"><dt>Location</dt><dd>{project.location ?? 'Not set'}</dd></div>
      </dl>

      <div className="project-summary-section">
        <h3>Commercial / source summary</h3>
        <dl className="project-summary-grid">
          <div>
            <dt>Client</dt>
            <dd>{clientQuery.data ? `${clientQuery.data.client.code} · ${clientQuery.data.client.displayName}` : project.clientId}</dd>
            <small>{canReadClients ? (clientQuery.data ? clientQuery.data.client.status : 'Loading permitted Client summary…') : 'Client detail hidden by permission.'}</small>
          </div>
          <div>
            <dt>Project commercial basis</dt>
            <dd>{project.projectModel === 'FIXED_PRICE' ? 'Fixed Price' : `Cost + ${project.costPlusPercent}%`}</dd>
            <small>{project.currency} {project.projectValue}. Operational and financial totals below remain source-owned.</small>
          </div>
        </dl>

        <h3>Project module summary</h3>
        <dl className="project-summary-grid">
          <div>
            <dt>Stages / progress</dt>
            <dd>{details.stageSummary ? `${details.stageSummary.stageCount} stages · ${details.stageSummary.overallPhysicalProgressPercent}%` : 'Restricted'}</dd>
            <small>{details.stageSummary
              ? `Baseline ${details.stageSummary.baselineStatus ?? 'not frozen'}${details.stageSummary.totalWeightPercent ? ` · ${details.stageSummary.totalWeightPercent}% weight` : ''}`
              : 'Stage setup and physical progress require Stage read permission.'}</small>
          </div>
          <div>
            <dt>Project team</dt>
            <dd>{details.teamSummary ? `${details.teamSummary.activeEmployeeCount} active employees` : 'Restricted'}</dd>
            <small>{details.teamSummary
              ? `${details.teamSummary.activeAssignmentCount} active assignments`
              : 'Team counts require Project Team read permission.'}</small>
          </div>
          <div>
            <dt>Budget</dt>
            <dd>{details.budgetSummary ? `${details.budgetSummary.currency} ${details.budgetSummary.totalAmount}` : 'Not available'}</dd>
            <small>{details.budgetSummary
              ? `Version ${details.budgetSummary.versionNo} · ${details.budgetSummary.status}`
              : 'No readable Project budget is available.'}</small>
          </div>
          <div>
            <dt>Actual / forecast cost</dt>
            <dd>{details.costSummary ? `${project.currency} ${details.costSummary.actualCost}` : 'Restricted'}</dd>
            <small>{details.costSummary
              ? `Budget ${details.costSummary.budgetCost} · committed ${details.costSummary.committedCost} · forecast ${details.costSummary.forecastCost} · variance ${details.costSummary.variance}`
              : 'Cost totals require Job Cost read permission.'}</small>
          </div>
          <div>
            <dt>Client billing</dt>
            <dd>{details.billingSummary ? `${project.currency} ${details.billingSummary.billedAmount}` : 'Restricted'}</dd>
            <small>{details.billingSummary
              ? `${details.billingSummary.invoiceCount} issued/posted invoices`
              : 'Billing totals require Client Billing read permission.'}</small>
          </div>
          <div>
            <dt>Client receipts</dt>
            <dd>{details.receiptSummary ? `${project.currency} ${details.receiptSummary.receivedAmount}` : 'Restricted'}</dd>
            <small>{details.receiptSummary
              ? `Allocated ${details.receiptSummary.allocatedAmount} · advance ${details.receiptSummary.advanceAmount} · outstanding ${details.receiptSummary.outstandingAmount ?? 'Restricted'}`
              : 'Receipt totals require Client Receipts read permission.'}</small>
          </div>
        </dl>
        {clientQuery.error instanceof Error && <div className="form-error" role="alert">{clientQuery.error.message}</div>}
        {clientOptionsQuery.error instanceof Error && <div className="form-error" role="alert">{clientOptionsQuery.error.message}</div>}
        {managerOptionsQuery.error instanceof Error && <div className="form-error" role="alert">{managerOptionsQuery.error.message}</div>}
      </div>

      {canEditProject && (
        <div className="project-edit-section">
          <h3>Edit Project</h3>
          <form className="admin-form" onSubmit={editForm.handleSubmit(handleUpdate)} noValidate>
            <div className="project-form-grid">
              <label>Project name<input {...editForm.register('name')} /></label>
              <label>Client
                {canReadClients ? (
                  <select {...editForm.register('clientId')}>
                    {clientQuery.data && !clientOptionsQuery.data?.items.some((client) => client.id === project.clientId) && (
                      <option value={project.clientId}>{clientQuery.data.client.code} · {clientQuery.data.client.displayName}</option>
                    )}
                    {(clientOptionsQuery.data?.items ?? []).map((client) => <option key={client.id} value={client.id}>{client.code} · {client.displayName}</option>)}
                  </select>
                ) : (
                  <><input type="hidden" {...editForm.register('clientId')} /><span className="muted">Current Client preserved · Client read permission required to change it.</span></>
                )}
              </label>
              <label>
                Commercial model
                <select {...editForm.register('projectModel')}>
                  <option value="FIXED_PRICE">Fixed Price</option>
                  <option value="COST_PLUS_PERCENTAGE">Cost + Percentage</option>
                </select>
              </label>
              <label>Project value<input inputMode="decimal" {...editForm.register('projectValue')} /></label>
              {selectedProjectModel === 'COST_PLUS_PERCENTAGE' && (
                <label>Cost + percent<input inputMode="decimal" {...editForm.register('costPlusPercent')} /></label>
              )}
              <label>Currency<input maxLength={3} {...editForm.register('currency')} /></label>
              <label>Start date<input type="date" {...editForm.register('startDate')} /></label>
              <label>Planned end date<input type="date" {...editForm.register('plannedEndDate')} /></label>
              <label>Project Manager (optional)
                {canReadUsers ? (
                  <select {...editForm.register('projectManagerUserId')}>
                    <option value="">Unassigned</option>
                    {project.projectManagerUserId && !activeManagers.some((user) => user.id === project.projectManagerUserId) && (
                      <option value={project.projectManagerUserId}>{projectManager ? `${projectManager.name} · ${projectManager.email}` : 'Current assigned manager'}</option>
                    )}
                    {activeManagers.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}
                  </select>
                ) : (
                  <><input type="hidden" {...editForm.register('projectManagerUserId')} /><span className="muted">Current manager assignment preserved · User read permission required to change it.</span></>
                )}
              </label>
              <label>Location (optional)<input {...editForm.register('location')} /></label>
            </div>
            <p className="muted">Project code and lifecycle status are controlled separately. Commercial values are stored on the Project and do not depend on Tender, Estimate, BOQ, Contract or WBS records.</p>
            {Object.values(editForm.formState.errors).map((error, index) => (
              <span className="field-error" key={index}>{error?.message}</span>
            ))}
            {updateMutation.error instanceof Error && <div className="form-error" role="alert">{updateMutation.error.message}</div>}
            <button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? 'Saving…' : 'Save Project'}</button>
          </form>
        </div>
      )}


      <div className="project-lifecycle-section">
        <h3>Lifecycle controls</h3>
        <div className="project-action-row">
          {canActivate && project.status === 'DRAFT' && (
            <button type="button" onClick={() => void handleActivate()} disabled={activateMutation.isPending}>
              {activateMutation.isPending ? 'Activating…' : 'Activate Project'}
            </button>
          )}
          {canComplete && project.status === 'ACTIVE' && (
            <button type="button" onClick={() => void handleComplete()} disabled={completeMutation.isPending}>
              {completeMutation.isPending ? 'Completing…' : 'Complete Project'}
            </button>
          )}
        </div>

        {canUpdate && project.status === 'ACTIVE' && (
          <form className="project-close-form" onSubmit={transitionForm.handleSubmit(handleSuspend)} noValidate>
            <label>
              Suspension reason (optional)
              <input {...transitionForm.register('reason')} placeholder="Reason saved in lifecycle history" />
            </label>
            <button type="submit" disabled={suspendMutation.isPending}>{suspendMutation.isPending ? 'Suspending…' : 'Suspend Project'}</button>
            {transitionForm.formState.errors.reason && <span className="field-error">{transitionForm.formState.errors.reason.message}</span>}
          </form>
        )}

        {canClose && project.status === 'COMPLETED' && (
          <form className="project-close-form" onSubmit={closeForm.handleSubmit(handleClose)} noValidate>
            <label>
              Close reason (optional)
              <input {...closeForm.register('reason')} placeholder="Reason saved in lifecycle history" />
            </label>
            <button type="submit" disabled={closeMutation.isPending}>{closeMutation.isPending ? 'Closing…' : 'Close Project'}</button>
            {closeForm.formState.errors.reason && <span className="field-error">{closeForm.formState.errors.reason.message}</span>}
          </form>
        )}

        {!canActivate && !canUpdate && !canComplete && !canClose && <p className="muted">Your current role does not include Project lifecycle authority.</p>}
        {project.status === 'SUSPENDED' && <p className="muted">Suspended Projects remain visible for administration while normal downstream operational transactions stay blocked.</p>}
        {project.status === 'CLOSED' && <p className="muted">Closed Projects are read-only in normal Project Management workflows.</p>}
        {lifecycleError instanceof Error && <div className="form-error" role="alert">{lifecycleError.message}</div>}
      </div>

      <div className="project-modules-section">
        <h3>Integrated Project modules</h3>
        <p className="muted">Stages, team, budget, job cost, billing and receipts stay owned by their source modules. This Project view only reads permission-safe summaries and never stores duplicate totals.</p>
      </div>

      <div className="project-history-section">
        <h3>Lifecycle history</h3>
        {details.statusHistory.length === 0 ? (
          <p className="muted">No lifecycle history is available.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Changed by</th>
                  <th>Reason</th>
                  <th>Changed at</th>
                </tr>
              </thead>
              <tbody>
                {details.statusHistory.map((history) => (
                  <tr key={history.id}>
                    <td>{history.fromStatus ?? 'Created'}</td>
                    <td>{history.toStatus}</td>
                    <td>{history.changedBy}</td>
                    <td>{history.reason ?? '—'}</td>
                    <td>{new Date(history.changedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
