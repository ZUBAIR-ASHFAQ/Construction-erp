import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useClients } from '../../clients/hooks/clients.js';
import { listUsers } from '../../administration/api/admin-api.js';
import { usePermission, useProjectWorkspaceVisibility } from '../../administration/hooks/auth.js';
import { ProjectDetailsPanel } from '../components/project-details-panel.js';
import { useCreateProject, useProjects } from '../hooks/projects.js';
import type { ProjectModel, ProjectStatus } from '../api/projects-api.js';

const createProjectSchema = z.object({
  projectCode: z.string().trim().min(1, 'Project code is required.').max(100),
  name: z.string().trim().min(1, 'Project name is required.').max(300),
  clientId: z.string().uuid('Select or enter a valid Client ID.'),
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

type CreateProjectValues = z.infer<typeof createProjectSchema>;
type ProjectDialog =
  | Readonly<{ kind: 'create' }>
  | Readonly<{ kind: 'open'; projectId: string }>
  | Readonly<{ kind: 'edit'; projectId: string }>
  | null;

type ProjectsPageProps = Readonly<{ initialClientId?: string | null }>;

const PROJECT_STATUSES: readonly ProjectStatus[] = ['DRAFT', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'CLOSED'];
const PROJECT_MODELS: readonly ProjectModel[] = ['FIXED_PRICE', 'COST_PLUS_PERCENTAGE'];

/** Render the Project register as a list-first workspace with focused create, detail and edit dialogs. */
export function ProjectsPage({ initialClientId = null }: ProjectsPageProps = {}) {
  const canRead = useProjectWorkspaceVisibility();
  const canCreate = usePermission('projects.create');
  const canUpdate = usePermission('projects.update');
  const canReadClients = usePermission('clients.read');
  const canReadUsers = usePermission('admin.users.read');
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [statusText, setStatusText] = useState<ProjectStatus | ''>('');
  const [projectModelText, setProjectModelText] = useState<ProjectModel | ''>('');
  const [clientFilterText, setClientFilterText] = useState(initialClientId ?? '');
  const [clientId, setClientId] = useState(initialClientId ?? '');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<ProjectDialog>(null);

  const projectsQuery = useProjects({
    ...(search ? { search } : {}),
    ...(statusText ? { status: statusText } : {}),
    ...(projectModelText ? { projectModel: projectModelText } : {}),
    ...(clientId ? { clientId } : {}),
    page,
    pageSize: 25
  }, canRead);
  const clientsQuery = useClients({ status: 'ACTIVE', page: 1, pageSize: 100 }, canReadClients);
  const managersQuery = useQuery({
    queryKey: ['module-24a', 'users', 'project-manager-options'],
    queryFn: () => listUsers({ page: 1, pageSize: 100 }),
    enabled: canReadUsers
  });
  const createMutation = useCreateProject();
  const createForm = useForm<CreateProjectValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      projectCode: '',
      name: '',
      clientId: initialClientId ?? '',
      projectModel: 'FIXED_PRICE',
      projectValue: '0.00',
      costPlusPercent: '',
      currency: 'PKR',
      startDate: '',
      plannedEndDate: '',
      projectManagerUserId: '',
      location: ''
    }
  });
  const selectedProjectModel = createForm.watch('projectModel');

  if (!canRead) {
    return (
      <section className="admin-card">
        <h1>Project Management</h1>
        <p className="muted">Your current role does not include Project read access.</p>
      </section>
    );
  }

  const projects = projectsQuery.data?.items ?? [];
  const pageCount = projectsQuery.data ? Math.max(1, Math.ceil(projectsQuery.data.total / projectsQuery.data.pageSize)) : 1;
  const activeManagers = (managersQuery.data?.items ?? []).filter((user) => user.status === 'ACTIVE');
  const clientLabels = new Map((clientsQuery.data?.items ?? []).map((client) => [client.id, `${client.code} · ${client.displayName}`]));
  const managerLabels = new Map(activeManagers.map((user) => [user.id, `${user.name} · ${user.email}`]));

  /** Apply Project register filters from page one without changing any active Project record. */
  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSearch(searchText.trim());
    setClientId(clientFilterText.trim());
    setPage(1);
  }

  /** Create one DRAFT Project from every validated create field and open the new Project details. */
  async function handleCreate(values: CreateProjectValues): Promise<void> {
    const project = await createMutation.mutateAsync({
      projectCode: values.projectCode,
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

    createForm.reset({
      projectCode: '',
      name: '',
      clientId: clientId || initialClientId || '',
      projectModel: 'FIXED_PRICE',
      projectValue: '0.00',
      costPlusPercent: '',
      currency: project.currency,
      startDate: '',
      plannedEndDate: '',
      projectManagerUserId: '',
      location: ''
    });
    setDialog({ kind: 'open', projectId: project.id });
  }

  /** Close only the active Project dialog while preserving filters and pagination. */
  function closeDialog(): void {
    setDialog(null);
  }

  return (
    <section className="admin-stack project-management-page" aria-labelledby="projects-title">
      <div className="section-heading project-page-heading">
        <div>
          <p className="eyebrow">Projects</p>
          <h1 id="projects-title">Project Management</h1>
          <p className="muted">Search, review and maintain Project master records, commercial terms, dates and lifecycle controls.</p>
        </div>
        {canCreate && (
          <button type="button" className="project-primary-action" onClick={() => setDialog({ kind: 'create' })}>
            <span aria-hidden="true">+</span>
            Create project
          </button>
        )}
      </div>

      <section className="admin-card project-list-card" aria-label="Project list">
        <form className="project-filter-grid project-filter-row" onSubmit={handleSearch}>
          <label>
            Search projects
            <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Project code or name" />
          </label>
          <label>
            Status
            <select value={statusText} onChange={(event) => { setStatusText(event.target.value as ProjectStatus | ''); setPage(1); }}>
              <option value="">All statuses</option>
              {PROJECT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label>
            Commercial model
            <select value={projectModelText} onChange={(event) => { setProjectModelText(event.target.value as ProjectModel | ''); setPage(1); }}>
              <option value="">All models</option>
              {PROJECT_MODELS.map((model) => <option key={model} value={model}>{model === 'FIXED_PRICE' ? 'Fixed Price' : 'Cost + Percentage'}</option>)}
            </select>
          </label>
          <label>
            Client
            <select value={clientFilterText} onChange={(event) => setClientFilterText(event.target.value)} disabled={!canReadClients}>
              <option value="">{canReadClients ? 'All Clients' : 'Client read permission required'}</option>
              {(clientsQuery.data?.items ?? []).map((client) => <option key={client.id} value={client.id}>{client.code} · {client.displayName}</option>)}
            </select>
          </label>
          <button type="submit" className="secondary-button">Apply</button>
        </form>

        {projectsQuery.isPending && <p>Loading Projects…</p>}
        {projectsQuery.error instanceof Error && <div className="form-error" role="alert">{projectsQuery.error.message}</div>}

        {projectsQuery.data && (
          <div className="table-wrap project-list-table-wrap">
            <table className="admin-table project-list-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Client</th>
                  <th>Model / Value</th>
                  <th>Manager</th>
                  <th>Dates</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td><strong>{project.projectCode}</strong><span>{project.name}</span></td>
                    <td><span className={`project-status project-status-${project.status.toLowerCase()}`}>{project.status}</span></td>
                    <td>{clientLabels.get(project.clientId) ?? 'Client linked'}</td>
                    <td>{project.projectModel === 'FIXED_PRICE' ? 'Fixed Price' : 'Cost + Percentage'}<span>{project.currency} {project.projectValue}</span></td>
                    <td>{project.projectManagerUserId ? (managerLabels.get(project.projectManagerUserId) ?? 'Assigned') : 'Unassigned'}</td>
                    <td>{project.startDate}<span>to {project.plannedEndDate}</span></td>
                    <td>
                      <div className="project-row-actions">
                        <button type="button" className="link-button" onClick={() => setDialog({ kind: 'open', projectId: project.id })}>Open</button>
                        {canUpdate && (
                          <button
                            type="button"
                            className="secondary-button project-edit-button"
                            disabled={project.status === 'CLOSED'}
                            title={project.status === 'CLOSED' ? 'Closed Projects are read-only.' : 'Edit Project'}
                            onClick={() => setDialog({ kind: 'edit', projectId: project.id })}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {projectsQuery.data && projects.length === 0 && <p className="muted">No Projects found.</p>}

        <div className="pagination-row">
          <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
          <span>Page {page} of {pageCount}</span>
          <button type="button" className="secondary-button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
        </div>
      </section>

      {dialog?.kind === 'create' && (
        <ProjectModal title="Create project" eyebrow="New project" onClose={closeDialog}>
          <form className="admin-form project-modal-form" onSubmit={createForm.handleSubmit(handleCreate)} noValidate>
            <div className="project-form-grid project-modal-grid">
              <label>Project code<input autoFocus {...createForm.register('projectCode')} /></label>
              <label>Project name<input {...createForm.register('name')} /></label>
              <label>
                Client
                <select {...createForm.register('clientId')} disabled={!canReadClients}>
                  <option value="">{canReadClients ? 'Select active Client' : 'Client read permission required'}</option>
                  {(clientsQuery.data?.items ?? []).map((client) => (
                    <option key={client.id} value={client.id}>{client.code} · {client.displayName}</option>
                  ))}
                </select>
              </label>
              <label>
                Commercial model
                <select {...createForm.register('projectModel')}>
                  <option value="FIXED_PRICE">Fixed Price</option>
                  <option value="COST_PLUS_PERCENTAGE">Cost + Percentage</option>
                </select>
              </label>
              <label>Project value<input inputMode="decimal" {...createForm.register('projectValue')} /></label>
              {selectedProjectModel === 'COST_PLUS_PERCENTAGE' && (
                <label>Cost + percent<input inputMode="decimal" {...createForm.register('costPlusPercent')} /></label>
              )}
              <label>Currency<input maxLength={3} {...createForm.register('currency')} /></label>
              <label>Start date<input type="date" {...createForm.register('startDate')} /></label>
              <label>Planned end date<input type="date" {...createForm.register('plannedEndDate')} /></label>
              <label>
                Project Manager
                <select {...createForm.register('projectManagerUserId')} disabled={!canReadUsers}>
                  <option value="">{canReadUsers ? 'Unassigned' : 'Unassigned · User read permission required'}</option>
                  {activeManagers.map((user) => (
                    <option key={user.id} value={user.id}>{user.name} · {user.email}</option>
                  ))}
                </select>
              </label>
              <label className="project-form-wide">Location (optional)<input {...createForm.register('location')} /></label>
            </div>

            {Object.values(createForm.formState.errors).map((error, index) => (
              <span className="field-error" key={index}>{error?.message}</span>
            ))}
            {clientsQuery.error instanceof Error && <div className="form-error" role="alert">{clientsQuery.error.message}</div>}
            {managersQuery.error instanceof Error && <div className="form-error" role="alert">{managersQuery.error.message}</div>}
            {createMutation.error instanceof Error && <div className="form-error" role="alert">{createMutation.error.message}</div>}
            <div className="project-modal-actions">
              <button type="button" className="secondary-button" onClick={closeDialog}>Cancel</button>
              <button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Creating…' : 'Create Project'}</button>
            </div>
          </form>
        </ProjectModal>
      )}

      {dialog?.kind === 'open' && (
        <ProjectModal title="Project details" eyebrow="Project record" onClose={closeDialog} wide>
          <ProjectDetailsPanel projectId={dialog.projectId} mode="details" />
        </ProjectModal>
      )}

      {dialog?.kind === 'edit' && (
        <ProjectModal title="Edit project" eyebrow="Project master data" onClose={closeDialog}>
          <ProjectDetailsPanel projectId={dialog.projectId} mode="edit" onSaved={closeDialog} />
        </ProjectModal>
      )}
    </section>
  );
}

/** Render one accessible Project modal without introducing another UI dependency. */
function ProjectModal(props: Readonly<{
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}>) {
  useEffect(() => {
    /** Close only the active Project modal when Escape is pressed. */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') props.onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [props.onClose]);

  return (
    <div className="project-modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section
        className={`project-modal${props.wide ? ' project-modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="project-modal-header">
          <div>
            <p className="eyebrow">{props.eyebrow}</p>
            <h2 id="project-modal-title">{props.title}</h2>
          </div>
          <button type="button" className="project-modal-close" onClick={props.onClose} aria-label={`Close ${props.title}`}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="project-modal-body">{props.children}</div>
      </section>
    </div>
  );
}
