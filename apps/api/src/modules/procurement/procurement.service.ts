import { recordAudit } from '@construction-erp/audit';
import type { DatabaseClient } from '@construction-erp/database';
import { AppError, AuthorizationError, ConflictError, NotFoundError, ValidationError } from '@construction-erp/errors';
import { executeIdempotentCommand } from '@construction-erp/idempotency';
import { allocateCompanyNumber } from '@construction-erp/numbering';
import { recordOutboxEvent } from '@construction-erp/outbox';
import { requireRequestSecurityContext } from '@construction-erp/request-context';
import { InventoryService } from '../inventory/inventory.service.js';
import { AdministrationRepository } from '../administration/administration.repository.js';
import { ProcurementRepository, type ProjectVisibility, type PurchaseOrderLineWrite } from './procurement.repository.js';
import {
  createProcurementError,
  type CancelPurchaseOrderBody,
  type CreateGoodsReceiptBody,
  type CreatePurchaseOrderBody,
  type CreatePurchaseRequisitionBody,
  type ListPurchaseOrdersQuery,
  type ListPurchaseRequisitionsQuery,
  type ProcurementPermissionCode
} from './procurement.schema.js';

const REQUISITION_SEQUENCE_KEY = 'purchase-requisition';
const PURCHASE_ORDER_SEQUENCE_KEY = 'purchase-order';
const ASSIGNMENT_ACTIVE = 'ACTIVE';
const ROLE_ACTIVE = 'ACTIVE';
const PROJECT_SUSPENDED = 'SUSPENDED';
const PROJECT_CLOSED = 'CLOSED';
const REQUISITION_DRAFT = 'DRAFT';
const REQUISITION_APPROVED = 'APPROVED';
const PO_DRAFT = 'DRAFT';
const PO_ISSUED = 'ISSUED';
const PO_CANCELLED = 'CANCELLED';
const VENDOR_ACTIVE = 'ACTIVE';
const VENDOR_QUALIFIED = 'QUALIFIED';
const VENDOR_PENDING = 'PENDING';
const DECIMAL_SCALE_4 = 10_000n;
const MAX_MONEY_MINOR_UNITS = 999_999_999_999_999_999n;

type DecimalLike = Readonly<{ toString(): string }> | string;
type PurchaseRequisitionRecord = NonNullable<Awaited<ReturnType<ProcurementRepository['findPurchaseRequisitionById']>>>;
type PurchaseRequisitionItemRecord = PurchaseRequisitionRecord['items'][number];
type PurchaseOrderRecord = NonNullable<Awaited<ReturnType<ProcurementRepository['findPurchaseOrderById']>>>;
type PurchaseOrderItemRecord = PurchaseOrderRecord['items'][number];
type GoodsReceiptRecord = NonNullable<Awaited<ReturnType<ProcurementRepository['findGoodsReceiptById']>>>;
type GoodsReceiptItemRecord = GoodsReceiptRecord['items'][number];

/** Compare one internal string-backed lifecycle token. */
function hasStatus(value: string, expected: string): boolean {
  return value.trim().toUpperCase() === expected;
}

/** Convert one exact quantity/rate token to four-decimal scaled integer form. */
function decimalToScale4(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return (BigInt(whole) * DECIMAL_SCALE_4) + BigInt(`${fraction}0000`.slice(0, 4));
}

/** Convert exact money minor units to the API/storage two-decimal representation. */
function minorUnitsToMoney(value: bigint): string {
  if (value < 0n || value > MAX_MONEY_MINOR_UNITS) throw new ValidationError({ message: 'Calculated Purchase Order amount is outside the supported range.' });
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
}

/** Round one positive integer ratio half-up without floating-point arithmetic. */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + (denominator / 2n)) / denominator;
}

/** Convert a stored Prisma decimal-like value to a stable string. */
function storedDecimal(value: DecimalLike): string {
  return value.toString();
}

/** Convert one date to the API YYYY-MM-DD representation. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Map one persisted material requirement to the Final-21 response contract. */
function requisitionResponse(row: PurchaseRequisitionRecord) {
  return {
    id: row.id,
    projectId: row.projectId,
    stageId: row.stageId ?? null,
    requestNo: row.prNo,
    requestedBy: row.requestedBy,
    requiredDate: dateOnly(row.requiredDate),
    status: row.status,
    notes: row.purpose?.trim() ? row.purpose : null,
    items: row.items.map((item: PurchaseRequisitionItemRecord) => ({
      id: item.id,
      requisitionId: item.requisitionId,
      materialId: item.itemId,
      description: item.description,
      quantity: storedDecimal(item.quantity),
      unit: item.unit,
      stageId: item.stageId ?? null
    }))
  };
}

/** Map one persisted Purchase Order to the Final-21 response contract. */
function purchaseOrderResponse(row: PurchaseOrderRecord) {
  return {
    id: row.id,
    projectId: row.projectId,
    requisitionId: row.requisitionId ?? null,
    poNo: row.poNo,
    vendorId: row.vendorId,
    orderDate: dateOnly(row.orderDate),
    currency: row.currency,
    status: row.status,
    subtotal: storedDecimal(row.subtotal),
    taxAmount: storedDecimal(row.tax),
    totalAmount: storedDecimal(row.total),
    deliveryAddress: row.deliveryAddress,
    terms: row.terms,
    cancelReason: row.cancelReason ?? null,
    items: row.items.map((item: PurchaseOrderItemRecord) => ({
      id: item.id,
      purchaseOrderId: item.purchaseOrderId,
      requisitionItemId: item.requisitionItemId ?? null,
      materialId: item.itemId,
      stageId: item.stageId ?? null,
      description: item.description,
      quantity: storedDecimal(item.quantity),
      unit: item.unit,
      unitPrice: storedDecimal(item.unitRate),
      taxRate: storedDecimal(item.taxRate),
      lineTotal: storedDecimal(item.lineTotal),
      receivedQuantity: storedDecimal(item.receivedQty)
    }))
  };
}

/** Map one Inventory-owned receipt record to the Final-21 Procurement response contract. */
function goodsReceiptResponse(row: GoodsReceiptRecord) {
  return {
    id: row.id,
    projectId: row.projectId,
    vendorId: row.vendorId,
    warehouseId: row.warehouseId,
    receiptNo: row.receiptNo,
    purchaseOrderId: row.purchaseOrderId,
    receivedAt: row.receivedAt instanceof Date ? row.receivedAt.toISOString() : row.receivedAt,
    status: row.status,
    receivedBy: row.receivedBy,
    items: row.items.map((item: GoodsReceiptItemRecord) => ({
      id: item.id,
      goodsReceiptId: item.goodsReceiptId,
      poItemId: item.poItemId,
      materialId: item.itemId,
      stageId: item.stageId ?? null,
      quantity: storedDecimal(item.quantity),
      acceptedQuantity: storedDecimal(item.acceptedQty),
      rejectedQuantity: storedDecimal(item.rejectedQty),
      batchNo: item.batchNo ?? null
    }))
  };
}

/** Return whether one supplier can be used for a new Purchase Order. */
function isPurchasableVendor(vendor: Readonly<{ status: string; qualificationStatus?: string | null }>): boolean {
  if (!hasStatus(vendor.status, VENDOR_ACTIVE)) return false;
  if (vendor.qualificationStatus === null || vendor.qualificationStatus === undefined) return true;
  if (hasStatus(vendor.qualificationStatus, VENDOR_PENDING)) return false;
  return hasStatus(vendor.qualificationStatus, VENDOR_QUALIFIED);
}

/** Calculate authoritative PO line and header totals from approved requirement lines. */
function preparePurchaseOrderLines(input: CreatePurchaseOrderBody, requisition: PurchaseRequisitionRecord): Readonly<{ items: PurchaseOrderLineWrite[]; subtotal: string; taxAmount: string; totalAmount: string }> {
  const requestedById = new Map(requisition.items.map((item) => [item.id, item] as const));
  const unique = new Set<string>();
  const items: PurchaseOrderLineWrite[] = [];
  let subtotal = 0n;
  let tax = 0n;

  for (const line of input.items) {
    if (unique.has(line.requisitionItemId)) throw new ValidationError({ message: 'A material requirement line may appear only once in one Purchase Order.' });
    unique.add(line.requisitionItemId);
    const requirement = requestedById.get(line.requisitionItemId);
    if (!requirement) throw new ValidationError({ message: 'Every Purchase Order line must belong to the approved material requirement.' });

    if (!requirement.itemId) throw new ValidationError({ message: 'Every Purchase Order line requires a material from the approved requirement.' });

    const quantity = decimalToScale4(line.quantity);
    const unitPrice = decimalToScale4(line.unitPrice);
    const taxRate = decimalToScale4(line.taxRate);
    const lineSubtotal = divideRoundHalfUp(quantity * unitPrice, 1_000_000n);
    const lineTax = divideRoundHalfUp(quantity * unitPrice * taxRate, 1_000_000_000_000n);
    const lineTotal = lineSubtotal + lineTax;
    subtotal += lineSubtotal;
    tax += lineTax;

    items.push({
      requisitionItemId: requirement.id,
      materialId: requirement.itemId,
      stageId: requirement.stageId ?? null,
      description: requirement.description,
      quantity: line.quantity,
      unit: requirement.unit,
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
      lineTotal: minorUnitsToMoney(lineTotal)
    });
  }

  return { items, subtotal: minorUnitsToMoney(subtotal), taxAmount: minorUnitsToMoney(tax), totalAmount: minorUnitsToMoney(subtotal + tax) };
}

/** Final-21 Procurement business rules for requirements, POs and goods-receipt flow. */
export class ProcurementService {
  /** Bind Procurement business logic to the database. */
  constructor(private readonly db: DatabaseClient) {}

  /** Require one Project permission and enforce authenticated Project scope. */
  private async requireProjectPermission(repository: AdministrationRepository, projectId: string, permission: ProcurementPermissionCode, asOf: Date): Promise<void> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw new AuthorizationError();
    if (security.projectScope.kind === 'restricted' && !security.projectScope.projectIds.includes(projectId)) throw new AuthorizationError();
    const effective = await repository.findEffectivePermissionCodesForProject(projectId, { userId: security.actorUserId, asOf, assignmentStatuses: [ASSIGNMENT_ACTIVE], roleStatuses: [ROLE_ACTIVE] });
    if (effective === null) throw new NotFoundError();
    if (!effective.includes(permission)) throw new AuthorizationError();
  }

  /** Resolve Projects visible for one Procurement permission. */
  private async resolveProjectVisibility(repository: AdministrationRepository, permission: ProcurementPermissionCode, asOf: Date): Promise<ProjectVisibility> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw new AuthorizationError();
    const candidateIds = security.projectScope.kind === 'restricted' ? [...security.projectScope.projectIds] : null;
    const companyPermissions = await repository.findEffectivePermissionCodes({ userId: security.actorUserId, asOf, assignmentStatuses: [ASSIGNMENT_ACTIVE], roleStatuses: [ROLE_ACTIVE] });
    if (companyPermissions.includes(permission)) return { allowedProjectIds: candidateIds };
    return { allowedProjectIds: await repository.listProjectIdsWithPermission(permission, candidateIds, { userId: security.actorUserId, asOf, assignmentStatuses: [ASSIGNMENT_ACTIVE], roleStatuses: [ROLE_ACTIVE] }) };
  }

  /** Reject normal Procurement writes against suspended or closed Projects. */
  private requireWritableProject(project: Readonly<{ status: string }>): void {
    if (hasStatus(project.status, PROJECT_SUSPENDED) || hasStatus(project.status, PROJECT_CLOSED)) {
      throw new ConflictError({ message: 'Suspended or closed Projects do not accept Procurement writes.' });
    }
  }

  /** Require every supplied Stage id to belong to the selected Project and Company. */
  private async requireProjectStages(repository: ProcurementRepository, projectId: string, stageIds: readonly (string | null | undefined)[]): Promise<void> {
    const requested = [...new Set(stageIds.filter((stageId): stageId is string => Boolean(stageId)))];
    if (requested.length === 0) return;
    const valid = new Set(await repository.findProjectStageIds(projectId, requested));
    if (requested.some((stageId) => !valid.has(stageId))) {
      throw new ValidationError({ code: 'INVALID_PROCUREMENT_STAGE', message: 'Every Procurement Stage must belong to the selected Project and Company.' });
    }
  }

  /** List permission-scoped material requirements. */
  async listPurchaseRequisitions(input: ListPurchaseRequisitionsQuery) {
    const now = new Date();
    const users = new AdministrationRepository(this.db);
    const visibility = await this.resolveProjectVisibility(users, 'procurement.read', now);
    if (input.projectId) await this.requireProjectPermission(users, input.projectId, 'procurement.read', now);
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const result = await new ProcurementRepository(this.db).listPurchaseRequisitions({ visibility, ...(input.projectId ? { projectId: input.projectId } : {}), skip: (page - 1) * pageSize, take: pageSize });
    return { items: result.items.map(requisitionResponse), total: result.total, page, pageSize };
  }

  /** Create one retry-safe draft material requirement for an allowed Project and optional Stage. */
  async createPurchaseRequisition(input: CreatePurchaseRequisitionBody, idempotencyKey: string) {
    const now = new Date();
    const users = new AdministrationRepository(this.db);
    await this.requireProjectPermission(users, input.projectId, 'requisitions.create', now);
    const repository = new ProcurementRepository(this.db);
    const project = await repository.findProjectById(input.projectId);
    if (!project) throw new NotFoundError({ message: 'Project was not found.' });
    this.requireWritableProject(project);

    const materialIds = [...new Set(input.items.map((item) => item.materialId))];
    const activeMaterialIds = new Set(await repository.findActiveMaterialIds(materialIds));
    if (materialIds.some((materialId) => !activeMaterialIds.has(materialId))) {
      throw new ValidationError({ message: 'Every material requirement line must reference an active Company material.' });
    }

    const effectiveItems = input.items.map((item) => ({
      materialId: item.materialId,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      stageId: item.stageId ?? input.stageId ?? null
    }));
    await this.requireProjectStages(repository, input.projectId, [input.stageId, ...effectiveItems.map((item) => item.stageId)]);
    const security = requireRequestSecurityContext();

    const result = await executeIdempotentCommand(
      this.db,
      { operation: 'procurement.requisition.create', idempotencyKey, fingerprintInput: input },
      async (tx) => {
        const number = await allocateCompanyNumber(tx, { sequenceKey: REQUISITION_SEQUENCE_KEY });
        const requisition = await new ProcurementRepository(tx).createPurchaseRequisition({
          projectId: input.projectId,
          stageId: input.stageId ?? null,
          requestNo: number.formatted,
          requestedBy: security.actorUserId,
          requiredDate: new Date(`${input.requiredDate}T00:00:00.000Z`),
          notes: input.notes ?? null,
          items: effectiveItems
        });
        const response = requisitionResponse(requisition);
        await recordAudit(tx, { action: 'requisition.created', entityType: 'purchase_requisition', entityId: requisition.id, after: response });
        await recordOutboxEvent(tx, { eventType: 'requisition.created', resourceType: 'purchase_requisition', resourceId: requisition.id, payload: response, occurredAt: now });
        return { statusCode: 201, body: response };
      }
    );
    return result.response.body;
  }

  /** Approve one draft material requirement exactly once through an explicit command. */
  async approvePurchaseRequisition(requisitionId: string, idempotencyKey: string) {
    const now = new Date();
    const users = new AdministrationRepository(this.db);
    const visibility = await this.resolveProjectVisibility(users, 'requisitions.approve', now);
    const current = await new ProcurementRepository(this.db).findPurchaseRequisitionById(requisitionId, visibility);
    if (!current) throw createProcurementError('REQUISITION_NOT_FOUND');
    await this.requireProjectPermission(users, current.projectId, 'requisitions.approve', now);
    await this.requireProjectStages(new ProcurementRepository(this.db), current.projectId, [current.stageId, ...current.items.map((item) => item.stageId)]);

    const result = await executeIdempotentCommand(
      this.db,
      { operation: 'procurement.requisition.approve', idempotencyKey, fingerprintInput: { requisitionId } },
      async (tx) => {
        const repository = new ProcurementRepository(tx);
        const locked = await repository.lockPurchaseRequisitionForWrite(current.projectId, current.id);
        if (!locked) throw createProcurementError('REQUISITION_NOT_FOUND');
        if (hasStatus(locked.status, REQUISITION_APPROVED)) {
          const existing = await repository.findPurchaseRequisitionById(current.id, { allowedProjectIds: [current.projectId] });
          if (!existing) throw createProcurementError('REQUISITION_NOT_FOUND');
          return { statusCode: 200, body: requisitionResponse(existing) };
        }
        if (!hasStatus(locked.status, REQUISITION_DRAFT)) throw createProcurementError('REQUISITION_NOT_APPROVABLE');
        const approved = await repository.updatePurchaseRequisitionStatus(current.id, REQUISITION_DRAFT, REQUISITION_APPROVED);
        if (!approved) throw createProcurementError('REQUISITION_NOT_APPROVABLE');
        const response = requisitionResponse(approved);
        await recordAudit(tx, { action: 'requisition.approved', entityType: 'purchase_requisition', entityId: approved.id, before: { status: REQUISITION_DRAFT }, after: { status: approved.status } });
        await recordOutboxEvent(tx, { eventType: 'requisition.approved', resourceType: 'purchase_requisition', resourceId: approved.id, payload: response, occurredAt: now });
        return { statusCode: 200, body: response };
      }
    );
    return result.response.body;
  }

  /** List permission-scoped Purchase Orders from the same Procurement module. */
  async listPurchaseOrders(input: ListPurchaseOrdersQuery) {
    const now = new Date();
    const users = new AdministrationRepository(this.db);
    const visibility = await this.resolveProjectVisibility(users, 'procurement.read', now);
    if (input.projectId) await this.requireProjectPermission(users, input.projectId, 'procurement.read', now);
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const result = await new ProcurementRepository(this.db).listPurchaseOrders({ visibility, ...(input.projectId ? { projectId: input.projectId } : {}), skip: (page - 1) * pageSize, take: pageSize });
    return { items: result.items.map(purchaseOrderResponse), total: result.total, page, pageSize };
  }

  /** Get one permission-scoped Purchase Order. */
  async getPurchaseOrder(purchaseOrderId: string) {
    const now = new Date();
    const visibility = await this.resolveProjectVisibility(new AdministrationRepository(this.db), 'procurement.read', now);
    const purchaseOrder = await new ProcurementRepository(this.db).findPurchaseOrderById(purchaseOrderId, visibility);
    if (!purchaseOrder) throw createProcurementError('PO_NOT_FOUND');
    await this.requireProjectPermission(new AdministrationRepository(this.db), purchaseOrder.projectId, 'procurement.read', now);
    return purchaseOrderResponse(purchaseOrder);
  }

  /** Create one retry-safe draft PO from an approved material requirement with server-calculated totals. */
  async createPurchaseOrder(input: CreatePurchaseOrderBody, idempotencyKey: string) {
    const now = new Date();
    const users = new AdministrationRepository(this.db);
    const visibility = await this.resolveProjectVisibility(users, 'purchase_orders.create', now);
    const repository = new ProcurementRepository(this.db);
    const requisition = await repository.findPurchaseRequisitionById(input.requisitionId, visibility);
    if (!requisition) throw createProcurementError('REQUISITION_NOT_FOUND');
    await this.requireProjectPermission(users, requisition.projectId, 'purchase_orders.create', now);
    if (!hasStatus(requisition.status, REQUISITION_APPROVED)) throw new ConflictError({ code: 'REQUISITION_NOT_APPROVABLE', message: 'Only an approved material requirement can be converted to a Purchase Order.' });

    const project = await repository.findProjectById(requisition.projectId);
    if (!project) throw new NotFoundError({ message: 'Project was not found.' });
    this.requireWritableProject(project);
    await this.requireProjectStages(repository, requisition.projectId, [requisition.stageId, ...requisition.items.map((item) => item.stageId)]);

    const vendor = await repository.findVendorById(input.vendorId);
    if (!vendor || !isPurchasableVendor(vendor)) throw createProcurementError('VENDOR_NOT_ACTIVE');
    const prepared = preparePurchaseOrderLines(input, requisition);
    const required = new Map(requisition.items.map((item) => [item.id, decimalToScale4(item.quantity.toString())] as const));

    const result = await executeIdempotentCommand(
      this.db,
      { operation: 'procurement.purchase_order.create', idempotencyKey, fingerprintInput: input },
      async (tx) => {
        const txRepository = new ProcurementRepository(tx);
        const locked = await txRepository.lockPurchaseRequisitionForWrite(requisition.projectId, requisition.id);
        if (!locked || !hasStatus(locked.status, REQUISITION_APPROVED)) throw createProcurementError('REQUISITION_NOT_APPROVABLE');

        const ordered = await txRepository.listOrderedQuantities(prepared.items.map((item) => item.requisitionItemId));
        const existing = new Map(ordered.map((row) => [row.requisitionItemId, decimalToScale4(row._sum.quantity?.toString() ?? '0')] as const));
        for (const item of prepared.items) {
          const next = (existing.get(item.requisitionItemId) ?? 0n) + decimalToScale4(item.quantity);
          if (next > (required.get(item.requisitionItemId) ?? 0n)) throw createProcurementError('OVER_ORDER_NOT_ALLOWED');
        }

        const number = await allocateCompanyNumber(tx, { sequenceKey: PURCHASE_ORDER_SEQUENCE_KEY });
        const purchaseOrder = await txRepository.createPurchaseOrder({
          projectId: requisition.projectId,
          requisitionId: requisition.id,
          poNo: number.formatted,
          vendorId: input.vendorId,
          orderDate: new Date(`${input.orderDate}T00:00:00.000Z`),
          currency: input.currency,
          subtotal: prepared.subtotal,
          taxAmount: prepared.taxAmount,
          totalAmount: prepared.totalAmount,
          deliveryAddress: input.deliveryAddress,
          terms: input.terms,
          items: prepared.items
        });
        const response = purchaseOrderResponse(purchaseOrder);
        await recordAudit(tx, { action: 'purchase_order.created', entityType: 'purchase_order', entityId: purchaseOrder.id, after: response });
        return { statusCode: 201, body: response };
      }
    );
    return result.response.body;
  }

  /** Issue one draft PO exactly once and post one material commitment per line. */
  async issuePurchaseOrder(purchaseOrderId: string, idempotencyKey: string) {
    const now = new Date();
    const users = new AdministrationRepository(this.db);
    const visibility = await this.resolveProjectVisibility(users, 'purchase_orders.issue', now);
    const current = await new ProcurementRepository(this.db).findPurchaseOrderById(purchaseOrderId, visibility);
    if (!current) throw createProcurementError('PO_NOT_FOUND');
    await this.requireProjectPermission(users, current.projectId, 'purchase_orders.issue', now);
    await this.requireProjectStages(new ProcurementRepository(this.db), current.projectId, current.items.map((item) => item.stageId));

    const result = await executeIdempotentCommand(
      this.db,
      { operation: 'procurement.purchase_order.issue', idempotencyKey, fingerprintInput: { purchaseOrderId } },
      async (tx) => {
        const repository = new ProcurementRepository(tx);
        const locked = await repository.lockPurchaseOrderForWrite(current.projectId, current.id);
        if (!locked) throw createProcurementError('PO_NOT_FOUND');
        if (hasStatus(locked.status, PO_ISSUED)) {
          const existing = await repository.findPurchaseOrderById(current.id, { allowedProjectIds: [current.projectId] });
          if (!existing) throw createProcurementError('PO_NOT_FOUND');
          return { statusCode: 200, body: purchaseOrderResponse(existing) };
        }
        if (!hasStatus(locked.status, PO_DRAFT)) throw createProcurementError('PO_NOT_ISSUABLE');
        const issued = await repository.updatePurchaseOrderStatus(current.id, PO_DRAFT, PO_ISSUED);
        if (!issued) throw createProcurementError('PO_NOT_ISSUABLE');
        for (const item of issued.items) {
          await repository.upsertMaterialCommitment({
            projectId: issued.projectId,
            stageId: item.stageId ?? null,
            sourceId: issued.id,
            sourceKey: `purchase_order:${issued.id}:${item.id}`,
            amount: storedDecimal(item.lineTotal),
            status: 'ACTIVE',
            postedAt: now
          });
        }
        const response = purchaseOrderResponse(issued);
        await recordAudit(tx, { action: 'purchase_order.issued', entityType: 'purchase_order', entityId: issued.id, before: { status: PO_DRAFT }, after: { status: issued.status } });
        await recordOutboxEvent(tx, { eventType: 'purchase_order.issued', resourceType: 'purchase_order', resourceId: issued.id, payload: response, occurredAt: now });
        return { statusCode: 200, body: response };
      }
    );
    return result.response.body;
  }

  /** Cancel one draft or issued PO exactly once and cancel any remaining commitments. */
  async cancelPurchaseOrder(purchaseOrderId: string, input: CancelPurchaseOrderBody, idempotencyKey: string) {
    const now = new Date();
    const users = new AdministrationRepository(this.db);
    const visibility = await this.resolveProjectVisibility(users, 'purchase_orders.issue', now);
    const current = await new ProcurementRepository(this.db).findPurchaseOrderById(purchaseOrderId, visibility);
    if (!current) throw createProcurementError('PO_NOT_FOUND');
    await this.requireProjectPermission(users, current.projectId, 'purchase_orders.issue', now);
    const security = requireRequestSecurityContext();

    const result = await executeIdempotentCommand(
      this.db,
      { operation: 'procurement.purchase_order.cancel', idempotencyKey, fingerprintInput: { purchaseOrderId, ...input } },
      async (tx) => {
        const repository = new ProcurementRepository(tx);
        const locked = await repository.lockPurchaseOrderForWrite(current.projectId, current.id);
        if (!locked) throw createProcurementError('PO_NOT_FOUND');
        const lockedPurchaseOrder = await repository.findPurchaseOrderById(current.id, { allowedProjectIds: [current.projectId] });
        if (!lockedPurchaseOrder) throw createProcurementError('PO_NOT_FOUND');
        if (hasStatus(lockedPurchaseOrder.status, PO_CANCELLED)) return { statusCode: 200, body: purchaseOrderResponse(lockedPurchaseOrder) };
        if (![PO_DRAFT, PO_ISSUED].some((status) => hasStatus(lockedPurchaseOrder.status, status))) throw createProcurementError('PO_NOT_CANCELLABLE');
        if (lockedPurchaseOrder.items.some((item) => decimalToScale4(item.receivedQty.toString()) > 0n)) {
          throw new ConflictError({ code: 'PO_NOT_CANCELLABLE', message: 'A Purchase Order with received material cannot be cancelled.' });
        }
        const cancelled = await repository.updatePurchaseOrderStatus(current.id, lockedPurchaseOrder.status, PO_CANCELLED, { reason: input.reason, actorUserId: security.actorUserId, at: now });
        if (!cancelled) throw createProcurementError('PO_NOT_CANCELLABLE');
        await repository.cancelPurchaseOrderCommitments(cancelled.id, now);
        const response = purchaseOrderResponse(cancelled);
        await recordAudit(tx, { action: 'purchase_order.cancelled', entityType: 'purchase_order', entityId: cancelled.id, before: { status: lockedPurchaseOrder.status }, after: { status: cancelled.status, reason: input.reason } });
        return { statusCode: 200, body: response };
      }
    );
    return result.response.body;
  }

  /** Create one retry-safe Goods Receipt while Inventory applies the atomic stock effect. */
  async createGoodsReceipt(input: CreateGoodsReceiptBody, idempotencyKey: string) {
    const now = new Date();
    const users = new AdministrationRepository(this.db);
    const visibility = await this.resolveProjectVisibility(users, 'goods_receipts.create', now);
    const purchaseOrder = await new ProcurementRepository(this.db).findPurchaseOrderById(input.purchaseOrderId, visibility);
    if (!purchaseOrder) throw createProcurementError('PO_NOT_FOUND');
    await this.requireProjectPermission(users, purchaseOrder.projectId, 'goods_receipts.create', now);
    if (!hasStatus(purchaseOrder.status, PO_ISSUED)) throw createProcurementError('PO_NOT_RECEIVABLE');
    await this.requireProjectStages(new ProcurementRepository(this.db), purchaseOrder.projectId, purchaseOrder.items.map((item) => item.stageId));

    try {
      const received = await new InventoryService(this.db).receiveInventory({
        purchaseOrderId: input.purchaseOrderId,
        warehouseId: input.warehouseId,
        items: input.items.map((item) => ({
          poItemId: item.poItemId,
          itemId: item.materialId,
          quantity: item.quantity,
          acceptedQty: item.acceptedQuantity,
          rejectedQty: item.rejectedQuantity,
          batchNo: item.batchNo ?? null
        }))
      }, idempotencyKey);
      if (!received || Array.isArray(received) || typeof received !== 'object' || typeof received.id !== 'string') {
        throw new Error('Inventory Goods Receipt replay result is invalid.');
      }
      const persistedReceipt = await new ProcurementRepository(this.db).findGoodsReceiptById(received.id, visibility);
      if (!persistedReceipt) throw createProcurementError('GOODS_RECEIPT_NOT_FOUND');
      return goodsReceiptResponse(persistedReceipt);
    } catch (error) {
      if (error instanceof AppError && error.code === 'RECEIPT_EXCEEDS_PO') throw createProcurementError('OVER_RECEIPT_NOT_ALLOWED');
      throw error;
    }
  }

  /** Get one permission-scoped Goods Receipt through the Procurement API. */
  async getGoodsReceipt(goodsReceiptId: string) {
    const now = new Date();
    const visibility = await this.resolveProjectVisibility(new AdministrationRepository(this.db), 'procurement.read', now);
    const receipt = await new ProcurementRepository(this.db).findGoodsReceiptById(goodsReceiptId, visibility);
    if (!receipt) throw createProcurementError('GOODS_RECEIPT_NOT_FOUND');
    await this.requireProjectPermission(new AdministrationRepository(this.db), receipt.projectId, 'procurement.read', now);
    return goodsReceiptResponse(receipt);
  }
}
