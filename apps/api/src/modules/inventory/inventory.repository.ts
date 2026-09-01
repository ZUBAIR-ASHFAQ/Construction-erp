import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';
import { MODULE_11_MAX_PAGE_SIZE } from './inventory.schema.js';

type RepositoryClient = DatabaseClient | TransactionClient;

export type PageWindow = Readonly<{ skip: number; take: number }>;
export type InventoryVisibility = Readonly<{
  allowedProjectIds: readonly string[] | null;
  includeCompanyWideWarehouses: boolean;
}>;

/** Reject invalid bounded pagination before it reaches persistence. */
function assertPageWindow(input: PageWindow): void {
  if (!Number.isInteger(input.skip) || input.skip < 0) throw new RangeError('skip must be a non-negative integer.');
  if (!Number.isInteger(input.take) || input.take < 1 || input.take > MODULE_11_MAX_PAGE_SIZE) {
    throw new RangeError(`take must be between 1 and ${MODULE_11_MAX_PAGE_SIZE}.`);
  }
}

type WarehouseVisibilityWhere = {
  projectId?: { in: string[] };
  OR?: Array<{ projectId: null } | { projectId: { in: string[] } }>;
};

/** Build a Project-safe Warehouse predicate from trusted request scope. */
function warehouseVisibilityWhere(visibility: InventoryVisibility): WarehouseVisibilityWhere {
  if (visibility.allowedProjectIds === null) return {};
  const projectIds = [...new Set(visibility.allowedProjectIds)];
  if (!visibility.includeCompanyWideWarehouses) return { projectId: { in: projectIds } };
  return { OR: [{ projectId: null }, { projectId: { in: projectIds } }] };
}

/** Persistence for Final Module 11 Inventory / Material Management. */
export class InventoryRepository {
  /** Bind Inventory persistence to Prisma or one active service transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /** List Company-owned Materials with deterministic pagination. */
  async listMaterials(input: PageWindow) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({});
    const [items, total] = await Promise.all([
      this.db.material.findMany({ where, orderBy: [{ code: 'asc' }, { id: 'asc' }], skip: input.skip, take: input.take }),
      this.db.material.count({ where })
    ]);
    return { items, total };
  }

  /** Find one Company-owned Material by identifier. */
  async findMaterialById(materialId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.material.findFirst({ where: scope.where({ id: materialId }) });
  }

  /** Find one Company-owned Material by normalized code. */
  async findMaterialByCode(code: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.material.findFirst({ where: scope.where({ code }) });
  }

  /** Create one Company-owned Material master. */
  async createMaterial(input: Readonly<{ code: string; name: string; unit: string; category?: string | null; status: string }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.material.create({ data: scope.createData({ ...input, category: input.category ?? null }) });
  }

  /** List Warehouse options visible through trusted Project scope. */
  async listWarehouses(visibility: InventoryVisibility) {
    const scope = requireCompanyRepositoryScope();
    return this.db.warehouse.findMany({
      where: scope.where(warehouseVisibilityWhere(visibility)),
      orderBy: [{ code: 'asc' }, { id: 'asc' }]
    });
  }

  /** Find one Warehouse only when it is visible to the authenticated caller. */
  async findWarehouseById(warehouseId: string, visibility: InventoryVisibility) {
    const scope = requireCompanyRepositoryScope();
    return this.db.warehouse.findFirst({ where: scope.where({ id: warehouseId, ...warehouseVisibilityWhere(visibility) }) });
  }

  /** Find one same-Company Project. */
  async findProjectById(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.project.findFirst({ where: scope.where({ id: projectId }), select: { id: true, status: true } });
  }

  /** Find one same-Project Stage. */
  async findStage(projectId: string, stageId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.projectStage.findFirst({ where: { companyId: scope.companyId, projectId, id: stageId }, select: { id: true } });
  }

  /** Serialize writes for one Warehouse/Material stock key without a redundant balance table. */
  async lockStockKey(warehouseId: string, materialId: string): Promise<void> {
    const scope = requireCompanyRepositoryScope();
    await this.db.$queryRaw<Array<{ lockResult: unknown }>>`
      SELECT pg_advisory_xact_lock(hashtext(${`${scope.companyId}:${warehouseId}:${materialId}`})) AS "lockResult"
    `;
  }

  /** Derive current quantity and weighted average cost from the append-only stock ledger. */
  async getStockPosition(warehouseId: string, materialId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{ quantityOnHand: { toString(): string }; averageCost: { toString(): string } }>>`
      SELECT
        COALESCE(SUM(quantity), 0)::numeric(18,4) AS "quantityOnHand",
        CASE
          WHEN COALESCE(SUM(quantity), 0) = 0 THEN 0::numeric(18,4)
          ELSE COALESCE(SUM(quantity * unit_cost), 0) / NULLIF(SUM(quantity), 0)
        END::numeric(18,4) AS "averageCost"
      FROM stock_ledger
      WHERE company_id = ${scope.companyId}::uuid
        AND warehouse_id = ${warehouseId}::uuid
        AND material_id = ${materialId}::uuid
    `;
    return rows[0] ?? null;
  }

  /** List bounded derived stock rows for visible Warehouses. */
  async listStock(input: PageWindow & Readonly<{ visibility: InventoryVisibility; warehouseId?: string | undefined; materialId?: string | undefined }>) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const warehouses = await this.listWarehouses(input.visibility);
    const warehouseIds = warehouses.map((row) => row.id);
    if (warehouseIds.length === 0) return { items: [], total: 0, warehouses };
    if (input.warehouseId && !warehouseIds.includes(input.warehouseId)) return { items: [], total: 0, warehouses };

    const groups = await this.db.stockLedger.groupBy({
      by: ['warehouseId', 'materialId'],
      where: {
        companyId: scope.companyId,
        warehouseId: input.warehouseId ? input.warehouseId : { in: warehouseIds },
        ...(input.materialId ? { materialId: input.materialId } : {})
      },
      _sum: { quantity: true },
      orderBy: [{ warehouseId: 'asc' }, { materialId: 'asc' }]
    });
    const visibleGroups = groups.filter((row) => Number(row._sum.quantity?.toString() ?? '0') !== 0);
    const page = visibleGroups.slice(input.skip, input.skip + input.take);
    const items = [];
    for (const group of page) {
      const [warehouse, material, position] = await Promise.all([
        this.db.warehouse.findUnique({ where: { id: group.warehouseId } }),
        this.db.material.findUnique({ where: { id: group.materialId } }),
        this.getStockPosition(group.warehouseId, group.materialId)
      ]);
      if (warehouse && material && position) items.push({ warehouse, material, ...position });
    }
    return { items, total: visibleGroups.length, warehouses };
  }

  /** List append-only ledger rows inside visible Warehouse scope. */
  async listLedger(input: PageWindow & Readonly<{ visibility: InventoryVisibility; warehouseId?: string | undefined; materialId?: string | undefined; projectId?: string | undefined; stageId?: string | undefined }>) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const warehouses = await this.listWarehouses(input.visibility);
    const warehouseIds = warehouses.map((row) => row.id);
    if (warehouseIds.length === 0) return { items: [], total: 0 };
    if (input.warehouseId && !warehouseIds.includes(input.warehouseId)) return { items: [], total: 0 };
    const where = {
      companyId: scope.companyId,
      warehouseId: input.warehouseId ? input.warehouseId : { in: warehouseIds },
      ...(input.materialId ? { materialId: input.materialId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.stageId ? { stageId: input.stageId } : {})
    };
    const [items, total] = await Promise.all([
      this.db.stockLedger.findMany({ where, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], skip: input.skip, take: input.take }),
      this.db.stockLedger.count({ where })
    ]);
    return { items, total };
  }

  /** Append one immutable stock-ledger movement. */
  async createLedgerEntry(input: Readonly<{
    materialId: string; warehouseId: string; projectId?: string | null; stageId?: string | null;
    movementType: string; quantity: string; unitCost: string; sourceType: string; sourceId: string; occurredAt: Date;
  }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.stockLedger.create({ data: scope.createData({ ...input, projectId: input.projectId ?? null, stageId: input.stageId ?? null }) });
  }

  /** Create one Material Issue header. */
  async createMaterialIssue(input: Readonly<{
    projectId: string; stageId?: string | null; warehouseId: string; issueNo: string; issueDate: Date;
    description?: string | null; issuedBy: string; status: string;
  }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.materialIssue.create({ data: scope.createData({ ...input, stageId: input.stageId ?? null, description: input.description ?? null }) });
  }

  /** Append one Material Issue line with server-derived cost. */
  async createMaterialIssueItem(input: Readonly<{ issueId: string; materialId: string; quantity: string; unitCost: string; lineCost: string }>) {
    return this.db.materialIssueItem.create({ data: input });
  }

  /** Append one idempotent Project/Stage material actual-cost source. */
  async createMaterialCostActual(input: Readonly<{
    projectId: string; stageId?: string | null; sourceId: string; sourceKey: string; postingDate: Date; amount: string;
  }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.costActual.create({
      data: scope.createData({
        projectId: input.projectId,
        stageId: input.stageId ?? null,
        category: 'material',
        sourceType: 'inventory_issue',
        sourceId: input.sourceId,
        sourceKey: input.sourceKey,
        postingDate: input.postingDate,
        amount: input.amount
      })
    });
  }

  /** Read one Purchase Order for the internal Goods Receipt adapter. */
  async findPurchaseOrderForReceipt(purchaseOrderId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.purchaseOrder.findFirst({
      where: scope.where({ id: purchaseOrderId }),
      include: { items: true }
    });
  }

  /** Lock one Purchase Order line before changing received quantity. */
  async lockPurchaseOrderItem(poItemId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{ id: string; quantity: { toString(): string }; receivedQty: { toString(): string } }>>`
      SELECT poi.id, poi.quantity, poi.received_qty AS "receivedQty"
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.purchase_order_id
      WHERE poi.id = ${poItemId}::uuid AND po.company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Increase one Purchase Order line's server-owned received quantity. */
  async addPurchaseOrderReceivedQuantity(poItemId: string, quantity: string) {
    return this.db.purchaseOrderItem.update({ where: { id: poItemId }, data: { receivedQty: { increment: quantity } } });
  }

  /** Create the Procurement-owned Goods Receipt and its lines in the same stock transaction. */
  async createGoodsReceipt(input: Readonly<{
    projectId: string; vendorId: string; warehouseId: string; receiptNo: string; purchaseOrderId: string;
    receivedAt: Date; status: string; receivedBy: string;
    items: readonly Readonly<{
      poItemId: string; itemId: string; stageId?: string | null; quantity: string; sourceUnit: string;
      conversionFactor: string; sourceUnitCost: string; unitCost: string; acceptedQty: string; rejectedQty: string;
      batchNo?: string | null; baseQuantity: string; acceptedBaseQty: string; rejectedBaseQty: string;
    }>[];
  }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.goodsReceipt.create({
      data: scope.createData({
        projectId: input.projectId,
        vendorId: input.vendorId,
        warehouseId: input.warehouseId,
        receiptNo: input.receiptNo,
        purchaseOrderId: input.purchaseOrderId,
        receivedAt: input.receivedAt,
        status: input.status,
        receivedBy: input.receivedBy,
        items: { create: input.items.map((item) => ({ ...item, stageId: item.stageId ?? null, batchNo: item.batchNo ?? null })) }
      }),
      include: { items: true }
    });
  }
}
