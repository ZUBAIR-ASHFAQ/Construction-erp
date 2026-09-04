import { authenticatedRequest } from '../../administration/api/auth-api.js';

export type VendorStatus = 'ACTIVE' | 'ARCHIVED';
export type VendorQualificationStatus = 'QUALIFIED' | 'PENDING';
export type SubcontractorStatus = 'ACTIVE' | 'ARCHIVED';
export type SubcontractContractStatus = 'ACTIVE' | 'FINISHED';
export type SubcontractPaymentStatus = 'DRAFT' | 'POSTED';

export type Vendor = Readonly<{
  id: string;
  code: string;
  legalName: string;
  displayName: string;
  taxNo: string | null;
  paymentTermsDays: number | null;
  currency: string | null;
  status: VendorStatus;
  qualificationStatus: VendorQualificationStatus | null;
}>;

export type VendorContact = Readonly<{
  id: string;
  vendorId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  status: string;
}>;

export type VendorDetails = Readonly<{
  vendor: Vendor & Readonly<{ contacts: VendorContact[] }>;
  purchaseSummary: Readonly<{ purchaseOrderCount: number; purchaseOrderTotal: string }>;
  payableSummary: Readonly<{
    postedInvoiceCount: number;
    postedInvoiceTotal: string;
    allocatedPaymentTotal: string;
    outstandingAmount: string;
  }> | null;
}>;

export type Subcontractor = Readonly<{
  id: string;
  name: string;
  phone: string;
  specialty: string;
  address: string;
  status: SubcontractorStatus;
}>;

export type SubcontractContract = Readonly<{
  id: string;
  subcontractorId: string;
  projectId: string;
  contractAmount: string;
  contractDate: string;
  status: SubcontractContractStatus;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  project: Readonly<{ id: string; projectCode: string; name: string; currency: string; status: string }>;
  subcontractor: Readonly<{
    id: string;
    name: string;
    specialty: string;
    status: string;
  }>;
}>;

export type SubcontractPayment = Readonly<{
  id: string;
  subcontractContractId: string;
  paymentNo: string;
  paymentDate: string;
  amount: string;
  reference: string | null;
  status: SubcontractPaymentStatus;
  subcontractor: Readonly<{ id: string; name: string; specialty: string; status: string }>;
  project: Readonly<{ id: string; projectCode: string; name: string; currency: string; status: string }>;
  cashBankAccount: Readonly<{ id: string; code: string; name: string; accountType: string; status: string }>;
}>;

export type SubcontractLedgerRow = Readonly<{
  subcontractContractId: string;
  contractDate: string;
  status: SubcontractContractStatus;
  finishedAt: string | null;
  contractAmount: string;
  paidAmount: string;
  balanceAmount: string;
  subcontractor: Readonly<{ id: string; name: string; specialty: string; status: string }>;
  project: Readonly<{ id: string; projectCode: string; name: string; currency: string; status: string }>;
}>;

type Page<T> = Readonly<{ items: T[]; total: number; page: number; pageSize: number }>;

export type ListVendorsInput = Readonly<{
  search?: string;
  status?: VendorStatus;
  qualificationStatus?: VendorQualificationStatus;
  page?: number;
  pageSize?: number;
}>;

export type CreateVendorInput = Readonly<{
  code: string;
  legalName: string;
  displayName: string;
  taxNo?: string | null;
  paymentTermsDays?: number | null;
  currency?: string | null;
  qualificationStatus?: VendorQualificationStatus | null;
}>;

export type UpdateVendorInput = Partial<CreateVendorInput> & Readonly<{ status?: VendorStatus }>;

export type CreateVendorContactInput = Readonly<{
  name: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
}>;

export type ListSubcontractorsInput = Readonly<{
  search?: string;
  status?: SubcontractorStatus;
  page?: number;
  pageSize?: number;
}>;

export type CreateSubcontractorInput = Readonly<{
  name: string;
  phone: string;
  specialty: string;
  address: string;
}>;

export type UpdateSubcontractorInput = Partial<CreateSubcontractorInput> & Readonly<{ status?: SubcontractorStatus }>;

export type ListSubcontractContractsInput = Readonly<{
  subcontractorId?: string;
  projectId?: string;
  status?: SubcontractContractStatus;
  page?: number;
  pageSize?: number;
}>;

export type CreateSubcontractContractInput = Readonly<{
  subcontractorId: string;
  projectId: string;
  contractAmount: string;
  contractDate: string;
}>;

export type ListSubcontractPaymentsInput = Readonly<{
  subcontractorId?: string;
  projectId?: string;
  subcontractContractId?: string;
  status?: SubcontractPaymentStatus;
  page?: number;
  pageSize?: number;
}>;

export type CreateSubcontractPaymentInput = Readonly<{
  subcontractContractId: string;
  paymentDate: string;
  amount: string;
  cashBankAccountId: string;
  reference?: string | null;
}>;

export type ListSubcontractLedgerInput = Readonly<{
  subcontractorId?: string;
  projectId?: string;
  status?: SubcontractContractStatus;
  page?: number;
  pageSize?: number;
}>;

/** Load one bounded supplier/vendor page from the final Module 5 API. */
export function listVendors(input: ListVendorsInput = {}): Promise<Page<Vendor>> {
  const query = new URLSearchParams();
  if (input.search) query.set('search', input.search);
  if (input.status) query.set('status', input.status);
  if (input.qualificationStatus) query.set('qualificationStatus', input.qualificationStatus);
  if (input.page !== undefined) query.set('page', String(input.page));
  if (input.pageSize !== undefined) query.set('pageSize', String(input.pageSize));
  const suffix = query.size ? `?${query.toString()}` : '';
  return authenticatedRequest<Page<Vendor>>(`vendors${suffix}`);
}

/** Load one supplier/vendor with contacts and source-derived purchase summary. */
export function getVendor(vendorId: string): Promise<VendorDetails> {
  return authenticatedRequest<VendorDetails>(`vendors/${vendorId}`);
}

/** Create one supplier/vendor without browser-owned company or lifecycle fields. */
export function createVendor(input: CreateVendorInput): Promise<Vendor> {
  return authenticatedRequest<Vendor>('vendors', { method: 'POST', body: JSON.stringify(input) });
}

/** Update final supplier/vendor master fields through the documented PATCH route. */
export function updateVendor(vendorId: string, input: UpdateVendorInput): Promise<VendorDetails['vendor']> {
  return authenticatedRequest<VendorDetails['vendor']>(`vendors/${vendorId}`, { method: 'PATCH', body: JSON.stringify(input) });
}

/** Add one contact under an existing supplier/vendor. */
export function createVendorContact(vendorId: string, input: CreateVendorContactInput): Promise<VendorContact> {
  return authenticatedRequest<VendorContact>(`vendors/${vendorId}/contacts`, { method: 'POST', body: JSON.stringify(input) });
}

/** Load one bounded subcontractor-master page. */
export function listSubcontractors(input: ListSubcontractorsInput = {}): Promise<Page<Subcontractor>> {
  const query = new URLSearchParams();
  if (input.search) query.set('search', input.search);
  if (input.status) query.set('status', input.status);
  if (input.page !== undefined) query.set('page', String(input.page));
  if (input.pageSize !== undefined) query.set('pageSize', String(input.pageSize));
  const suffix = query.size ? `?${query.toString()}` : '';
  return authenticatedRequest<Page<Subcontractor>>(`subcontractors${suffix}`);
}

/** Create one subcontractor profile with an optional supplier/vendor link. */
export function createSubcontractor(input: CreateSubcontractorInput): Promise<Subcontractor> {
  return authenticatedRequest<Subcontractor>('subcontractors', { method: 'POST', body: JSON.stringify(input) });
}

/** Update one subcontractor profile without creating operational subcontract workflow state. */
export function updateSubcontractor(subcontractorId: string, input: UpdateSubcontractorInput): Promise<Subcontractor> {
  return authenticatedRequest<Subcontractor>(`subcontractors/${subcontractorId}`, { method: 'PATCH', body: JSON.stringify(input) });
}

/** Load one bounded subcontract-contract page with Project and subcontractor labels. */
export function listSubcontractContracts(input: ListSubcontractContractsInput = {}): Promise<Page<SubcontractContract>> {
  const query = new URLSearchParams();
  if (input.subcontractorId) query.set('subcontractorId', input.subcontractorId);
  if (input.projectId) query.set('projectId', input.projectId);
  if (input.status) query.set('status', input.status);
  if (input.page !== undefined) query.set('page', String(input.page));
  if (input.pageSize !== undefined) query.set('pageSize', String(input.pageSize));
  const suffix = query.size ? `?${query.toString()}` : '';
  return authenticatedRequest<Page<SubcontractContract>>(`subcontract-contracts${suffix}`);
}

/** Create one Project assignment and agreed amount for a subcontractor. */
export function createSubcontractContract(input: CreateSubcontractContractInput): Promise<SubcontractContract> {
  return authenticatedRequest<SubcontractContract>('subcontract-contracts', { method: 'POST', body: JSON.stringify(input) });
}

/** Finish one active subcontract contract. */
export function finishSubcontractContract(contractId: string): Promise<SubcontractContract> {
  return authenticatedRequest<SubcontractContract>(`subcontract-contracts/${contractId}/finish`, { method: 'POST' });
}

/** Load direct payments posted against subcontract contracts. */
export function listSubcontractPayments(input: ListSubcontractPaymentsInput = {}): Promise<Page<SubcontractPayment>> {
  const query = new URLSearchParams();
  if (input.subcontractorId) query.set('subcontractorId', input.subcontractorId);
  if (input.projectId) query.set('projectId', input.projectId);
  if (input.subcontractContractId) query.set('subcontractContractId', input.subcontractContractId);
  if (input.status) query.set('status', input.status);
  if (input.page !== undefined) query.set('page', String(input.page));
  if (input.pageSize !== undefined) query.set('pageSize', String(input.pageSize));
  return authenticatedRequest<Page<SubcontractPayment>>(`subcontract-payments${query.size ? `?${query}` : ''}`);
}

/** Create and automatically post one direct subcontractor payment. */
export function createSubcontractPayment(input: CreateSubcontractPaymentInput): Promise<SubcontractPayment> {
  return authenticatedRequest<SubcontractPayment>('subcontract-payments', {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(input)
  });
}

/** Load source-derived contract, paid and remaining balances for the subcontractor ledger. */
export function listSubcontractLedger(input: ListSubcontractLedgerInput = {}): Promise<Page<SubcontractLedgerRow>> {
  const query = new URLSearchParams();
  if (input.subcontractorId) query.set('subcontractorId', input.subcontractorId);
  if (input.projectId) query.set('projectId', input.projectId);
  if (input.status) query.set('status', input.status);
  if (input.page !== undefined) query.set('page', String(input.page));
  if (input.pageSize !== undefined) query.set('pageSize', String(input.pageSize));
  return authenticatedRequest<Page<SubcontractLedgerRow>>(`subcontract-ledger${query.size ? `?${query}` : ''}`);
}
