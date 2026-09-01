import { randomUUID } from 'node:crypto';
import { recordAudit } from '@construction-erp/audit';
import { withTransaction, type DatabaseClient, type TransactionClient } from '@construction-erp/database';
import { executeIdempotentCommand } from '@construction-erp/idempotency';
import { recordOutboxEvent } from '@construction-erp/outbox';
import { hasPermission, requireRequestSecurityContext } from '@construction-erp/request-context';
import { assertCompanyObjectKey, buildCompanyObjectKey, type ObjectStorage } from '@construction-erp/storage';
import { AdministrationRepository } from '../administration/administration.repository.js';
import { DocumentsRepository } from './documents-audit.repository.js';
import {
  createModule21Error,
  DOCUMENT_LINK_RESOURCE_TYPES,
  type CreateUploadIntentBody,
  type CreateVersionUploadIntentBody,
  type DocumentLinkResourceType,
  type ListAuditLogsQuery,
  type ListDocumentsQuery,
  type Module21PermissionCode
} from './documents-audit.schema.js';

const ACTIVE = 'ACTIVE';

type StoredUploadIntent = NonNullable<Awaited<ReturnType<DocumentsRepository['findUploadIntentById']>>>;
type StoredDocument = Awaited<ReturnType<DocumentsRepository['createDocument']>>;
type StoredDocumentVersion = NonNullable<Awaited<ReturnType<DocumentsRepository['createDocumentVersion']>>>;

export type DocumentsUploadPolicy = Readonly<{
  maxSizeBytes: number;
  allowedMimeTypes: readonly string[];
  signedUrlTtlSeconds: number;
}>;

export type LinkDocumentToResourceInput = Readonly<{
  documentId: string;
  versionId?: string | null | undefined;
  linkedResourceType: string;
  linkedResourceId: string;
}>;

export class DocumentsService {
  private readonly repository: DocumentsRepository;
  private readonly usersRepository: AdministrationRepository;

  /** Bind Module 21 to the database, object storage, and upload policy. */
  constructor(
    private readonly db: DatabaseClient,
    private readonly storage: ObjectStorage,
    private readonly uploadPolicy: DocumentsUploadPolicy
  ) {
    this.repository = new DocumentsRepository(db);
    this.usersRepository = new AdministrationRepository(db);
  }


  /** Require one company-wide Document permission from trusted request context. */
  private requireCompanyPermission(permission: Module21PermissionCode): void {
    if (!hasPermission(permission)) throw createModule21Error('DOCUMENT_SCOPE_FORBIDDEN');
  }

  /** Require membership scope plus one exact effective permission for a Project. */
  private async requireProjectPermission(
    repository: AdministrationRepository,
    projectId: string,
    permission: Module21PermissionCode,
    asOf: Date
  ): Promise<void> {
    const security = requireRequestSecurityContext();
    const scope = security.projectScope;

    if (scope.kind === 'not-resolved') throw createModule21Error('DOCUMENT_SCOPE_FORBIDDEN');
    if (scope.kind === 'restricted' && !scope.projectIds.includes(projectId)) {
      throw createModule21Error('DOCUMENT_SCOPE_FORBIDDEN');
    }

    const permissions = await repository.findEffectivePermissionCodesForProject(projectId, {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ACTIVE],
      roleStatuses: [ACTIVE]
    });
    if (permissions === null || !permissions.includes(permission)) {
      throw createModule21Error('DOCUMENT_SCOPE_FORBIDDEN');
    }
  }

  /** Require one business-module permission at company level or for the exact linked Project. */
  private async requireLinkedProjectPermission(
    repository: AdministrationRepository,
    projectId: string,
    permission: string,
    asOf: Date
  ): Promise<void> {
    const security = requireRequestSecurityContext();
    const scope = security.projectScope;
    if (scope.kind === 'not-resolved') throw createModule21Error('DOCUMENT_SCOPE_FORBIDDEN');
    if (scope.kind === 'restricted' && !scope.projectIds.includes(projectId)) {
      throw createModule21Error('DOCUMENT_SCOPE_FORBIDDEN');
    }
    if (security.permissions.includes(permission)) return;

    const permissions = await repository.findEffectivePermissionCodesForProject(projectId, {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ACTIVE],
      roleStatuses: [ACTIVE]
    });
    if (permissions === null || !permissions.includes(permission)) {
      throw createModule21Error('DOCUMENT_SCOPE_FORBIDDEN');
    }
  }

  /** Require the correct company-wide or exact-Project permission for one Document resource. */
  private async requireDocumentPermission(
    repository: AdministrationRepository,
    projectId: string | null,
    companyPermission: Module21PermissionCode,
    projectPermission: Module21PermissionCode,
    asOf: Date
  ): Promise<void> {
    if (projectId === null) {
      this.requireCompanyPermission(companyPermission);
      return;
    }

    await this.requireProjectPermission(repository, projectId, projectPermission, asOf);
  }

  /** Resolve company-wide and Project IDs that may appear in Document list results. */
  private async resolveReadVisibility(repository: AdministrationRepository, asOf: Date) {
    const security = requireRequestSecurityContext();
    const scope = security.projectScope;
    if (scope.kind === 'not-resolved') throw createModule21Error('DOCUMENT_SCOPE_FORBIDDEN');

    const includeCompanyWide = security.permissions.includes('documents.read');
    const allowedProjectIds = await repository.listProjectIdsWithPermission(
      'documents.read',
      scope.kind === 'all' ? null : scope.projectIds,
      {
        userId: security.actorUserId,
        asOf,
        assignmentStatuses: [ACTIVE],
        roleStatuses: [ACTIVE]
      }
    );

    if (!includeCompanyWide && allowedProjectIds !== null && allowedProjectIds.length === 0) {
      throw createModule21Error('DOCUMENT_SCOPE_FORBIDDEN');
    }

    return { includeCompanyWide, allowedProjectIds } as const;
  }

  /** Resolve normal visibility or narrow one list to one explicitly requested Project. */
  private async resolveRequestedReadVisibility(projectId: string | undefined, asOf: Date) {
    if (!projectId) return this.resolveReadVisibility(this.usersRepository, asOf);
    await this.requireProjectPermission(this.usersRepository, projectId, 'documents.read', asOf);
    return { includeCompanyWide: false, allowedProjectIds: [projectId] } as const;
  }

  /** Resolve version/link action visibility from trusted company or exact Project permissions. */
  private async resolveDocumentCapabilities(projectId: string | null, asOf: Date) {
    const security = requireRequestSecurityContext();
    if (projectId === null) {
      return {
        canVersion: security.permissions.includes('documents.version'),
        canLink: security.permissions.includes('documents.link')
      } as const;
    }

    const scope = security.projectScope;
    if (scope.kind === 'not-resolved' || (scope.kind === 'restricted' && !scope.projectIds.includes(projectId))) {
      return { canVersion: false, canLink: false } as const;
    }

    const permissions = await this.usersRepository.findEffectivePermissionCodesForProject(projectId, {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ACTIVE],
      roleStatuses: [ACTIVE]
    });
    return {
      canVersion: permissions?.includes('documents.version') ?? false,
      canLink: permissions?.includes('documents.link') ?? false
    } as const;
  }

  /** Re-authorize an upload intent using its trusted persisted Project target. */
  private async requireUploadIntentPermission(
    repository: AdministrationRepository,
    projectId: string | null,
    documentId: string | null,
    asOf: Date
  ): Promise<void> {
    const permission: Module21PermissionCode = documentId ? 'documents.version' : 'documents.upload';
    await this.requireDocumentPermission(repository, projectId, permission, permission, asOf);
  }

  /** Create a signed upload URL for the first immutable document version. */
  async createUploadIntent(input: CreateUploadIntentBody) {
    const security = requireRequestSecurityContext();
    const projectId = input.projectId ?? null;

    await this.requireDocumentPermission(
      this.usersRepository,
      projectId,
      'documents.upload',
      'documents.upload',
      new Date()
    );

    if (input.sizeBytes > this.uploadPolicy.maxSizeBytes) {
      throw createModule21Error('DOCUMENT_UPLOAD_INVALID');
    }

    const mimeTypeAllowed = this.uploadPolicy.allowedMimeTypes.some(
      (value) => value.toLowerCase() === input.mimeType.toLowerCase()
    );
    if (!mimeTypeAllowed) throw createModule21Error('DOCUMENT_UPLOAD_INVALID');

    const intentId = randomUUID();
    const documentId = randomUUID();
    const versionId = randomUUID();
    const storageKey = buildCompanyObjectKey({
      namespace: 'documents',
      objectId: documentId,
      versionId
    });

    const signedUpload = await this.storage.createSignedUploadUrl({
      key: storageKey,
      contentType: input.mimeType,
      checksumSha256: input.checksum,
      expiresInSeconds: this.uploadPolicy.signedUrlTtlSeconds
    });

    await this.repository.createUploadIntent({
      id: intentId,
      projectId,
      actorUserId: security.actorUserId,
      targetDocumentId: documentId,
      versionId,
      title: input.title,
      documentNo: input.documentNo,
      category: input.category,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: BigInt(input.sizeBytes),
      checksum: input.checksum,
      storageKey,
      expiresAt: signedUpload.expiresAt
    });

    return {
      id: intentId,
      uploadUrl: signedUpload.url,
      expiresAt: signedUpload.expiresAt.toISOString(),
      headers: {
        'content-type': input.mimeType,
        'if-none-match': '*',
        'x-amz-checksum-sha256': input.checksum
      }
    };
  }

  /** Create a signed upload URL for the next version of an existing document. */
  async createVersionUploadIntent(documentId: string, input: CreateVersionUploadIntentBody) {
    const security = requireRequestSecurityContext();
    const document = await this.repository.findDocumentById(documentId);
    if (!document) throw createModule21Error('DOCUMENT_NOT_FOUND');

    await this.requireDocumentPermission(
      this.usersRepository,
      document.projectId,
      'documents.version',
      'documents.version',
      new Date()
    );
    if (document.status !== 'active') throw createModule21Error('DOCUMENT_UPLOAD_INVALID');

    if (input.sizeBytes > this.uploadPolicy.maxSizeBytes) {
      throw createModule21Error('DOCUMENT_UPLOAD_INVALID');
    }

    const mimeTypeAllowed = this.uploadPolicy.allowedMimeTypes.some(
      (value) => value.toLowerCase() === input.mimeType.toLowerCase()
    );
    if (!mimeTypeAllowed) throw createModule21Error('DOCUMENT_UPLOAD_INVALID');

    const intentId = randomUUID();
    const versionId = randomUUID();
    const storageKey = buildCompanyObjectKey({
      namespace: 'documents',
      objectId: document.id,
      versionId
    });

    const signedUpload = await this.storage.createSignedUploadUrl({
      key: storageKey,
      contentType: input.mimeType,
      checksumSha256: input.checksum,
      expiresInSeconds: this.uploadPolicy.signedUrlTtlSeconds
    });

    await this.repository.createUploadIntent({
      id: intentId,
      projectId: document.projectId,
      actorUserId: security.actorUserId,
      targetDocumentId: document.id,
      documentId: document.id,
      versionId,
      title: document.title,
      documentNo: document.documentNo,
      category: document.category,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: BigInt(input.sizeBytes),
      checksum: input.checksum,
      revisionCode: input.revisionCode,
      storageKey,
      expiresAt: signedUpload.expiresAt
    });

    return {
      id: intentId,
      uploadUrl: signedUpload.url,
      expiresAt: signedUpload.expiresAt.toISOString(),
      headers: {
        'content-type': input.mimeType,
        'if-none-match': '*',
        'x-amz-checksum-sha256': input.checksum
      }
    };
  }

  /** Link an authorized Document version to one allow-listed same-company ERP resource. */
  async linkDocumentToResource(input: LinkDocumentToResourceInput) {
    const resourceType = input.linkedResourceType.trim() as DocumentLinkResourceType;
    if (!DOCUMENT_LINK_RESOURCE_TYPES.includes(resourceType)) {
      throw createModule21Error('DOCUMENT_LINK_INVALID');
    }

    return withTransaction(this.db, async (tx) => {
      const repository = new DocumentsRepository(tx);
      const usersRepository = new AdministrationRepository(tx);
      const document = await repository.findDocumentById(input.documentId);
      if (!document) throw createModule21Error('DOCUMENT_NOT_FOUND');
      if (document.status !== 'active') throw createModule21Error('DOCUMENT_UPLOAD_INVALID');

      await this.requireDocumentPermission(
        usersRepository,
        document.projectId,
        'documents.link',
        'documents.link',
        new Date()
      );

      if (resourceType === 'employee' && !hasPermission('employees.read')) {
        throw createModule21Error('DOCUMENT_SCOPE_FORBIDDEN');
      }
      if (resourceType === 'project_stage' && !hasPermission('stages.read')) {
        throw createModule21Error('DOCUMENT_SCOPE_FORBIDDEN');
      }
      if (
        resourceType === 'client_invoice'
        && !hasPermission('client_invoices.read')
        && !hasPermission('client_billing.read')
      ) {
        throw createModule21Error('DOCUMENT_SCOPE_FORBIDDEN');
      }

      const resource = await repository.findLinkableResource(resourceType, input.linkedResourceId);
      if (!resource) throw createModule21Error('DOCUMENT_LINK_INVALID');
      if (resourceType === 'supplier_invoice') {
        if (!resource.projectId) throw createModule21Error('DOCUMENT_LINK_INVALID');
        await this.requireLinkedProjectPermission(usersRepository, resource.projectId, 'supplier_payables.read', new Date());
      }
      if (resourceType === 'client_receipt') {
        if (!resource.projectId) throw createModule21Error('DOCUMENT_LINK_INVALID');
        await this.requireLinkedProjectPermission(usersRepository, resource.projectId, 'client_receipts.read', new Date());
      }
      if (resourceType === 'site_expense') {
        if (!resource.projectId) throw createModule21Error('DOCUMENT_LINK_INVALID');
        await this.requireLinkedProjectPermission(usersRepository, resource.projectId, 'site_expenses.read', new Date());
      }
      if (document.projectId && resource.projectId && document.projectId !== resource.projectId) {
        throw createModule21Error('DOCUMENT_LINK_INVALID');
      }
      if (resource.projectId && resource.projectId !== document.projectId) {
        await this.requireProjectPermission(usersRepository, resource.projectId, 'documents.link', new Date());
      }

      const versionId = input.versionId ?? document.currentVersionId;
      if (versionId && !(await repository.findDocumentVersion(document.id, versionId))) {
        throw createModule21Error('DOCUMENT_LINK_INVALID');
      }

      const security = requireRequestSecurityContext();
      const result = await repository.createDocumentLink({
        documentId: document.id,
        versionId: versionId ?? null,
        linkedResourceType: resourceType,
        linkedResourceId: resource.id,
        projectId: resource.projectId ?? document.projectId,
        stageId: resource.stageId,
        createdBy: security.actorUserId
      });
      if (!result) throw createModule21Error('DOCUMENT_NOT_FOUND');

      if (result.created) {
        await recordAudit(tx, {
          action: 'document.linked',
          entityType: 'document',
          entityId: document.id,
          after: {
            projectId: result.link.projectId,
            versionId: result.link.versionId,
            resourceType: result.link.linkedResourceType,
            resourceId: result.link.linkedResourceId
          }
        });

        await recordOutboxEvent(tx, {
          eventType: 'document.linked',
          resourceType: 'document',
          resourceId: document.id,
          payload: {
            documentId: document.id,
            linkId: result.link.id,
            projectId: result.link.projectId,
            resourceType: result.link.linkedResourceType,
            resourceId: result.link.linkedResourceId
          }
        });
      }

      return {
        id: result.link.id,
        documentId: result.link.documentId,
        versionId: result.link.versionId,
        resourceType: result.link.linkedResourceType,
        resourceId: result.link.linkedResourceId,
        projectId: result.link.projectId,
        stageId: result.link.stageId,
        createdAt: result.link.createdAt.toISOString()
      };
    });
  }

  /** Remove one authorized Document link while preserving Document and version history. */
  async unlinkDocumentFromResource(documentId: string, linkId: string) {
    return withTransaction(this.db, async (tx) => {
      const repository = new DocumentsRepository(tx);
      const usersRepository = new AdministrationRepository(tx);
      const document = await repository.findDocumentById(documentId);
      if (!document) throw createModule21Error('DOCUMENT_NOT_FOUND');

      await this.requireDocumentPermission(
        usersRepository,
        document.projectId,
        'documents.link',
        'documents.link',
        new Date()
      );

      const link = await repository.findDocumentLink(document.id, linkId);
      if (!link) throw createModule21Error('DOCUMENT_LINK_INVALID');
      if (link.linkedResourceType === 'employee' && !hasPermission('employees.read')) {
        throw createModule21Error('DOCUMENT_SCOPE_FORBIDDEN');
      }
      if (link.linkedResourceType === 'project_stage' && !hasPermission('stages.read')) {
        throw createModule21Error('DOCUMENT_SCOPE_FORBIDDEN');
      }
      if (
        link.linkedResourceType === 'client_invoice'
        && !hasPermission('client_invoices.read')
        && !hasPermission('client_billing.read')
      ) {
        throw createModule21Error('DOCUMENT_SCOPE_FORBIDDEN');
      }
      if (link.linkedResourceType === 'supplier_invoice') {
        if (!link.projectId) throw createModule21Error('DOCUMENT_LINK_INVALID');
        await this.requireLinkedProjectPermission(usersRepository, link.projectId, 'supplier_payables.read', new Date());
      }
      if (link.linkedResourceType === 'client_receipt') {
        if (!link.projectId) throw createModule21Error('DOCUMENT_LINK_INVALID');
        await this.requireLinkedProjectPermission(usersRepository, link.projectId, 'client_receipts.read', new Date());
      }
      if (link.linkedResourceType === 'site_expense') {
        if (!link.projectId) throw createModule21Error('DOCUMENT_LINK_INVALID');
        await this.requireLinkedProjectPermission(usersRepository, link.projectId, 'site_expenses.read', new Date());
      }
      if (link.projectId && link.projectId !== document.projectId) {
        await this.requireProjectPermission(usersRepository, link.projectId, 'documents.link', new Date());
      }

      if (!(await repository.deleteDocumentLink(document.id, link.id))) {
        throw createModule21Error('DOCUMENT_LINK_INVALID');
      }

      await recordAudit(tx, {
        action: 'document.unlinked',
        entityType: 'document',
        entityId: document.id,
        before: {
          linkId: link.id,
          projectId: link.projectId,
          versionId: link.versionId,
          resourceType: link.linkedResourceType,
          resourceId: link.linkedResourceId
        }
      });

      await recordOutboxEvent(tx, {
        eventType: 'document.unlinked',
        resourceType: 'document',
        resourceId: document.id,
        payload: {
          documentId: document.id,
          linkId: link.id,
          projectId: link.projectId,
          resourceType: link.linkedResourceType,
          resourceId: link.linkedResourceId
        }
      });

      return { id: link.id, documentId: document.id, unlinked: true };
    });
  }

  /** List only company-wide and exact Project documents the actor may read. */
  async listDocuments(input: ListDocumentsQuery) {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const asOf = new Date();
    const availableVisibility = await this.resolveReadVisibility(this.usersRepository, asOf);
    const visibility = input.projectId
      ? await this.resolveRequestedReadVisibility(input.projectId, asOf)
      : availableVisibility;
    const result = await this.repository.listDocuments({
      search: input.search,
      category: input.category,
      status: input.status,
      ...visibility,
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    return {
      items: result.items.map((document) => ({
        id: document.id,
        projectId: document.projectId,
        title: document.title,
        documentNo: document.documentNo,
        category: document.category,
        status: document.status,
        fileName: document.fileName,
        mimeType: document.mimeType,
        sizeBytes: Number(document.sizeBytes),
        createdBy: document.createdBy,
        currentVersion: document.currentVersion
          ? {
              id: document.currentVersion.id,
              versionNo: document.currentVersion.versionNo,
              originalName: document.currentVersion.originalName,
              mimeType: document.currentVersion.mimeType,
              sizeBytes: Number(document.currentVersion.sizeBytes),
              revisionCode: document.currentVersion.revisionCode,
              createdBy: document.currentVersion.createdBy,
              createdAt: document.currentVersion.createdAt.toISOString()
            }
          : null,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString()
      })),
      accessibleProjectIds: availableVisibility.allowedProjectIds === null
        ? null
        : [...availableVisibility.allowedProjectIds],
      page,
      pageSize,
      total: result.total
    };
  }

  /** Search append-only audit history inside the actor's company and allowed Project scope. */
  async listAuditLogs(input: ListAuditLogsQuery) {
    if (!hasPermission('audit.read')) throw createModule21Error('AUDIT_SCOPE_FORBIDDEN');

    const security = requireRequestSecurityContext();
    const scope = security.projectScope;
    if (scope.kind === 'not-resolved') throw createModule21Error('AUDIT_SCOPE_FORBIDDEN');
    if (input.projectId && scope.kind === 'restricted' && !scope.projectIds.includes(input.projectId)) {
      throw createModule21Error('AUDIT_SCOPE_FORBIDDEN');
    }

    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 50;
    const allowedProjectIds = scope.kind === 'all'
      ? null
      : (input.projectId ? [input.projectId] : scope.projectIds);
    const result = await this.repository.listAuditLogs({
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.stageId ? { stageId: input.stageId } : {}),
      ...(input.resourceType ? { resourceType: input.resourceType } : {}),
      ...(input.resourceId ? { resourceId: input.resourceId } : {}),
      ...(input.action ? { action: input.action } : {}),
      ...(input.from ? { from: input.from } : {}),
      ...(input.to ? { to: input.to } : {}),
      allowedProjectIds,
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    return {
      items: result.items.map((row) => ({
        id: row.id,
        actorUserId: row.actorUserId,
        actor: row.actor,
        projectId: row.projectId,
        stageId: row.stageId,
        action: row.action,
        resourceType: row.entityType,
        resourceId: row.entityId,
        requestId: row.requestId,
        before: row.beforeValue,
        after: row.afterValue,
        createdAt: row.createdAt.toISOString()
      })),
      page,
      pageSize,
      total: result.total
    };
  }

  /** Get metadata/history only after company or exact Project read authorization. */
  async getDocument(documentId: string) {
    const document = await this.repository.findDocumentWithVersions(documentId);
    if (!document) throw createModule21Error('DOCUMENT_NOT_FOUND');

    await this.requireDocumentPermission(
      this.usersRepository,
      document.projectId,
      'documents.read',
      'documents.read',
      new Date()
    );

    const capabilities = await this.resolveDocumentCapabilities(document.projectId, new Date());

    return {
      id: document.id,
      projectId: document.projectId,
      title: document.title,
      documentNo: document.documentNo,
      category: document.category,
      status: document.status,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: Number(document.sizeBytes),
      createdBy: document.createdBy,
      currentVersionId: document.currentVersionId,
      versions: document.versions.map((version) => ({
        id: version.id,
        versionNo: version.versionNo,
        originalName: version.originalName,
        mimeType: version.mimeType,
        sizeBytes: Number(version.sizeBytes),
        checksum: version.checksum,
        revisionCode: version.revisionCode,
        createdBy: version.createdBy,
        createdAt: version.createdAt.toISOString()
      })),
      links: document.links.map((link) => ({
        id: link.id,
        versionId: link.versionId,
        resourceType: link.linkedResourceType,
        resourceId: link.linkedResourceId,
        projectId: link.projectId,
        stageId: link.stageId,
        createdAt: link.createdAt.toISOString()
      })),
      capabilities,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString()
    };
  }

  /** Authorize the current version and return a short-lived download URL. */
  async createDownloadUrl(documentId: string) {
    const document = await this.repository.findDocumentById(documentId);
    if (!document) throw createModule21Error('DOCUMENT_NOT_FOUND');

    await this.requireDocumentPermission(
      this.usersRepository,
      document.projectId,
      'documents.read',
      'documents.read',
      new Date()
    );

    const currentVersion = document.currentVersion;
    if (!currentVersion) throw createModule21Error('DOCUMENT_UPLOAD_INVALID');

    const storageKey = assertCompanyObjectKey(currentVersion.storageKey);
    const signedDownload = await this.storage.createSignedDownloadUrl({
      key: storageKey,
      expiresInSeconds: this.uploadPolicy.signedUrlTtlSeconds
    });

    // Audit only safe metadata. Never persist the signed URL or storage key.
    await withTransaction(this.db, async (tx) => {
      await recordAudit(tx, {
        action: 'document.download_authorized',
        entityType: 'document',
        entityId: document.id,
        after: {
          projectId: document.projectId,
          versionId: currentVersion.id,
          versionNo: currentVersion.versionNo,
          mimeType: currentVersion.mimeType,
          sizeBytes: currentVersion.sizeBytes
        }
      });
    });

    return {
      url: signedDownload.url,
      expiresAt: signedDownload.expiresAt.toISOString(),
      version: {
        id: currentVersion.id,
        versionNo: currentVersion.versionNo,
        originalName: currentVersion.originalName,
        mimeType: currentVersion.mimeType,
        sizeBytes: Number(currentVersion.sizeBytes)
      }
    };
  }

  /** Load one actor-owned upload intent and re-check its current resource permission. */
  private async loadAuthorizedUploadIntent(intentId: string): Promise<StoredUploadIntent> {
    const security = requireRequestSecurityContext();
    const intent = await this.repository.findUploadIntentById(intentId);
    if (!intent || intent.actorUserId !== security.actorUserId) {
      throw createModule21Error('DOCUMENT_UPLOAD_INVALID');
    }

    await this.requireUploadIntentPermission(
      this.usersRepository,
      intent.projectId,
      intent.documentId,
      new Date()
    );
    return intent;
  }

  /** Verify object storage still matches the immutable metadata captured by the upload intent. */
  private async verifyUploadedObject(intent: StoredUploadIntent): Promise<void> {
    let uploadedObject;
    try {
      uploadedObject = await this.storage.headObject(assertCompanyObjectKey(intent.storageKey));
    } catch {
      throw createModule21Error('DOCUMENT_UPLOAD_INVALID');
    }

    if (
      uploadedObject.key !== intent.storageKey
      || uploadedObject.sizeBytes === null
      || BigInt(uploadedObject.sizeBytes) !== intent.sizeBytes
      || uploadedObject.contentType?.toLowerCase() !== intent.mimeType.toLowerCase()
      || uploadedObject.checksumSha256 !== intent.checksum
    ) {
      throw createModule21Error('DOCUMENT_UPLOAD_INVALID');
    }
  }

  /** Re-read, authorize, and atomically claim one upload intent inside its completion transaction. */
  private async claimUploadIntentForCompletion(
    repository: DocumentsRepository,
    usersRepository: AdministrationRepository,
    intentId: string,
    actorUserId: string
  ): Promise<StoredUploadIntent> {
    const currentIntent = await repository.findUploadIntentById(intentId);
    const now = new Date();
    if (
      !currentIntent
      || currentIntent.actorUserId !== actorUserId
      || currentIntent.completedAt
      || currentIntent.expiresAt <= now
    ) {
      throw createModule21Error('DOCUMENT_UPLOAD_INVALID');
    }

    await this.requireUploadIntentPermission(
      usersRepository,
      currentIntent.projectId,
      currentIntent.documentId,
      now
    );

    const claimed = await repository.claimUploadIntentCompletion(currentIntent.id, actorUserId, now);
    if (!claimed) throw createModule21Error('DOCUMENT_UPLOAD_INVALID');
    return currentIntent;
  }

  /** Add the next immutable version to an existing active document. */
  private async createNextVersionFromIntent(
    repository: DocumentsRepository,
    intent: StoredUploadIntent,
    actorUserId: string
  ): Promise<{ document: StoredDocument; version: StoredDocumentVersion }> {
    if (!intent.documentId) throw createModule21Error('DOCUMENT_UPLOAD_INVALID');
    const document = await repository.findDocumentById(intent.documentId);
    if (!document) throw createModule21Error('DOCUMENT_NOT_FOUND');
    if (document.projectId !== intent.projectId || document.status !== 'active') {
      throw createModule21Error('DOCUMENT_UPLOAD_INVALID');
    }

    const latestVersion = await repository.findLatestVersion(document.id);
    const version = await repository.createDocumentVersion({
      id: intent.versionId,
      documentId: document.id,
      versionNo: (latestVersion?.versionNo ?? 0) + 1,
      storageKey: intent.storageKey,
      originalName: intent.originalName,
      mimeType: intent.mimeType,
      sizeBytes: intent.sizeBytes,
      checksum: intent.checksum,
      revisionCode: intent.revisionCode,
      createdBy: actorUserId
    });
    if (!version) throw createModule21Error('DOCUMENT_UPLOAD_INVALID');
    return { document, version };
  }

  /** Create the first document and version from one claimed upload intent. */
  private async createInitialDocumentFromIntent(
    tx: TransactionClient,
    repository: DocumentsRepository,
    intent: StoredUploadIntent,
    actorUserId: string
  ): Promise<{ document: StoredDocument; version: StoredDocumentVersion }> {
    const document = await repository.createDocument({
      id: intent.targetDocumentId,
      projectId: intent.projectId,
      title: intent.title,
      documentNo: intent.documentNo,
      category: intent.category,
      status: 'active',
      fileName: intent.originalName,
      mimeType: intent.mimeType,
      sizeBytes: intent.sizeBytes,
      createdBy: actorUserId
    });
    const version = await repository.createDocumentVersion({
      id: intent.versionId,
      documentId: document.id,
      versionNo: 1,
      storageKey: intent.storageKey,
      originalName: intent.originalName,
      mimeType: intent.mimeType,
      sizeBytes: intent.sizeBytes,
      checksum: intent.checksum,
      createdBy: actorUserId
    });
    if (!version) throw createModule21Error('DOCUMENT_UPLOAD_INVALID');

    await recordAudit(tx, {
      action: 'document.created',
      entityType: 'document',
      entityId: document.id,
      after: {
        projectId: document.projectId,
        title: document.title,
        category: document.category,
        status: document.status,
        fileName: document.fileName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        createdBy: document.createdBy,
        currentVersionId: intent.versionId
      }
    });
    await recordOutboxEvent(tx, {
      eventType: 'document.created',
      resourceType: 'document',
      resourceId: document.id,
      payload: {
        documentId: document.id,
        projectId: document.projectId,
        category: document.category
      }
    });
    return { document, version };
  }

  /** Create the correct first or next document version for one claimed intent. */
  private async createVersionFromIntent(
    tx: TransactionClient,
    repository: DocumentsRepository,
    intent: StoredUploadIntent,
    actorUserId: string
  ): Promise<{ document: StoredDocument; version: StoredDocumentVersion }> {
    return intent.documentId
      ? this.createNextVersionFromIntent(repository, intent, actorUserId)
      : this.createInitialDocumentFromIntent(tx, repository, intent, actorUserId);
  }

  /** Record the durable audit and outbox evidence for one successfully created document version. */
  private async recordVersionAdded(
    tx: TransactionClient,
    document: StoredDocument,
    version: StoredDocumentVersion
  ): Promise<void> {
    await recordAudit(tx, {
      action: 'document.version_added',
      entityType: 'document_version',
      entityId: version.id,
      after: {
        documentId: document.id,
        projectId: document.projectId,
        versionNo: version.versionNo,
        originalName: version.originalName,
        mimeType: version.mimeType,
        sizeBytes: version.sizeBytes,
        checksum: version.checksum,
        revisionCode: version.revisionCode,
        createdBy: version.createdBy
      }
    });
    await recordOutboxEvent(tx, {
      eventType: 'document.version_added',
      resourceType: 'document',
      resourceId: document.id,
      payload: {
        documentId: document.id,
        projectId: document.projectId,
        versionId: version.id,
        versionNo: version.versionNo
      }
    });
  }

  /** Build the stable API body returned after one upload intent completes. */
  private buildCompletedUploadBody(document: StoredDocument, version: StoredDocumentVersion) {
    return {
      document: {
        id: document.id,
        projectId: document.projectId,
        title: document.title,
        documentNo: document.documentNo,
        category: document.category,
        status: document.status,
        fileName: version.originalName,
        mimeType: version.mimeType,
        sizeBytes: Number(version.sizeBytes),
        createdBy: document.createdBy,
        currentVersionId: version.id
      },
      version: {
        id: version.id,
        versionNo: version.versionNo,
        originalName: version.originalName,
        mimeType: version.mimeType,
        sizeBytes: Number(version.sizeBytes),
        checksum: version.checksum,
        revisionCode: version.revisionCode,
        createdBy: version.createdBy,
        createdAt: version.createdAt.toISOString()
      }
    };
  }

  /** Complete one claimed upload intent inside the idempotent database transaction. */
  private async completeUploadIntentInTransaction(
    tx: TransactionClient,
    intentId: string,
    actorUserId: string
  ) {
    const repository = new DocumentsRepository(tx);
    const usersRepository = new AdministrationRepository(tx);
    const intent = await this.claimUploadIntentForCompletion(
      repository,
      usersRepository,
      intentId,
      actorUserId
    );
    const { document, version } = await this.createVersionFromIntent(
      tx,
      repository,
      intent,
      actorUserId
    );

    const currentVersionUpdated = await repository.setCurrentVersion(
      document.id,
      version.id,
      version.originalName,
      version.mimeType,
      version.sizeBytes
    );
    if (!currentVersionUpdated) throw createModule21Error('DOCUMENT_UPLOAD_INVALID');
    await this.recordVersionAdded(tx, document, version);
    return { statusCode: 200, body: this.buildCompletedUploadBody(document, version) };
  }

  /** Verify an uploaded object and create its authorized document version exactly once. */
  async completeUploadIntent(intentId: string, idempotencyKey: string) {
    const security = requireRequestSecurityContext();
    const intent = await this.loadAuthorizedUploadIntent(intentId);
    await this.verifyUploadedObject(intent);

    try {
      const result = await executeIdempotentCommand(
        this.db,
        {
          operation: 'documents.upload.complete',
          idempotencyKey,
          fingerprintInput: { intentId }
        },
        async (tx) => this.completeUploadIntentInTransaction(tx, intentId, security.actorUserId)
      );
      return result.response.body;
    } catch (error) {
      // The database unique constraint on (document_id, version_no) is the final concurrency guard.
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw createModule21Error('DOCUMENT_UPLOAD_INVALID');
      }
      throw error;
    }
  }
}
