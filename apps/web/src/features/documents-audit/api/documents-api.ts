import { authenticatedRequest } from '../../administration/api/auth-api.js';

export type DocumentVersion = Readonly<{
  id: string;
  versionNo: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  revisionCode: string | null;
  createdBy: string;
  createdAt: string;
}>;

export type DocumentListItem = Readonly<{
  id: string;
  projectId: string | null;
  title: string;
  documentNo: string | null;
  category: string;
  status: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdBy: string;
  currentVersion: DocumentVersion | null;
  createdAt: string;
  updatedAt: string;
}>;

export type DocumentLink = Readonly<{
  id: string;
  versionId: string | null;
  resourceType: string;
  resourceId: string;
  projectId: string | null;
  stageId: string | null;
  createdAt: string;
}>;

export type DocumentLinkResourceType =
  | 'project'
  | 'employee'
  | 'project_stage'
  | 'client_invoice'
  | 'client_receipt'
  | 'supplier_invoice'
  | 'site_expense';

export type CreateDocumentLinkInput = Readonly<{
  versionId?: string | null;
  resourceType: DocumentLinkResourceType;
  resourceId: string;
}>;

export type DocumentLinkResult = DocumentLink & Readonly<{ documentId: string }>;

export type DeleteDocumentLinkResult = Readonly<{
  id: string;
  documentId: string;
  unlinked: true;
}>;

export type DocumentDetails = Readonly<{
  id: string;
  projectId: string | null;
  title: string;
  documentNo: string | null;
  category: string;
  status: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdBy: string;
  currentVersionId: string | null;
  versions: Array<DocumentVersion & Readonly<{ checksum: string }>>;
  links: DocumentLink[];
  capabilities: Readonly<{
    canVersion: boolean;
    canLink: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
}>;

export type DocumentPage = Readonly<{
  items: DocumentListItem[];
  accessibleProjectIds: string[] | null;
  page: number;
  pageSize: number;
  total: number;
}>;

export type ListDocumentsInput = Readonly<{
  search?: string;
  projectId?: string;
  category?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}>;

export type UploadDocumentInput = Readonly<{
  file: File;
  title: string;
  category: string;
  projectId?: string | null;
  documentNo?: string | null;
}>;

export type UploadDocumentVersionInput = Readonly<{
  documentId: string;
  file: File;
  revisionCode?: string | null;
}>;

export type UploadIntent = Readonly<{
  id: string;
  uploadUrl: string;
  expiresAt: string;
  headers: Readonly<Record<string, string>>;
}>;

export type CompletedUpload = Readonly<{
  document: Readonly<{
    id: string;
    title: string;
    documentNo: string | null;
    category: string;
    status: string;
    projectId: string | null;
      fileName: string;
    mimeType: string;
    sizeBytes: number;
    createdBy: string;
    currentVersionId: string;
  }>;
  version: Readonly<{
    id: string;
    versionNo: number;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    checksum: string;
    revisionCode: string | null;
    createdBy: string;
    createdAt: string;
  }>;
}>;

export type DownloadResult = Readonly<{
  url: string;
  expiresAt: string;
  version: Readonly<{
    id: string;
    versionNo: number;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}>;

/** Load one company-scoped page of documents. */
export function listDocuments(input: ListDocumentsInput = {}): Promise<DocumentPage> {
  const query = new URLSearchParams();

  if (input.search) query.set('search', input.search);
  if (input.projectId) query.set('projectId', input.projectId);
  if (input.category) query.set('category', input.category);
  if (input.status) query.set('status', input.status);
  if (input.page !== undefined) query.set('page', String(input.page));
  if (input.pageSize !== undefined) query.set('pageSize', String(input.pageSize));

  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return authenticatedRequest<DocumentPage>(`documents${suffix}`);
}

/** Load document metadata, version history and linked records. */
export function getDocument(documentId: string): Promise<DocumentDetails> {
  return authenticatedRequest<DocumentDetails>(`documents/${documentId}`);
}

/** Link one document version to an approved ERP resource. */
export function createDocumentLink(documentId: string, input: CreateDocumentLinkInput): Promise<DocumentLinkResult> {
  return authenticatedRequest<DocumentLinkResult>(`documents/${documentId}/links`, {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

/** Remove one existing document/resource link without deleting the document. */
export function deleteDocumentLink(documentId: string, linkId: string): Promise<DeleteDocumentLinkResult> {
  return authenticatedRequest<DeleteDocumentLinkResult>(`documents/${documentId}/links/${linkId}`, {
    method: 'DELETE'
  });
}

/** Ask the ERP API for a short-lived direct-upload URL for a new document. */
export function createUploadIntent(input: Readonly<{
  projectId?: string | null;
  title: string;
  category: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  documentNo?: string | null;
}>): Promise<UploadIntent> {
  return authenticatedRequest<UploadIntent>('documents/uploads/init', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

/** Ask for a direct-upload URL for the next immutable document version. */
export function createVersionUploadIntent(documentId: string, input: Readonly<{
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  revisionCode?: string | null;
}>): Promise<UploadIntent> {
  return authenticatedRequest<UploadIntent>(`documents/${documentId}/versions`, {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

/** Tell the ERP API to verify the uploaded object and create its version metadata. */
export function completeUploadIntent(intentId: string): Promise<CompletedUpload> {
  return authenticatedRequest<CompletedUpload>('documents/uploads/complete', {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ uploadIntentId: intentId })
  });
}

/** Return the current version's authorized short-lived download URL. */
export function getDocumentDownload(documentId: string): Promise<DownloadResult> {
  return authenticatedRequest<DownloadResult>(`documents/${documentId}/download`);
}

export type AuditLogItem = Readonly<{
  id: string;
  actorUserId: string | null;
  actor: Readonly<{ id: string; name: string; email: string }> | null;
  projectId: string | null;
  stageId: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}>;

export type AuditLogPage = Readonly<{
  items: AuditLogItem[];
  page: number;
  pageSize: number;
  total: number;
}>;

export type ListAuditLogsInput = Readonly<{
  actorUserId?: string;
  projectId?: string;
  stageId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}>;

/** Search permission-safe append-only audit history. */
export function listAuditLogs(input: ListAuditLogsInput = {}): Promise<AuditLogPage> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return authenticatedRequest<AuditLogPage>(`audit-logs${suffix}`);
}

/** Upload a new document using the server-issued signed URL, then complete it. */
export async function uploadDocument(input: UploadDocumentInput): Promise<CompletedUpload> {
  const checksum = await sha256Base64(input.file);
  const intent = await createUploadIntent({
    title: input.title,
    category: input.category,
    originalName: input.file.name,
    mimeType: input.file.type || 'application/octet-stream',
    sizeBytes: input.file.size,
    checksum,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.documentNo !== undefined ? { documentNo: input.documentNo } : {})
  });

  await uploadFile(intent, input.file);
  return completeUploadIntent(intent.id);
}

/** Upload the next immutable version of an existing document. */
export async function uploadDocumentVersion(input: UploadDocumentVersionInput): Promise<CompletedUpload> {
  const checksum = await sha256Base64(input.file);
  const intent = await createVersionUploadIntent(input.documentId, {
    originalName: input.file.name,
    mimeType: input.file.type || 'application/octet-stream',
    sizeBytes: input.file.size,
    checksum,
    ...(input.revisionCode !== undefined ? { revisionCode: input.revisionCode } : {})
  });

  await uploadFile(intent, input.file);
  return completeUploadIntent(intent.id);
}

/** Compute the base64 SHA-256 checksum expected by the signed-upload contract. */
async function sha256Base64(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** PUT the binary directly to object storage; the ERP API never receives the file bytes. */
async function uploadFile(intent: UploadIntent, file: File): Promise<void> {
  const response = await fetch(intent.uploadUrl, {
    method: 'PUT',
    headers: intent.headers,
    body: file
  });

  if (!response.ok) {
    throw new Error('The file upload failed. Please try again.');
  }
}
