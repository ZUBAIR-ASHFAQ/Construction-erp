import { authenticatedRequest } from '../../administration/api/auth-api.js';

export type Material = Readonly<{ id: string; code: string; name: string; unit: string; category: string | null; status: string }>;
export type MaterialPage = Readonly<{ items: Material[]; total: number; page: number; pageSize: number }>;
export type WarehouseOption = Readonly<{ id: string; projectId: string | null; code: string; name: string; status: string }>;
export type StockRow = Readonly<{
  warehouseId: string; warehouseCode: string; warehouseName: string; projectId: string | null;
  materialId: string; materialCode: string; materialName: string; unit: string; quantityOnHand: string; averageCost: string;
}>;
export type StockPage = Readonly<{ items: StockRow[]; warehouses: WarehouseOption[]; total: number; page: number; pageSize: number }>;
export type LedgerRow = Readonly<{
  id: string; warehouseId: string; materialId: string; projectId: string | null; stageId: string | null;
  movementType: string; quantity: string; unitCost: string; sourceType: string; sourceId: string; occurredAt: string;
}>;
export type LedgerPage = Readonly<{ items: LedgerRow[]; total: number; page: number; pageSize: number }>;
export type MaterialIssue = Readonly<{
  id: string; projectId: string; stageId: string | null; warehouseId: string; issueNo: string; issueDate: string; status: string;
  items: ReadonlyArray<Readonly<{ id: string; materialId: string; quantity: string; unitCost: string; lineCost: string }>>;
}>;
export type CreateMaterialInput = Readonly<{ code: string; name: string; unit: string; category?: string | null }>;
export type CreateMaterialIssueInput = Readonly<{
  projectId: string; stageId?: string | null; warehouseId: string; issueDate: string; description?: string | null;
  items: ReadonlyArray<Readonly<{ materialId: string; quantity: string }>>;
}>;
export type TransferMaterialInput = Readonly<{ sourceWarehouseId: string; destinationWarehouseId: string; materialId: string; quantity: string }>;
export type AdjustStockInput = Readonly<{ warehouseId: string; materialId: string; quantityDelta: string; reason: string }>;

/** Build one bounded Inventory query string. */
function queryString(input: Readonly<Record<string, string | number | undefined | null>>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  return query.size ? `?${query.toString()}` : '';
}

/** Build the Foundation retry header required by Inventory writes. */
function commandHeaders(): HeadersInit {
  return { 'Idempotency-Key': crypto.randomUUID() };
}

/** Load a bounded Material master page. */
export function listMaterials(input: Readonly<{ page?: number; pageSize?: number }> = {}): Promise<MaterialPage> {
  return authenticatedRequest<MaterialPage>(`inventory/materials${queryString(input)}`);
}

/** Create one Company Material. */
export function createMaterial(input: CreateMaterialInput): Promise<Material> {
  return authenticatedRequest<Material>('inventory/materials', { method: 'POST', headers: commandHeaders(), body: JSON.stringify(input) });
}

/** Load derived stock plus visible Warehouse options. */
export function listStock(input: Readonly<{ page?: number; pageSize?: number; warehouseId?: string; materialId?: string }> = {}): Promise<StockPage> {
  return authenticatedRequest<StockPage>(`inventory/stock${queryString(input)}`);
}

/** Load the append-only stock ledger. */
export function listLedger(input: Readonly<{ page?: number; pageSize?: number; warehouseId?: string; materialId?: string; projectId?: string; stageId?: string }> = {}): Promise<LedgerPage> {
  return authenticatedRequest<LedgerPage>(`inventory/ledger${queryString(input)}`);
}

/** Issue one or more Materials to a Project and optional Stage. */
export function createMaterialIssue(input: CreateMaterialIssueInput): Promise<MaterialIssue> {
  return authenticatedRequest<MaterialIssue>('inventory/issues', { method: 'POST', headers: commandHeaders(), body: JSON.stringify(input) });
}

/** Transfer one Material between Warehouses. */
export function transferMaterial(input: TransferMaterialInput): Promise<Readonly<{ transactions: LedgerRow[] }>> {
  return authenticatedRequest<Readonly<{ transactions: LedgerRow[] }>>('inventory/transfers', { method: 'POST', headers: commandHeaders(), body: JSON.stringify(input) });
}

/** Append one controlled stock adjustment. */
export function adjustStock(input: AdjustStockInput): Promise<LedgerRow & Readonly<{ reason: string }>> {
  return authenticatedRequest<LedgerRow & Readonly<{ reason: string }>>('inventory/adjustments', { method: 'POST', headers: commandHeaders(), body: JSON.stringify(input) });
}
