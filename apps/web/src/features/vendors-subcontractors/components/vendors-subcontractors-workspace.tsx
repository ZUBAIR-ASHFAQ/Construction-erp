import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useClients, useCreateClient } from '../../clients/hooks/clients.js';
import { useCreateProject, useProjects } from '../../projects/hooks/projects.js';
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
const projectCreateSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required.').max(300),
  clientId: z.string().uuid('Select a Client.'),
  projectModel: z.enum(['FIXED_PRICE', 'COST_PLUS_PERCENTAGE']),
  projectValue: z.string().trim().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/, 'Enter a valid non-negative Project value with at most 2 decimals.'),
  costPlusPercent: z.string().trim(),
  currency: z.string().trim().length(3, 'Currency must use three letters.').regex(/^[A-Za-z]{3}$/, 'Currency must use letters only.'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date is required.'),
  plannedEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Planned end date is required.'),
  location: z.string().trim().max(1000, 'Location is too long.')
}).superRefine((value, context) => {
  if (value.plannedEndDate < value.startDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['plannedEndDate'], message: 'Planned end date cannot be before the start date.' });
  }

  if (value.projectModel === 'COST_PLUS_PERCENTAGE') {
    const validPercent = /^(?:0|[1-9]\d{0,2}|100)(?:\.\d{1,4})?$/.test(value.costPlusPercent);
    const percent = Number(value.costPlusPercent);
    if (!validPercent || percent <= 0 || percent > 100) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['costPlusPercent'], message: 'Cost + Percentage requires a percent greater than 0 and at most 100.' });
    }
  } else if (value.costPlusPercent) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['costPlusPercent'], message: 'Leave Cost + Percentage empty for a Fixed Price Project.' });
  }
});
const quickProjectClientSchema = z.object({
  legalName: z.string().trim().min(1, 'Legal name is required.').max(240),
  displayName: z.string().trim().min(1, 'Display name is required.').max(240),
  taxNo: z.string().trim().max(100),
  billingAddress: z.string().trim().min(1, 'Billing address is required.').max(1000),
  creditTermsDays: z.number().int().min(0, 'Credit terms cannot be negative.').nullable(),
  contactName: z.string().trim().max(200),
  contactTitle: z.string().trim().max(160),
  contactEmail: z.union([z.literal(''), z.string().trim().email('Enter a valid contact email address.')]),
  contactPhone: z.union([z.literal(''), z.string().trim().min(7, 'Contact phone must contain at least 7 characters.').max(50)]),
  contactIsPrimary: z.boolean()
}).refine((value) => {
  const hasContactDetails = Boolean(value.contactTitle || value.contactEmail || value.contactPhone || value.contactIsPrimary);
  return !hasContactDetails || Boolean(value.contactName);
}, {
  path: ['contactName'],
  message: 'Contact name is required when contact details are provided.'
});

type VendorCreateValues = z.infer<typeof vendorCreateSchema>;
type VendorEditValues = z.infer<typeof vendorEditSchema>;
type ContactValues = z.infer<typeof contactSchema>;
type SubcontractorValues = z.infer<typeof subcontractorSchema>;
type SubcontractorEditValues = z.infer<typeof subcontractorEditSchema>;
type ProjectCreateValues = z.infer<typeof projectCreateSchema>;
type QuickProjectClientValues = z.infer<typeof quickProjectClientSchema>;

type VendorDialog =
  | Readonly<{ kind: 'create' }>
  | Readonly<{ kind: 'create-project' }>
  | Readonly<{ kind: 'create-project-client' }>
  | Readonly<{ kind: 'edit'; vendor: Vendor }>
  | null;
type SubcontractorDialog =
  | Readonly<{ kind: 'create' }>
  | Readonly<{ kind: 'create-project' }>
  | Readonly<{ kind: 'create-project-client' }>
  | Readonly<{ kind: 'edit'; subcontractor: Subcontractor }>
  | null;

type WorkspaceProps = Readonly<{
  entity?: 'supplier' | 'subcontractor' | 'all';
  initialCreate?: boolean;
  canReadVendors: boolean;
  canCreateVendors: boolean;
  canUpdateVendors: boolean;
  canReadSubcontractors: boolean;
  canManageSubcontractors: boolean;
  canReadProjects: boolean;
  canCreateProjects: boolean;
  canReadClients: boolean;
  canCreateClients: boolean;
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
  const [vendorProjectSearch, setVendorProjectSearch] = useState('');
  const [vendorProjectPickerOpen, setVendorProjectPickerOpen] = useState(false);
  const [subcontractorSearch, setSubcontractorSearch] = useState('');
  const [selectedSubcontractor, setSelectedSubcontractor] = useState<Subcontractor | null>(null);
  const [subcontractorDialog, setSubcontractorDialog] = useState<SubcontractorDialog>(null);
  const [subcontractorProjectSearch, setSubcontractorProjectSearch] = useState('');
  const [subcontractorProjectPickerOpen, setSubcontractorProjectPickerOpen] = useState(false);
  const [projectClientSearch, setProjectClientSearch] = useState('');
  const [projectClientPickerOpen, setProjectClientPickerOpen] = useState(false);
  const [quickCreatedProject, setQuickCreatedProject] = useState<Readonly<{ id: string; label: string }> | null>(null);
  const [quickCreatedProjectClient, setQuickCreatedProjectClient] = useState<Readonly<{ id: string; label: string }> | null>(null);
  const [projectFilter, setProjectFilter] = useState('');
  const projects = useProjects({ page: 1, pageSize: 100 }, props.canReadProjects);
  const vendorProjects = useProjects({
    ...(vendorProjectSearch.trim() ? { search: vendorProjectSearch.trim() } : {}),
    page: 1,
    pageSize: 100
  }, props.canReadProjects && showSuppliers && vendorDialog?.kind === 'create');
  const subcontractorProjects = useProjects({
    ...(subcontractorProjectSearch.trim() ? { search: subcontractorProjectSearch.trim() } : {}),
    page: 1,
    pageSize: 100
  }, props.canReadProjects && showSubcontractors && subcontractorDialog?.kind === 'create');

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
  const createProjectMutation = useCreateProject();
  const createProjectClientMutation = useCreateClient();

  const vendorForm = useForm<VendorCreateValues>({
    resolver: zodResolver(vendorCreateSchema),
    defaultValues: { projectId: '', code: '', legalName: '', displayName: '', taxNo: '', paymentTermsDays: null, currency: '', qualificationStatus: null }
  });
  const subcontractorForm = useForm<SubcontractorValues>({
    resolver: zodResolver(subcontractorSchema),
    defaultValues: { projectId: '', name: '', phone: '', specialty: '', address: '' }
  });
  const projectForm = useForm<ProjectCreateValues>({
    resolver: zodResolver(projectCreateSchema),
    defaultValues: {
      name: '', clientId: '', projectModel: 'FIXED_PRICE', projectValue: '0.00', costPlusPercent: '',
      currency: 'PKR', startDate: '', plannedEndDate: '', location: ''
    }
  });
  const quickProjectClientForm = useForm<QuickProjectClientValues>({
    resolver: zodResolver(quickProjectClientSchema),
    defaultValues: {
      legalName: '', displayName: '', taxNo: '', billingAddress: '', creditTermsDays: null,
      contactName: '', contactTitle: '', contactEmail: '', contactPhone: '', contactIsPrimary: false
    }
  });
  const selectedProjectClientId = projectForm.watch('clientId');
  const selectedProjectModel = projectForm.watch('projectModel');
  const projectClients = useClients({
    status: 'ACTIVE',
    ...(projectClientSearch.trim() ? { search: projectClientSearch.trim() } : {}),
    page: 1,
    pageSize: 100
  }, props.canReadClients && (vendorDialog?.kind === 'create-project' || subcontractorDialog?.kind === 'create-project'));

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
    setVendorProjectSearch('');
    setVendorProjectPickerOpen(false);
    setVendorDialog(null);
    setSelectedVendorId(vendor.id);
  }

  /** Filter Projects in the Add supplier combobox and clear a stale selection when typing starts. */
  function handleVendorProjectSearch(value: string): void {
    setVendorProjectSearch(value);
    setVendorProjectPickerOpen(true);
    if (vendorForm.getValues('projectId')) {
      vendorForm.setValue('projectId', '', { shouldDirty: true, shouldValidate: true });
    }
  }

  /** Select one Project for the supplier being created. */
  function handleVendorProjectSelect(project: Readonly<{ id: string; projectCode: string; name: string }>): void {
    vendorForm.setValue('projectId', project.id, { shouldDirty: true, shouldValidate: true });
    setVendorProjectSearch(project.name);
    setVendorProjectPickerOpen(false);
  }

  /** Open the normal Project-create fields without discarding the in-progress supplier form. */
  function openVendorProjectCreate(): void {
    createProjectMutation.reset();
    setVendorProjectPickerOpen(false);
    projectForm.reset({
      name: '', clientId: '', projectModel: 'FIXED_PRICE', projectValue: '0.00', costPlusPercent: '',
      currency: 'PKR', startDate: '', plannedEndDate: '', location: ''
    });
    setProjectClientSearch('');
    setProjectClientPickerOpen(false);
    setVendorDialog({ kind: 'create-project' });
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
    setSubcontractorProjectSearch('');
    setSubcontractorProjectPickerOpen(false);
    setSubcontractorDialog(null);
    setSelectedSubcontractor(created);
  }

  /** Filter Projects in the Add subcontractor combobox and clear a stale selection when typing starts. */
  function handleSubcontractorProjectSearch(value: string): void {
    setSubcontractorProjectSearch(value);
    setSubcontractorProjectPickerOpen(true);
    if (subcontractorForm.getValues('projectId')) {
      subcontractorForm.setValue('projectId', '', { shouldDirty: true, shouldValidate: true });
    }
  }

  /** Select one Project for the subcontractor being created. */
  function handleSubcontractorProjectSelect(project: Readonly<{ id: string; projectCode: string; name: string }>): void {
    subcontractorForm.setValue('projectId', project.id, { shouldDirty: true, shouldValidate: true });
    setSubcontractorProjectSearch(`${project.projectCode} · ${project.name}`);
    setSubcontractorProjectPickerOpen(false);
  }


  /** Open the normal Project-create fields without discarding the in-progress subcontractor form. */
  function openProjectCreate(): void {
    createProjectMutation.reset();
    setSubcontractorProjectPickerOpen(false);
    projectForm.reset({
      name: '', clientId: '', projectModel: 'FIXED_PRICE', projectValue: '0.00', costPlusPercent: '',
      currency: 'PKR', startDate: '', plannedEndDate: '', location: ''
    });
    setProjectClientSearch('');
    setProjectClientPickerOpen(false);
    setSubcontractorDialog({ kind: 'create-project' });
  }

  /** Return to the originating supplier/subcontractor form without clearing fields already entered there. */
  function closeProjectCreate(): void {
    const returnToSupplier = vendorDialog?.kind === 'create-project';
    createProjectMutation.reset();
    setProjectClientPickerOpen(false);
    if (returnToSupplier) setVendorDialog({ kind: 'create' });
    else setSubcontractorDialog({ kind: 'create' });
  }

  /** Filter active Clients inside the Project popup and clear a stale selection when the search text changes. */
  function handleProjectClientSearch(value: string): void {
    setProjectClientSearch(value);
    setProjectClientPickerOpen(true);
    if (projectForm.getValues('clientId')) {
      projectForm.setValue('clientId', '', { shouldDirty: true, shouldValidate: true });
    }
  }

  /** Select one active Client for the Project being created. */
  function handleProjectClientSelect(client: Readonly<{ id: string; code: string; displayName: string }>): void {
    projectForm.setValue('clientId', client.id, { shouldDirty: true, shouldValidate: true });
    setProjectClientSearch(client.displayName);
    setProjectClientPickerOpen(false);
  }

  /** Open the full Client-create form from the active Project popup. */
  function openProjectClientCreate(): void {
    const returnToSupplier = vendorDialog?.kind === 'create-project';
    createProjectClientMutation.reset();
    quickProjectClientForm.reset({
      legalName: '', displayName: '', taxNo: '', billingAddress: '', creditTermsDays: null,
      contactName: '', contactTitle: '', contactEmail: '', contactPhone: '', contactIsPrimary: false
    });
    if (returnToSupplier) setVendorDialog({ kind: 'create-project-client' });
    else setSubcontractorDialog({ kind: 'create-project-client' });
  }

  /** Return from Client creation to the Project popup that opened it. */
  function closeProjectClientCreate(): void {
    const returnToSupplier = vendorDialog?.kind === 'create-project-client';
    createProjectClientMutation.reset();
    if (returnToSupplier) setVendorDialog({ kind: 'create-project' });
    else setSubcontractorDialog({ kind: 'create-project' });
  }

  /** Create the Project through the existing Projects API, select it, then return to its originating form. */
  async function handleCreateProject(values: ProjectCreateValues): Promise<void> {
    const returnToSupplier = vendorDialog?.kind === 'create-project';
    const project = await createProjectMutation.mutateAsync({
      name: values.name,
      clientId: values.clientId,
      projectModel: values.projectModel,
      projectValue: values.projectValue,
      costPlusPercent: values.projectModel === 'COST_PLUS_PERCENTAGE' ? values.costPlusPercent : null,
      currency: values.currency.toUpperCase(),
      startDate: values.startDate,
      plannedEndDate: values.plannedEndDate,
      location: values.location || null
    });
    const label = `${project.projectCode} · ${project.name}`;
    setQuickCreatedProject({ id: project.id, label });
    if (returnToSupplier) {
      vendorForm.setValue('projectId', project.id, { shouldDirty: true, shouldValidate: true });
      setVendorProjectSearch(project.name);
      setVendorProjectPickerOpen(false);
      setVendorDialog({ kind: 'create' });
      return;
    }
    subcontractorForm.setValue('projectId', project.id, { shouldDirty: true, shouldValidate: true });
    setSubcontractorProjectSearch(label);
    setSubcontractorProjectPickerOpen(false);
    setSubcontractorDialog({ kind: 'create' });
  }

  /** Create a Client from inside Project creation, then return with that Client selected. */
  async function handleCreateProjectClient(values: QuickProjectClientValues): Promise<void> {
    const returnToSupplier = vendorDialog?.kind === 'create-project-client';
    const client = await createProjectClientMutation.mutateAsync({
      legalName: values.legalName,
      displayName: values.displayName,
      taxNo: values.taxNo ? values.taxNo : null,
      billingAddress: values.billingAddress,
      creditTermsDays: values.creditTermsDays,
      ...(values.contactName ? {
        contact: {
          name: values.contactName,
          title: values.contactTitle ? values.contactTitle : null,
          email: values.contactEmail ? values.contactEmail : null,
          phone: values.contactPhone ? values.contactPhone : null,
          isPrimary: values.contactIsPrimary
        }
      } : {})
    });
    const label = `${client.code} · ${client.displayName}`;
    setQuickCreatedProjectClient({ id: client.id, label });
    projectForm.setValue('clientId', client.id, { shouldDirty: true, shouldValidate: true });
    setProjectClientSearch(client.displayName);
    setProjectClientPickerOpen(false);
    quickProjectClientForm.reset({
      legalName: '', displayName: '', taxNo: '', billingAddress: '', creditTermsDays: null,
      contactName: '', contactTitle: '', contactEmail: '', contactPhone: '', contactIsPrimary: false
    });
    if (returnToSupplier) setVendorDialog({ kind: 'create-project' });
    else setSubcontractorDialog({ kind: 'create-project' });
  }

  const creatingProjectForSupplier = showSuppliers && vendorDialog?.kind === 'create-project';
  const creatingProjectForSubcontractor = showSubcontractors && subcontractorDialog?.kind === 'create-project';
  const creatingProjectClientForSupplier = showSuppliers && vendorDialog?.kind === 'create-project-client';
  const creatingProjectClientForSubcontractor = showSubcontractors && subcontractorDialog?.kind === 'create-project-client';

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
                onClick={() => {
                  createVendorMutation.reset();
                  vendorForm.reset();
                  setVendorProjectSearch('');
                  setVendorProjectPickerOpen(false);
                  setQuickCreatedProject(null);
                  setVendorDialog({ kind: 'create' });
                }}
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
              <thead><tr><th>Code</th><th>Name</th><th>Status</th><th>Qualification</th><th>Payables</th><th>Actions</th></tr></thead>
              <tbody>{(vendors.data?.items ?? []).map((vendor) => <tr key={vendor.id}><td>{vendor.code}</td><td>{vendor.displayName}</td><td>{vendor.status}</td><td>{vendor.qualificationStatus ?? '—'}</td><td><strong>{vendor.payableOutstanding === null ? 'Restricted' : Number(vendor.payableOutstanding).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><br /><small>{projectFilter ? 'Selected Project outstanding' : 'All allowed Projects outstanding'}</small></td><td><div className="client-row-actions"><button type="button" className="link-button" onClick={() => setSelectedVendorId(vendor.id)}>Open</button>{props.onOpenSupplierLedger && <button type="button" className="secondary-button client-edit-button" onClick={() => props.onOpenSupplierLedger?.(vendor.id)}>Ledger</button>}{props.canUpdateVendors && <button type="button" className="secondary-button client-edit-button" onClick={() => setVendorDialog({ kind: 'edit', vendor })}>Edit</button>}</div></td></tr>)}</tbody>
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
        <SupplierModal title="Add supplier" eyebrow="Supplier master" onClose={() => { createVendorMutation.reset(); vendorForm.reset(); setVendorProjectSearch(''); setVendorProjectPickerOpen(false); setVendorDialog(null); }}>
          <form className="admin-form client-modal-form" onSubmit={vendorForm.handleSubmit(handleCreateVendor)} noValidate>
            <div className="client-form-grid">
              <div className="project-client-field">
                <label htmlFor="supplier-master-project-search">Project</label>
                <div className="project-client-search-row">
                  <div
                    className="project-client-combobox"
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setVendorProjectPickerOpen(false);
                    }}
                  >
                    <input
                      id="supplier-master-project-search"
                      type="search"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-controls="supplier-master-project-options"
                      aria-expanded={vendorProjectPickerOpen}
                      value={vendorProjectSearch}
                      onChange={(event) => handleVendorProjectSearch(event.target.value)}
                      onFocus={() => setVendorProjectPickerOpen(true)}
                      onClick={() => setVendorProjectPickerOpen(true)}
                      onKeyDown={(event) => { if (event.key === 'Escape') setVendorProjectPickerOpen(false); }}
                      placeholder={props.canReadProjects ? 'Search Projects by name or code' : 'Project read permission required'}
                      autoComplete="off"
                      disabled={!props.canReadProjects}
                    />
                    {vendorProjectPickerOpen && props.canReadProjects && (
                      <div id="supplier-master-project-options" className="project-client-options" role="listbox" aria-label="Projects">
                        {vendorProjects.isFetching && <div className="project-client-option-state">Searching Projects…</div>}
                        {!vendorProjects.isFetching && quickCreatedProject && !(vendorProjects.data?.items ?? []).some((project) => project.id === quickCreatedProject.id) && (!vendorProjectSearch.trim() || quickCreatedProject.label.toLowerCase().includes(vendorProjectSearch.trim().toLowerCase())) && (
                          <button
                            type="button"
                            role="option"
                            aria-selected={vendorForm.getValues('projectId') === quickCreatedProject.id}
                            className="project-client-option"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              vendorForm.setValue('projectId', quickCreatedProject.id, { shouldDirty: true, shouldValidate: true });
                              setVendorProjectSearch(quickCreatedProject.label.split(' · ').slice(1).join(' · '));
                              setVendorProjectPickerOpen(false);
                            }}
                          >
                            {quickCreatedProject.label}
                          </button>
                        )}
                        {!vendorProjects.isFetching && (vendorProjects.data?.items ?? []).map((project) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected={vendorForm.getValues('projectId') === project.id}
                            className="project-client-option"
                            key={project.id}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleVendorProjectSelect(project)}
                          >
                            <strong>{project.projectCode}</strong><span>{project.name}</span>
                          </button>
                        ))}
                        {!vendorProjects.isFetching && (vendorProjects.data?.items ?? []).length === 0 && !quickCreatedProject && (
                          <div className="project-client-option-state">No Projects match this search.</div>
                        )}
                      </div>
                    )}
                  </div>
                  {props.canCreateProjects && <button type="button" className="secondary-button project-client-create-button" onClick={openVendorProjectCreate}>+ Create project</button>}
                </div>
                <input type="hidden" {...vendorForm.register('projectId')} />
                {vendorProjects.error instanceof Error && <span className="field-error">{vendorProjects.error.message}</span>}
              </div>
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
              <button type="button" className="secondary-button" onClick={() => { createVendorMutation.reset(); vendorForm.reset(); setVendorProjectSearch(''); setVendorProjectPickerOpen(false); setVendorDialog(null); }}>Cancel</button>
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
                onClick={() => {
                  createSubcontractorMutation.reset();
                  subcontractorForm.reset();
                  setSubcontractorProjectSearch('');
                  setSubcontractorProjectPickerOpen(false);
                  setSubcontractorDialog({ kind: 'create' });
                }}
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
              <div className="project-client-field">
                <label htmlFor="subcontractor-project-search">Project</label>
                <div className="project-client-search-row">
                  <div
                    className="project-client-combobox"
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSubcontractorProjectPickerOpen(false);
                    }}
                  >
                    <input
                      id="subcontractor-project-search"
                      type="search"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-controls="subcontractor-project-options"
                      aria-expanded={subcontractorProjectPickerOpen}
                      value={subcontractorProjectSearch}
                      onChange={(event) => handleSubcontractorProjectSearch(event.target.value)}
                      onFocus={() => setSubcontractorProjectPickerOpen(true)}
                      onClick={() => setSubcontractorProjectPickerOpen(true)}
                      onKeyDown={(event) => { if (event.key === 'Escape') setSubcontractorProjectPickerOpen(false); }}
                      placeholder="Search Projects by name or code"
                      autoComplete="off"
                    />
                    {subcontractorProjectPickerOpen && (
                      <div id="subcontractor-project-options" className="project-client-options" role="listbox" aria-label="Projects">
                        {subcontractorProjects.isFetching && <div className="project-client-option-state">Searching Projects…</div>}
                        {!subcontractorProjects.isFetching && quickCreatedProject && !(subcontractorProjects.data?.items ?? []).some((project) => project.id === quickCreatedProject.id) && (
                          <button
                            type="button"
                            role="option"
                            aria-selected={subcontractorForm.getValues('projectId') === quickCreatedProject.id}
                            className="project-client-option"
                            onClick={() => {
                              subcontractorForm.setValue('projectId', quickCreatedProject.id, { shouldDirty: true, shouldValidate: true });
                              setSubcontractorProjectSearch(quickCreatedProject.label);
                              setSubcontractorProjectPickerOpen(false);
                            }}
                          >
                            {quickCreatedProject.label}
                          </button>
                        )}
                        {!subcontractorProjects.isFetching && (subcontractorProjects.data?.items ?? []).map((project) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected={subcontractorForm.getValues('projectId') === project.id}
                            className="project-client-option"
                            key={project.id}
                            onClick={() => handleSubcontractorProjectSelect(project)}
                          >
                            <strong>{project.projectCode}</strong><span>{project.name}</span>
                          </button>
                        ))}
                        {!subcontractorProjects.isFetching && (subcontractorProjects.data?.items ?? []).length === 0 && !quickCreatedProject && (
                          <div className="project-client-option-state">No Projects match this search.</div>
                        )}
                      </div>
                    )}
                  </div>
                  {props.canCreateProjects && props.canReadClients && (
                    <button type="button" className="secondary-button project-client-create-button" onClick={openProjectCreate}>+ Create project</button>
                  )}
                </div>
                <input type="hidden" {...subcontractorForm.register('projectId')} />
                {subcontractorProjects.error instanceof Error && <span className="field-error">{subcontractorProjects.error.message}</span>}
              </div>
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


      {(creatingProjectForSupplier || creatingProjectForSubcontractor) && (
        <SubcontractorModal title="Create project" eyebrow="New project" onClose={closeProjectCreate}>
          <form className="admin-form project-modal-form" onSubmit={projectForm.handleSubmit(handleCreateProject)} noValidate>
            <div className="project-form-grid project-modal-grid">
              <label>Project name<input autoFocus {...projectForm.register('name')} /></label>
              <div className="project-client-field">
                <label htmlFor="subcontractor-project-client-search">Client</label>
                <div className="project-client-search-row">
                  <div
                    className="project-client-combobox"
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setProjectClientPickerOpen(false);
                    }}
                  >
                    <input
                      id="subcontractor-project-client-search"
                      type="search"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-controls="subcontractor-project-client-options"
                      aria-expanded={projectClientPickerOpen}
                      value={projectClientSearch}
                      onChange={(event) => handleProjectClientSearch(event.target.value)}
                      onFocus={() => setProjectClientPickerOpen(true)}
                      onClick={() => setProjectClientPickerOpen(true)}
                      onKeyDown={(event) => { if (event.key === 'Escape') setProjectClientPickerOpen(false); }}
                      placeholder={props.canReadClients ? 'Search active clients by name or code' : 'Client read permission required'}
                      autoComplete="off"
                      disabled={!props.canReadClients}
                    />
                    {projectClientPickerOpen && props.canReadClients && (
                      <div id="subcontractor-project-client-options" className="project-client-options" role="listbox" aria-label="Active clients">
                        {projectClients.isFetching && <div className="project-client-option-state">Searching active clients…</div>}
                        {!projectClients.isFetching && quickCreatedProjectClient && !(projectClients.data?.items ?? []).some((client) => client.id === quickCreatedProjectClient.id) && (
                          <button
                            type="button"
                            role="option"
                            aria-selected={selectedProjectClientId === quickCreatedProjectClient.id}
                            className="project-client-option"
                            onClick={() => {
                              projectForm.setValue('clientId', quickCreatedProjectClient.id, { shouldDirty: true, shouldValidate: true });
                              setProjectClientSearch(quickCreatedProjectClient.label);
                              setProjectClientPickerOpen(false);
                            }}
                          >
                            {quickCreatedProjectClient.label}
                          </button>
                        )}
                        {!projectClients.isFetching && (projectClients.data?.items ?? []).map((client) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected={selectedProjectClientId === client.id}
                            className="project-client-option"
                            key={client.id}
                            onClick={() => handleProjectClientSelect(client)}
                          >
                            <strong>{client.code}</strong><span>{client.displayName}</span>
                          </button>
                        ))}
                        {!projectClients.isFetching && (projectClients.data?.items ?? []).length === 0 && !quickCreatedProjectClient && (
                          <div className="project-client-option-state">No active clients match this search.</div>
                        )}
                      </div>
                    )}
                  </div>
                  {props.canReadClients && props.canCreateClients && (
                    <button
                      type="button"
                      className="secondary-button project-client-create-button"
                      onClick={openProjectClientCreate}
                    >
                      + Create client
                    </button>
                  )}
                </div>
                <input type="hidden" {...projectForm.register('clientId')} />
                {projectClients.error instanceof Error && <span className="field-error">{projectClients.error.message}</span>}
              </div>
              <label>Commercial model<select {...projectForm.register('projectModel')}><option value="FIXED_PRICE">Fixed Price</option><option value="COST_PLUS_PERCENTAGE">Cost + Percentage</option></select></label>
              <label>Project value<input inputMode="decimal" {...projectForm.register('projectValue')} /></label>
              {selectedProjectModel === 'COST_PLUS_PERCENTAGE' && <label>Cost + percent<input inputMode="decimal" {...projectForm.register('costPlusPercent')} /></label>}
              <label>Currency<input maxLength={3} {...projectForm.register('currency')} /></label>
              <label>Start date<input type="date" {...projectForm.register('startDate')} /></label>
              <label>Planned end date<input type="date" {...projectForm.register('plannedEndDate')} /></label>
              <label className="project-form-wide">Location (optional)<input {...projectForm.register('location')} /></label>
            </div>
            <p className="muted project-edit-note">Create the Project here, then it will be selected automatically for this {creatingProjectForSupplier ? 'supplier' : 'subcontractor'}.</p>
            {Object.values(projectForm.formState.errors).map((error, index) => <span className="field-error" key={index}>{error?.message}</span>)}
            {createProjectMutation.error instanceof Error && <div className="form-error" role="alert">{createProjectMutation.error.message}</div>}
            <div className="client-modal-actions">
              <button type="button" className="secondary-button" onClick={closeProjectCreate}>{creatingProjectForSupplier ? 'Back to supplier' : 'Back to subcontractor'}</button>
              <button type="submit" disabled={createProjectMutation.isPending}>{createProjectMutation.isPending ? 'Creating…' : 'Create Project'}</button>
            </div>
          </form>
        </SubcontractorModal>
      )}

      {(creatingProjectClientForSupplier || creatingProjectClientForSubcontractor) && (
        <SubcontractorModal title="Create client" eyebrow="New client account" onClose={closeProjectClientCreate}>
          <form className="admin-form client-modal-form" onSubmit={quickProjectClientForm.handleSubmit(handleCreateProjectClient)} noValidate>
            <div className="client-form-grid">
              <label>Display name<input autoFocus {...quickProjectClientForm.register('displayName')} /></label>
              <label>Legal name<input {...quickProjectClientForm.register('legalName')} /></label>
              <label>Tax number<input {...quickProjectClientForm.register('taxNo')} /></label>
              <label>
                Credit terms (days)
                <input
                  type="number"
                  min="0"
                  {...quickProjectClientForm.register('creditTermsDays', {
                    setValueAs: (value) => value === '' ? null : Number(value)
                  })}
                />
              </label>
              <label className="client-form-wide">Billing address<textarea rows={3} {...quickProjectClientForm.register('billingAddress')} /></label>
              <div className="client-form-wide client-create-contact-heading">
                <strong>Primary contact (optional)</strong>
                <span className="muted">The client code is generated automatically by the server.</span>
              </div>
              <label>Contact name<input {...quickProjectClientForm.register('contactName')} /></label>
              <label>Contact title<input {...quickProjectClientForm.register('contactTitle')} /></label>
              <label>Contact email<input type="email" {...quickProjectClientForm.register('contactEmail')} /></label>
              <label>Contact phone<input {...quickProjectClientForm.register('contactPhone')} /></label>
              <label className="checkbox-row client-form-wide"><input type="checkbox" {...quickProjectClientForm.register('contactIsPrimary')} /><span>Primary contact</span></label>
            </div>
            {Object.values(quickProjectClientForm.formState.errors).map((error, index) => <span className="field-error" key={index}>{error?.message}</span>)}
            {createProjectClientMutation.error instanceof Error && <div className="form-error" role="alert">{createProjectClientMutation.error.message}</div>}
            <div className="client-modal-actions">
              <button type="button" className="secondary-button" onClick={closeProjectClientCreate}>Back to Project</button>
              <button type="submit" disabled={createProjectClientMutation.isPending}>{createProjectClientMutation.isPending ? 'Creating…' : 'Create client'}</button>
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
