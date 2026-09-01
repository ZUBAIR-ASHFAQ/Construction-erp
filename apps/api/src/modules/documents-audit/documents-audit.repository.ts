import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';
import { MODULE_21_MAX_PAGE_SIZE, type DocumentLinkResourceType } from './documents-audit.schema.js';

type RepositoryClient = DatabaseClient | TransactionClient;

export type ProjectVisibilityRepositoryInput = Readonly<{
  includeCompanyWide: boolean;
  allowedProjectIds: readonly string[] | null;
}>;

export type ListDocumentsRepositoryInput = Readonly<{
  search?: string | undefined;
  category?: string | undefined;
  status?: string | undefined;
  includeCompanyWide: boolean;
  allowedProjectIds: readonly string[] | null;
  skip: number;
  take: number;
}>;


export type ListAuditLogsRepositoryInput = Readonly<{
  actorUserId?: string;
  projectId?: string;
  stageId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  allowedProjectIds: readonly string[] | null;
  skip: number;
  take: number;
}>;

export type CreateDocumentRepositoryInput = Readonly<{
  id?: string;
  projectId?: string | null;
  title: string;
  documentNo?: string | null;
  category: string;
  status: string;
  fileName: string;
  mimeType: string;
  sizeBytes: bigint;
  createdBy: string;
}>;

export type CreateDocumentVersionRepositoryInput = Readonly<{
  id?: string;
  documentId: string;
  versionNo: number;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: bigint;
  checksum: string;
  revisionCode?: string | null | undefined;
  createdBy: string;
}>;


export type CreateUploadIntentRepositoryInput = Readonly<{
  id: string;
  projectId?: string | null | undefined;
  actorUserId: string;
  targetDocumentId: string;
  documentId?: string | null | undefined;
  versionId: string;
  title: string;
  documentNo?: string | null | undefined;
  category: string;
  originalName: string;
  mimeType: string;
  sizeBytes: bigint;
  checksum: string;
  revisionCode?: string | null | undefined;
  storageKey: string;
  expiresAt: Date;
}>;

export type CreateDocumentLinkRepositoryInput = Readonly<{
  documentId: string;
  versionId: string | null;
  linkedResourceType: DocumentLinkResourceType;
  linkedResourceId: string;
  projectId: string | null;
  stageId: string | null;
  createdBy: string;
}>;

export type LinkableDocumentResource = Readonly<{
  id: string;
  projectId: string | null;
  stageId: string | null;
}>;

/** Reject invalid repository pagination before it reaches Prisma. */
function assertPageWindow(input: Readonly<{ skip: number; take: number }>): void {
  if (!Number.isInteger(input.skip) || input.skip < 0) {
    throw new RangeError('Repository skip must be a non-negative integer.');
  }

  if (!Number.isInteger(input.take) || input.take < 1 || input.take > MODULE_21_MAX_PAGE_SIZE) {
    throw new RangeError(`Repository take must be between 1 and ${MODULE_21_MAX_PAGE_SIZE}.`);
  }
}

/** Build the nullable Project filter shared by Document list queries. */
function buildProjectVisibilityWhere(input: ProjectVisibilityRepositoryInput) {
  if (input.allowedProjectIds === null) {
    return input.includeCompanyWide ? {} : { projectId: { not: null } };
  }

  const projectIds = [...new Set(input.allowedProjectIds)];
  if (input.includeCompanyWide) {
    return {
      AND: [{
        OR: [
          { projectId: null },
          { projectId: { in: projectIds } }
        ]
      }]
    };
  }

  return { projectId: { in: projectIds } };
}

/**
 * Module 21 database access.
 * Every company-owned read/write gets its company id from trusted request context.
 */
export class DocumentsRepository {
  /** Bind repository reads and writes to a Prisma client or active transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /** Persist one short-lived server-issued upload intent for this company. */
  async createUploadIntent(input: CreateUploadIntentRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    return this.db.documentUploadIntent.create({
      data: scope.createData({
        id: input.id,
        projectId: input.projectId ?? null,
        actorUserId: input.actorUserId,
        targetDocumentId: input.targetDocumentId,
        documentId: input.documentId ?? null,
        versionId: input.versionId,
        title: input.title,
        documentNo: input.documentNo ?? null,
        category: input.category,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        checksum: input.checksum,
        revisionCode: input.revisionCode ?? null,
        storageKey: input.storageKey,
        expiresAt: input.expiresAt
      })
    });
  }

  /** Find one server-issued upload intent inside the authenticated company. */
  async findUploadIntentById(id: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.documentUploadIntent.findFirst({
      where: scope.where({ id })
    });
  }

  /** Claim an upload intent exactly once while it is still valid. */
  async claimUploadIntentCompletion(id: string, actorUserId: string, completedAt: Date): Promise<boolean> {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.documentUploadIntent.updateMany({
      where: scope.where({
        id,
        actorUserId,
        completedAt: null,
        expiresAt: { gt: completedAt }
      }),
      data: { completedAt }
    });
    return updated.count === 1;
  }

  /** Create document metadata and stamp company ownership server-side. */
  async createDocument(input: CreateDocumentRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    return this.db.document.create({
      data: scope.createData({
        ...(input.id ? { id: input.id } : {}),
        projectId: input.projectId ?? null,
        title: input.title,
        documentNo: input.documentNo ?? null,
        category: input.category,
        status: input.status,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        createdBy: input.createdBy
      })
    });
  }

  /** Find one document only inside the authenticated company. */
  async findDocumentById(id: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.document.findFirst({
      where: scope.where({ id }),
      include: { currentVersion: true }
    });
  }

  /** Load document detail, immutable versions and linked resources. */
  async findDocumentWithVersions(id: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.document.findFirst({
      where: scope.where({ id }),
      include: {
        currentVersion: true,
        versions: { orderBy: { versionNo: 'desc' } },
        links: { orderBy: { createdAt: 'desc' } }
      }
    });
  }

  /** List company documents with bounded filters and a matching total count. */
  async listDocuments(input: ListDocumentsRepositoryInput) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const search = input.search?.trim();
    const where = scope.where({
      ...buildProjectVisibilityWhere(input),
      ...(input.category ? { category: input.category } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' as const } },
              { documentNo: { contains: search, mode: 'insensitive' as const } }
            ]
          }
        : {})
    });

    const [items, total] = await Promise.all([
      this.db.document.findMany({
        where,
        include: { currentVersion: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.document.count({ where })
    ]);

    return { items, total };
  }

  /** Create one immutable version after confirming the document belongs to this company. */
  async createDocumentVersion(input: CreateDocumentVersionRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const document = await this.db.document.findFirst({
      where: scope.where({ id: input.documentId }),
      select: { id: true }
    });

    if (!document) return null;

    return this.db.documentVersion.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        documentId: input.documentId,
        versionNo: input.versionNo,
        storageKey: input.storageKey,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        checksum: input.checksum,
        revisionCode: input.revisionCode ?? null,
        createdBy: input.createdBy
      }
    });
  }

  /** Return the newest version number for a company-owned document. */
  async findLatestVersion(documentId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.documentVersion.findFirst({
      where: {
        documentId,
        document: { companyId: scope.companyId }
      },
      orderBy: { versionNo: 'desc' }
    });
  }

  /** Promote one owned version and synchronize the required Document file metadata. */
  async setCurrentVersion(
    documentId: string,
    versionId: string,
    fileName: string,
    mimeType: string,
    sizeBytes: bigint
  ): Promise<boolean> {
    const scope = requireCompanyRepositoryScope();
    const version = await this.db.documentVersion.findFirst({
      where: {
        id: versionId,
        documentId,
        document: { companyId: scope.companyId }
      },
      select: { id: true }
    });
    if (!version) return false;

    const updated = await this.db.document.updateMany({
      where: scope.where({ id: documentId }),
      data: { currentVersionId: version.id, fileName, mimeType, sizeBytes }
    });
    return updated.count === 1;
  }

  /** Resolve one allow-listed ERP resource inside the authenticated company. */
  async findLinkableResource(
    resourceType: DocumentLinkResourceType,
    resourceId: string
  ): Promise<LinkableDocumentResource | null> {
    const scope = requireCompanyRepositoryScope();

    if (resourceType === 'project') {
      const project = await this.db.project.findFirst({
        where: scope.where({ id: resourceId }),
        select: { id: true }
      });
      return project ? { id: project.id, projectId: project.id, stageId: null } : null;
    }

    if (resourceType === 'employee') {
      const employee = await this.db.employee.findFirst({
        where: scope.where({ id: resourceId }),
        select: { id: true }
      });
      return employee ? { id: employee.id, projectId: null, stageId: null } : null;
    }

    if (resourceType === 'project_stage') {
      const stage = await this.db.projectStage.findFirst({
        where: scope.where({ id: resourceId }),
        select: { id: true, projectId: true }
      });
      return stage ? { id: stage.id, projectId: stage.projectId, stageId: stage.id } : null;
    }

    if (resourceType === 'client_invoice') {
      const invoice = await this.db.clientInvoice.findFirst({
        where: scope.where({ id: resourceId }),
        select: { id: true, projectId: true }
      });
      return invoice ? { id: invoice.id, projectId: invoice.projectId, stageId: null } : null;
    }

    if (resourceType === 'client_receipt') {
      const receipt = await this.db.clientReceipt.findFirst({
        where: scope.where({ id: resourceId }),
        select: { id: true, projectId: true, stageId: true }
      });
      return receipt ? { id: receipt.id, projectId: receipt.projectId, stageId: receipt.stageId } : null;
    }

    if (resourceType === 'supplier_invoice') {
      const invoice = await this.db.supplierInvoice.findFirst({
        where: scope.where({ id: resourceId }),
        select: { id: true, projectId: true }
      });
      return invoice ? { id: invoice.id, projectId: invoice.projectId, stageId: null } : null;
    }

    if (resourceType === 'site_expense') {
      const expense = await this.db.siteExpense.findFirst({
        where: scope.where({ id: resourceId }),
        select: { id: true, projectId: true, stageId: true }
      });
      return expense ? { id: expense.id, projectId: expense.projectId, stageId: expense.stageId } : null;
    }

    return null;
  }

  /** Find one immutable version only when it belongs to this company Document. */
  async findDocumentVersion(documentId: string, versionId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.documentVersion.findFirst({
      where: {
        id: versionId,
        documentId,
        document: { companyId: scope.companyId }
      },
      select: { id: true }
    });
  }

  /** Create one retry-safe company-owned document link. */
  async createDocumentLink(input: CreateDocumentLinkRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const document = await this.db.document.findFirst({
      where: scope.where({ id: input.documentId }),
      select: { id: true }
    });
    if (!document) return null;

    const data = scope.createData({
      documentId: input.documentId,
      versionId: input.versionId,
      linkedResourceType: input.linkedResourceType,
      linkedResourceId: input.linkedResourceId,
      projectId: input.projectId,
      stageId: input.stageId,
      createdBy: input.createdBy
    });

    try {
      const link = await this.db.documentLink.create({ data });
      return { link, created: true };
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') throw error;

      const link = await this.db.documentLink.findFirst({
        where: {
          documentId: input.documentId,
          linkedResourceType: input.linkedResourceType,
          linkedResourceId: input.linkedResourceId,
          companyId: scope.companyId
        }
      });
      if (!link) throw error;
      return { link, created: false };
    }
  }

  /** Find one link only through its authenticated company Document. */
  async findDocumentLink(documentId: string, linkId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.documentLink.findFirst({
      where: {
        id: linkId,
        documentId,
        companyId: scope.companyId
      }
    });
  }

  /** Remove one authorized link without deleting Document or version history. */
  async deleteDocumentLink(documentId: string, linkId: string): Promise<boolean> {
    const scope = requireCompanyRepositoryScope();
    const deleted = await this.db.documentLink.deleteMany({
      where: {
        id: linkId,
        documentId,
        companyId: scope.companyId
      }
    });
    return deleted.count === 1;
  }


  /** Search append-only audit history inside the authenticated company and allowed Project scope. */
  async listAuditLogs(input: ListAuditLogsRepositoryInput) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const allowedProjectIds = input.allowedProjectIds === null ? null : [...new Set(input.allowedProjectIds)];
    const where = scope.where({
      ...(allowedProjectIds === null ? {} : { projectId: { in: allowedProjectIds } }),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.stageId ? { stageId: input.stageId } : {}),
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      ...(input.resourceType ? { entityType: input.resourceType } : {}),
      ...(input.resourceId ? { entityId: input.resourceId } : {}),
      ...(input.action ? { action: input.action } : {}),
      ...(input.from || input.to
        ? {
            createdAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {})
            }
          }
        : {})
    });

    const [items, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.auditLog.count({ where })
    ]);

    return { items, total };
  }

}
