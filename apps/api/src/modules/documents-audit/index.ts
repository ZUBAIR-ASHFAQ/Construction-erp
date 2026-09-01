export {
  DOCUMENT_BROWSER_HTTP_ROUTES,
  DOCUMENT_LINK_RESOURCE_TYPES,
  MODULE_21_ERROR_CODES,
  MODULE_21_EVENT_TYPES,
  MODULE_21_HTTP_ROUTES,
  MODULE_21_MAX_PAGE_SIZE,
  MODULE_21_PERMISSION_CODES,
  completeDocumentUploadBodySchema,
  createDocumentLinkBodySchema,
  createModule21Error,
  createUploadIntentBodySchema,
  createVersionUploadIntentBodySchema,
  documentIdParamsSchema,
  documentLinkIdParamsSchema,
  listAuditLogsQuerySchema,
  listDocumentsQuerySchema,
  module21ErrorCodeSchema,
  module21PermissionCodeSchema
} from './documents-audit.schema.js';
export type {
  CompleteDocumentUploadBody,
  CreateDocumentLinkBody,
  CreateUploadIntentBody,
  CreateVersionUploadIntentBody,
  DocumentIdParams,
  DocumentLinkIdParams,
  DocumentLinkResourceType,
  ListAuditLogsQuery,
  ListDocumentsQuery,
  Module21ErrorCode,
  Module21EventType,
  Module21PermissionCode
} from './documents-audit.schema.js';

export { DocumentsRepository } from './documents-audit.repository.js';
export type {
  CreateDocumentLinkRepositoryInput,
  CreateDocumentRepositoryInput,
  CreateDocumentVersionRepositoryInput,
  CreateUploadIntentRepositoryInput,
  LinkableDocumentResource,
  ListAuditLogsRepositoryInput,
  ListDocumentsRepositoryInput
} from './documents-audit.repository.js';

export { DocumentsService } from './documents-audit.service.js';
export type { DocumentsUploadPolicy, LinkDocumentToResourceInput } from './documents-audit.service.js';

export { registerDocumentsRoutes } from './documents-audit.routes.js';
export type { DocumentsRoutesOptions } from './documents-audit.routes.js';
