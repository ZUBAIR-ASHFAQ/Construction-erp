import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  useCreateDocumentLink,
  useDeleteDocumentLink,
  useDocument,
  useDocumentDownload,
  useUploadDocumentVersion
} from '../hooks/documents.js';
import type { DocumentLinkResourceType } from '../api/documents-api.js';

const documentLinkResourceTypes = [
  'project',
  'employee',
  'project_stage',
  'client_invoice',
  'client_receipt',
  'supplier_invoice',
  'site_expense'
] as const satisfies readonly DocumentLinkResourceType[];

const versionUploadSchema = z.object({
  revisionCode: z.string().trim().max(100),
  file: z.custom<FileList>(
    (value) => typeof FileList !== 'undefined' && value instanceof FileList && value.length === 1,
    'Choose one file.'
  )
});

const documentLinkSchema = z.object({
  versionId: z.string().trim(),
  resourceType: z.enum(documentLinkResourceTypes),
  resourceId: z.string().uuid('Use a valid resource UUID.')
});

type VersionUploadValues = z.infer<typeof versionUploadSchema>;
type DocumentLinkValues = z.infer<typeof documentLinkSchema>;

/** Show one document's metadata, immutable version history, links and allowed actions. */
export function DocumentDetailsPanel({ documentId }: Readonly<{ documentId: string | null }>) {
  const documentQuery = useDocument(documentId);
  const downloadMutation = useDocumentDownload();
  const versionMutation = useUploadDocumentVersion();
  const linkMutation = useCreateDocumentLink();
  const unlinkMutation = useDeleteDocumentLink();

  const versionForm = useForm<VersionUploadValues>({
    resolver: zodResolver(versionUploadSchema),
    defaultValues: { revisionCode: '' }
  });

  const linkForm = useForm<DocumentLinkValues>({
    resolver: zodResolver(documentLinkSchema),
    defaultValues: { versionId: '', resourceType: 'project', resourceId: '' }
  });

  if (!documentId) {
    return (
      <section className="admin-card">
        <h2>Document details</h2>
        <p className="muted">Select a document to view its versions, linked records and actions.</p>
      </section>
    );
  }

  if (documentQuery.isPending) {
    return <section className="admin-card"><p>Loading document…</p></section>;
  }

  if (documentQuery.error instanceof Error) {
    return <section className="admin-card"><div className="form-error" role="alert">{documentQuery.error.message}</div></section>;
  }

  const document = documentQuery.data;
  if (!document) return null;

  const currentDocumentId = document.id;
  const canVersion = document.capabilities.canVersion;
  const canLink = document.capabilities.canLink;
  const currentVersion = document.versions.find((version) => version.id === document.currentVersionId) ?? null;

  /** Ask the API to authorize the current file before opening its short-lived URL. */
  async function openCurrentVersion(): Promise<void> {
    const result = await downloadMutation.mutateAsync(currentDocumentId);
    window.open(result.url, '_blank', 'noopener,noreferrer');
  }

  /** Upload the next immutable version of this active document. */
  async function uploadNextVersion(values: VersionUploadValues): Promise<void> {
    const file = values.file.item(0);
    if (!file) return;

    await versionMutation.mutateAsync({
      documentId: currentDocumentId,
      file,
      revisionCode: values.revisionCode || null
    });
    versionForm.reset();
  }

  /** Link this document or one selected version to an approved ERP resource. */
  async function linkDocument(values: DocumentLinkValues): Promise<void> {
    await linkMutation.mutateAsync({
      documentId: currentDocumentId,
      link: {
        versionId: values.versionId || null,
        resourceType: values.resourceType,
        resourceId: values.resourceId
      }
    });
    linkForm.reset({ versionId: '', resourceType: values.resourceType, resourceId: '' });
  }

  /** Remove one existing resource link from this document. */
  async function unlinkDocument(linkId: string): Promise<void> {
    await unlinkMutation.mutateAsync({ documentId: currentDocumentId, linkId });
  }

  return (
    <section className="admin-card" aria-labelledby="document-detail-title">
      <div className="document-heading">
        <div>
          <p className="eyebrow">Module 21</p>
          <h2 id="document-detail-title">{document.title}</h2>
          <p className="muted">{document.documentNo ?? 'No document number'}</p>
        </div>
        <div className="action-row">
          {currentVersion && (
            <button type="button" className="secondary-button" onClick={() => void openCurrentVersion()} disabled={downloadMutation.isPending}>
              {downloadMutation.isPending ? 'Authorizing…' : 'Open / download'}
            </button>
          )}
        </div>
      </div>

      {downloadMutation.error instanceof Error && <div className="form-error" role="alert">{downloadMutation.error.message}</div>}

      <dl className="document-meta">
        <div><dt>Document ID</dt><dd>{document.id}</dd></div>
        <div><dt>Status</dt><dd>{document.status}</dd></div>
        <div><dt>Category</dt><dd>{document.category}</dd></div>
        <div><dt>Project</dt><dd>{document.projectId ?? 'Company-wide'}</dd></div>
        <div><dt>File</dt><dd>{document.fileName}</dd></div>
        <div><dt>MIME type</dt><dd>{document.mimeType}</dd></div>
        <div><dt>Size</dt><dd>{document.sizeBytes.toLocaleString()} bytes</dd></div>
        <div><dt>Current version ID</dt><dd>{document.currentVersionId ?? '—'}</dd></div>
        <div><dt>Can version</dt><dd>{document.capabilities.canVersion ? 'Yes' : 'No'}</dd></div>
        <div><dt>Can link</dt><dd>{document.capabilities.canLink ? 'Yes' : 'No'}</dd></div>
        <div><dt>Created by</dt><dd>{document.createdBy}</dd></div>
        <div><dt>Created</dt><dd>{new Date(document.createdAt).toLocaleString()}</dd></div>
        <div><dt>Updated</dt><dd>{new Date(document.updatedAt).toLocaleString()}</dd></div>
      </dl>

      {canVersion && (
        <div className="document-section">
          <h3>Upload new version</h3>
          <form className="admin-form" onSubmit={versionForm.handleSubmit(uploadNextVersion)} noValidate>
            <label>
              Revision code <span className="muted">(optional)</span>
              <input {...versionForm.register('revisionCode')} />
            </label>
            <label className="file-dropzone">
              <strong>Choose or drop one replacement file</strong>
              <span className="muted">The existing versions stay unchanged.</span>
              <input type="file" {...versionForm.register('file')} />
            </label>
            {versionForm.formState.errors.file && <span className="field-error">{versionForm.formState.errors.file.message}</span>}
            {versionMutation.error instanceof Error && <div className="form-error" role="alert">{versionMutation.error.message}</div>}
            <button type="submit" disabled={versionMutation.isPending}>
              {versionMutation.isPending ? 'Uploading…' : 'Upload next version'}
            </button>
          </form>
        </div>
      )}

      {canLink && (
        <div className="document-section">
          <h3>Link business record</h3>
          <form className="admin-form" onSubmit={linkForm.handleSubmit(linkDocument)} noValidate>
            <label>
              Version
              <select {...linkForm.register('versionId')}>
                <option value="">Current version</option>
                {document.versions.map((version) => (
                  <option key={version.id} value={version.id}>v{version.versionNo} · {version.originalName}</option>
                ))}
              </select>
            </label>
            <label>
              Resource type
              <select {...linkForm.register('resourceType')}>
                {documentLinkResourceTypes.map((resourceType) => (
                  <option key={resourceType} value={resourceType}>{resourceType.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </label>
            <label>
              Resource ID
              <input placeholder="Resource UUID" {...linkForm.register('resourceId')} />
            </label>
            {linkForm.formState.errors.resourceId && <span className="field-error">{linkForm.formState.errors.resourceId.message}</span>}
            {linkMutation.error instanceof Error && <div className="form-error" role="alert">{linkMutation.error.message}</div>}
            <button type="submit" disabled={linkMutation.isPending}>
              {linkMutation.isPending ? 'Linking…' : 'Link record'}
            </button>
          </form>
        </div>
      )}

      <div className="document-section">
        <h3>Version history</h3>
        {document.versions.length === 0 ? (
          <p className="muted">No versions are recorded.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Version</th><th>File</th><th>Revision</th><th>Size</th><th>Checksum</th><th>Created by</th><th>Created</th></tr>
              </thead>
              <tbody>
                {document.versions.map((version) => (
                  <tr key={version.id}>
                    <td>
                      v{version.versionNo}
                      {version.id === document.currentVersionId && <span>Current</span>}
                      <span>{version.id}</span>
                    </td>
                    <td>{version.originalName}<span>{version.mimeType}</span></td>
                    <td>{version.revisionCode ?? '—'}</td>
                    <td>{version.sizeBytes.toLocaleString()} bytes</td>
                    <td>{version.checksum}</td>
                    <td>{version.createdBy}</td>
                    <td>{new Date(version.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="document-section">
        <h3>Linked records</h3>
        {unlinkMutation.error instanceof Error && <div className="form-error" role="alert">{unlinkMutation.error.message}</div>}
        {document.links.length === 0 ? (
          <p className="muted">No business records are linked to this document yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Link ID</th><th>Resource</th><th>Resource ID</th><th>Version ID</th><th>Project</th><th>Stage</th><th>Created</th>{canLink && <th>Action</th>}</tr></thead>
              <tbody>
                {document.links.map((link) => (
                  <tr key={link.id}>
                    <td>{link.id}</td>
                    <td>{link.resourceType}</td>
                    <td>{link.resourceId}</td>
                    <td>{link.versionId ?? 'Current document'}</td>
                    <td>{link.projectId ?? '—'}</td>
                    <td>{link.stageId ?? '—'}</td>
                    <td>{new Date(link.createdAt).toLocaleString()}</td>
                    {canLink && (
                      <td>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={unlinkMutation.isPending}
                          onClick={() => void unlinkDocument(link.id)}
                        >
                          Unlink
                        </button>
                      </td>
                    )}
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
