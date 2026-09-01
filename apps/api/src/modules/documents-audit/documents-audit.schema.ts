import {
  AppError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError
} from '@construction-erp/errors';
import { z } from 'zod';

/** Final Module 21 boundary constants shared by repository, service, routes and tests. */
export const MODULE_21_MAX_PAGE_SIZE = 100;

export const MODULE_21_PERMISSION_CODES = Object.freeze([
  'documents.read',
  'documents.upload',
  'documents.link',
  'documents.version',
  'audit.read',
  'audit.export'
] as const);

export const MODULE_21_ERROR_CODES = Object.freeze([
  'DOCUMENT_NOT_FOUND',
  'DOCUMENT_UPLOAD_INVALID',
  'DOCUMENT_SCOPE_FORBIDDEN',
  'DOCUMENT_LINK_INVALID',
  'AUDIT_SCOPE_FORBIDDEN'
] as const);

export const MODULE_21_EVENT_TYPES = Object.freeze([
  'document.created',
  'document.version_added',
  'document.linked',
  'document.unlinked'
] as const);

/** Exact Final-21 Module 21 route contract from the controlling requirements. */
export const MODULE_21_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'POST', route: '/api/v1/documents/uploads/init' }),
  Object.freeze({ method: 'POST', route: '/api/v1/documents/uploads/complete' }),
  Object.freeze({ method: 'GET', route: '/api/v1/documents/:id' }),
  Object.freeze({ method: 'POST', route: '/api/v1/documents/:id/versions' }),
  Object.freeze({ method: 'POST', route: '/api/v1/documents/:id/links' }),
  Object.freeze({ method: 'DELETE', route: '/api/v1/documents/:id/links/:linkId' }),
  Object.freeze({ method: 'GET', route: '/api/v1/documents/:id/download' }),
  Object.freeze({ method: 'GET', route: '/api/v1/audit-logs' })
] as const);

/** One bounded list read retained for the required React document browser. */
export const DOCUMENT_BROWSER_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/documents' })
] as const);

export type Module21PermissionCode = (typeof MODULE_21_PERMISSION_CODES)[number];
export type Module21ErrorCode = (typeof MODULE_21_ERROR_CODES)[number];
export type Module21EventType = (typeof MODULE_21_EVENT_TYPES)[number];

/** Resource types whose owner modules exist at the current generation stage. */
export const DOCUMENT_LINK_RESOURCE_TYPES = Object.freeze([
  'project',
  'employee',
  'project_stage',
  'client_invoice',
  'client_receipt',
  'supplier_invoice',
  'site_expense'
] as const);

export type DocumentLinkResourceType = (typeof DOCUMENT_LINK_RESOURCE_TYPES)[number];

export const module21PermissionCodeSchema = z.enum(MODULE_21_PERMISSION_CODES);
export const module21ErrorCodeSchema = z.enum(MODULE_21_ERROR_CODES);

const uuidSchema = z.string().uuid();
const shortTextSchema = z.string().trim().min(1).max(100);
const titleSchema = z.string().trim().min(1).max(300);
const documentNoSchema = z.string().trim().min(1).max(120);
const fileNameSchema = z.string().trim().min(1).max(500);
const mimeTypeSchema = z.string().trim().min(1).max(255);
const checksumSchema = z.string().regex(/^[A-Za-z0-9+/]{43}=$/, 'checksum must be a base64 SHA-256 value');
const revisionCodeSchema = z.string().trim().min(1).max(100);
const searchSchema = z.string().trim().min(1).max(200);
const sizeBytesSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

const paginationQueryShape = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(MODULE_21_MAX_PAGE_SIZE).optional()
} as const;

/** Shared :id path contract for document routes. */
export const documentIdParamsSchema = z.object({ id: uuidSchema }).strict();

/** Document/link path contract for controlled unlinking. */
export const documentLinkIdParamsSchema = z.object({
  id: uuidSchema,
  linkId: uuidSchema
}).strict();

/** Create the first upload intent for a company-wide or Project-scoped document. */
export const createUploadIntentBodySchema = z.object({
  projectId: uuidSchema.nullable().optional(),
  title: titleSchema,
  documentNo: documentNoSchema.nullable().optional(),
  category: shortTextSchema,
  originalName: fileNameSchema,
  mimeType: mimeTypeSchema,
  sizeBytes: sizeBytesSchema,
  checksum: checksumSchema
}).strict();

/** Create an upload intent for the next immutable version of a document. */
export const createVersionUploadIntentBodySchema = z.object({
  originalName: fileNameSchema,
  mimeType: mimeTypeSchema,
  sizeBytes: sizeBytesSchema,
  checksum: checksumSchema,
  revisionCode: revisionCodeSchema.nullable().optional()
}).strict();

/** Final upload completion identifies the server-owned upload intent only. */
export const completeDocumentUploadBodySchema = z.object({
  uploadIntentId: uuidSchema
}).strict();

/** Bounded filters for the required document browser. */
export const listDocumentsQuerySchema = z.object({
  search: searchSchema.optional(),
  projectId: uuidSchema.optional(),
  category: shortTextSchema.optional(),
  status: shortTextSchema.optional(),
  ...paginationQueryShape
}).strict();

/** Bounded filters for the append-only audit read surface. */
export const listAuditLogsQuerySchema = z.object({
  actorUserId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  stageId: uuidSchema.optional(),
  resourceType: shortTextSchema.optional(),
  resourceId: z.string().trim().min(1).max(128).optional(),
  action: shortTextSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  ...paginationQueryShape
}).strict().refine(
  (value) => !value.from || !value.to || value.from <= value.to,
  { message: 'from must be on or before to', path: ['from'] }
);

/** Link one document version to an allow-listed same-company ERP resource. */
export const createDocumentLinkBodySchema = z.object({
  versionId: uuidSchema.nullable().optional(),
  resourceType: z.enum(DOCUMENT_LINK_RESOURCE_TYPES),
  resourceId: uuidSchema
}).strict();

export type DocumentIdParams = z.infer<typeof documentIdParamsSchema>;
export type DocumentLinkIdParams = z.infer<typeof documentLinkIdParamsSchema>;
export type CreateUploadIntentBody = z.infer<typeof createUploadIntentBodySchema>;
export type CreateVersionUploadIntentBody = z.infer<typeof createVersionUploadIntentBodySchema>;
export type CompleteDocumentUploadBody = z.infer<typeof completeDocumentUploadBodySchema>;
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
export type CreateDocumentLinkBody = z.infer<typeof createDocumentLinkBodySchema>;

const MODULE_21_ERROR_MESSAGES: Readonly<Record<Module21ErrorCode, string>> = Object.freeze({
  DOCUMENT_NOT_FOUND: 'The requested document was not found.',
  DOCUMENT_UPLOAD_INVALID: 'The upload intent or document version is invalid.',
  DOCUMENT_SCOPE_FORBIDDEN: 'You are not allowed to access this document.',
  DOCUMENT_LINK_INVALID: 'The document link target is invalid or unavailable.',
  AUDIT_SCOPE_FORBIDDEN: 'You are not allowed to access this audit scope.'
});

/** Map each documented Module 21 business code to one public HTTP error type. */
export function createModule21Error(code: Module21ErrorCode): AppError {
  const message = MODULE_21_ERROR_MESSAGES[code];

  switch (code) {
    case 'DOCUMENT_NOT_FOUND':
      return new NotFoundError({ code, message });
    case 'DOCUMENT_SCOPE_FORBIDDEN':
    case 'AUDIT_SCOPE_FORBIDDEN':
      return new AuthorizationError({ code, message });
    case 'DOCUMENT_LINK_INVALID':
      return new ValidationError({ code, message });
    case 'DOCUMENT_UPLOAD_INVALID':
      return new ConflictError({ code, message });
  }
}
