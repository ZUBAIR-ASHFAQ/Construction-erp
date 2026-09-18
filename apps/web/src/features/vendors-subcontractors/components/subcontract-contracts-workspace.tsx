import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { useClients, useCreateClient } from '../../clients/hooks/clients.js';
import { useCreateProject, useProjects } from '../../projects/hooks/projects.js';
import type { SubcontractContract } from '../api/vendors-subcontractors-api.js';
import {
  useCreateSubcontractContract,
  useCreateSubcontractor,
  useFinishSubcontractContract,
  useSubcontractContracts,
  useSubcontractors,
  useUpdateSubcontractContract
} from '../hooks/vendors-subcontractors.js';

const contractFormSchema = z.object({
  subcontractorId: z.string().uuid('Select a subcontractor.'),
  projectId: z.string().uuid('Select a Project.'),
  contractAmount: z.string().trim().regex(
    /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/,
    'Enter a valid amount with at most 2 decimal places.'
  ).refine((value) => Number(value) > 0, 'Contract amount must be greater than 0.'),
  contractDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select the subcontract date.')
});

const subcontractorCreateSchema = z.object({
  projectId: z.string().uuid('Select a Project.'),
  name: z.string().trim().min(1, 'Name is required.').max(300),
  phone: z.string().trim().min(7, 'Phone must contain at least 7 characters.').max(50),
  specialty: z.string().trim().min(1, 'Specialty is required.').max(200),
  address: z.string().trim().min(1, 'Address is required.').max(1000)
});

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

const clientCreateSchema = z.object({
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

type ContractFormValues = z.infer<typeof contractFormSchema>;
type SubcontractorCreateValues = z.infer<typeof subcontractorCreateSchema>;
type ProjectCreateValues = z.infer<typeof projectCreateSchema>;
type ClientCreateValues = z.infer<typeof clientCreateSchema>;
type ContractDialog = Readonly<{ kind: 'create' }> | Readonly<{ kind: 'edit'; contract: SubcontractContract }> | null;
type CreateFlowDialog =
  | Readonly<{ kind: 'create-subcontractor' }>
  | Readonly<{ kind: 'create-project'; returnTo: 'contract' | 'subcontractor' }>
  | Readonly<{ kind: 'create-project-client'; returnTo: 'contract' | 'subcontractor' }>
  | null;

type WorkspaceProps = Readonly<{
  canReadSubcontractors: boolean;
  canManageSubcontractors: boolean;
  canReadProjects: boolean;
  canCreateProjects: boolean;
  canReadClients: boolean;
  canCreateClients: boolean;
}>;

/** Render the subcontract Project-assignment workflow on its own page. */
export function SubcontractContractsWorkspace(props: WorkspaceProps) {
  const [contractDialog, setContractDialog] = useState<ContractDialog>(null);
  const [createFlowDialog, setCreateFlowDialog] = useState<CreateFlowDialog>(null);
  const [subcontractorSearch, setSubcontractorSearch] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [subcontractorProjectSearch, setSubcontractorProjectSearch] = useState('');
  const [subcontractorProjectPickerOpen, setSubcontractorProjectPickerOpen] = useState(false);
  const [projectClientSearch, setProjectClientSearch] = useState('');
  const [projectClientPickerOpen, setProjectClientPickerOpen] = useState(false);
  const subcontractors = useSubcontractors({
    status: 'ACTIVE',
    ...(subcontractorSearch.trim() ? { search: subcontractorSearch.trim() } : {}),
    page: 1,
    pageSize: 100
  }, props.canReadSubcontractors && contractDialog !== null);
  const projects = useProjects({
    ...(projectSearch.trim() ? { search: projectSearch.trim() } : {}),
    page: 1,
    pageSize: 100
  }, props.canReadProjects && contractDialog !== null);
  const subcontractorProjects = useProjects({
    ...(subcontractorProjectSearch.trim() ? { search: subcontractorProjectSearch.trim() } : {}),
    page: 1,
    pageSize: 100
  }, props.canReadProjects && createFlowDialog?.kind === 'create-subcontractor');
  const projectClients = useClients({
    status: 'ACTIVE',
    ...(projectClientSearch.trim() ? { search: projectClientSearch.trim() } : {}),
    page: 1,
    pageSize: 100
  }, props.canReadClients && createFlowDialog?.kind === 'create-project');
  const contracts = useSubcontractContracts({ page: 1, pageSize: 100 }, props.canReadSubcontractors);
  const createMutation = useCreateSubcontractContract();
  const createSubcontractorMutation = useCreateSubcontractor();
  const createProjectMutation = useCreateProject();
  const createClientMutation = useCreateClient();
  const finishMutation = useFinishSubcontractContract();
  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: { subcontractorId: '', projectId: '', contractAmount: '', contractDate: '' }
  });
  const subcontractorForm = useForm<SubcontractorCreateValues>({
    resolver: zodResolver(subcontractorCreateSchema),
    defaultValues: { projectId: '', name: '', phone: '', specialty: '', address: '' }
  });
  const projectForm = useForm<ProjectCreateValues>({
    resolver: zodResolver(projectCreateSchema),
    defaultValues: {
      name: '', clientId: '', projectModel: 'FIXED_PRICE', projectValue: '0.00', costPlusPercent: '',
      currency: 'PKR', startDate: '', plannedEndDate: '', location: ''
    }
  });
  const clientForm = useForm<ClientCreateValues>({
    resolver: zodResolver(clientCreateSchema),
    defaultValues: {
      legalName: '', displayName: '', taxNo: '', billingAddress: '', creditTermsDays: null,
      contactName: '', contactTitle: '', contactEmail: '', contactPhone: '', contactIsPrimary: false
    }
  });
  const selectedProjectClientId = projectForm.watch('clientId');
  const selectedProjectModel = projectForm.watch('projectModel');

  /** Reset the two searchable master pickers without touching contract register state. */
  function resetContractPickers(): void {
    setSubcontractorSearch('');
    setProjectSearch('');
  }

  /** Open the create dialog with fresh form and searchable picker state. */
  function openCreateDialog(): void {
    createMutation.reset();
    form.reset({ subcontractorId: '', projectId: '', contractAmount: '', contractDate: '' });
    resetContractPickers();
    setCreateFlowDialog(null);
    setContractDialog({ kind: 'create' });
  }

  /** Open one active contract for editing while keeping its current labels visible in the searchable pickers. */
  function openEditDialog(contract: SubcontractContract): void {
    setSubcontractorSearch(contract.subcontractor.name);
    setProjectSearch(contract.project.name);
    setContractDialog({ kind: 'edit', contract });
  }

  /** Close either contract dialog and clear picker-only search state. */
  function closeContractDialog(): void {
    resetContractPickers();
    setCreateFlowDialog(null);
    setContractDialog(null);
  }

  /** Open the full subcontractor form without discarding the in-progress Contract. */
  function openSubcontractorCreate(): void {
    createSubcontractorMutation.reset();
    subcontractorForm.reset({ projectId: '', name: '', phone: '', specialty: '', address: '' });
    setSubcontractorProjectSearch('');
    setSubcontractorProjectPickerOpen(false);
    setCreateFlowDialog({ kind: 'create-subcontractor' });
  }

  /** Search Projects inside the full subcontractor form and clear any stale selection. */
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

  /** Create a subcontractor through the normal master-data API, select it, and return to the Contract. */
  async function handleCreateSubcontractor(values: SubcontractorCreateValues): Promise<void> {
    const subcontractor = await createSubcontractorMutation.mutateAsync(values);
    form.setValue('subcontractorId', subcontractor.id, { shouldDirty: true, shouldValidate: true });
    setSubcontractorSearch(subcontractor.name);
    setCreateFlowDialog(null);
  }

  /** Open the normal full Project form from either the Contract or nested Subcontractor form. */
  function openProjectCreate(returnTo: 'contract' | 'subcontractor'): void {
    createProjectMutation.reset();
    projectForm.reset({
      name: '', clientId: '', projectModel: 'FIXED_PRICE', projectValue: '0.00', costPlusPercent: '',
      currency: 'PKR', startDate: '', plannedEndDate: '', location: ''
    });
    setProjectClientSearch('');
    setProjectClientPickerOpen(false);
    setCreateFlowDialog({ kind: 'create-project', returnTo });
  }

  /** Return from Project creation to the form that opened it without losing entered values. */
  function closeProjectCreate(): void {
    const returnTo = createFlowDialog?.kind === 'create-project' ? createFlowDialog.returnTo : 'contract';
    createProjectMutation.reset();
    setProjectClientPickerOpen(false);
    setCreateFlowDialog(returnTo === 'subcontractor' ? { kind: 'create-subcontractor' } : null);
  }

  /** Search active Clients inside the Project form and clear a stale Client selection. */
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
    setProjectClientSearch(`${client.code} · ${client.displayName}`);
    setProjectClientPickerOpen(false);
  }

  /** Open the same complete Client-create fields used by Client Management. */
  function openProjectClientCreate(): void {
    if (createFlowDialog?.kind !== 'create-project') return;
    createClientMutation.reset();
    clientForm.reset({
      legalName: '', displayName: '', taxNo: '', billingAddress: '', creditTermsDays: null,
      contactName: '', contactTitle: '', contactEmail: '', contactPhone: '', contactIsPrimary: false
    });
    setCreateFlowDialog({ kind: 'create-project-client', returnTo: createFlowDialog.returnTo });
  }

  /** Return from Client creation to the Project popup that opened it. */
  function closeProjectClientCreate(): void {
    const returnTo = createFlowDialog?.kind === 'create-project-client' ? createFlowDialog.returnTo : 'contract';
    createClientMutation.reset();
    setCreateFlowDialog({ kind: 'create-project', returnTo });
  }

  /** Create a Client with the normal Client API and select it in the unfinished Project. */
  async function handleCreateProjectClient(values: ClientCreateValues): Promise<void> {
    if (createFlowDialog?.kind !== 'create-project-client') return;
    const returnTo = createFlowDialog.returnTo;
    const client = await createClientMutation.mutateAsync({
      legalName: values.legalName,
      displayName: values.displayName,
      taxNo: values.taxNo || null,
      billingAddress: values.billingAddress,
      creditTermsDays: values.creditTermsDays,
      ...(values.contactName ? {
        contact: {
          name: values.contactName,
          title: values.contactTitle || null,
          email: values.contactEmail || null,
          phone: values.contactPhone || null,
          isPrimary: values.contactIsPrimary
        }
      } : {})
    });
    projectForm.setValue('clientId', client.id, { shouldDirty: true, shouldValidate: true });
    setProjectClientSearch(`${client.code} · ${client.displayName}`);
    setProjectClientPickerOpen(false);
    setCreateFlowDialog({ kind: 'create-project', returnTo });
  }

  /** Create a Project through the existing Projects API, select it in its originating form, then return. */
  async function handleCreateProject(values: ProjectCreateValues): Promise<void> {
    if (createFlowDialog?.kind !== 'create-project') return;
    const returnTo = createFlowDialog.returnTo;
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
    if (returnTo === 'subcontractor') {
      subcontractorForm.setValue('projectId', project.id, { shouldDirty: true, shouldValidate: true });
      setSubcontractorProjectSearch(label);
      setSubcontractorProjectPickerOpen(false);
      setCreateFlowDialog({ kind: 'create-subcontractor' });
      return;
    }
    form.setValue('projectId', project.id, { shouldDirty: true, shouldValidate: true });
    setProjectSearch(label);
    setCreateFlowDialog(null);
  }

  /** Create one subcontract Project assignment from the selected master records. */
  async function handleCreate(values: ContractFormValues): Promise<void> {
    await createMutation.mutateAsync(values);
    form.reset({ subcontractorId: '', projectId: '', contractAmount: '', contractDate: '' });
    closeContractDialog();
  }

  /** Finish one active subcontract contract after explicit user confirmation. */
  async function handleFinish(contractId: string): Promise<void> {
    if (!window.confirm('Finish this subcontract? This will mark the contract as FINISHED.')) return;
    await finishMutation.mutateAsync(contractId);
  }

  const canEditContracts = props.canManageSubcontractors && props.canReadProjects && props.canReadSubcontractors;

  return (
    <section className="admin-stack" aria-labelledby="subcontract-contracts-title">
      <section className="admin-card">
        <div className="client-page-heading">
          <div>
            <p className="eyebrow">Subcontractor Module</p>
            <h1 id="subcontract-contracts-title">Subcontract Contracts</h1>
            <p className="muted">Assign a Project, agreed contract amount and subcontract date. Finish the contract when the subcontract work is complete.</p>
          </div>
          {canEditContracts && (
            <button type="button" className="client-primary-action" onClick={openCreateDialog}>
              <span aria-hidden="true">+</span> Add contract
            </button>
          )}
        </div>
      </section>

      {props.canManageSubcontractors && !props.canReadProjects && (
        <section className="admin-card"><p className="muted">Project read access is required before a Project can be assigned to a subcontractor.</p></section>
      )}

      {props.canReadSubcontractors && (
        <section className="admin-card">
          <h2>Subcontract register</h2>
          {contracts.isLoading && <p className="muted">Loading subcontract contracts…</p>}
          {contracts.error instanceof Error && <div className="form-error">{contracts.error.message}</div>}
          {finishMutation.error instanceof Error && <div className="form-error">{finishMutation.error.message}</div>}
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Subcontractor</th><th>Project</th><th>Contract amount</th><th>Contract date</th><th>Status</th><th>Finished</th><th>Actions</th></tr></thead>
              <tbody>
                {(contracts.data?.items ?? []).map((contract) => (
                  <tr key={contract.id}>
                    <td>{contract.subcontractor.name} · {contract.subcontractor.specialty}</td>
                    <td>{contract.project.projectCode} · {contract.project.name}</td>
                    <td>{contract.contractAmount} {contract.project.currency}</td>
                    <td>{contract.contractDate.slice(0, 10)}</td>
                    <td>{contract.status === 'FINISHED' ? 'Finished' : 'Active'}</td>
                    <td>{contract.finishedAt ? new Date(contract.finishedAt).toLocaleString() : '—'}</td>
                    <td>
                      {contract.status === 'ACTIVE' && props.canManageSubcontractors
                        ? <div className="client-row-actions">
                            {props.canReadProjects && <button type="button" className="secondary-button client-edit-button" onClick={() => openEditDialog(contract)}>Edit</button>}
                            <button type="button" className="link-button" disabled={finishMutation.isPending} onClick={() => handleFinish(contract.id)}>Finish subcontract</button>
                          </div>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!contracts.isLoading && (contracts.data?.items.length ?? 0) === 0 && <p className="muted">No subcontract contracts yet.</p>}
        </section>
      )}

      {!props.canReadSubcontractors && (
        <section className="admin-card"><p className="muted">Your current role does not include subcontractor read access.</p></section>
      )}

      {contractDialog?.kind === 'create' && canEditContracts && createFlowDialog === null && (
        <ContractModal title="Add contract" eyebrow="Subcontract contract" onClose={() => { createMutation.reset(); form.reset(); closeContractDialog(); }}>
          <form className="admin-form client-modal-form" onSubmit={form.handleSubmit(handleCreate)} noValidate>
            <ContractFields
              form={form}
              subcontractors={subcontractors.data?.items ?? []}
              projects={projects.data?.items ?? []}
              subcontractorSearch={subcontractorSearch}
              projectSearch={projectSearch}
              onSubcontractorSearchChange={setSubcontractorSearch}
              onProjectSearchChange={setProjectSearch}
              subcontractorsLoading={subcontractors.isFetching}
              projectsLoading={projects.isFetching}
              {...(props.canManageSubcontractors ? { onCreateSubcontractor: openSubcontractorCreate } : {})}
              {...(props.canCreateProjects && props.canReadClients ? { onCreateProject: () => openProjectCreate('contract') } : {})}
            />
            {subcontractors.error instanceof Error && <span className="field-error">{subcontractors.error.message}</span>}
            {projects.error instanceof Error && <span className="field-error">{projects.error.message}</span>}
            {Object.values(form.formState.errors).map((error, index) => <span className="field-error" key={index}>{error?.message}</span>)}
            {createMutation.error instanceof Error && <div className="form-error" role="alert">{createMutation.error.message}</div>}
            <div className="client-modal-actions">
              <button type="button" className="secondary-button" onClick={() => { createMutation.reset(); form.reset(); closeContractDialog(); }}>Cancel</button>
              <button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Creating…' : 'Create contract'}</button>
            </div>
          </form>
        </ContractModal>
      )}

      {contractDialog?.kind === 'create' && createFlowDialog?.kind === 'create-subcontractor' && (
        <ContractModal title="Add subcontractor" eyebrow="Subcontractor master" onClose={() => setCreateFlowDialog(null)}>
          <form className="admin-form client-modal-form" onSubmit={subcontractorForm.handleSubmit(handleCreateSubcontractor)} noValidate>
            <div className="client-form-grid">
              <div className="project-client-field">
                <label htmlFor="contract-new-subcontractor-project-search">Project</label>
                <div className="project-client-search-row">
                  <div
                    className="project-client-combobox"
                    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSubcontractorProjectPickerOpen(false); }}
                  >
                    <input
                      id="contract-new-subcontractor-project-search"
                      type="search"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={subcontractorProjectPickerOpen}
                      aria-controls="contract-new-subcontractor-project-options"
                      value={subcontractorProjectSearch}
                      onChange={(event) => handleSubcontractorProjectSearch(event.target.value)}
                      onFocus={() => setSubcontractorProjectPickerOpen(true)}
                      onClick={() => setSubcontractorProjectPickerOpen(true)}
                      onKeyDown={(event) => { if (event.key === 'Escape') setSubcontractorProjectPickerOpen(false); }}
                      placeholder="Search Projects by name or code"
                      autoComplete="off"
                    />
                    {subcontractorProjectPickerOpen && (
                      <div id="contract-new-subcontractor-project-options" className="project-client-options" role="listbox" aria-label="Projects">
                        {subcontractorProjects.isFetching && <div className="project-client-option-state">Searching Projects…</div>}
                        {!subcontractorProjects.isFetching && (subcontractorProjects.data?.items ?? []).map((project) => (
                          <button type="button" className="project-client-option" role="option" aria-selected={subcontractorForm.getValues('projectId') === project.id} key={project.id} onMouseDown={(event) => event.preventDefault()} onClick={() => handleSubcontractorProjectSelect(project)}>
                            <strong>{project.projectCode}</strong><span>{project.name}</span>
                          </button>
                        ))}
                        {!subcontractorProjects.isFetching && (subcontractorProjects.data?.items.length ?? 0) === 0 && <div className="project-client-option-state">No Projects match this search.</div>}
                      </div>
                    )}
                  </div>
                  {props.canCreateProjects && props.canReadClients && <button type="button" className="secondary-button project-client-create-button" onClick={() => openProjectCreate('subcontractor')}>+ Create project</button>}
                </div>
                <input type="hidden" {...subcontractorForm.register('projectId')} />
                {subcontractorProjects.error instanceof Error && <span className="field-error">{subcontractorProjects.error.message}</span>}
              </div>
              <label>Name<input {...subcontractorForm.register('name')} /></label>
              <label>Phone<input type="tel" {...subcontractorForm.register('phone')} /></label>
              <label>Specialty<input {...subcontractorForm.register('specialty')} /></label>
              <label className="client-form-wide">Address<input {...subcontractorForm.register('address')} /></label>
            </div>
            {Object.values(subcontractorForm.formState.errors).map((error, index) => <span className="field-error" key={index}>{error?.message}</span>)}
            {createSubcontractorMutation.error instanceof Error && <div className="form-error" role="alert">{createSubcontractorMutation.error.message}</div>}
            <div className="client-modal-actions">
              <button type="button" className="secondary-button" onClick={() => setCreateFlowDialog(null)}>Back to Contract</button>
              <button type="submit" disabled={createSubcontractorMutation.isPending}>{createSubcontractorMutation.isPending ? 'Creating…' : 'Create subcontractor'}</button>
            </div>
          </form>
        </ContractModal>
      )}

      {contractDialog?.kind === 'create' && createFlowDialog?.kind === 'create-project' && (
        <ContractModal title="Create project" eyebrow="New project" onClose={closeProjectCreate}>
          <form className="admin-form project-modal-form" onSubmit={projectForm.handleSubmit(handleCreateProject)} noValidate>
            <div className="project-form-grid project-modal-grid">
              <label>Project name<input autoFocus {...projectForm.register('name')} /></label>
              <div className="project-client-field">
                <label htmlFor="contract-project-client-search">Client</label>
                <div className="project-client-search-row">
                  <div className="project-client-combobox" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setProjectClientPickerOpen(false); }}>
                    <input
                      id="contract-project-client-search"
                      type="search"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-controls="contract-project-client-options"
                      aria-expanded={projectClientPickerOpen}
                      value={projectClientSearch}
                      onChange={(event) => handleProjectClientSearch(event.target.value)}
                      onFocus={() => setProjectClientPickerOpen(true)}
                      onClick={() => setProjectClientPickerOpen(true)}
                      onKeyDown={(event) => { if (event.key === 'Escape') setProjectClientPickerOpen(false); }}
                      placeholder="Search active clients by name or code"
                      autoComplete="off"
                    />
                    {projectClientPickerOpen && (
                      <div id="contract-project-client-options" className="project-client-options" role="listbox" aria-label="Active clients">
                        {projectClients.isFetching && <div className="project-client-option-state">Searching active clients…</div>}
                        {!projectClients.isFetching && (projectClients.data?.items ?? []).map((client) => (
                          <button type="button" role="option" aria-selected={selectedProjectClientId === client.id} className="project-client-option" key={client.id} onMouseDown={(event) => event.preventDefault()} onClick={() => handleProjectClientSelect(client)}>
                            <strong>{client.code}</strong><span>{client.displayName}</span>
                          </button>
                        ))}
                        {!projectClients.isFetching && (projectClients.data?.items.length ?? 0) === 0 && <div className="project-client-option-state">No active clients match this search.</div>}
                      </div>
                    )}
                  </div>
                  {props.canCreateClients && <button type="button" className="secondary-button project-client-create-button" onClick={openProjectClientCreate}>+ Create client</button>}
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
            <p className="muted project-edit-note">Create the Project here and it will be selected automatically when you return.</p>
            {Object.values(projectForm.formState.errors).map((error, index) => <span className="field-error" key={index}>{error?.message}</span>)}
            {createProjectMutation.error instanceof Error && <div className="form-error" role="alert">{createProjectMutation.error.message}</div>}
            <div className="client-modal-actions">
              <button type="button" className="secondary-button" onClick={closeProjectCreate}>{createFlowDialog.returnTo === 'subcontractor' ? 'Back to subcontractor' : 'Back to Contract'}</button>
              <button type="submit" disabled={createProjectMutation.isPending}>{createProjectMutation.isPending ? 'Creating…' : 'Create Project'}</button>
            </div>
          </form>
        </ContractModal>
      )}

      {contractDialog?.kind === 'create' && createFlowDialog?.kind === 'create-project-client' && (
        <ContractModal title="Create client" eyebrow="New client account" onClose={closeProjectClientCreate}>
          <form className="admin-form client-modal-form" onSubmit={clientForm.handleSubmit(handleCreateProjectClient)} noValidate>
            <div className="client-form-grid">
              <label>Display name<input autoFocus {...clientForm.register('displayName')} /></label>
              <label>Legal name<input {...clientForm.register('legalName')} /></label>
              <label>Tax number<input {...clientForm.register('taxNo')} /></label>
              <label>Credit terms (days)<input type="number" min="0" {...clientForm.register('creditTermsDays', { setValueAs: (value) => value === '' ? null : Number(value) })} /></label>
              <label className="client-form-wide">Billing address<textarea rows={3} {...clientForm.register('billingAddress')} /></label>
              <div className="client-form-wide client-create-contact-heading"><strong>Primary contact (optional)</strong><span className="muted">The client code is generated automatically by the server.</span></div>
              <label>Contact name<input {...clientForm.register('contactName')} /></label>
              <label>Contact title<input {...clientForm.register('contactTitle')} /></label>
              <label>Contact email<input type="email" {...clientForm.register('contactEmail')} /></label>
              <label>Contact phone<input {...clientForm.register('contactPhone')} /></label>
              <label className="checkbox-row client-form-wide"><input type="checkbox" {...clientForm.register('contactIsPrimary')} /><span>Primary contact</span></label>
            </div>
            {Object.values(clientForm.formState.errors).map((error, index) => <span className="field-error" key={index}>{error?.message}</span>)}
            {createClientMutation.error instanceof Error && <div className="form-error" role="alert">{createClientMutation.error.message}</div>}
            <div className="client-modal-actions">
              <button type="button" className="secondary-button" onClick={closeProjectClientCreate}>Back to Project</button>
              <button type="submit" disabled={createClientMutation.isPending}>{createClientMutation.isPending ? 'Creating…' : 'Create client'}</button>
            </div>
          </form>
        </ContractModal>
      )}

      {contractDialog?.kind === 'edit' && canEditContracts && (
        <ContractEditModal
          contract={contractDialog.contract}
          subcontractors={subcontractors.data?.items ?? []}
          projects={projects.data?.items ?? []}
          subcontractorSearch={subcontractorSearch}
          projectSearch={projectSearch}
          onSubcontractorSearchChange={setSubcontractorSearch}
          onProjectSearchChange={setProjectSearch}
          subcontractorsLoading={subcontractors.isFetching}
          projectsLoading={projects.isFetching}
          subcontractorsError={subcontractors.error}
          projectsError={projects.error}
          onClose={closeContractDialog}
        />
      )}
    </section>
  );
}

type ContractFieldsProps = Readonly<{
  form: UseFormReturn<ContractFormValues>;
  subcontractors: ReadonlyArray<{ id: string; name: string; specialty: string }>;
  projects: ReadonlyArray<{ id: string; projectCode: string; name: string }>;
  subcontractorSearch: string;
  projectSearch: string;
  onSubcontractorSearchChange: (value: string) => void;
  onProjectSearchChange: (value: string) => void;
  subcontractorsLoading: boolean;
  projectsLoading: boolean;
  onCreateSubcontractor?: () => void;
  onCreateProject?: () => void;
  currentContract?: SubcontractContract;
}>;

/** Render searchable Subcontractor and Project pickers plus the two contract fields. */
function ContractFields(props: ContractFieldsProps) {
  const [subcontractorPickerOpen, setSubcontractorPickerOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const currentSubcontractorMissing = props.currentContract && !props.subcontractors.some((item) => item.id === props.currentContract?.subcontractorId);
  const currentProjectMissing = props.currentContract && !props.projects.some((item) => item.id === props.currentContract?.projectId);

  /** Clear the selected Subcontractor whenever the user starts a new search. */
  function handleSubcontractorSearch(value: string): void {
    props.form.setValue('subcontractorId', '', { shouldDirty: true });
    props.onSubcontractorSearchChange(value);
    setSubcontractorPickerOpen(true);
  }

  /** Keep the selected Subcontractor id and readable label in sync. */
  function handleSubcontractorSelect(subcontractor: Readonly<{ id: string; name: string; specialty: string }>): void {
    props.form.setValue('subcontractorId', subcontractor.id, { shouldDirty: true, shouldValidate: true });
    props.onSubcontractorSearchChange(subcontractor.name);
    setSubcontractorPickerOpen(false);
  }

  /** Clear the selected Project whenever the user starts a new search. */
  function handleProjectSearch(value: string): void {
    props.form.setValue('projectId', '', { shouldDirty: true });
    props.onProjectSearchChange(value);
    setProjectPickerOpen(true);
  }

  /** Keep the selected Project id and readable label in sync. */
  function handleProjectSelect(project: Readonly<{ id: string; projectCode: string; name: string }>): void {
    props.form.setValue('projectId', project.id, { shouldDirty: true, shouldValidate: true });
    props.onProjectSearchChange(project.name);
    setProjectPickerOpen(false);
  }

  return (
    <div className="client-form-grid">
      <div>
        <label htmlFor="subcontract-contract-subcontractor-search">Subcontractor</label>
        <div className="project-client-search-row">
          <div
            className="project-client-combobox"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSubcontractorPickerOpen(false);
            }}
          >
            <input
            id="subcontract-contract-subcontractor-search"
            type="search"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={subcontractorPickerOpen}
            aria-controls="subcontract-contract-subcontractor-options"
            value={props.subcontractorSearch}
            onChange={(event) => handleSubcontractorSearch(event.target.value)}
            onFocus={() => setSubcontractorPickerOpen(true)}
            onClick={() => setSubcontractorPickerOpen(true)}
            onKeyDown={(event) => { if (event.key === 'Escape') setSubcontractorPickerOpen(false); }}
            placeholder="Search subcontractors by name or specialty"
          />
          {subcontractorPickerOpen && (
            <div id="subcontract-contract-subcontractor-options" className="project-client-options" role="listbox" aria-label="Subcontractors">
              {props.subcontractorsLoading && <div className="project-client-option-state">Searching subcontractors…</div>}
              {!props.subcontractorsLoading && currentSubcontractorMissing && props.currentContract && (
                <button
                  type="button"
                  className="project-client-option"
                  role="option"
                  aria-selected={props.form.getValues('subcontractorId') === props.currentContract.subcontractorId}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSubcontractorSelect({
                    id: props.currentContract!.subcontractorId,
                    name: props.currentContract!.subcontractor.name,
                    specialty: props.currentContract!.subcontractor.specialty
                  })}
                >
                  {props.currentContract.subcontractor.name} · {props.currentContract.subcontractor.specialty}
                </button>
              )}
              {!props.subcontractorsLoading && props.subcontractors.map((subcontractor) => (
                <button
                  type="button"
                  className="project-client-option"
                  role="option"
                  aria-selected={props.form.getValues('subcontractorId') === subcontractor.id}
                  key={subcontractor.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSubcontractorSelect(subcontractor)}
                >
                  {subcontractor.name} · {subcontractor.specialty}
                </button>
              ))}
              {!props.subcontractorsLoading && props.subcontractors.length === 0 && !currentSubcontractorMissing && (
                <div className="project-client-option-state">No active subcontractors match this search.</div>
              )}
              </div>
            )}
          </div>
          {props.onCreateSubcontractor && <button type="button" className="secondary-button project-client-create-button" onClick={props.onCreateSubcontractor}>+ Create subcontractor</button>}
        </div>
        <input type="hidden" {...props.form.register('subcontractorId')} />
      </div>

      <div>
        <label htmlFor="subcontract-contract-project-search">Project</label>
        <div className="project-client-search-row">
          <div
            className="project-client-combobox"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setProjectPickerOpen(false);
            }}
          >
            <input
            id="subcontract-contract-project-search"
            type="search"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={projectPickerOpen}
            aria-controls="subcontract-contract-project-options"
            value={props.projectSearch}
            onChange={(event) => handleProjectSearch(event.target.value)}
            onFocus={() => setProjectPickerOpen(true)}
            onClick={() => setProjectPickerOpen(true)}
            onKeyDown={(event) => { if (event.key === 'Escape') setProjectPickerOpen(false); }}
            placeholder="Search Projects by name or code"
          />
          {projectPickerOpen && (
            <div id="subcontract-contract-project-options" className="project-client-options" role="listbox" aria-label="Projects">
              {props.projectsLoading && <div className="project-client-option-state">Searching Projects…</div>}
              {!props.projectsLoading && currentProjectMissing && props.currentContract && (
                <button
                  type="button"
                  className="project-client-option"
                  role="option"
                  aria-selected={props.form.getValues('projectId') === props.currentContract.projectId}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleProjectSelect({
                    id: props.currentContract!.projectId,
                    projectCode: props.currentContract!.project.projectCode,
                    name: props.currentContract!.project.name
                  })}
                >
                  {props.currentContract.project.projectCode} · {props.currentContract.project.name}
                </button>
              )}
              {!props.projectsLoading && props.projects.map((project) => (
                <button
                  type="button"
                  className="project-client-option"
                  role="option"
                  aria-selected={props.form.getValues('projectId') === project.id}
                  key={project.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleProjectSelect(project)}
                >
                  {project.projectCode} · {project.name}
                </button>
              ))}
              {!props.projectsLoading && props.projects.length === 0 && !currentProjectMissing && (
                <div className="project-client-option-state">No Projects match this search.</div>
              )}
              </div>
            )}
          </div>
          {props.onCreateProject && <button type="button" className="secondary-button project-client-create-button" onClick={props.onCreateProject}>+ Create project</button>}
        </div>
        <input type="hidden" {...props.form.register('projectId')} />
      </div>

      <label>
        Contract amount
        <input type="number" min="0.01" step="0.01" inputMode="decimal" {...props.form.register('contractAmount')} />
      </label>
      <label>
        Subcontract date
        <input type="date" {...props.form.register('contractDate')} />
      </label>
    </div>
  );
}

/** Render one accessible contract modal using the existing Supplier/Subcontractor modal styling. */
function ContractModal(props: Readonly<{ title: string; eyebrow: string; onClose: () => void; children: ReactNode }>) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') props.onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [props.onClose]);

  return (
    <div className="client-modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section className="client-modal client-modal-wide" role="dialog" aria-modal="true" aria-labelledby="subcontract-contract-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="client-modal-header">
          <div><p className="eyebrow">{props.eyebrow}</p><h2 id="subcontract-contract-modal-title">{props.title}</h2></div>
          <button type="button" className="client-modal-close" onClick={props.onClose} aria-label={`Close ${props.title}`}><span aria-hidden="true">×</span></button>
        </header>
        <div className="client-modal-body">{props.children}</div>
      </section>
    </div>
  );
}

/** Edit one selected active subcontract contract through the dedicated PATCH endpoint. */
function ContractEditModal(props: Readonly<{
  contract: SubcontractContract;
  subcontractors: ReadonlyArray<{ id: string; name: string; specialty: string }>;
  projects: ReadonlyArray<{ id: string; projectCode: string; name: string }>;
  subcontractorSearch: string;
  projectSearch: string;
  onSubcontractorSearchChange: (value: string) => void;
  onProjectSearchChange: (value: string) => void;
  subcontractorsLoading: boolean;
  projectsLoading: boolean;
  subcontractorsError: unknown;
  projectsError: unknown;
  onClose: () => void;
}>) {
  const mutation = useUpdateSubcontractContract(props.contract.id);
  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: {
      subcontractorId: props.contract.subcontractorId,
      projectId: props.contract.projectId,
      contractAmount: props.contract.contractAmount,
      contractDate: props.contract.contractDate.slice(0, 10)
    }
  });

  async function handleUpdate(values: ContractFormValues): Promise<void> {
    await mutation.mutateAsync(values);
    props.onClose();
  }

  return (
    <ContractModal title={`Edit ${props.contract.subcontractor.name} contract`} eyebrow="Subcontract contract" onClose={props.onClose}>
      <form className="admin-form client-modal-form" onSubmit={form.handleSubmit(handleUpdate)} noValidate>
        <ContractFields
          form={form}
          subcontractors={props.subcontractors}
          projects={props.projects}
          subcontractorSearch={props.subcontractorSearch}
          projectSearch={props.projectSearch}
          onSubcontractorSearchChange={props.onSubcontractorSearchChange}
          onProjectSearchChange={props.onProjectSearchChange}
          subcontractorsLoading={props.subcontractorsLoading}
          projectsLoading={props.projectsLoading}
          currentContract={props.contract}
        />
        {props.subcontractorsError instanceof Error && <span className="field-error">{props.subcontractorsError.message}</span>}
        {props.projectsError instanceof Error && <span className="field-error">{props.projectsError.message}</span>}
        {Object.values(form.formState.errors).map((error, index) => <span className="field-error" key={index}>{error?.message}</span>)}
        {mutation.error instanceof Error && <div className="form-error" role="alert">{mutation.error.message}</div>}
        <div className="client-modal-actions">
          <button type="button" className="secondary-button" onClick={props.onClose}>Cancel</button>
          <button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save contract'}</button>
        </div>
      </form>
    </ContractModal>
  );
}
