import { authenticatedRequest } from '../../administration/api/auth-api.js';

export type Vendor = Readonly<{
  id: string;
  code: string;
  legalName: string;
  displayName: string;
  status: string;
  qualificationStatus: 'QUALIFIED' | 'PENDING' | null;
}>;

export type RequisitionItem = Readonly<{
  id: string;
  requisitionId: string;
  materialId: string | null;
  description: string;
  quantity: string;
  unit: string;
  stageId: string | null;
}>;

export type PurchaseRequisition = Readonly<{
  id: string;
  projectId: string;
  stageId: string | null;
  requestNo: string;
  requestedBy: string;
  requiredDate: string;
  status: string;
  notes: string | null;
  items: RequisitionItem[];
}>;

export type PurchaseOrderItem = Readonly<{
  id: string;
  purchaseOrderId: string;
  requisitionItemId: string | null;
  materialId: string | null;
  stageId: string | null;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  taxRate: string;
  lineTotal: string;
  receivedQuantity: string;
}>;

export type PurchaseOrder = Readonly<{
  id: string;
  projectId: string;
  requisitionId: string | null;
  poNo: string;
  vendorId: string;
  orderDate: string;
  currency: string;
  status: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  deliveryAddress: string;
  terms: string;
  cancelReason: string | null;
  goodsReceipts: Array<Readonly<{
    id: string;
    receiptNo: string;
    warehouseId: string;
    receivedAt: string;
    status: string;
  }>>;
  items: PurchaseOrderItem[];
}>;

export type Page<T> = Readonly<{ items: T[]; total: number; page: number; pageSize: number }>;

export type CreateRequisitionInput = Readonly<{
  projectId: string;
  stageId?: string | null;
  requiredDate: string;
  notes?: string | null;
  items: Array<Readonly<{ materialId: string; description: string; quantity: string; unit: string; stageId?: string | null }>>;
}>;

export type CreatePurchaseOrderInput = Readonly<{
  requisitionId: string;
  vendorId: string;
  orderDate: string;
  currency: string;
  deliveryAddress: string;
  terms: string;
  items: Array<Readonly<{ requisitionItemId: string; quantity: string; unitPrice: string; taxRate: string }>>;
}>;

export type CreateGoodsReceiptInput = Readonly<{
  purchaseOrderId: string;
  warehouseId: string;
  items: Array<Readonly<{ poItemId: string; materialId: string; quantity: string; acceptedQuantity: string; rejectedQuantity: string; batchNo?: string | null }>>;
}>;

export type GoodsReceiptItem = Readonly<{
  id: string;
  goodsReceiptId: string;
  poItemId: string;
  materialId: string;
  stageId: string | null;
  quantity: string;
  acceptedQuantity: string;
  rejectedQuantity: string;
  batchNo: string | null;
}>;

export type GoodsReceipt = Readonly<{
  id: string;
  projectId: string;
  vendorId: string;
  warehouseId: string;
  receiptNo: string;
  purchaseOrderId: string;
  receivedAt: string;
  status: string;
  receivedBy: string;
  items: GoodsReceiptItem[];
}>;

/** Build a new Foundation idempotency header for one user write command. */
function writeHeaders(): Readonly<Record<string, string>> {
  return { 'Idempotency-Key': crypto.randomUUID() };
}

/** Build one bounded Procurement register query. */
function pageQuery(projectId?: string): string {
  const query = new URLSearchParams({ page: '1', pageSize: '100' });
  if (projectId) query.set('projectId', projectId);
  return `?${query.toString()}`;
}

/** Load active Supplier choices from final Module 5 Vendor master. */
export function listVendors(): Promise<Page<Vendor>> {
  return authenticatedRequest<Page<Vendor>>('vendors?page=1&pageSize=100');
}

/** Load material requirements for one Project. */
export function listRequisitions(projectId: string): Promise<Page<PurchaseRequisition>> {
  return authenticatedRequest<Page<PurchaseRequisition>>(`procurement/requisitions${pageQuery(projectId)}`);
}

/** Create one material requirement. */
export function createRequisition(input: CreateRequisitionInput): Promise<PurchaseRequisition> {
  return authenticatedRequest<PurchaseRequisition>('procurement/requisitions', { method: 'POST', headers: writeHeaders(), body: JSON.stringify(input) });
}

/** Approve one draft material requirement. */
export function approveRequisition(requisitionId: string): Promise<PurchaseRequisition> {
  return authenticatedRequest<PurchaseRequisition>(`procurement/requisitions/${requisitionId}/approve`, { method: 'POST', headers: writeHeaders(), body: JSON.stringify({}) });
}

/** Load Purchase Orders for one Project. */
export function listPurchaseOrders(projectId: string): Promise<Page<PurchaseOrder>> {
  return authenticatedRequest<Page<PurchaseOrder>>(`procurement/purchase-orders${pageQuery(projectId)}`);
}

/** Create one Purchase Order from an approved material requirement. */
export function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
  return authenticatedRequest<PurchaseOrder>('procurement/purchase-orders', { method: 'POST', headers: writeHeaders(), body: JSON.stringify(input) });
}

/** Issue one draft Purchase Order. */
export function issuePurchaseOrder(purchaseOrderId: string): Promise<PurchaseOrder> {
  return authenticatedRequest<PurchaseOrder>(`procurement/purchase-orders/${purchaseOrderId}/issue`, { method: 'POST', headers: writeHeaders(), body: JSON.stringify({}) });
}

/** Cancel one Purchase Order with an explicit reason. */
export function cancelPurchaseOrder(purchaseOrderId: string, reason: string): Promise<PurchaseOrder> {
  return authenticatedRequest<PurchaseOrder>(`procurement/purchase-orders/${purchaseOrderId}/cancel`, { method: 'POST', headers: writeHeaders(), body: JSON.stringify({ reason }) });
}

/** Create one retry-safe Goods Receipt against an issued Purchase Order. */
export function createGoodsReceipt(input: CreateGoodsReceiptInput): Promise<GoodsReceipt> {
  return authenticatedRequest<GoodsReceipt>('procurement/goods-receipts', {
    method: 'POST',
    headers: writeHeaders(),
    body: JSON.stringify(input)
  });
}

/** Load one durable Goods Receipt by id. */
export function getGoodsReceipt(goodsReceiptId: string): Promise<GoodsReceipt> {
  return authenticatedRequest<GoodsReceipt>(`procurement/goods-receipts/${goodsReceiptId}`);
}
