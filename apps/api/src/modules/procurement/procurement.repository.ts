import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';
import { PROCUREMENT_MAX_PAGE_SIZE } from './procurement.schema.js';

type RepositoryClient = DatabaseClient | TransactionClient;

export type ProjectVisibility = Readonly<{ allowedProjectIds: readonly string[] | null }>;
export type PageWindow = Readonly<{ skip: number; take: number }>;
export type RequisitionItemWrite = Readonly<{
  materialId: string;
  description: string;
  quantity: string;
  unit: string;
  stageId?: string | null;
}>;
export type PurchaseOrderLineWrite = Readonly<{
  requisitionItemId: string;
  materialId: string;
  stageId?: string | null;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  taxRate: string;
  lineTotal: string;
}>;

/** Reject invalid repository pagination before it reaches Prisma. */
function assertPageWindow(input: PageWindow): void {
  if (!Number.isInteger(input.skip) || input.skip < 0) throw new RangeError('Repository skip must be a non-negative integer.');
  if (!Number.isInteger(input.take) || input.take < 1 || input.take > PROCUREMENT_MAX_PAGE_SIZE) {
    throw new RangeError(`Repository take must be between 1 and ${PROCUREMENT_MAX_PAGE_SIZE}.`);
  }
}

/** Build one project visibility condition without weakening Company scope. */
function projectVisibilityWhere(visibility: ProjectVisibility): Record<string, unknown> {
  return visibility.allowedProjectIds === null ? {} : { projectId: { in: [...visibility.allowedProjectIds] } };
}

/** Final-21 Procurement persistence with Company and Project scope on every business read/write. */
export class ProcurementRepository {
  /** Bind Procurement persistence to Prisma or to one active service transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /** Find one Company-owned Project. */
  async findProjectById(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.project.findFirst({ where: scope.where({ id: projectId }) });
  }

  /** Return active Company material ids used by one material requirement. */
  async findActiveMaterialIds(materialIds: readonly string[]): Promise<string[]> {
    if (materialIds.length === 0) return [];
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.material.findMany({
      where: scope.where({ id: { in: [...materialIds] }, status: 'ACTIVE' }),
      select: { id: true }
    });
    return rows.map((row) => row.id);
  }

  /** Return Project Stage ids that belong to the current Company and selected Project. */
  async findProjectStageIds(projectId: string, stageIds: readonly string[]): Promise<string[]> {
    if (stageIds.length === 0) return [];
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.projectStage.findMany({
      where: scope.where({ projectId, id: { in: [...stageIds] } }),
      select: { id: true }
    });
    return rows.map((row) => row.id);
  }

  /** Find one Company vendor by id. */
  async findVendorById(vendorId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.vendor.findFirst({ where: scope.where({ id: vendorId }), select: { id: true, status: true, qualificationStatus: true } });
  }

  /** List requisitions inside the authenticated Project visibility. */
  async listPurchaseRequisitions(input: PageWindow & Readonly<{ visibility: ProjectVisibility; projectId?: string }>) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({ ...projectVisibilityWhere(input.visibility), ...(input.projectId ? { projectId: input.projectId } : {}) });
    const [items, total] = await Promise.all([
      this.db.purchaseRequisition.findMany({ where, include: { items: { orderBy: [{ id: 'asc' }] } }, orderBy: [{ requiredDate: 'desc' }, { id: 'desc' }], skip: input.skip, take: input.take }),
      this.db.purchaseRequisition.count({ where })
    ]);
    return { items, total };
  }

  /** Find one requisition inside Company and Project visibility. */
  async findPurchaseRequisitionById(requisitionId: string, visibility: ProjectVisibility) {
    const scope = requireCompanyRepositoryScope();
    return this.db.purchaseRequisition.findFirst({
      where: scope.where({ id: requisitionId, ...projectVisibilityWhere(visibility) }),
      include: { items: { orderBy: [{ id: 'asc' }] } }
    });
  }

  /** Lock one requisition before a controlled lifecycle transition. */
  async lockPurchaseRequisitionForWrite(projectId: string, requisitionId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{ id: string; project_id: string; status: string }>>`
      SELECT id, project_id, status FROM purchase_requisitions
      WHERE id = ${requisitionId}::uuid AND company_id = ${scope.companyId}::uuid AND project_id = ${projectId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Create one material requirement and its simple project/stage lines. */
  async createPurchaseRequisition(input: Readonly<{ projectId: string; stageId?: string | null; requestNo: string; requestedBy: string; requiredDate: Date; notes: string | null; items: readonly RequisitionItemWrite[] }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.purchaseRequisition.create({
      data: scope.createData({
        projectId: input.projectId,
        stageId: input.stageId ?? null,
        prNo: input.requestNo,
        requestedBy: input.requestedBy,
        requiredDate: input.requiredDate,
        status: 'DRAFT',
        purpose: input.notes ?? '',
        items: { create: input.items.map((item) => ({ itemId: item.materialId, description: item.description, quantity: item.quantity, unit: item.unit, estimatedRate: null, stageId: item.stageId ?? null })) }
      }),
      include: { items: { orderBy: [{ id: 'asc' }] } }
    });
  }

  /** Change one requisition lifecycle state after service validation. */
  async updatePurchaseRequisitionStatus(requisitionId: string, expectedStatus: string, status: string) {
    const scope = requireCompanyRepositoryScope();
    const result = await this.db.purchaseRequisition.updateMany({ where: scope.where({ id: requisitionId, status: expectedStatus }), data: { status } });
    if (result.count === 0) return null;
    return this.db.purchaseRequisition.findFirst({ where: scope.where({ id: requisitionId }), include: { items: { orderBy: [{ id: 'asc' }] } } });
  }

  /** List Purchase Orders inside authenticated Project visibility. */
  async listPurchaseOrders(input: PageWindow & Readonly<{ visibility: ProjectVisibility; projectId?: string }>) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({ ...projectVisibilityWhere(input.visibility), ...(input.projectId ? { projectId: input.projectId } : {}) });
    const [items, total] = await Promise.all([
      this.db.purchaseOrder.findMany({ where, include: { items: { orderBy: [{ id: 'asc' }] } }, orderBy: [{ orderDate: 'desc' }, { id: 'desc' }], skip: input.skip, take: input.take }),
      this.db.purchaseOrder.count({ where })
    ]);
    return { items, total };
  }

  /** Find one Purchase Order inside Company and Project visibility. */
  async findPurchaseOrderById(purchaseOrderId: string, visibility: ProjectVisibility) {
    const scope = requireCompanyRepositoryScope();
    return this.db.purchaseOrder.findFirst({ where: scope.where({ id: purchaseOrderId, ...projectVisibilityWhere(visibility) }), include: { items: { orderBy: [{ id: 'asc' }] } } });
  }

  /** Lock one Purchase Order before issue or cancellation. */
  async lockPurchaseOrderForWrite(projectId: string, purchaseOrderId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{ id: string; project_id: string; status: string }>>`
      SELECT id, project_id, status FROM purchase_orders
      WHERE id = ${purchaseOrderId}::uuid AND company_id = ${scope.companyId}::uuid AND project_id = ${projectId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Sum already ordered non-cancelled quantities for approved requisition lines. */
  async listOrderedQuantities(requisitionItemIds: readonly string[]) {
    if (requisitionItemIds.length === 0) return [];
    return this.db.purchaseOrderItem.groupBy({
      by: ['requisitionItemId'],
      where: { requisitionItemId: { in: [...requisitionItemIds] }, purchaseOrder: { status: { not: 'CANCELLED' } } },
      _sum: { quantity: true }
    });
  }

  /** Create one draft Purchase Order from an approved material requirement. */
  async createPurchaseOrder(input: Readonly<{ projectId: string; requisitionId: string; poNo: string; vendorId: string; orderDate: Date; currency: string; subtotal: string; taxAmount: string; totalAmount: string; deliveryAddress: string; terms: string; items: readonly PurchaseOrderLineWrite[] }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.purchaseOrder.create({
      data: scope.createData({
        projectId: input.projectId,
        requisitionId: input.requisitionId,
        poNo: input.poNo,
        vendorId: input.vendorId,
        orderDate: input.orderDate,
        currency: input.currency,
        status: 'DRAFT',
        subtotal: input.subtotal,
        tax: input.taxAmount,
        total: input.totalAmount,
        deliveryAddress: input.deliveryAddress,
        terms: input.terms,
        items: { create: input.items.map((item) => ({
          requisitionItemId: item.requisitionItemId,
          itemId: item.materialId,
          stageId: item.stageId ?? null,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitRate: item.unitPrice,
          taxRate: item.taxRate,
          lineTotal: item.lineTotal,
          receivedQty: '0',
          invoicedAmount: '0'
        })) }
      }),
      include: { items: { orderBy: [{ id: 'asc' }] } }
    });
  }

  /** Change one Purchase Order status after service validation. */
  async updatePurchaseOrderStatus(purchaseOrderId: string, expectedStatus: string, status: string, cancellation?: Readonly<{ reason: string; actorUserId: string; at: Date }>) {
    const scope = requireCompanyRepositoryScope();
    const result = await this.db.purchaseOrder.updateMany({
      where: scope.where({ id: purchaseOrderId, status: expectedStatus }),
      data: { status, ...(cancellation ? { cancelReason: cancellation.reason, cancelledAt: cancellation.at, cancelledBy: cancellation.actorUserId } : {}) }
    });
    if (result.count === 0) return null;
    return this.db.purchaseOrder.findFirst({ where: scope.where({ id: purchaseOrderId }), include: { items: { orderBy: [{ id: 'asc' }] } } });
  }

  /** Upsert one material commitment by Company-scoped source key. */
  async upsertMaterialCommitment(input: Readonly<{ projectId: string; stageId?: string | null; sourceId: string; sourceKey: string; amount: string; status: string; postedAt: Date }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.costCommitment.upsert({
      where: { companyId_sourceKey: { companyId: scope.companyId, sourceKey: input.sourceKey } },
      create: scope.createData({
        projectId: input.projectId,
        stageId: input.stageId ?? null,
        category: 'material',
        sourceType: 'purchase_order',
        sourceId: input.sourceId,
        sourceKey: input.sourceKey,
        amount: input.amount,
        status: input.status,
        postedAt: input.postedAt
      }),
      update: {
        stageId: input.stageId ?? null,
        amount: input.amount,
        status: input.status,
        postedAt: input.postedAt
      }
    });
  }

  /** Cancel active commitments belonging to one Purchase Order. */
  async cancelPurchaseOrderCommitments(purchaseOrderId: string, at: Date) {
    const scope = requireCompanyRepositoryScope();
    return this.db.costCommitment.updateMany({ where: scope.where({ sourceType: 'purchase_order', sourceId: purchaseOrderId, status: 'ACTIVE' }), data: { status: 'CANCELLED', postedAt: at } });
  }

  /** Find one Goods Receipt through the Purchase Order's Company/Project scope. */
  async findGoodsReceiptById(goodsReceiptId: string, visibility: ProjectVisibility) {
    const scope = requireCompanyRepositoryScope();
    return this.db.goodsReceipt.findFirst({
      where: scope.where({ id: goodsReceiptId, ...projectVisibilityWhere(visibility) }),
      include: { items: { orderBy: [{ id: 'asc' }] } }
    });
  }
}
