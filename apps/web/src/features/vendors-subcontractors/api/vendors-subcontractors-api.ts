import { authenticatedRequest } from '../../administration/api/auth-api.js';

export type VendorStatus = 'ACTIVE' | 'ARCHIVED';
export type VendorQualificationStatus = 'QUALIFIED' | 'PENDING';
export type SubcontractorStatus = 'ACTIVE' | 'ARCHIVED';

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
  vendorId: string | null;
  code: string;
  specialty: string;
  status: SubcontractorStatus;
  defaultTerms: string | null;
  vendor: Readonly<{ id: string; code: string; displayName: string; status: string }> | null;
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
  vendorId?: string | null;
  code: string;
  specialty: string;
  defaultTerms?: string | null;
}>;

export type UpdateSubcontractorInput = Partial<CreateSubcontractorInput> & Readonly<{ status?: SubcontractorStatus }>;

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
