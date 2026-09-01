import { authenticatedRequest } from '../../administration/api/auth-api.js';

export type SupplierInvoiceStatus = 'DRAFT' | 'POSTED';
export type SupplierPaymentStatus = 'DRAFT' | 'POSTED';

export type SupplierInvoiceLine = Readonly<{
  id: string;
  supplierInvoiceId: string;
  stageId: string | null;
  description: string;
  amount: string;
  expenseOrInventoryAccountId: string | null;
}>;

export type SupplierInvoice = Readonly<{
  id: string;
  vendorId: string;
  projectId: string;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string | null;
  purchaseOrderId: string | null;
  goodsReceiptId: string | null;
  status: SupplierInvoiceStatus;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  lines: SupplierInvoiceLine[];
}>;

export type SupplierPayment = Readonly<{
  id: string;
  vendorId: string;
  projectId: string | null;
  paymentNo: string;
  paymentDate: string;
  amount: string;
  cashBankAccountId: string;
  reference: string | null;
  status: SupplierPaymentStatus;
}>;

export type SupplierPaymentAllocation = Readonly<{
  id: string;
  supplierPaymentId: string;
  supplierInvoiceId: string;
  amount: string;
  allocatedAt: string;
}>;

export type SupplierAgingRow = Readonly<{
  supplierInvoiceId: string;
  vendorId: string;
  projectId: string;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string | null;
  totalAmount: string;
  allocatedAmount: string;
  outstandingAmount: string;
  ageDays: number;
}>;

export type Page<T> = Readonly<{ items: T[]; total: number; page: number; pageSize: number }>;
export type SupplierAgingPage = Page<SupplierAgingRow> & Readonly<{ asOfDate: string }>;

export type ListSupplierInvoicesInput = Readonly<{
  vendorId?: string;
  projectId?: string;
  purchaseOrderId?: string;
  goodsReceiptId?: string;
  status?: SupplierInvoiceStatus;
  fromDate?: string;
  toDate?: string;
  dueBefore?: string;
  page?: number;
  pageSize?: number;
}>;

export type CreateSupplierInvoiceInput = Readonly<{
  vendorId: string;
  projectId: string;
  invoiceNo: string;
  invoiceDate: string;
  dueDate?: string | null;
  purchaseOrderId?: string | null;
  goodsReceiptId?: string | null;
  taxAmount?: string;
  lines: Array<Readonly<{
    stageId?: string | null;
    description: string;
    amount: string;
    expenseOrInventoryAccountId?: string | null;
  }>>;
}>;

export type ListSupplierPaymentsInput = Readonly<{
  vendorId?: string;
  projectId?: string;
  status?: SupplierPaymentStatus;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}>;

export type CreateSupplierPaymentInput = Readonly<{
  vendorId: string;
  projectId?: string | null;
  paymentDate: string;
  amount: string;
  cashBankAccountId: string;
  reference?: string | null;
}>;

export type AllocateSupplierPaymentInput = Readonly<{
  allocations: Array<Readonly<{ supplierInvoiceId: string; amount: string }>>;
}>;

export type SupplierAgingInput = Readonly<{
  vendorId?: string;
  projectId?: string;
  asOfDate?: string;
  page?: number;
  pageSize?: number;
}>;

/** Add documented query values without sending empty browser fields. */
function buildQuery<T extends object>(input: T): string {
  const query = new URLSearchParams();
  (Object.entries(input) as Array<[string, string | number | undefined]>).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return query.size > 0 ? `?${query.toString()}` : '';
}

/** Create one retry key for a Supplier Payables write command. */
function commandHeaders(): HeadersInit {
  return { 'Idempotency-Key': crypto.randomUUID() };
}

/** Load a bounded Supplier Invoice register page. */
export function listSupplierInvoices(input: ListSupplierInvoicesInput = {}): Promise<Page<SupplierInvoice>> {
  return authenticatedRequest<Page<SupplierInvoice>>(`supplier-payables/invoices${buildQuery(input)}`);
}

/** Create one DRAFT Supplier Invoice with server-calculated totals. */
export function createSupplierInvoice(input: CreateSupplierInvoiceInput): Promise<SupplierInvoice> {
  return authenticatedRequest<SupplierInvoice>('supplier-payables/invoices', {
    method: 'POST',
    headers: commandHeaders(),
    body: JSON.stringify(input)
  });
}

/** Load one Supplier Invoice with its immutable line values. */
export function getSupplierInvoice(invoiceId: string): Promise<SupplierInvoice> {
  return authenticatedRequest<SupplierInvoice>(`supplier-payables/invoices/${encodeURIComponent(invoiceId)}`);
}

/** Post one DRAFT Supplier Invoice to Finance/AP. */
export function postSupplierInvoice(invoiceId: string): Promise<SupplierInvoice> {
  return authenticatedRequest<SupplierInvoice>(`supplier-payables/invoices/${encodeURIComponent(invoiceId)}/post`, {
    method: 'POST',
    headers: commandHeaders(),
    body: JSON.stringify({})
  });
}

/** Load a bounded Supplier Payment register page. */
export function listSupplierPayments(input: ListSupplierPaymentsInput = {}): Promise<Page<SupplierPayment>> {
  return authenticatedRequest<Page<SupplierPayment>>(`supplier-payables/payments${buildQuery(input)}`);
}

/** Create and atomically post one Supplier Payment. */
export function createSupplierPayment(input: CreateSupplierPaymentInput): Promise<SupplierPayment> {
  return authenticatedRequest<SupplierPayment>('supplier-payables/payments', {
    method: 'POST',
    headers: commandHeaders(),
    body: JSON.stringify(input)
  });
}

/** Append one or more allocations to a POSTED Supplier Payment. */
export function allocateSupplierPayment(paymentId: string, input: AllocateSupplierPaymentInput): Promise<SupplierPaymentAllocation[]> {
  return authenticatedRequest<SupplierPaymentAllocation[]>(`supplier-payables/payments/${encodeURIComponent(paymentId)}/allocations`, {
    method: 'POST',
    headers: commandHeaders(),
    body: JSON.stringify(input)
  });
}

/** Load derived Supplier aging and outstanding values as of one date. */
export function getSupplierAging(input: SupplierAgingInput = {}): Promise<SupplierAgingPage> {
  return authenticatedRequest<SupplierAgingPage>(`supplier-payables/aging${buildQuery(input)}`);
}
