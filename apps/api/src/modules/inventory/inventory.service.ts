import { recordAudit } from '@construction-erp/audit';
import { type DatabaseClient, type TransactionClient } from '@construction-erp/database';
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '@construction-erp/errors';
import { executeIdempotentCommand } from '@construction-erp/idempotency';
import { allocateCompanyNumber } from '@construction-erp/numbering';
import { recordOutboxEvent } from '@construction-erp/outbox';
import { requireRequestContext, requireRequestSecurityContext } from '@construction-erp/request-context';
import { AdministrationRepository } from '../administration/administration.repository.js';
import { InventoryRepository, type InventoryVisibility } from './inventory.repository.js';
import {
  createModule11Error,
  type AdjustStockBody,
  type CreateMaterialBody,
  type CreateMaterialIssueBody,
  type ListLedgerQuery,
  type ListMaterialsQuery,
  type ListStockQuery,
  type ReceiveInventoryBody,
  type TransferMaterialBody
} from './inventory.schema.js';

const ACTIVE = 'ACTIVE';
const ISSUED = 'ISSUED';
const RECEIVED = 'RECEIVED';
const MATERIAL_ISSUE_SEQUENCE = 'material-issue';
const GOODS_RECEIPT_SEQUENCE = 'goods-receipt';
const SCALE_4 = 10_000n;
const MONEY_DIVISOR = 1_000_000n;

type DecimalLike = string | Readonly<{ toString(): string }>;

/** Normalize one status or code token for case-insensitive comparisons. */
function token(value: string): string {
  return value.trim().toUpperCase();
}

/** Convert one exact four-decimal string/value to scaled integer arithmetic. */
function decimalToScale4(value: DecimalLike): bigint {
  const text = value.toString().trim();
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const scaled = (BigInt(whole || '0') * SCALE_4) + BigInt((fraction + '0000').slice(0, 4));
  return negative ? -scaled : scaled;
}

/** Convert one scaled integer back to an exact four-decimal string. */
function scale4ToDecimal(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / SCALE_4}.${(absolute % SCALE_4).toString().padStart(4, '0')}`;
}

/** Divide exact integers with half-up rounding. */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new ValidationError({ message: 'Inventory calculation denominator must be positive.' });
  return (numerator + denominator / 2n) / denominator;
}

/** Convert quantity times unit cost into a two-decimal money string. */
function quantityCostToMoney(quantity: bigint, unitCost: bigint): string {
  const minor = divideRoundHalfUp(quantity * unitCost, MONEY_DIVISOR);
  return `${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`;
}

/** Parse a YYYY-MM-DD business date without local-time drift. */
function inputDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Convert page/query input into repository pagination. */
function pageWindow(input: Readonly<{ page?: number | undefined; pageSize?: number | undefined }>) {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 50;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Map a Material row to the public response. */
function materialResponse(row: any) {
  return { id: row.id, code: row.code, name: row.name, unit: row.unit, category: row.category ?? null, status: row.status };
}

/** Map one stock-ledger row to precision-safe public values. */
function ledgerResponse(row: any) {
  return {
    id: row.id,
    warehouseId: row.warehouseId,
    materialId: row.materialId,
    projectId: row.projectId ?? null,
    stageId: row.stageId ?? null,
    movementType: row.movementType,
    quantity: row.quantity.toString(),
    unitCost: row.unitCost.toString(),
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    occurredAt: row.occurredAt.toISOString()
  };
}

/** Map one persisted Material Issue and its lines. */
function materialIssueResponse(row: any) {
  return {
    id: row.id,
    projectId: row.projectId,
    stageId: row.stageId ?? null,
    warehouseId: row.warehouseId,
    issueNo: row.issueNo,
    issueDate: row.issueDate.toISOString().slice(0, 10),
    status: row.status,
    items: row.items.map((item: any) => ({
      id: item.id,
      materialId: item.materialId,
      quantity: item.quantity.toString(),
      unitCost: item.unitCost.toString(),
      lineCost: item.lineCost.toString()
    }))
  };
}

/** Final Module 11 business logic with source-derived stock and Project cost. */
export class InventoryService {
  /** Bind Inventory behavior to the application database. */
  constructor(private readonly db: DatabaseClient) {}

  /** Resolve whether the actor has one persisted Company-level permission. */
  private async hasCompanyPermission(repository: AdministrationRepository, permission: string, asOf: Date): Promise<boolean> {
    const security = requireRequestSecurityContext();
    const permissions = await repository.findEffectivePermissionCodes({
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ACTIVE],
      roleStatuses: [ACTIVE]
    });
    return permissions.includes(permission);
  }

  /** Require one Company-level permission for Company-owned masters. */
  private async requireCompanyPermission(repository: AdministrationRepository, permission: string, asOf: Date): Promise<void> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw new AuthorizationError();
    if (!(await this.hasCompanyPermission(repository, permission, asOf))) throw new AuthorizationError();
  }

  /** Require one permission for one Project inside trusted request scope. */
  private async requireProjectPermission(repository: AdministrationRepository, projectId: string, permission: string, asOf: Date): Promise<void> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw new AuthorizationError();
    if (security.projectScope.kind === 'restricted' && !security.projectScope.projectIds.includes(projectId)) throw new AuthorizationError();
    const permissions = await repository.findEffectivePermissionCodesForProject(projectId, {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ACTIVE],
      roleStatuses: [ACTIVE]
    });
    if (permissions === null) throw new NotFoundError();
    if (!permissions.includes(permission)) throw new AuthorizationError();
  }

  /** Resolve visible Project/Company Warehouses for one Inventory permission. */
  private async resolveVisibility(repository: AdministrationRepository, permission: string, asOf: Date): Promise<InventoryVisibility> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw new AuthorizationError();
    const companyPermission = await this.hasCompanyPermission(repository, permission, asOf);
    const candidates = security.projectScope.kind === 'restricted' ? [...security.projectScope.projectIds] : null;
    if (companyPermission) {
      return { allowedProjectIds: candidates, includeCompanyWideWarehouses: security.projectScope.kind === 'all' };
    }
    const projectIds = await repository.listProjectIdsWithPermission(permission, candidates, {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ACTIVE],
      roleStatuses: [ACTIVE]
    });
    if (projectIds.length === 0) throw new AuthorizationError();
    return { allowedProjectIds: projectIds, includeCompanyWideWarehouses: false };
  }

  /** Require Warehouse permission using its owning Project or Company scope. */
  private async requireWarehousePermission(repository: AdministrationRepository, warehouse: any, permission: string, asOf: Date): Promise<void> {
    if (warehouse.projectId) {
      await this.requireProjectPermission(repository, warehouse.projectId, permission, asOf);
      return;
    }
    if (requireRequestSecurityContext().projectScope.kind !== 'all') throw new AuthorizationError();
    await this.requireCompanyPermission(repository, permission, asOf);
  }

  /** List Material master rows after persisted authorization. */
  async listMaterials(query: ListMaterialsQuery) {
    await this.resolveVisibility(new AdministrationRepository(this.db), 'inventory.read', new Date());
    const page = pageWindow(query);
    const result = await new InventoryRepository(this.db).listMaterials(page);
    return { items: result.items.map(materialResponse), total: result.total, page: page.page, pageSize: page.pageSize };
  }

  /** Create one Company Material exactly once. */
  async createMaterial(input: CreateMaterialBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'inventory.material.create', idempotencyKey, fingerprintInput: input
    }, async (tx) => {
      const users = new AdministrationRepository(tx);
      await this.requireCompanyPermission(users, 'materials.manage', new Date());
      const repository = new InventoryRepository(tx);
      const code = token(input.code);
      if (await repository.findMaterialByCode(code)) throw new ConflictError({ message: 'Material code already exists in this company.' });
      const material = await repository.createMaterial({ code, name: input.name, unit: token(input.unit), category: input.category ?? null, status: ACTIVE });
      const response = materialResponse(material);
      await recordAudit(tx, { action: 'material.created', entityType: 'material', entityId: material.id, after: response });
      await recordOutboxEvent(tx, { eventType: 'inventory.material_created', resourceType: 'material', resourceId: material.id, payload: response });
      return { statusCode: 201, body: response };
    });
    return result.response.body;
  }

  /** Read derived stock balances and Warehouse options without storing editable totals. */
  async listStock(query: ListStockQuery) {
    const now = new Date();
    const visibility = await this.resolveVisibility(new AdministrationRepository(this.db), 'inventory.read', now);
    const page = pageWindow(query);
    const result = await new InventoryRepository(this.db).listStock({ ...page, visibility, warehouseId: query.warehouseId, materialId: query.materialId });
    return {
      items: result.items.map((row: any) => ({
        warehouseId: row.warehouse.id,
        warehouseCode: row.warehouse.code,
        warehouseName: row.warehouse.name,
        projectId: row.warehouse.projectId ?? null,
        materialId: row.material.id,
        materialCode: row.material.code,
        materialName: row.material.name,
        unit: row.material.unit,
        quantityOnHand: row.quantityOnHand.toString(),
        averageCost: row.averageCost.toString()
      })),
      warehouses: result.warehouses.map((row: any) => ({ id: row.id, projectId: row.projectId ?? null, code: row.code, name: row.name, status: row.status })),
      total: result.total,
      page: page.page,
      pageSize: page.pageSize
    };
  }

  /** Read the append-only stock ledger through the same Project permission scope. */
  async listLedger(query: ListLedgerQuery) {
    const visibility = await this.resolveVisibility(new AdministrationRepository(this.db), 'inventory.read', new Date());
    const page = pageWindow(query);
    const result = await new InventoryRepository(this.db).listLedger({ ...page, visibility, ...query });
    return { items: result.items.map(ledgerResponse), total: result.total, page: page.page, pageSize: page.pageSize };
  }

  /** Create one Project/Stage material issue and its actual cost exactly once. */
  async createMaterialIssue(input: CreateMaterialIssueBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'inventory.issue', idempotencyKey, fingerprintInput: input
    }, async (tx) => this.createMaterialIssueOnce(tx, input));
    return result.response.body;
  }

  /** Execute one atomic Material Issue inside the idempotency transaction. */
  private async createMaterialIssueOnce(tx: TransactionClient, input: CreateMaterialIssueBody) {
    const now = new Date();
    const users = new AdministrationRepository(tx);
    await this.requireProjectPermission(users, input.projectId, 'inventory.issue', now);
    const repository = new InventoryRepository(tx);
    const project = await repository.findProjectById(input.projectId);
    if (!project || token(project.status) !== ACTIVE) throw new ConflictError({ message: 'Material issues require an active project.' });
    if (input.stageId && !(await repository.findStage(input.projectId, input.stageId))) throw createModule11Error('INVALID_STAGE_ISSUE');
    const visibility: InventoryVisibility = { allowedProjectIds: [input.projectId], includeCompanyWideWarehouses: requireRequestSecurityContext().projectScope.kind === 'all' };
    const warehouse = await repository.findWarehouseById(input.warehouseId, visibility);
    if (!warehouse) throw createModule11Error('WAREHOUSE_NOT_FOUND');
    await this.requireWarehousePermission(users, warehouse, 'inventory.issue', now);
    if (warehouse.projectId && warehouse.projectId !== input.projectId) throw createModule11Error('WAREHOUSE_NOT_FOUND');

    const uniqueMaterialIds = new Set(input.items.map((item) => item.materialId));
    if (uniqueMaterialIds.size !== input.items.length) throw new ValidationError({ message: 'A material may appear only once in one issue.' });
    const sortedMaterialIds = [...uniqueMaterialIds].sort();
    for (const materialId of sortedMaterialIds) await repository.lockStockKey(warehouse.id, materialId);

    const prepared: Array<{ material: any; quantity: bigint; unitCost: bigint; lineCost: string }> = [];
    for (const line of input.items) {
      const material = await repository.findMaterialById(line.materialId);
      if (!material || token(material.status) !== ACTIVE) throw createModule11Error('MATERIAL_NOT_FOUND');
      const position = await repository.getStockPosition(warehouse.id, material.id);
      const quantity = decimalToScale4(line.quantity);
      const available = decimalToScale4(position?.quantityOnHand ?? '0');
      if (quantity > available) throw createModule11Error('INSUFFICIENT_STOCK');
      const unitCost = decimalToScale4(position?.averageCost ?? '0');
      prepared.push({ material, quantity, unitCost, lineCost: quantityCostToMoney(quantity, unitCost) });
    }

    const number = await allocateCompanyNumber(tx, { sequenceKey: MATERIAL_ISSUE_SEQUENCE });
    const issue = await repository.createMaterialIssue({
      projectId: input.projectId,
      stageId: input.stageId ?? null,
      warehouseId: warehouse.id,
      issueNo: number.formatted,
      issueDate: inputDate(input.issueDate),
      description: input.description ?? null,
      issuedBy: requireRequestSecurityContext().actorUserId,
      status: ISSUED
    });

    const persistedItems = [];
    for (const line of prepared) {
      const issueItem = await repository.createMaterialIssueItem({
        issueId: issue.id,
        materialId: line.material.id,
        quantity: scale4ToDecimal(line.quantity),
        unitCost: scale4ToDecimal(line.unitCost),
        lineCost: line.lineCost
      });
      await repository.createLedgerEntry({
        materialId: line.material.id,
        warehouseId: warehouse.id,
        projectId: input.projectId,
        stageId: input.stageId ?? null,
        movementType: 'ISSUE',
        quantity: scale4ToDecimal(-line.quantity),
        unitCost: scale4ToDecimal(line.unitCost),
        sourceType: 'material_issue',
        sourceId: issueItem.id,
        occurredAt: now
      });
      await repository.createMaterialCostActual({
        projectId: input.projectId,
        stageId: input.stageId ?? null,
        sourceId: issueItem.id,
        sourceKey: `inventory_issue:${issue.id}:${issueItem.id}`,
        postingDate: inputDate(input.issueDate),
        amount: line.lineCost
      });
      persistedItems.push(issueItem);
    }

    const response = materialIssueResponse({ ...issue, items: persistedItems });
    await recordAudit(tx, { action: 'inventory.material_issued', entityType: 'material_issue', entityId: issue.id, after: response });
    await recordOutboxEvent(tx, { eventType: 'inventory.material_issued', resourceType: 'material_issue', resourceId: issue.id, payload: response });
    return { statusCode: 201, body: response };
  }

  /** Transfer stock between two Warehouses with one server-derived valuation. */
  async transferMaterial(input: TransferMaterialBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'inventory.transfer', idempotencyKey, fingerprintInput: input
    }, async (tx) => {
      const now = new Date();
      const users = new AdministrationRepository(tx);
      const visibility = await this.resolveVisibility(users, 'inventory.transfer', now);
      const repository = new InventoryRepository(tx);
      const [source, destination, material] = await Promise.all([
        repository.findWarehouseById(input.sourceWarehouseId, visibility),
        repository.findWarehouseById(input.destinationWarehouseId, visibility),
        repository.findMaterialById(input.materialId)
      ]);
      if (!source || !destination) throw createModule11Error('WAREHOUSE_NOT_FOUND');
      if (!material || token(material.status) !== ACTIVE) throw createModule11Error('MATERIAL_NOT_FOUND');
      await this.requireWarehousePermission(users, source, 'inventory.transfer', now);
      await this.requireWarehousePermission(users, destination, 'inventory.transfer', now);
      for (const warehouseId of [source.id, destination.id].sort()) await repository.lockStockKey(warehouseId, material.id);
      const position = await repository.getStockPosition(source.id, material.id);
      const quantity = decimalToScale4(input.quantity);
      if (quantity > decimalToScale4(position?.quantityOnHand ?? '0')) throw createModule11Error('INSUFFICIENT_STOCK');
      const unitCost = decimalToScale4(position?.averageCost ?? '0');
      const sourceId = requireRequestContext().requestId;
      const outbound = await repository.createLedgerEntry({ materialId: material.id, warehouseId: source.id, projectId: source.projectId, movementType: 'TRANSFER_OUT', quantity: scale4ToDecimal(-quantity), unitCost: scale4ToDecimal(unitCost), sourceType: 'inventory_transfer', sourceId, occurredAt: now });
      const inbound = await repository.createLedgerEntry({ materialId: material.id, warehouseId: destination.id, projectId: destination.projectId, movementType: 'TRANSFER_IN', quantity: scale4ToDecimal(quantity), unitCost: scale4ToDecimal(unitCost), sourceType: 'inventory_transfer', sourceId, occurredAt: now });
      const response = { transactions: [ledgerResponse(outbound), ledgerResponse(inbound)] };
      await recordAudit(tx, { action: 'inventory.transferred', entityType: 'stock_ledger', entityId: outbound.id, after: response });
      await recordOutboxEvent(tx, { eventType: 'inventory.transferred', resourceType: 'stock_ledger', resourceId: outbound.id, payload: response });
      return { statusCode: 201, body: response };
    });
    return result.response.body;
  }

  /** Apply one controlled compensating stock adjustment without deleting history. */
  async adjustStock(input: AdjustStockBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'inventory.adjust', idempotencyKey, fingerprintInput: input
    }, async (tx) => {
      const now = new Date();
      const users = new AdministrationRepository(tx);
      const visibility = await this.resolveVisibility(users, 'inventory.adjust', now);
      const repository = new InventoryRepository(tx);
      const [warehouse, material] = await Promise.all([
        repository.findWarehouseById(input.warehouseId, visibility),
        repository.findMaterialById(input.materialId)
      ]);
      if (!warehouse) throw createModule11Error('WAREHOUSE_NOT_FOUND');
      if (!material || token(material.status) !== ACTIVE) throw createModule11Error('MATERIAL_NOT_FOUND');
      await this.requireWarehousePermission(users, warehouse, 'inventory.adjust', now);
      await repository.lockStockKey(warehouse.id, material.id);
      const position = await repository.getStockPosition(warehouse.id, material.id);
      const delta = decimalToScale4(input.quantityDelta);
      const available = decimalToScale4(position?.quantityOnHand ?? '0');
      if (delta < 0n && -delta > available) throw createModule11Error('INSUFFICIENT_STOCK');
      const unitCost = decimalToScale4(position?.averageCost ?? '0');
      const movement = await repository.createLedgerEntry({
        materialId: material.id,
        warehouseId: warehouse.id,
        projectId: warehouse.projectId,
        movementType: 'ADJUSTMENT',
        quantity: scale4ToDecimal(delta),
        unitCost: scale4ToDecimal(unitCost),
        sourceType: 'inventory_adjustment',
        sourceId: requireRequestContext().requestId,
        occurredAt: now
      });
      const response = { ...ledgerResponse(movement), reason: input.reason };
      await recordAudit(tx, { action: 'inventory.adjusted', entityType: 'stock_ledger', entityId: movement.id, after: response });
      await recordOutboxEvent(tx, { eventType: 'inventory.adjusted', resourceType: 'stock_ledger', resourceId: movement.id, payload: response });
      return { statusCode: 201, body: response };
    });
    return result.response.body;
  }

  /** Receive one issued Purchase Order into stock atomically for the Procurement module. */
  async receiveInventory(input: ReceiveInventoryBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'goods_receipts.create', idempotencyKey, fingerprintInput: input
    }, async (tx) => this.receiveInventoryOnce(tx, input));
    return result.response.body;
  }

  /** Execute one Goods Receipt and all resulting stock ledger rows in one transaction. */
  private async receiveInventoryOnce(tx: TransactionClient, input: ReceiveInventoryBody) {
    const now = new Date();
    const users = new AdministrationRepository(tx);
    const repository = new InventoryRepository(tx);
    const purchaseOrder = await repository.findPurchaseOrderForReceipt(input.purchaseOrderId);
    if (!purchaseOrder || token(purchaseOrder.status) !== ISSUED) throw new ConflictError({ message: 'Purchase Order is not receivable.' });
    await this.requireProjectPermission(users, purchaseOrder.projectId, 'goods_receipts.create', now);
    const visibility: InventoryVisibility = { allowedProjectIds: [purchaseOrder.projectId], includeCompanyWideWarehouses: requireRequestSecurityContext().projectScope.kind === 'all' };
    const warehouse = await repository.findWarehouseById(input.warehouseId, visibility);
    if (!warehouse || (warehouse.projectId && warehouse.projectId !== purchaseOrder.projectId)) throw createModule11Error('WAREHOUSE_NOT_FOUND');
    await this.requireWarehousePermission(users, warehouse, 'goods_receipts.create', now);
    const poItems = new Map(purchaseOrder.items.map((row: any) => [row.id, row]));
    const requestedPoItemIds = new Set(input.items.map((item) => item.poItemId));
    if (requestedPoItemIds.size !== input.items.length) throw new ValidationError({ message: 'A Purchase Order line may appear only once in one Goods Receipt.' });
    const prepared = [];

    for (const requested of input.items) {
      const line: any = poItems.get(requested.poItemId);
      if (!line || line.itemId !== requested.itemId) throw new ValidationError({ message: 'Goods Receipt line does not match the Purchase Order material.' });
      const material = await repository.findMaterialById(requested.itemId);
      if (!material || token(material.status) !== ACTIVE) throw createModule11Error('MATERIAL_NOT_FOUND');
      if (token(material.unit) !== token(line.unit)) throw new ValidationError({ message: 'Purchase Order unit must match the Material base unit.' });
      const quantity = decimalToScale4(requested.quantity);
      const accepted = decimalToScale4(requested.acceptedQty);
      const rejected = decimalToScale4(requested.rejectedQty);
      if (accepted + rejected !== quantity) throw new ValidationError({ message: 'Accepted plus rejected quantity must equal received quantity.' });
      const locked = await repository.lockPurchaseOrderItem(line.id);
      if (!locked) throw new NotFoundError();
      if (decimalToScale4(locked.receivedQty) + quantity > decimalToScale4(locked.quantity)) throw createModule11Error('RECEIPT_EXCEEDS_PO');
      prepared.push({
        poItemId: line.id,
        itemId: material.id,
        stageId: line.stageId ?? null,
        quantity: scale4ToDecimal(quantity),
        sourceUnit: material.unit,
        conversionFactor: '1.0000',
        sourceUnitCost: line.unitRate.toString(),
        unitCost: line.unitRate.toString(),
        acceptedQty: scale4ToDecimal(accepted),
        rejectedQty: scale4ToDecimal(rejected),
        batchNo: requested.batchNo ?? null,
        baseQuantity: scale4ToDecimal(quantity),
        acceptedBaseQty: scale4ToDecimal(accepted),
        rejectedBaseQty: scale4ToDecimal(rejected)
      });
    }

    const number = await allocateCompanyNumber(tx, { sequenceKey: GOODS_RECEIPT_SEQUENCE });
    const receipt = await repository.createGoodsReceipt({
      projectId: purchaseOrder.projectId,
      vendorId: purchaseOrder.vendorId,
      warehouseId: warehouse.id,
      receiptNo: number.formatted,
      purchaseOrderId: purchaseOrder.id,
      receivedAt: now,
      status: RECEIVED,
      receivedBy: requireRequestSecurityContext().actorUserId,
      items: prepared
    });

    for (const item of receipt.items) {
      const accepted = decimalToScale4(item.acceptedQty);
      if (accepted === 0n) continue;
      await repository.addPurchaseOrderReceivedQuantity(item.poItemId, scale4ToDecimal(accepted));
      await repository.lockStockKey(warehouse.id, item.itemId);
      await repository.createLedgerEntry({
        materialId: item.itemId,
        warehouseId: warehouse.id,
        projectId: purchaseOrder.projectId,
        stageId: item.stageId ?? null,
        movementType: 'RECEIPT',
        quantity: scale4ToDecimal(accepted),
        unitCost: item.unitCost.toString(),
        sourceType: 'goods_receipt',
        sourceId: item.id,
        occurredAt: now
      });
    }

    const receiptEvent = { receiptId: receipt.id, projectId: receipt.projectId };
    await recordAudit(tx, { action: 'inventory.receipt_posted', entityType: 'goods_receipt', entityId: receipt.id, after: receiptEvent });
    await recordOutboxEvent(tx, { eventType: 'goods_receipt.posted', resourceType: 'goods_receipt', resourceId: receipt.id, payload: receiptEvent });
    await recordOutboxEvent(tx, { eventType: 'inventory.receipt_posted', resourceType: 'goods_receipt', resourceId: receipt.id, payload: receiptEvent });
    return { statusCode: 201, body: receipt };
  }
}
