import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useProjects } from '../../projects/hooks/projects.js';
import type { Subcontractor, Vendor, VendorDetails, VendorQualificationStatus, VendorStatus } from '../api/vendors-subcontractors-api.js';
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
  projectId: z.string().uuid('Select a Project.'),
  code: z.string().trim().min(1).max(100),
  legalName: z.string().trim().min(1).max(300),
  displayName: z.string().trim().min(1).max(300),
  taxNo: optionalText,
  paymentTermsDays: z.number().int().min(0).nullable(),
  currency: z.string().trim().max(3),
  qualificationStatus: z.enum(['QUALIFIED', 'PENDING']).nullable()
});
const vendorEditSchema = vendorCreateSchema.omit({ projectId: true }).extend({ status: z.enum(['ACTIVE', 'ARCHIVED']) });
const contactSchema = z.object({ name: z.string().trim().min(1).max(200), email: optionalText, phone: optionalText, role: optionalText });
const subcontractorSchema = z.object({
  projectId: z.string().uuid('Select a Project.'),
  name: z.string().trim().min(1).max(300),
  phone: z.string().trim().min(7).max(50),
  specialty: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(1000)
});
const subcontractorEditSchema = subcontractorSchema.omit({ projectId: true }).extend({ status: z.enum(['ACTIVE', 'ARCHIVED']) });

type VendorCreateValues = z.infer<typeof vendorCreateSchema>;
type VendorEditValues = z.infer<typeof vendorEditSchema>;
type ContactValues = z.infer<typeof contactSchema>;
type SubcontractorValues = z.infer<typeof subcontractorSchema>;
type SubcontractorEditValues = z.infer<typeof subcontractorEditSchema>;

type VendorDialog = Readonly<{ kind: 'create' }> | Readonly<{ kind: 'edit'; vendor: Vendor }> | null;
type SubcontractorDialog = Readonly<{ kind: 'create' }> | Readonly<{ kind: 'edit'; subcontractor: Subcontractor }> | null;

type WorkspaceProps = Readonly<{
  entity?: 'supplier' | 'subcontractor' | 'all';
  initialCreate?: boolean;
  canReadVendors: boolean;
  canCreateVendors: boolean;
  canUpdateVendors: boolean;
  canReadSubcontractors: boolean;
  canManageSubcontractors: boolean;
  onOpenSupplierLedger?: (vendorId: string) => void;
  onOpenSubcontractorLedger?: (subcontractorId: string) => void;
}>;

/** Render the final company-level Supplier and Subcontractor master workspace. */
export function VendorsSubcontractorsWorkspace(props: WorkspaceProps) {
  const showSuppliers = props.entity !== 'subcontractor';
  const showSubcontractors = props.entity !== 'supplier';
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorStatus, setVendorStatus] = useState<VendorStatus | ''>('');
  const [qualification, setQualification] = useState<VendorQualificationStatus | ''>('');
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [vendorDialog, setVendorDialog] = useState<VendorDialog>(null);
  const [subcontractorSearch, setSubcontractorSearch] = useState('');
  const [selectedSubcontractor, setSelectedSubcontractor] = useState<Subcontractor | null>(null);
  const [subcontractorDialog, setSubcontractorDialog] = useState<SubcontractorDialog>(null);
  const [projectFilter, setProjectFilter] = useState('');
  const projects = useProjects({ page: 1, pageSize: 100 });

  const vendors = useVendors({
    ...(projectFilter ? { projectId: projectFilter } : {}),
    ...(vendorSearch ? { search: vendorSearch } : {}),
    ...(vendorStatus ? { status: vendorStatus } : {}),
    ...(qualification ? { qualificationStatus: qualification } : {}),
    page: 1,
    pageSize: 100
  }, props.canReadVendors);
  const vendorDetail = useVendor(selectedVendorId, props.canReadVendors);
  const subcontractors = useSubcontractors({ ...(projectFilter ? { projectId: projectFilter } : {}), ...(subcontractorSearch ? { search: subcontractorSearch } : {}), page: 1, pageSize: 100 }, props.canReadSubcontractors);
  const createVendorMutation = useCreateVendor();
  const createSubcontractorMutation = useCreateSubcontractor();

  const vendorForm = useForm<VendorCreateValues>({
    resolver: zodResolver(vendorCreateSchema),
    defaultValues: { projectId: '', code: '', legalName: '', displayName: '', taxNo: '', paymentTermsDays: null, currency: '', qualificationStatus: null }
  });
  const subcontractorForm = useForm<SubcontractorValues>({
    resolver: zodResolver(subcontractorSchema),
    defaultValues: { projectId: '', name: '', phone: '', specialty: '', address: '' }
  });

  useEffect(() => {
    if (!props.initialCreate) return;
    if (props.entity === 'subcontractor') {
      if (props.canManageSubcontractors) setSubcontractorDialog({ kind: 'create' });
      return;
    }
    if (props.canCreateVendors) setVendorDialog({ kind: 'create' });
  }, [props.canCreateVendors, props.canManageSubcontractors, props.entity, props.initialCreate]);

  /** Create one supplier/vendor and open its detail after success. */
  async function handleCreateVendor(values: VendorCreateValues): Promise<void> {
    const vendor = await createVendorMutation.mutateAsync({
      projectId: values.projectId,
      code: values.code,
      legalName: values.legalName,
      displayName: values.displayName,
      taxNo: values.taxNo || null,
      paymentTermsDays: values.paymentTermsDays,
      currency: values.currency ? values.currency.toUpperCase() : null,
      qualificationStatus: values.qualificationStatus
    });
    vendorForm.reset();
    setVendorDialog(null);
    setSelectedVendorId(vendor.id);
  }

  /** Create one subcontractor profile; its internal code is generated by the server. */
  async function handleCreateSubcontractor(values: SubcontractorValues): Promise<void> {
    const created = await createSubcontractorMutation.mutateAsync({
      projectId: values.projectId,
      name: values.name,
      phone: values.phone,
      specialty: values.specialty,
      address: values.address
    });
    subcontractorForm.reset();
    setSubcontractorDialog(null);
    setSelectedSubcontractor(created);
  }

  return (
    <section className="admin-stack" aria-labelledby="vendors-subcontractors-title">
      <section className="admin-card">
        <p className="eyebrow">Commercial master data</p>
        <h1 id="vendors-subcontractors-title">{props.entity === 'supplier' ? 'Supplier Management' : props.entity === 'subcontractor' ? 'Subcontractor Management' : 'Suppliers & Subcontractors'}</h1>
        <p className="muted">Maintain master records here. Payments and ledger balances remain Finance-owned and are available from this module's navigation.</p>
        <label>Project scope<select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="">All my Projects</option>{(projects.data?.items ?? []).map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}</select></label>
      </section>

      {showSuppliers && props.canReadVendors && (
        <section className="admin-card">
          <div className="client-page-heading">
            <div>
              <h2>Suppliers / Vendors</h2>
              <p className="muted">Search and maintain supplier master records without leaving the register.</p>
            </div>
            {props.canCreateVendors && (
              <button
                type="button"
                className="client-primary-action"
                onClick={() => { createVendorMutation.reset(); vendorForm.reset(); setVendorDialog({ kind: 'create' }); }}
              >
                <span aria-hidden="true">+</span> Add supplier
              </button>
            )}
          </div>
          <div className="client-form-grid">
            <label>Search<input value={vendorSearch} onChange={(event) => setVendorSearch(event.target.value)} /></label>
            <label>Status<select value={vendorStatus} onChange={(event) => setVendorStatus(event.target.value as VendorStatus | '')}><option value="">All</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></label>
            <label>Qualification<select value={qualification} onChange={(event) => setQualification(event.target.value as VendorQualificationStatus | '')}><option value="">All</option><option value="QUALIFIED">Qualified</option><option value="PENDING">Pending</option></select></label>
          </div>
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Code</th><th>Name</th><th>Status</th><th>Qualification</th><th>Actions</th></tr></thead>
              <tbody>{(vendors.data?.items ?? []).map((vendor) => <tr key={vendor.id}><td>{vendor.code}</td><td>{vendor.displayName}</td><td>{vendor.status}</td><td>{vendor.qualificationStatus ?? '—'}</td><td><div className="client-row-actions"><button type="button" className="link-button" onClick={() => setSelectedVendorId(vendor.id)}>Open</button>{props.onOpenSupplierLedger && <button type="button" className="secondary-button client-edit-button" onClick={() => props.onOpenSupplierLedger?.(vendor.id)}>Ledger</button>}{props.canUpdateVendors && <button type="button" className="secondary-button client-edit-button" onClick={() => setVendorDialog({ kind: 'edit', vendor })}>Edit</button>}</div></td></tr>)}</tbody>
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

      {showSuppliers && vendorDialog?.kind === 'create' && (
        <SupplierModal title="Add supplier" eyebrow="Supplier master" onClose={() => { createVendorMutation.reset(); vendorForm.reset(); setVendorDialog(null); }}>
          <form className="admin-form client-modal-form" onSubmit={vendorForm.handleSubmit(handleCreateVendor)} noValidate>
            <div className="client-form-grid">
              <label>Project<select {...vendorForm.register('projectId')}><option value="">Select Project</option>{(projects.data?.items ?? []).map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}</select></label>
              <label>Code<input {...vendorForm.register('code')} /></label>
              <label>Display name<input {...vendorForm.register('displayName')} /></label>
              <label>Legal name<input {...vendorForm.register('legalName')} /></label>
              <label>Tax number<input {...vendorForm.register('taxNo')} /></label>
              <label>Payment terms days<input type="number" min="0" {...vendorForm.register('paymentTermsDays', { setValueAs: (value) => value === '' ? null : Number(value) })} /></label>
              <label>Currency<input maxLength={3} {...vendorForm.register('currency')} /></label>
              <label>Qualification<select {...vendorForm.register('qualificationStatus', { setValueAs: (value) => value || null })}><option value="">Not set</option><option value="QUALIFIED">Qualified</option><option value="PENDING">Pending</option></select></label>
            </div>
            {Object.values(vendorForm.formState.errors).map((error, index) => <span className="field-error" key={index}>{error?.message}</span>)}
            {createVendorMutation.error instanceof Error && <div className="form-error" role="alert">{createVendorMutation.error.message}</div>}
            <div className="client-modal-actions">
              <button type="button" className="secondary-button" onClick={() => { createVendorMutation.reset(); vendorForm.reset(); setVendorDialog(null); }}>Cancel</button>
              <button type="submit" disabled={createVendorMutation.isPending}>{createVendorMutation.isPending ? 'Creating…' : 'Create supplier'}</button>
            </div>
          </form>
        </SupplierModal>
      )}

      {showSuppliers && vendorDialog?.kind === 'edit' && (
        <SupplierEditModal vendor={vendorDialog.vendor} onClose={() => setVendorDialog(null)} />
      )}

      {showSubcontractors && props.canReadSubcontractors && (
        <section className="admin-card">
          <div className="client-page-heading">
            <div>
              <h2>Subcontractors</h2>
              <p className="muted">Search and maintain subcontractor master records without leaving the register.</p>
            </div>
            {props.canManageSubcontractors && (
              <button
                type="button"
                className="client-primary-action"
                onClick={() => { createSubcontractorMutation.reset(); subcontractorForm.reset(); setSubcontractorDialog({ kind: 'create' }); }}
              >
                <span aria-hidden="true">+</span> Add subcontractor
              </button>
            )}
          </div>
          <label>Search<input value={subcontractorSearch} onChange={(event) => setSubcontractorSearch(event.target.value)} /></label>
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Name</th><th>Phone</th><th>Specialty</th><th>Address</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{(subcontractors.data?.items ?? []).map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.phone}</td><td>{item.specialty}</td><td>{item.address}</td><td>{item.status}</td><td><div className="client-row-actions"><button type="button" className="link-button" onClick={() => setSelectedSubcontractor(item)}>Open</button>{props.onOpenSubcontractorLedger && <button type="button" className="secondary-button client-edit-button" onClick={() => props.onOpenSubcontractorLedger?.(item.id)}>Ledger</button>}{props.canManageSubcontractors && <button type="button" className="secondary-button client-edit-button" onClick={() => setSubcontractorDialog({ kind: 'edit', subcontractor: item })}>Edit</button>}</div></td></tr>)}</tbody>
            </table>
          </div>
          {subcontractors.isLoading && <p className="muted">Loading subcontractors…</p>}
          {subcontractors.error instanceof Error && <div className="form-error">{subcontractors.error.message}</div>}
        </section>
      )}

      {showSubcontractors && selectedSubcontractor && (
        <SubcontractorDetail subcontractor={selectedSubcontractor} />
      )}

      {showSubcontractors && subcontractorDialog?.kind === 'create' && (
        <SubcontractorModal title="Add subcontractor" eyebrow="Subcontractor master" onClose={() => { createSubcontractorMutation.reset(); subcontractorForm.reset(); setSubcontractorDialog(null); }}>
          <form className="admin-form client-modal-form" onSubmit={subcontractorForm.handleSubmit(handleCreateSubcontractor)} noValidate>
            <div className="client-form-grid">
              <label>Project<select {...subcontractorForm.register('projectId')}><option value="">Select Project</option>{(projects.data?.items ?? []).map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}</select></label>
              <label>Name<input {...subcontractorForm.register('name')} /></label>
              <label>Phone<input type="tel" {...subcontractorForm.register('phone')} /></label>
              <label>Specialty<input {...subcontractorForm.register('specialty')} /></label>
              <label>Address<input {...subcontractorForm.register('address')} /></label>
            </div>
            {Object.values(subcontractorForm.formState.errors).map((error, index) => <span className="field-error" key={index}>{error?.message}</span>)}
            {createSubcontractorMutation.error instanceof Error && <div className="form-error" role="alert">{createSubcontractorMutation.error.message}</div>}
            <div className="client-modal-actions">
              <button type="button" className="secondary-button" onClick={() => { createSubcontractorMutation.reset(); subcontractorForm.reset(); setSubcontractorDialog(null); }}>Cancel</button>
              <button type="submit" disabled={createSubcontractorMutation.isPending}>{createSubcontractorMutation.isPending ? 'Creating…' : 'Create subcontractor'}</button>
            </div>
          </form>
        </SubcontractorModal>
      )}

      {showSubcontractors && subcontractorDialog?.kind === 'edit' && (
        <SubcontractorEditModal
          subcontractor={subcontractorDialog.subcontractor}
          onSaved={(updated) => { setSelectedSubcontractor(updated); setSubcontractorDialog(null); }}
          onClose={() => setSubcontractorDialog(null)}
        />
      )}

      {!props.canReadVendors && !props.canReadSubcontractors && <section className="admin-card"><h1>Suppliers & Subcontractors</h1><p className="muted">Your current role does not include supplier or subcontractor read access.</p></section>}
    </section>
  );
}

/** Render one supplier/vendor detail with final editable master data and Contacts. */
function VendorDetail(props: Readonly<{ details: VendorDetails; canUpdate: boolean }>) {
  const details = props.details;
  const vendor = details.vendor;
  const contactMutation = useCreateVendorContact(vendor.id);
  const contactForm = useForm<ContactValues>({ resolver: zodResolver(contactSchema), defaultValues: { name: '', email: '', phone: '', role: '' } });

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
    </section>
  );
}

/** Render one accessible Supplier modal using the existing professional modal surface. */
function SupplierModal(props: Readonly<{ title: string; eyebrow: string; onClose: () => void; children: ReactNode }>) {
  useEffect(() => {
    /** Close only the active Supplier modal when Escape is pressed. */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') props.onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [props.onClose]);

  return (
    <div className="client-modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section className="client-modal client-modal-wide" role="dialog" aria-modal="true" aria-labelledby="supplier-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="client-modal-header">
          <div><p className="eyebrow">{props.eyebrow}</p><h2 id="supplier-modal-title">{props.title}</h2></div>
          <button type="button" className="client-modal-close" onClick={props.onClose} aria-label={`Close ${props.title}`}><span aria-hidden="true">×</span></button>
        </header>
        <div className="client-modal-body">{props.children}</div>
      </section>
    </div>
  );
}

/** Edit Supplier master information in a dedicated list-level dialog. */
function SupplierEditModal(props: Readonly<{ vendor: Vendor; onClose: () => void }>) {
  const updateMutation = useUpdateVendor(props.vendor.id);
  const editForm = useForm<VendorEditValues>({
    resolver: zodResolver(vendorEditSchema),
    defaultValues: {
      code: props.vendor.code,
      legalName: props.vendor.legalName,
      displayName: props.vendor.displayName,
      taxNo: props.vendor.taxNo ?? '',
      paymentTermsDays: props.vendor.paymentTermsDays,
      currency: props.vendor.currency ?? '',
      qualificationStatus: props.vendor.qualificationStatus,
      status: props.vendor.status
    }
  });

  /** Save Supplier changes through the existing PATCH contract, then return to the register. */
  async function handleUpdate(values: VendorEditValues): Promise<void> {
    await updateMutation.mutateAsync({
      code: values.code,
      legalName: values.legalName,
      displayName: values.displayName,
      taxNo: values.taxNo || null,
      paymentTermsDays: values.paymentTermsDays,
      currency: values.currency ? values.currency.toUpperCase() : null,
      qualificationStatus: values.qualificationStatus,
      status: values.status
    });
    props.onClose();
  }

  return (
    <SupplierModal title={`Edit ${props.vendor.displayName}`} eyebrow="Supplier master" onClose={props.onClose}>
      <form className="admin-form client-modal-form" onSubmit={editForm.handleSubmit(handleUpdate)} noValidate>
        <div className="client-form-grid">
          <label>Code<input {...editForm.register('code')} /></label>
          <label>Display name<input {...editForm.register('displayName')} /></label>
          <label>Legal name<input {...editForm.register('legalName')} /></label>
          <label>Tax number<input {...editForm.register('taxNo')} /></label>
          <label>Payment terms days<input type="number" min="0" {...editForm.register('paymentTermsDays', { setValueAs: (value) => value === '' ? null : Number(value) })} /></label>
          <label>Currency<input maxLength={3} {...editForm.register('currency')} /></label>
          <label>Qualification<select {...editForm.register('qualificationStatus', { setValueAs: (value) => value || null })}><option value="">Not set</option><option value="QUALIFIED">Qualified</option><option value="PENDING">Pending</option></select></label>
          <label>Status<select {...editForm.register('status')}><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></label>
        </div>
        {Object.values(editForm.formState.errors).map((error, index) => <span className="field-error" key={index}>{error?.message}</span>)}
        {updateMutation.error instanceof Error && <div className="form-error" role="alert">{updateMutation.error.message}</div>}
        <div className="client-modal-actions">
          <button type="button" className="secondary-button" onClick={props.onClose}>Cancel</button>
          <button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? 'Saving…' : 'Save supplier'}</button>
        </div>
      </form>
    </SupplierModal>
  );
}

/** Render the selected subcontractor master record without turning Open into an edit action. */
function SubcontractorDetail(props: Readonly<{ subcontractor: Subcontractor }>) {
  return (
    <section className="admin-card">
      <h2>{props.subcontractor.name}</h2>
      <p className="muted">{props.subcontractor.specialty} · {props.subcontractor.status}</p>
      <div className="client-detail-grid">
        <div><strong>Phone</strong><span>{props.subcontractor.phone}</span></div>
        <div><strong>Specialty</strong><span>{props.subcontractor.specialty}</span></div>
        <div><strong>Status</strong><span>{props.subcontractor.status}</span></div>
        <div><strong>Address</strong><span>{props.subcontractor.address}</span></div>
      </div>
    </section>
  );
}

/** Render one accessible Subcontractor modal using the same professional surface as Supplier master dialogs. */
function SubcontractorModal(props: Readonly<{ title: string; eyebrow: string; onClose: () => void; children: ReactNode }>) {
  useEffect(() => {
    /** Close only the active Subcontractor modal when Escape is pressed. */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') props.onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [props.onClose]);

  return (
    <div className="client-modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section className="client-modal client-modal-wide" role="dialog" aria-modal="true" aria-labelledby="subcontractor-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="client-modal-header">
          <div><p className="eyebrow">{props.eyebrow}</p><h2 id="subcontractor-modal-title">{props.title}</h2></div>
          <button type="button" className="client-modal-close" onClick={props.onClose} aria-label={`Close ${props.title}`}><span aria-hidden="true">×</span></button>
        </header>
        <div className="client-modal-body">{props.children}</div>
      </section>
    </div>
  );
}

/** Edit one selected subcontractor master record in a dedicated list-level dialog. */
function SubcontractorEditModal(props: Readonly<{ subcontractor: Subcontractor; onSaved: (value: Subcontractor) => void; onClose: () => void }>) {
  const mutation = useUpdateSubcontractor(props.subcontractor.id);
  const form = useForm<SubcontractorEditValues>({
    resolver: zodResolver(subcontractorEditSchema),
    defaultValues: {
      name: props.subcontractor.name,
      phone: props.subcontractor.phone,
      specialty: props.subcontractor.specialty,
      address: props.subcontractor.address,
      status: props.subcontractor.status
    }
  });

  /** Save subcontractor master changes and return to the register. */
  async function handleUpdate(values: SubcontractorEditValues): Promise<void> {
    const updated = await mutation.mutateAsync({ name: values.name, phone: values.phone, specialty: values.specialty, address: values.address, status: values.status });
    props.onSaved(updated);
  }

  return (
    <SubcontractorModal title={`Edit ${props.subcontractor.name}`} eyebrow="Subcontractor master" onClose={props.onClose}>
      <form className="admin-form client-modal-form" onSubmit={form.handleSubmit(handleUpdate)} noValidate>
        <div className="client-form-grid">
          <label>Name<input {...form.register('name')} /></label>
          <label>Phone<input type="tel" {...form.register('phone')} /></label>
          <label>Specialty<input {...form.register('specialty')} /></label>
          <label>Address<input {...form.register('address')} /></label>
          <label>Status<select {...form.register('status')}><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></label>
        </div>
        {Object.values(form.formState.errors).map((error, index) => <span className="field-error" key={index}>{error?.message}</span>)}
        {mutation.error instanceof Error && <div className="form-error" role="alert">{mutation.error.message}</div>}
        <div className="client-modal-actions">
          <button type="button" className="secondary-button" onClick={props.onClose}>Cancel</button>
          <button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save subcontractor'}</button>
        </div>
      </form>
    </SubcontractorModal>
  );
}
