import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth, usePermission } from '../../administration/hooks/auth.js';
import { useProjects } from '../../projects/hooks/projects.js';
import { useDocuments, useUploadDocument } from '../hooks/documents.js';
import type { ListDocumentsInput } from '../api/documents-api.js';

const filterSchema = z.object({
  search: z.string().trim().max(200),
  projectId: z.string().trim(),
  category: z.string().trim().max(100),
  status: z.string().trim().max(100)
});

const uploadSchema = z.object({
  projectId: z.string().trim(),
  title: z.string().trim().min(1, 'Title is required.').max(300),
  category: z.string().trim().min(1, 'Category is required.').max(100),
  documentNo: z.string().trim().max(120),
  file: z.custom<FileList>(
    (value) => typeof FileList !== 'undefined' && value instanceof FileList && value.length === 1,
    'Choose one file.'
  )
});

type FilterValues = z.infer<typeof filterSchema>;
type UploadValues = z.infer<typeof uploadSchema>;
type ProjectOption = Readonly<{ id: string; label: string }>;

type DocumentBrowserProps = Readonly<{
  selectedDocumentId: string | null;
  onSelectDocument: (documentId: string) => void;
}>;

/** Build Project selector options from the actor's allowed scope and readable Project names. */
function buildProjectOptions(
  accessibleProjectIds: readonly string[] | null | undefined,
  namedProjects: readonly Readonly<{ id: string; projectCode: string; name: string }>[]
): ProjectOption[] {
  if (accessibleProjectIds === null) {
    return namedProjects.map((project) => ({
      id: project.id,
      label: `${project.projectCode} · ${project.name}`
    }));
  }

  return (accessibleProjectIds ?? []).map((projectId) => ({
    id: projectId,
    label: `Assigned Project · ${projectId}`
  }));
}

/** Browse and upload company or Project documents without a separate folder abstraction. */
export function DocumentBrowser(props: DocumentBrowserProps) {
  const auth = useAuth();
  const canCompanyUpload = usePermission('documents.upload');
  const canReadProjects = usePermission('projects.read');
  const [filters, setFilters] = useState<ListDocumentsInput>({});
  const [page, setPage] = useState(1);
  const documentsQuery = useDocuments({ ...filters, page, pageSize: 20 });
  const projectNamesQuery = useProjects(
    { page: 1, pageSize: 100 },
    auth.identity?.projectScope.kind === 'all' && canReadProjects
  );
  const projectOptions = buildProjectOptions(
    documentsQuery.data?.accessibleProjectIds,
    projectNamesQuery.data?.items ?? []
  );
  const canUpload = canCompanyUpload || projectOptions.length > 0;
  const uploadMutation = useUploadDocument();

  const filterForm = useForm<FilterValues>({
    resolver: zodResolver(filterSchema),
    defaultValues: { search: '', projectId: '', category: '', status: '' }
  });

  const uploadForm = useForm<UploadValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: { projectId: '', title: '', category: '', documentNo: '' }
  });

  useEffect(() => {
    if (canCompanyUpload || projectOptions.length === 0 || uploadForm.getValues('projectId')) return;
    uploadForm.setValue('projectId', projectOptions[0]?.id ?? '');
  }, [canCompanyUpload, projectOptions, uploadForm]);

  const pageCount = documentsQuery.data
    ? Math.max(1, Math.ceil(documentsQuery.data.total / documentsQuery.data.pageSize))
    : 1;

  /** Apply the bounded list filters and return to the first page. */
  function applyFilters(values: FilterValues): void {
    setFilters({
      ...(values.search ? { search: values.search } : {}),
      ...(values.projectId ? { projectId: values.projectId } : {}),
      ...(values.category ? { category: values.category } : {}),
      ...(values.status ? { status: values.status } : {})
    });
    setPage(1);
  }

  /** Upload one file through the signed Module 21 upload flow. */
  async function uploadDocument(values: UploadValues): Promise<void> {
    const file = values.file.item(0);
    if (!file) return;

    const result = await uploadMutation.mutateAsync({
      file,
      title: values.title,
      category: values.category,
      projectId: values.projectId || null,
      documentNo: values.documentNo || null
    });

    uploadForm.reset({ projectId: values.projectId, title: '', category: '', documentNo: '' });
    setPage(1);
    props.onSelectDocument(result.document.id);
  }

  return (
    <div className="admin-stack">
      {canUpload && (
        <section className="admin-card">
          <h2>Upload document</h2>
          <form className="admin-form" onSubmit={uploadForm.handleSubmit(uploadDocument)} noValidate>
            <label>
              Document Project
              <select {...uploadForm.register('projectId')}>
                {canCompanyUpload && <option value="">Company-wide</option>}
                {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.label}</option>)}
              </select>
            </label>
            <label>
              Title
              <input {...uploadForm.register('title')} />
            </label>
            {uploadForm.formState.errors.title && <span className="field-error">{uploadForm.formState.errors.title.message}</span>}

            <label>
              Category
              <input placeholder="drawing, invoice, evidence…" {...uploadForm.register('category')} />
            </label>
            {uploadForm.formState.errors.category && <span className="field-error">{uploadForm.formState.errors.category.message}</span>}

            <label>
              Document number <span className="muted">(optional)</span>
              <input {...uploadForm.register('documentNo')} />
            </label>

            <label className="file-dropzone">
              <strong>Choose one file</strong>
              <span className="muted">The browser uploads directly to the signed object-storage URL.</span>
              <input type="file" {...uploadForm.register('file')} />
            </label>
            {uploadForm.formState.errors.file && <span className="field-error">{uploadForm.formState.errors.file.message}</span>}
            {uploadMutation.error instanceof Error && <div className="form-error" role="alert">{uploadMutation.error.message}</div>}
            <button type="submit" disabled={uploadMutation.isPending}>
              {uploadMutation.isPending ? 'Uploading…' : 'Upload document'}
            </button>
          </form>
        </section>
      )}

      <section className="admin-card">
        <h2>Document browser</h2>
        <form className="document-filter-grid" onSubmit={filterForm.handleSubmit(applyFilters)} noValidate>
          <label>
            Search
            <input placeholder="Title or document number" {...filterForm.register('search')} />
          </label>
          <label>
            Project filter
            <select {...filterForm.register('projectId')}>
              <option value="">All accessible</option>
              {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.label}</option>)}
            </select>
          </label>
          <label>
            Category
            <input {...filterForm.register('category')} />
          </label>
          <label>
            Status
            <input placeholder="active" {...filterForm.register('status')} />
          </label>
          <button type="submit">Apply filters</button>
        </form>

        {documentsQuery.isPending && <p>Loading documents…</p>}
        {documentsQuery.error instanceof Error && <div className="form-error" role="alert">{documentsQuery.error.message}</div>}
        {documentsQuery.data && documentsQuery.data.items.length === 0 && <p className="muted">No documents match the current filters.</p>}

        {documentsQuery.data && documentsQuery.data.items.length > 0 && (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Project</th>
                  <th>File</th>
                  <th>Category</th>
                  <th>Current version</th>
                  <th>Status</th>
                  <th>Created / updated</th>
                </tr>
              </thead>
              <tbody>
                {documentsQuery.data.items.map((document) => (
                  <tr key={document.id} className={props.selectedDocumentId === document.id ? 'selected-row' : undefined}>
                    <td>
                      <button type="button" className="link-button" onClick={() => props.onSelectDocument(document.id)}>
                        {document.title}
                      </button>
                      <span>{document.documentNo ?? 'No document number'}</span>
                      <span>{document.id}</span>
                    </td>
                    <td>{document.projectId ?? 'Company-wide'}</td>
                    <td>
                      {document.fileName}
                      <span>{document.mimeType}</span>
                      <span>{document.sizeBytes.toLocaleString()} bytes</span>
                    </td>
                    <td>{document.category}</td>
                    <td>
                      {document.currentVersion ? `v${document.currentVersion.versionNo}` : '—'}
                      {document.currentVersion && (
                        <>
                          <span>{document.currentVersion.originalName}</span>
                          <span>{document.currentVersion.mimeType} · {document.currentVersion.sizeBytes.toLocaleString()} bytes</span>
                          <span>Revision: {document.currentVersion.revisionCode ?? '—'}</span>
                          <span>Version ID: {document.currentVersion.id}</span>
                          <span>Created by: {document.currentVersion.createdBy}</span>
                          <span>{new Date(document.currentVersion.createdAt).toLocaleString()}</span>
                        </>
                      )}
                    </td>
                    <td>{document.status}</td>
                    <td>
                      {document.createdBy}
                      <span>Created: {new Date(document.createdAt).toLocaleString()}</span>
                      <span>Updated: {new Date(document.updatedAt).toLocaleString()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {documentsQuery.data && (
          <p className="muted">
            {documentsQuery.data.total} document(s) · {documentsQuery.data.pageSize} per page · Accessible Projects: {documentsQuery.data.accessibleProjectIds?.join(', ') ?? 'All'}
          </p>
        )}

        <div className="pagination-row">
          <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            Previous
          </button>
          <span>Page {documentsQuery.data?.page ?? page} of {pageCount}</span>
          <button type="button" className="secondary-button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
