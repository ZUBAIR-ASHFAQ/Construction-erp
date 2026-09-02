import { authenticatedRequest } from '../../administration/api/auth-api.js';

export type Equipment = Readonly<{
  id: string;
  code: string;
  name: string;
  equipmentType: string;
  ownershipType: string;
  defaultRate: string | null;
  rateUnit: string | null;
  status: string;
}>;

export type EquipmentPage = Readonly<{ items: Equipment[]; total: number; page: number; pageSize: number }>;

export type EquipmentAssignment = Readonly<{
  id: string;
  equipmentId: string;
  projectId: string;
  stageId: string | null;
  fromDate: string;
  toDate: string | null;
  status: string;
}>;

export type EquipmentUsage = Readonly<{
  id: string;
  assignmentId: string;
  projectId: string;
  stageId: string | null;
  usageDate: string;
  quantity: string;
  rate: string;
  amount: string;
  enteredBy: string;
  status: string;
  costActualId: string;
}>;

export type EquipmentHistoryUsage = Readonly<Omit<EquipmentUsage, 'costActualId'> & { costActualId: string | null }>;

export type EquipmentMaintenance = Readonly<{
  id: string;
  equipmentId: string;
  maintenanceDate: string;
  type: string;
  cost: string;
  note: string | null;
  status: string;
}>;

export type EquipmentCostSummary = Readonly<{ projectId: string; stageId: string | null; amount: string }>;

export type EquipmentHistory = Readonly<{
  equipment: Equipment;
  assignments: EquipmentAssignment[];
  usage: EquipmentHistoryUsage[];
  maintenance: EquipmentMaintenance[];
  costSummary: EquipmentCostSummary[];
}>;

export type ListEquipmentInput = Readonly<{ page?: number; pageSize?: number }>;
export type CreateEquipmentInput = Readonly<{
  code: string;
  name: string;
  equipmentType: string;
  ownershipType: string;
  defaultRate?: string | null;
  rateUnit?: string | null;
}>;
export type AssignEquipmentInput = Readonly<{
  projectId: string;
  stageId?: string | null;
  fromDate: string;
  toDate?: string | null;
}>;
export type RecordEquipmentUsageInput = Readonly<{
  assignmentId: string;
  usageDate: string;
  quantity: string;
  rate?: string | null;
}>;
export type CreateEquipmentMaintenanceInput = Readonly<{
  maintenanceDate: string;
  type: string;
  cost: string;
  note?: string | null;
}>;

/** Build one bounded Equipment list query. */
function listQuery(input: ListEquipmentInput): string {
  const query = new URLSearchParams();
  if (input.page !== undefined) query.set('page', String(input.page));
  if (input.pageSize !== undefined) query.set('pageSize', String(input.pageSize));
  return query.size > 0 ? `?${query.toString()}` : '';
}

/** Build the Foundation idempotency header for one Equipment command. */
function commandHeaders(): HeadersInit {
  return { 'Idempotency-Key': crypto.randomUUID() };
}

/** Load one bounded Equipment register page. */
export function listEquipment(input: ListEquipmentInput = {}): Promise<EquipmentPage> {
  return authenticatedRequest<EquipmentPage>(`equipment${listQuery(input)}`);
}

/** Create one Company Equipment master. */
export function createEquipment(input: CreateEquipmentInput): Promise<Equipment> {
  return authenticatedRequest<Equipment>('equipment', { method: 'POST', headers: commandHeaders(), body: JSON.stringify(input) });
}

/** Assign Equipment to one Project and optional Stage. */
export function assignEquipment(equipmentId: string, input: AssignEquipmentInput): Promise<EquipmentAssignment> {
  return authenticatedRequest<EquipmentAssignment>(`equipment/${equipmentId}/assignments`, { method: 'POST', headers: commandHeaders(), body: JSON.stringify(input) });
}

/** End one active Equipment assignment without deleting its history. */
export function endEquipmentAssignment(equipmentId: string, assignmentId: string, endDate: string): Promise<EquipmentAssignment> {
  return authenticatedRequest<EquipmentAssignment>(`equipment/${equipmentId}/assignments/${assignmentId}/end`, {
    method: 'POST', headers: commandHeaders(), body: JSON.stringify({ endDate })
  });
}

/** Record usage and atomically post its Project/Stage Equipment cost. */
export function recordEquipmentUsage(equipmentId: string, input: RecordEquipmentUsageInput): Promise<EquipmentUsage> {
  return authenticatedRequest<EquipmentUsage>(`equipment/${equipmentId}/usage`, { method: 'POST', headers: commandHeaders(), body: JSON.stringify(input) });
}

/** Record one Equipment maintenance history entry. */
export function createEquipmentMaintenance(equipmentId: string, input: CreateEquipmentMaintenanceInput): Promise<EquipmentMaintenance> {
  return authenticatedRequest<EquipmentMaintenance>(`equipment/${equipmentId}/maintenance`, { method: 'POST', headers: commandHeaders(), body: JSON.stringify(input) });
}

/** Load bounded assignment, usage, maintenance and cost history for one Equipment item. */
export function getEquipmentHistory(equipmentId: string, pageSize = 50): Promise<EquipmentHistory> {
  return authenticatedRequest<EquipmentHistory>(`equipment/${equipmentId}/history?pageSize=${pageSize}`);
}
