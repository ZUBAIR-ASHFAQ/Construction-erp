import { authenticatedRequest } from '../../administration/api/auth-api.js';

export type ClientReceiptPaymentMethod = 'CASH' | 'BANK';
export type ClientReceiptType = 'ADVANCE' | 'INVOICE_PAYMENT';
export type ClientReceiptStatus = 'POSTED' | 'REVERSED';

export type ClientReceiptAllocation = Readonly<{
  id: string;
  clientInvoiceId: string;
  amount: string;
  allocatedAt: string;
  allocatedBy: string;
}>;

export type ClientReceipt = Readonly<{
  id: string;
  clientId: string;
  projectId: string;
  stageId: string | null;
  receiptNo: string;
  receiptDate: string;
  amount: string;
  paymentMethod: ClientReceiptPaymentMethod;
  cashBankAccountId: string;
  reference: string | null;
  receiptType: ClientReceiptType;
  status: ClientReceiptStatus;
  createdBy: string;
  postedAt: string | null;
  createdAt: string;
  allocatedAmount: string;
  unallocatedAmount: string;
  allocations: ClientReceiptAllocation[];
}>;

export type ClientReceiptPage = Readonly<{
  items: ClientReceipt[];
  total: number;
  page: number;
  pageSize: number;
}>;

export type ListClientReceiptsInput = Readonly<{
  clientId?: string;
  projectId?: string;
  stageId?: string;
  status?: ClientReceiptStatus;
  receiptType?: ClientReceiptType;
  paymentMethod?: ClientReceiptPaymentMethod;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}>;

export type CreateClientReceiptInput = Readonly<{
  clientId: string;
  projectId: string;
  stageId?: string | null;
  receiptDate: string;
  amount: string;
  paymentMethod: ClientReceiptPaymentMethod;
  cashBankAccountId: string;
  reference?: string | null;
  receiptType: ClientReceiptType;
}>;

export type AllocateClientReceiptInput = Readonly<{
  clientInvoiceId: string;
  amount: string;
}>;

export type UnallocateClientReceiptInput = Readonly<{
  allocationId: string;
}>;

/** Build one bounded Client Receipt register query. */
function listQuery(input: ListClientReceiptsInput): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return query.size > 0 ? `?${query.toString()}` : '';
}

/** Add one browser retry key to a Client Receipt command. */
function commandHeaders(): HeadersInit {
  return { 'Idempotency-Key': crypto.randomUUID() };
}

/** Load one permission-scoped Client Receipt register page. */
export function listClientReceipts(input: ListClientReceiptsInput = {}): Promise<ClientReceiptPage> {
  return authenticatedRequest<ClientReceiptPage>(`client-receipts${listQuery(input)}`);
}

/** Create and atomically post one Client Receipt. */
export function createClientReceipt(input: CreateClientReceiptInput): Promise<ClientReceipt> {
  return authenticatedRequest<ClientReceipt>('client-receipts', {
    method: 'POST',
    headers: commandHeaders(),
    body: JSON.stringify(input)
  });
}

/** Load one Client Receipt with its source-derived allocation totals. */
export function getClientReceipt(receiptId: string): Promise<ClientReceipt> {
  return authenticatedRequest<ClientReceipt>(`client-receipts/${encodeURIComponent(receiptId)}`);
}

/** Allocate one posted Client Receipt to one Client Invoice. */
export function allocateClientReceipt(receiptId: string, input: AllocateClientReceiptInput): Promise<ClientReceipt> {
  return authenticatedRequest<ClientReceipt>(`client-receipts/${encodeURIComponent(receiptId)}/allocations`, {
    method: 'POST',
    headers: commandHeaders(),
    body: JSON.stringify(input)
  });
}

/** Reverse one selected allocation without rewriting the original receipt. */
export function unallocateClientReceipt(receiptId: string, input: UnallocateClientReceiptInput): Promise<ClientReceipt> {
  return authenticatedRequest<ClientReceipt>(`client-receipts/${encodeURIComponent(receiptId)}/unallocate`, {
    method: 'POST',
    headers: commandHeaders(),
    body: JSON.stringify(input)
  });
}

/** Reverse one posted Client Receipt through the controlled compensating command. */
export function reverseClientReceipt(receiptId: string): Promise<ClientReceipt> {
  return authenticatedRequest<ClientReceipt>(`client-receipts/${encodeURIComponent(receiptId)}/reverse`, {
    method: 'POST',
    headers: commandHeaders(),
    body: JSON.stringify({})
  });
}
