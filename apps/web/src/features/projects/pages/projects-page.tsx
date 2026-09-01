import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
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

type ProjectsPageProps = Readonly<{ initialClientId?: string | null }>;

const PROJECT_STATUSES: readonly ProjectStatus[] = ['DRAFT', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'CLOSED'];
const PROJECT_MODELS: readonly ProjectModel[] = ['FIXED_PRICE', 'COST_PLUS_PERCENTAGE'];

/** Render the Final Module 6 Project register, create form and read-only Project detail. */
export function ProjectsPage({ initialClientId = null }: ProjectsPageProps = {}) {
  const canRead = useProjectWorkspaceVisibility();
  const canCreate = usePermission('projects.create');
  const canReadClients = usePermission('clients.read');
  const canReadUsers = usePermission('admin.users.read');
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [statusText, setStatusText] = useState<ProjectStatus | ''>('');
  const [projectModelText, setProjectModelText] = useState<ProjectModel | ''>('');
  const [clientFilterText, setClientFilterText] = useState(initialClientId ?? '');
  const [clientId, setClientId] = useState(initialClientId ?? '');
  const [page, setPage] = useState(1);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

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

  /** Apply Project register filters from page one and clear the previous detail selection. */
  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSearch(searchText.trim());
    setClientId(clientFilterText.trim());
    setPage(1);
    setSelectedProjectId(null);
  }

  /** Create one DRAFT Project from validated business fields and select the returned Project. */
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
    setSelectedProjectId(project.id);
  }

  return (
    <section className="admin-stack" aria-labelledby="projects-title">
      <div className="section-heading">
        <p className="eyebrow">Final Module 6</p>
        <h1 id="projects-title">Project Management</h1>
        <p className="muted">Create Projects directly from Clients with Fixed Price or Cost + Percentage commercial terms. No Tender, Estimate, BOQ, Contract or WBS is required.</p>
      </div>

      <section className="admin-card">
        <form className="project-filter-grid" onSubmit={handleSearch}>
          <label>
            Search
            <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Project code or name" />
          </label>
          <label>
            Status
            <select value={statusText} onChange={(event) => setStatusText(event.target.value as ProjectStatus | '')}>
              <option value="">All statuses</option>
              {PROJECT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label>
            Commercial model
            <select value={projectModelText} onChange={(event) => setProjectModelText(event.target.value as ProjectModel | '')}>
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
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Client</th>
                  <th>Model / Value</th>
                  <th>Manager</th>
                  <th>Dates</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id} className={selectedProjectId === project.id ? 'selected-row' : undefined}>
                    <td><strong>{project.projectCode}</strong><span>{project.name}</span></td>
                    <td>{project.status}</td>
                    <td>{clientLabels.get(project.clientId) ?? 'Client linked'}</td>
                    <td>{project.projectModel === 'FIXED_PRICE' ? 'Fixed Price' : 'Cost + Percentage'}<span>{project.currency} {project.projectValue}</span></td>
                    <td>{project.projectManagerUserId ? (managerLabels.get(project.projectManagerUserId) ?? 'Assigned') : 'Unassigned'}</td>
                    <td>{project.startDate}<span>to {project.plannedEndDate}</span></td>
                    <td><button type="button" className="link-button" onClick={() => setSelectedProjectId(project.id)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {projectsQuery.data && projects.length === 0 && <p className="muted">No Projects found.</p>}

        <div className="pagination-row">
          <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => { setPage((value) => value - 1); setSelectedProjectId(null); }}>Previous</button>
          <span>Page {page} of {pageCount}</span>
          <button type="button" className="secondary-button" disabled={page >= pageCount} onClick={() => { setPage((value) => value + 1); setSelectedProjectId(null); }}>Next</button>
        </div>
      </section>

      {canCreate && (
        <section className="admin-card">
          <h2>Create Project</h2>
          <p className="muted">New Projects start as DRAFT and are created directly from an active Client. Project Manager and location are optional.</p>
          <form className="admin-form" onSubmit={createForm.handleSubmit(handleCreate)} noValidate>
            <div className="project-form-grid">
              <label>Project code<input {...createForm.register('projectCode')} /></label>
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
              <label className="project-detail-wide">Location (optional)<input {...createForm.register('location')} /></label>
            </div>

            {Object.values(createForm.formState.errors).map((error, index) => (
              <span className="field-error" key={index}>{error?.message}</span>
            ))}
            {clientsQuery.error instanceof Error && <div className="form-error" role="alert">{clientsQuery.error.message}</div>}
            {managersQuery.error instanceof Error && <div className="form-error" role="alert">{managersQuery.error.message}</div>}
            {createMutation.error instanceof Error && <div className="form-error" role="alert">{createMutation.error.message}</div>}
            <button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Creating…' : 'Create Project'}</button>
          </form>
        </section>
      )}

      {selectedProjectId && <ProjectDetailsPanel key={selectedProjectId} projectId={selectedProjectId} />}
    </section>
  );
}
