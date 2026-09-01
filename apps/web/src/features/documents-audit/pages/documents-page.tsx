import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { listUsers } from '../../administration/api/admin-api.js';
import { useDocumentWorkspaceVisibility, usePermission } from '../../administration/hooks/auth.js';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useProjects } from '../../projects/hooks/projects.js';
import { DocumentBrowser } from '../components/document-browser.js';
import { DocumentDetailsPanel } from '../components/document-details-panel.js';
import { useAuditLogs } from '../hooks/documents.js';
import type { ListAuditLogsInput } from '../api/documents-api.js';

const auditFilterSchema = z.object({
  actorUserId: z.string().trim(),
  projectId: z.string().trim(),
  stageId: z.string().trim(),
  resourceType: z.string().trim().max(100),
  resourceId: z.string().trim().max(128),
  action: z.string().trim().max(100),
  from: z.string().trim(),
  to: z.string().trim()
});

type AuditFilterValues = z.infer<typeof auditFilterSchema>;

/** Format one audit JSON snapshot for compact browser display. */
function formatAuditValue(value: unknown): string {
  return value === null || value === undefined ? '—' : JSON.stringify(value);
}

/** Render the permission-aware final Module 21 Documents & Audit workspace. */
export function DocumentsPage() {
  const canOpenWorkspace = useDocumentWorkspaceVisibility();
  const canReadDocuments = usePermission('documents.read');
  const canReadAudit = usePermission('audit.read');
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);

  if (!canOpenWorkspace) {
    return (
      <section className="admin-card">
        <h1>Documents & Audit Log</h1>
        <p className="muted">Your current role and Project scope do not provide access to this workspace.</p>
      </section>
    );
  }

  return (
    <section className="admin-stack" aria-labelledby="documents-title">
      <div className="section-heading">
        <p className="eyebrow">Module 21</p>
        <h1 id="documents-title">Documents & Audit Log</h1>
        <p className="muted">Secure document versions, authorized links, signed downloads and append-only activity history.</p>
      </div>

      {canReadDocuments && (
        <>
          <DocumentBrowser selectedDocumentId={selectedDocumentId} onSelectDocument={setSelectedDocumentId} />
          <DocumentDetailsPanel documentId={selectedDocumentId} />
        </>
      )}

      {canReadAudit && <AuditLogPanel />}
    </section>
  );
}

/** Render bounded audit filters and the permission-safe audit result table. */
function AuditLogPanel() {
  const [filters, setFilters] = useState<ListAuditLogsInput>({ page: 1, pageSize: 25 });
  const form = useForm<AuditFilterValues>({
    resolver: zodResolver(auditFilterSchema),
    defaultValues: {
      actorUserId: '',
      projectId: '',
      stageId: '',
      resourceType: '',
      resourceId: '',
      action: '',
      from: '',
      to: ''
    }
  });
  const canReadUsers = usePermission('admin.users.read');
  const canReadProjects = usePermission('projects.read');
  const canReadStages = usePermission('stages.read');
  const usersQuery = useQuery({ queryKey: ['module-21', 'audit-filter-users'], queryFn: () => listUsers({ page: 1, pageSize: 100 }), enabled: canReadUsers });
  const projectsQuery = useProjects({ page: 1, pageSize: 100 }, canReadProjects);
  const selectedProjectId = form.watch('projectId');
  const stagesQuery = useProjectStages(selectedProjectId || null, canReadStages && selectedProjectId !== '');
  const auditQuery = useAuditLogs(filters);
  const page = filters.page ?? 1;
  const pageSize = auditQuery.data?.pageSize ?? 25;
  const pageCount = Math.max(1, Math.ceil((auditQuery.data?.total ?? 0) / pageSize));
  const users = usersQuery.data?.items ?? [];
  const projects = projectsQuery.data?.items ?? [];
  const stages = stagesQuery.data?.items ?? [];
  const projectLabels = new Map(projects.map((project) => [project.id, `${project.projectCode} · ${project.name}`]));
  const stageLabels = new Map(stages.map((stage) => [stage.id, `${stage.code} · ${stage.name}`]));

  /** Apply only non-empty validated audit filters and return to the first page. */
  function applyFilters(values: AuditFilterValues): void {
    const next: ListAuditLogsInput = { page: 1, pageSize: 25 };
    for (const [key, value] of Object.entries(values)) {
      if (!value) continue;
      const normalizedValue = key === 'from' || key === 'to' ? new Date(value).toISOString() : value;
      Object.assign(next, { [key]: normalizedValue });
    }
    setFilters(next);
  }

  /** Move to another bounded audit result page. */
  function changePage(nextPage: number): void {
    setFilters((current) => ({ ...current, page: Math.min(Math.max(nextPage, 1), pageCount) }));
  }

  return (
    <section className="admin-card" aria-labelledby="audit-log-title">
      <div className="section-heading">
        <h2 id="audit-log-title">Audit log</h2>
        <p className="muted">Search by actor, Project, Stage, resource, action or date. Results never bypass your server-side scope.</p>
      </div>

      <form className="admin-form" onSubmit={form.handleSubmit(applyFilters)} noValidate>
        <div className="form-grid">
          <label>Actor
            <select {...form.register('actorUserId')} disabled={!canReadUsers}>
              <option value="">{canReadUsers ? 'All actors' : 'User read permission required'}</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}
            </select>
          </label>
          <label>Project
            <select {...form.register('projectId')} disabled={!canReadProjects} onChange={(event) => { form.setValue('projectId', event.target.value); form.setValue('stageId', ''); }}>
              <option value="">{canReadProjects ? 'All Projects' : 'Project read permission required'}</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}
            </select>
          </label>
          <label>Stage
            <select {...form.register('stageId')} disabled={!canReadStages || !selectedProjectId}>
              <option value="">{selectedProjectId ? 'All Stages' : 'Select a Project first'}</option>
              {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.code} · {stage.name}</option>)}
            </select>
          </label>
          <label>Resource type<input {...form.register('resourceType')} placeholder="document" /></label>
          <label>Resource ID<input {...form.register('resourceId')} /></label>
          <label>Action<input {...form.register('action')} placeholder="document.linked" /></label>
          <label>From<input type="datetime-local" {...form.register('from')} /></label>
          <label>To<input type="datetime-local" {...form.register('to')} /></label>
        </div>
        <button type="submit">Search audit history</button>
      </form>

      {auditQuery.isPending && <p>Loading audit history…</p>}
      {usersQuery.error instanceof Error && <div className="form-error" role="alert">{usersQuery.error.message}</div>}
      {projectsQuery.error instanceof Error && <div className="form-error" role="alert">{projectsQuery.error.message}</div>}
      {stagesQuery.error instanceof Error && <div className="form-error" role="alert">{stagesQuery.error.message}</div>}
      {auditQuery.error instanceof Error && <div className="form-error" role="alert">{auditQuery.error.message}</div>}
      {auditQuery.data && auditQuery.data.items.length === 0 && <p className="muted">No audit records match these filters.</p>}

      {auditQuery.data && auditQuery.data.items.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>Time / ID</th><th>Actor</th><th>Action</th><th>Resource</th><th>Project / Stage</th><th>Before</th><th>After</th><th>Request</th></tr></thead>
            <tbody>
              {auditQuery.data.items.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.createdAt).toLocaleString()}<span>{row.id}</span></td>
                  <td>
                    {row.actor?.name ?? row.actorUserId ?? 'System'}
                    <span>{row.actor?.email ?? ''}</span>
                    <span>Actor ID: {row.actor?.id ?? '—'}</span>
                    <span>Actor user ID: {row.actorUserId ?? '—'}</span>
                  </td>
                  <td>{row.action}</td>
                  <td>{row.resourceType}<span>{row.resourceId}</span></td>
                  <td>
                    {row.projectId ? (projectLabels.get(row.projectId) ?? 'Project') : 'Company-wide'}
                    <span>{row.projectId ?? ''}</span>
                    <span>{row.stageId ? (stageLabels.get(row.stageId) ?? 'Stage') : ''}</span>
                    <span>{row.stageId ?? ''}</span>
                  </td>
                  <td>{formatAuditValue(row.before)}</td>
                  <td>{formatAuditValue(row.after)}</td>
                  <td>{row.requestId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {auditQuery.data && (
        <p className="muted">{auditQuery.data.total} audit record(s) · {auditQuery.data.pageSize} per page</p>
      )}

      <div className="pagination-row">
        <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</button>
        <span>Page {auditQuery.data?.page ?? page} of {pageCount}</span>
        <button type="button" className="secondary-button" disabled={page >= pageCount} onClick={() => changePage(page + 1)}>Next</button>
      </div>
    </section>
  );
}
