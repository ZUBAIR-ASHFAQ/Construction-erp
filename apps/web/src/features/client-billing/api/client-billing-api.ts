import { authenticatedRequest } from '../../administration/api/auth-api.js';

export type BillingMethod = 'FIXED_PRICE' | 'COST_PLUS_PERCENTAGE';
export type BillingSettingsStatus = 'ACTIVE' | 'INACTIVE';
export type BillingClaimStatus = 'DRAFT' | 'FINALIZED';
export type ClientInvoiceStatus = 'ISSUED';

export type ProjectBillingSettings = Readonly<{
  projectId: string;
  billingMethod: BillingMethod;
  retentionPercent: string | null;
  billingCycle: string | null;
  advanceRecoveryEnabled: boolean;
  status: BillingSettingsStatus;
}>;

export type BillingClaimLine = Readonly<{
  id: string;
  stageId: string | null;
  description: string;
  billingProgressPercent: string | null;
  amount: string;
}>;

export type ClientInvoiceLine = Readonly<{
  id: string;
  stageId: string | null;
  description: string;
  amount: string;
}>;

export type ClientInvoice = Readonly<{
  id: string;
  projectId: string;
  clientId: string;
  claimId: string | null;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string | null;
  status: ClientInvoiceStatus;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  lines: ClientInvoiceLine[];
}>;

export type BillingClaim = Readonly<{
  id: string;
  projectId: string;
  clientId: string;
  claimNo: string;
  periodEnd: string;
  status: BillingClaimStatus;
  grossValue: string;
  deductions: string;
  retention: string;
  netCertified: string;
  lines: BillingClaimLine[];
  invoice: ClientInvoice | null;
}>;

export type Page<T> = Readonly<{ items: T[]; total: number; page: number; pageSize: number }>;
export type BillingClaimLineInput = Readonly<{ stageId?: string | null; description: string; billingProgressPercent?: string | null; amount: string }>;
export type UpdateBillingSettingsInput = Readonly<{ billingMethod: BillingMethod; retentionPercent?: string | null; billingCycle?: string | null; advanceRecoveryEnabled: boolean; status: BillingSettingsStatus }>;
export type CreateClaimInput = Readonly<{ projectId: string; periodEnd: string; lines: BillingClaimLineInput[] }>;
export type UpdateClaimInput = Readonly<{ periodEnd?: string; lines?: BillingClaimLineInput[] }>;
export type CreateInvoiceInput = Readonly<{ invoiceDate: string; dueDate: string }>;
export type ListBillingInput = Readonly<{ projectId?: string; status?: string; page?: number; pageSize?: number }>;

/** Build one bounded Client Billing list query. */
function listQuery(input: ListBillingInput): string {
  const query = new URLSearchParams();
  if (input.projectId) query.set('projectId', input.projectId);
  if (input.status) query.set('status', input.status);
  if (input.page) query.set('page', String(input.page));
  if (input.pageSize) query.set('pageSize', String(input.pageSize));
  return query.size > 0 ? `?${query.toString()}` : '';
}

/** Build the idempotency header required by Client Billing commands. */
function commandHeaders(idempotencyKey: string): HeadersInit {
  return { 'Idempotency-Key': idempotencyKey };
}

/** Read one project's Client Billing settings. */
export function getBillingSettings(projectId: string): Promise<ProjectBillingSettings> {
  return authenticatedRequest<ProjectBillingSettings>(`client-billing/projects/${projectId}/settings`);
}

/** Save one project's Client Billing settings. */
export function updateBillingSettings(projectId: string, input: UpdateBillingSettingsInput, idempotencyKey: string): Promise<ProjectBillingSettings> {
  return authenticatedRequest<ProjectBillingSettings>(`client-billing/projects/${projectId}/settings`, {
    method: 'PUT', headers: commandHeaders(idempotencyKey), body: JSON.stringify(input)
  });
}

/** List billing claims. */
export function listBillingClaims(input: ListBillingInput = {}): Promise<Page<BillingClaim>> {
  return authenticatedRequest<Page<BillingClaim>>(`client-billing/claims${listQuery(input)}`);
}

/** Create one draft billing claim. */
export function createBillingClaim(input: CreateClaimInput, idempotencyKey: string): Promise<BillingClaim> {
  return authenticatedRequest<BillingClaim>('client-billing/claims', {
    method: 'POST', headers: commandHeaders(idempotencyKey), body: JSON.stringify(input)
  });
}

/** Edit one draft billing claim. */
export function updateBillingClaim(claimId: string, input: UpdateClaimInput, idempotencyKey: string): Promise<BillingClaim> {
  return authenticatedRequest<BillingClaim>(`client-billing/claims/${claimId}`, {
    method: 'PATCH', headers: commandHeaders(idempotencyKey), body: JSON.stringify(input)
  });
}

/** Finalize one billing claim. */
export function finalizeBillingClaim(claimId: string, idempotencyKey: string): Promise<BillingClaim> {
  return authenticatedRequest<BillingClaim>(`client-billing/claims/${claimId}/finalize`, {
    method: 'POST', headers: commandHeaders(idempotencyKey), body: JSON.stringify({})
  });
}

/** Create one Client Invoice from a finalized claim. */
export function createClientInvoice(claimId: string, input: CreateInvoiceInput, idempotencyKey: string): Promise<ClientInvoice> {
  return authenticatedRequest<ClientInvoice>(`client-billing/claims/${claimId}/invoice`, {
    method: 'POST', headers: commandHeaders(idempotencyKey), body: JSON.stringify(input)
  });
}

/** List Client Invoices. */
export function listClientInvoices(input: ListBillingInput = {}): Promise<Page<ClientInvoice>> {
  return authenticatedRequest<Page<ClientInvoice>>(`client-billing/invoices${listQuery(input)}`);
}

/** Read one Client Invoice. */
export function getClientInvoice(invoiceId: string): Promise<ClientInvoice> {
  return authenticatedRequest<ClientInvoice>(`client-billing/invoices/${invoiceId}`);
}
