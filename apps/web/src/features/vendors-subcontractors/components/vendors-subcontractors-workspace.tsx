import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Subcontractor, VendorDetails, VendorQualificationStatus, VendorStatus } from '../api/vendors-subcontractors-api.js';
import {
  useCreateSubcontractor,
  useCreateVendor,
  useCreateVendorContact,
  useSubcontractors,
  useUpdateSubcontractor,
  useUpdateVendor,
  useVendor,
  useVendors
} from '../hooks/vendors-subcontractors.js';

const optionalText = z.string().trim();
const vendorCreateSchema = z.object({
  code: z.string().trim().min(1).max(100),
  legalName: z.string().trim().min(1).max(300),
  displayName: z.string().trim().min(1).max(300),
  taxNo: optionalText,
  paymentTermsDays: z.number().int().min(0).nullable(),
  currency: z.string().trim().max(3),
  qualificationStatus: z.enum(['QUALIFIED', 'PENDING']).nullable()
});
const vendorEditSchema = vendorCreateSchema.extend({ status: z.enum(['ACTIVE', 'ARCHIVED']) });
const contactSchema = z.object({ name: z.string().trim().min(1).max(200), email: optionalText, phone: optionalText, role: optionalText });
const subcontractorSchema = z.object({ vendorId: z.string().trim(), code: z.string().trim().min(1).max(100), specialty: z.string().trim().min(1).max(200), defaultTerms: optionalText });
const subcontractorEditSchema = subcontractorSchema.extend({ status: z.enum(['ACTIVE', 'ARCHIVED']) });

type VendorCreateValues = z.infer<typeof vendorCreateSchema>;
type VendorEditValues = z.infer<typeof vendorEditSchema>;
type ContactValues = z.infer<typeof contactSchema>;
type SubcontractorValues = z.infer<typeof subcontractorSchema>;
type SubcontractorEditValues = z.infer<typeof subcontractorEditSchema>;

type WorkspaceProps = Readonly<{
  entity?: 'supplier' | 'subcontractor' | 'all';
  initialCreate?: boolean;
  canReadVendors: boolean;
  canCreateVendors: boolean;
  canUpdateVendors: boolean;
  canReadSubcontractors: boolean;
  canManageSubcontractors: boolean;
}>;

/** Render the final company-level Supplier and Subcontractor master workspace. */
export function VendorsSubcontractorsWorkspace(props: WorkspaceProps) {
  const showSuppliers = props.entity !== 'subcontractor';
  const showSubcontractors = props.entity !== 'supplier';
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorStatus, setVendorStatus] = useState<VendorStatus | ''>('');
  const [qualification, setQualification] = useState<VendorQualificationStatus | ''>('');
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [subcontractorSearch, setSubcontractorSearch] = useState('');
  const [selectedSubcontractor, setSelectedSubcontractor] = useState<Subcontractor | null>(null);

  const vendors = useVendors({
    ...(vendorSearch ? { search: vendorSearch } : {}),
    ...(vendorStatus ? { status: vendorStatus } : {}),
    ...(qualification ? { qualificationStatus: qualification } : {}),
    page: 1,
    pageSize: 100
  }, props.canReadVendors);
  const vendorDetail = useVendor(selectedVendorId, props.canReadVendors);
  const subcontractors = useSubcontractors({ ...(subcontractorSearch ? { search: subcontractorSearch } : {}), page: 1, pageSize: 100 }, props.canReadSubcontractors);
  const createVendorMutation = useCreateVendor();
  const createSubcontractorMutation = useCreateSubcontractor();

  const vendorForm = useForm<VendorCreateValues>({
    resolver: zodResolver(vendorCreateSchema),
    defaultValues: { code: '', legalName: '', displayName: '', taxNo: '', paymentTermsDays: null, currency: '', qualificationStatus: null }
  });
  const subcontractorForm = useForm<SubcontractorValues>({
    resolver: zodResolver(subcontractorSchema),
    defaultValues: { vendorId: '', code: '', specialty: '', defaultTerms: '' }
  });

  useEffect(() => {
    if (!props.initialCreate) return;
    requestAnimationFrame(() => document.getElementById(props.entity === 'subcontractor' ? 'add-subcontractor' : 'add-supplier')?.scrollIntoView({ block: 'start' }));
  }, [props.entity, props.initialCreate]);

  /** Create one supplier/vendor and open its detail after success. */
  async function handleCreateVendor(values: VendorCreateValues): Promise<void> {
    const vendor = await createVendorMutation.mutateAsync({
      code: values.code,
      legalName: values.legalName,
      displayName: values.displayName,
      taxNo: values.taxNo || null,
      paymentTermsDays: values.paymentTermsDays,
      currency: values.currency ? values.currency.toUpperCase() : null,
      qualificationStatus: values.qualificationStatus
    });
    vendorForm.reset();
    setSelectedVendorId(vendor.id);
  }

  /** Create one subcontractor profile with an optional active vendor link. */
  async function handleCreateSubcontractor(values: SubcontractorValues): Promise<void> {
    const created = await createSubcontractorMutation.mutateAsync({
      vendorId: values.vendorId || null,
      code: values.code,
      specialty: values.specialty,
      defaultTerms: values.defaultTerms || null
    });
    subcontractorForm.reset();
    setSelectedSubcontractor(created);
  }

  return (
    <section className="admin-stack" aria-labelledby="vendors-subcontractors-title">
      <section className="admin-card">
        <p className="eyebrow">Commercial master data</p>
        <h1 id="vendors-subcontractors-title">{props.entity === 'supplier' ? 'Supplier Management' : props.entity === 'subcontractor' ? 'Subcontractor Management' : 'Suppliers & Subcontractors'}</h1>
        <p className="muted">Maintain master records here. Payments and ledger balances remain Finance-owned and are available from this module's navigation.</p>
      </section>

      {showSuppliers && props.canReadVendors && (
        <section className="admin-card">
          <h2>Suppliers / Vendors</h2>
          <div className="client-form-grid">
            <label>Search<input value={vendorSearch} onChange={(event) => setVendorSearch(event.target.value)} /></label>
            <label>Status<select value={vendorStatus} onChange={(event) => setVendorStatus(event.target.value as VendorStatus | '')}><option value="">All</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></label>
            <label>Qualification<select value={qualification} onChange={(event) => setQualification(event.target.value as VendorQualificationStatus | '')}><option value="">All</option><option value="QUALIFIED">Qualified</option><option value="PENDING">Pending</option></select></label>
          </div>
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Code</th><th>Name</th><th>Status</th><th>Qualification</th><th>Action</th></tr></thead>
              <tbody>{(vendors.data?.items ?? []).map((vendor) => <tr key={vendor.id}><td>{vendor.code}</td><td>{vendor.displayName}</td><td>{vendor.status}</td><td>{vendor.qualificationStatus ?? '—'}</td><td><button type="button" className="link-button" onClick={() => setSelectedVendorId(vendor.id)}>Open</button></td></tr>)}</tbody>
            </table>
          </div>
          {vendors.isLoading && <p className="muted">Loading suppliers…</p>}
          {vendors.error instanceof Error && <div className="form-error">{vendors.error.message}</div>}
        </section>
      )}

      {showSuppliers && selectedVendorId && vendorDetail.data && (
        <VendorDetail
          details={vendorDetail.data}
          canUpdate={props.canUpdateVendors}
        />
      )}

      {showSuppliers && props.canCreateVendors && (
        <section className="admin-card" id="add-supplier">
          <h2>Add supplier / vendor</h2>
          <form className="admin-form" onSubmit={vendorForm.handleSubmit(handleCreateVendor)} noValidate>
            <div className="client-form-grid">
              <label>Code<input {...vendorForm.register('code')} /></label>
              <label>Display name<input {...vendorForm.register('displayName')} /></label>
              <label>Legal name<input {...vendorForm.register('legalName')} /></label>
              <label>Tax number<input {...vendorForm.register('taxNo')} /></label>
              <label>Payment terms days<input type="number" min="0" {...vendorForm.register('paymentTermsDays', { setValueAs: (value) => value === '' ? null : Number(value) })} /></label>
              <label>Currency<input maxLength={3} {...vendorForm.register('currency')} /></label>
              <label>Qualification<select {...vendorForm.register('qualificationStatus', { setValueAs: (value) => value || null })}><option value="">Not set</option><option value="QUALIFIED">Qualified</option><option value="PENDING">Pending</option></select></label>
            </div>
            {Object.values(vendorForm.formState.errors).map((error, index) => <span className="field-error" key={index}>{error?.message}</span>)}
            {createVendorMutation.error instanceof Error && <div className="form-error">{createVendorMutation.error.message}</div>}
            <button type="submit" disabled={createVendorMutation.isPending}>{createVendorMutation.isPending ? 'Creating…' : 'Create supplier'}</button>
          </form>
        </section>
      )}

      {showSubcontractors && props.canReadSubcontractors && (
        <section className="admin-card">
          <h2>Subcontractors</h2>
          <label>Search<input value={subcontractorSearch} onChange={(event) => setSubcontractorSearch(event.target.value)} /></label>
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Code</th><th>Specialty</th><th>Linked supplier</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>{(subcontractors.data?.items ?? []).map((item) => <tr key={item.id}><td>{item.code}</td><td>{item.specialty}</td><td>{item.vendor?.displayName ?? '—'}</td><td>{item.status}</td><td>{props.canManageSubcontractors ? <button type="button" className="link-button" onClick={() => setSelectedSubcontractor(item)}>Edit</button> : '—'}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}

      {showSubcontractors && props.canManageSubcontractors && selectedSubcontractor && (
        <SubcontractorEditor subcontractor={selectedSubcontractor} vendors={vendors.data?.items ?? []} onSaved={setSelectedSubcontractor} />
      )}

      {showSubcontractors && props.canManageSubcontractors && (
        <section className="admin-card" id="add-subcontractor">
          <h2>Add subcontractor</h2>
          <form className="admin-form" onSubmit={subcontractorForm.handleSubmit(handleCreateSubcontractor)} noValidate>
            <div className="client-form-grid">
              <label>Code<input {...subcontractorForm.register('code')} /></label>
              <label>Specialty<input {...subcontractorForm.register('specialty')} /></label>
              <label>Linked supplier<select {...subcontractorForm.register('vendorId')}><option value="">None</option>{(vendors.data?.items ?? []).filter((vendor) => vendor.status === 'ACTIVE').map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.displayName}</option>)}</select></label>
              <label>Default terms<input {...subcontractorForm.register('defaultTerms')} /></label>
            </div>
            {Object.values(subcontractorForm.formState.errors).map((error, index) => <span className="field-error" key={index}>{error?.message}</span>)}
            {createSubcontractorMutation.error instanceof Error && <div className="form-error">{createSubcontractorMutation.error.message}</div>}
            <button type="submit" disabled={createSubcontractorMutation.isPending}>{createSubcontractorMutation.isPending ? 'Creating…' : 'Create subcontractor'}</button>
          </form>
        </section>
      )}

      {!props.canReadVendors && !props.canReadSubcontractors && <section className="admin-card"><h1>Suppliers & Subcontractors</h1><p className="muted">Your current role does not include supplier or subcontractor read access.</p></section>}
    </section>
  );
}

/** Render one supplier/vendor detail with final editable master data and Contacts. */
function VendorDetail(props: Readonly<{ details: VendorDetails; canUpdate: boolean }>) {
  const details = props.details;
  const vendor = details.vendor;
  const updateMutation = useUpdateVendor(vendor.id);
  const contactMutation = useCreateVendorContact(vendor.id);
  const editForm = useForm<VendorEditValues>({ resolver: zodResolver(vendorEditSchema), defaultValues: { code: vendor.code, legalName: vendor.legalName, displayName: vendor.displayName, taxNo: vendor.taxNo ?? '', paymentTermsDays: vendor.paymentTermsDays, currency: vendor.currency ?? '', qualificationStatus: vendor.qualificationStatus, status: vendor.status } });
  const contactForm = useForm<ContactValues>({ resolver: zodResolver(contactSchema), defaultValues: { name: '', email: '', phone: '', role: '' } });

  useEffect(() => {
    editForm.reset({ code: vendor.code, legalName: vendor.legalName, displayName: vendor.displayName, taxNo: vendor.taxNo ?? '', paymentTermsDays: vendor.paymentTermsDays, currency: vendor.currency ?? '', qualificationStatus: vendor.qualificationStatus, status: vendor.status });
  }, [vendor, editForm]);

  /** Save supplier/vendor master changes through the final PATCH route. */
  async function handleUpdate(values: VendorEditValues): Promise<void> {
    await updateMutation.mutateAsync({ code: values.code, legalName: values.legalName, displayName: values.displayName, taxNo: values.taxNo || null, paymentTermsDays: values.paymentTermsDays, currency: values.currency ? values.currency.toUpperCase() : null, qualificationStatus: values.qualificationStatus, status: values.status });
  }

  /** Add one optional-detail Contact under the selected supplier/vendor. */
  async function handleContact(values: ContactValues): Promise<void> {
    await contactMutation.mutateAsync({ name: values.name, email: values.email || null, phone: values.phone || null, role: values.role || null });
    contactForm.reset();
  }

  return (
    <section className="admin-card">
      <h2>{vendor.displayName}</h2>
      <p className="muted">{vendor.code} · {vendor.status}</p>
      <div className="client-detail-grid">
        <div><strong>Purchase orders</strong><span>{details.purchaseSummary.purchaseOrderCount}</span></div>
        <div><strong>Purchased total</strong><span>{details.purchaseSummary.purchaseOrderTotal}</span></div>
        <div><strong>Posted supplier invoices</strong><span>{details.payableSummary?.postedInvoiceCount ?? 'Restricted'}</span></div>
        <div><strong>Posted invoice total</strong><span>{details.payableSummary?.postedInvoiceTotal ?? 'Restricted'}</span></div>
        <div><strong>Allocated supplier payments</strong><span>{details.payableSummary?.allocatedPaymentTotal ?? 'Restricted'}</span></div>
        <div><strong>Supplier payable outstanding</strong><span>{details.payableSummary?.outstandingAmount ?? 'Restricted'}</span></div>
      </div>
      <h3>Contacts</h3>
      {vendor.contacts.length ? <div className="table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th></tr></thead><tbody>{vendor.contacts.map((contact) => <tr key={contact.id}><td>{contact.name}</td><td>{contact.role ?? '—'}</td><td>{contact.email ?? '—'}</td><td>{contact.phone ?? '—'}</td></tr>)}</tbody></table></div> : <p className="muted">No contacts yet.</p>}
      {props.canUpdate && <form className="admin-form" onSubmit={contactForm.handleSubmit(handleContact)} noValidate><h3>Add contact</h3><div className="client-form-grid"><label>Name<input {...contactForm.register('name')} /></label><label>Role<input {...contactForm.register('role')} /></label><label>Email<input {...contactForm.register('email')} /></label><label>Phone<input {...contactForm.register('phone')} /></label></div><button type="submit" disabled={contactMutation.isPending}>Add contact</button></form>}
      {props.canUpdate && <form className="admin-form" onSubmit={editForm.handleSubmit(handleUpdate)} noValidate><h3>Edit supplier</h3><div className="client-form-grid"><label>Code<input {...editForm.register('code')} /></label><label>Display name<input {...editForm.register('displayName')} /></label><label>Legal name<input {...editForm.register('legalName')} /></label><label>Tax number<input {...editForm.register('taxNo')} /></label><label>Payment terms<input type="number" min="0" {...editForm.register('paymentTermsDays', { setValueAs: (value) => value === '' ? null : Number(value) })} /></label><label>Currency<input maxLength={3} {...editForm.register('currency')} /></label><label>Qualification<select {...editForm.register('qualificationStatus', { setValueAs: (value) => value || null })}><option value="">Not set</option><option value="QUALIFIED">Qualified</option><option value="PENDING">Pending</option></select></label><label>Status<select {...editForm.register('status')}><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></label></div><button type="submit" disabled={updateMutation.isPending}>Save supplier</button></form>}
    </section>
  );
}

/** Edit one selected subcontractor master record. */
function SubcontractorEditor(props: Readonly<{ subcontractor: Subcontractor; vendors: readonly { id: string; displayName: string; status: string }[]; onSaved: (value: Subcontractor) => void }>) {
  const mutation = useUpdateSubcontractor(props.subcontractor.id);
  const form = useForm<SubcontractorEditValues>({ resolver: zodResolver(subcontractorEditSchema), defaultValues: { vendorId: props.subcontractor.vendorId ?? '', code: props.subcontractor.code, specialty: props.subcontractor.specialty, defaultTerms: props.subcontractor.defaultTerms ?? '', status: props.subcontractor.status } });

  /** Save subcontractor master changes and keep the selected readback current. */
  async function handleUpdate(values: SubcontractorEditValues): Promise<void> {
    const updated = await mutation.mutateAsync({ vendorId: values.vendorId || null, code: values.code, specialty: values.specialty, defaultTerms: values.defaultTerms || null, status: values.status });
    props.onSaved(updated);
  }

  return <section className="admin-card"><h2>Edit subcontractor</h2><form className="admin-form" onSubmit={form.handleSubmit(handleUpdate)} noValidate><div className="client-form-grid"><label>Code<input {...form.register('code')} /></label><label>Specialty<input {...form.register('specialty')} /></label><label>Linked supplier<select {...form.register('vendorId')}><option value="">None</option>{props.vendors.filter((vendor) => vendor.status === 'ACTIVE').map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.displayName}</option>)}</select></label><label>Default terms<input {...form.register('defaultTerms')} /></label><label>Status<select {...form.register('status')}><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></label></div>{mutation.error instanceof Error && <div className="form-error">{mutation.error.message}</div>}<button type="submit" disabled={mutation.isPending}>Save subcontractor</button></form></section>;
}
