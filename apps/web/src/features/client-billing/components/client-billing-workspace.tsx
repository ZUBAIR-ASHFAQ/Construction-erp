import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useClients, useCreateClient } from '../../clients/hooks/clients.js';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useCreateProject, useProjects } from '../../projects/hooks/projects.js';
import type { Project } from '../../projects/api/projects-api.js';
import {
  useClientInvoice,
  useClientInvoices,
  useCreateDirectClientInvoice
} from '../hooks/client-billing.js';

const positiveMoneySchema = z.string().trim().regex(/^(?:[1-9]\d{0,15})(?:\.\d{1,2})?$|^0\.(?:0[1-9]|[1-9]\d?)$/, 'Enter a positive amount with up to 2 decimals.');
const optionalUuidSchema = z.string().trim().refine((value) => value === '' || z.string().uuid().safeParse(value).success, 'Select a valid Stage or leave it at Project level.');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select a valid date.');

const directInvoiceFormSchema = z.object({
  invoiceDate: dateSchema,
  dueDate: z.string().refine((value) => value === '' || dateSchema.safeParse(value).success, 'Select a valid date or leave it blank.'),
  lines: z.array(z.object({
    stageId: optionalUuidSchema,
    description: z.string().trim().min(1, 'Description is required.').max(1000),
    amount: positiveMoneySchema
  })).min(1, 'Add at least one invoice line.').max(500)
}).superRefine((value, context) => {
  if (value.dueDate && value.dueDate < value.invoiceDate) context.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDate'], message: 'Due date cannot be earlier than invoice date.' });
});

type DirectInvoiceForm = z.infer<typeof directInvoiceFormSchema>;

const quickClientSchema = z.object({
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

const quickProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required.').max(300),
  clientId: z.string().uuid('Select or enter a valid Client ID.'),
  projectModel: z.enum(['FIXED_PRICE', 'COST_PLUS_PERCENTAGE']),
  projectValue: z.string().trim().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/, 'Enter a valid non-negative Project value with at most 2 decimals.'),
  costPlusPercent: z.string().trim(),
  currency: z.string().trim().length(3, 'Currency must use three letters.').regex(/^[A-Za-z]{3}$/, 'Currency must use letters only.'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date is required.'),
  plannedEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Planned end date is required.'),
  location: z.string().trim().max(1000, 'Location is too long.')
}).superRefine((value, context) => {
  if (value.plannedEndDate < value.startDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['plannedEndDate'],
      message: 'Planned end date cannot be before the start date.'
    });
  }

  if (value.projectModel === 'COST_PLUS_PERCENTAGE') {
    const validPercent = /^(?:0|[1-9]\d{0,2}|100)(?:\.\d{1,4})?$/.test(value.costPlusPercent);
    const percent = Number(value.costPlusPercent);
    if (!validPercent || percent <= 0 || percent > 100) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['costPlusPercent'],
        message: 'Cost + Percentage requires a percent greater than 0 and at most 100.'
      });
    }
  } else if (value.costPlusPercent) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['costPlusPercent'],
      message: 'Leave Cost + Percentage empty for a Fixed Price Project.'
    });
  }
});

type QuickClientForm = z.infer<typeof quickClientSchema>;
type QuickProjectForm = z.infer<typeof quickProjectSchema>;
type QuickCreateDialog = 'client' | 'project' | null;

type ClientBillingWorkspaceProps = Readonly<{
  canRead: boolean;
  canReadClients: boolean;
  canCreateClients: boolean;
  canCreateProjects: boolean;
  canCreateInvoices: boolean;
  canReadInvoices: boolean;
  canReadStages: boolean;
  createModalOpen: boolean;
  onCloseCreateModal: () => void;
}>;

/** Return today's local browser date for a date input without UTC rollover. */
function todayDateInputValue(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Build a fresh direct-invoice form with today's invoice date preselected. */
function emptyDirectInvoiceForm(): DirectInvoiceForm {
  return { invoiceDate: todayDateInputValue(), dueDate: '', lines: [{ stageId: '', description: '', amount: '' }] };
}

/** Return a safe message for one failed browser mutation. */
function mutationMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

/** Convert one money value to a readable two-decimal display without browser-owned totals. */
function displayMoney(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value;
}

/** Render direct Client Invoice entry, register and immutable invoice detail only. */
export function ClientBillingWorkspace(props: ClientBillingWorkspaceProps) {
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [clientSearchText, setClientSearchText] = useState('');
  const [projectSearchText, setProjectSearchText] = useState('');
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [quickDialog, setQuickDialog] = useState<QuickCreateDialog>(null);
  const [quickCreatedClient, setQuickCreatedClient] = useState<Readonly<{ id: string; code: string; displayName: string }> | null>(null);
  const [quickCreatedProject, setQuickCreatedProject] = useState<Project | null>(null);
  const [quickProjectClientSearchText, setQuickProjectClientSearchText] = useState('');
  const [quickProjectClientPickerOpen, setQuickProjectClientPickerOpen] = useState(false);
  const preserveInvoiceFormOnNextProjectChange = useRef(false);

  const clientsQuery = useClients({ page: 1, pageSize: 100 }, props.canReadClients);
  const projectsQuery = useProjects({ ...(props.canReadClients && clientId ? { clientId } : {}), page: 1, pageSize: 100 }, props.canRead);
  const clientOptionsQuery = useClients({
    status: 'ACTIVE',
    ...(clientSearchText.trim() ? { search: clientSearchText.trim() } : {}),
    page: 1,
    pageSize: 100
  }, props.canReadClients && props.createModalOpen && quickDialog === null);
  const projectOptionsQuery = useProjects({
    ...(props.canReadClients && clientId ? { clientId } : {}),
    ...(projectSearchText.trim() ? { search: projectSearchText.trim() } : {}),
    page: 1,
    pageSize: 100
  }, props.canRead && props.createModalOpen && quickDialog === null && (!props.canReadClients || clientId !== ''));
  const quickProjectClientOptionsQuery = useClients({
    status: 'ACTIVE',
    ...(quickProjectClientSearchText.trim() ? { search: quickProjectClientSearchText.trim() } : {}),
    page: 1,
    pageSize: 100
  }, props.canReadClients && props.createModalOpen && quickDialog === 'project');

  const clients = clientsQuery.data?.items ?? [];
  const projects = projectsQuery.data?.items ?? [];
  const clientNames = useMemo(() => {
    const names = new Map(clients.map((client) => [client.id, client.displayName]));
    if (quickCreatedClient) names.set(quickCreatedClient.id, quickCreatedClient.displayName);
    return names;
  }, [clients, quickCreatedClient]);
  const clientProjects = useMemo(() => props.canReadClients ? projects.filter((project) => project.clientId === clientId) : projects, [clientId, projects, props.canReadClients]);
  const selectedProject = useMemo(() => projects.find((project) => project.id === projectId) ?? (quickCreatedProject?.id === projectId ? quickCreatedProject : null), [projectId, projects, quickCreatedProject]);
  const clientOptions = clientOptionsQuery.data?.items ?? [];
  const projectOptions = projectOptionsQuery.data?.items ?? [];
  const quickClientMissing = quickCreatedClient !== null
    && !clientOptions.some((client) => client.id === quickCreatedClient.id)
    && (!clientSearchText.trim() || `${quickCreatedClient.code} ${quickCreatedClient.displayName}`.toLowerCase().includes(clientSearchText.trim().toLowerCase()));
  const quickProjectMissing = quickCreatedProject !== null
    && quickCreatedProject.clientId === clientId
    && !projectOptions.some((project) => project.id === quickCreatedProject.id)
    && (!projectSearchText.trim() || `${quickCreatedProject.projectCode} ${quickCreatedProject.name}`.toLowerCase().includes(projectSearchText.trim().toLowerCase()));
  const quickProjectClientOptions = quickProjectClientOptionsQuery.data?.items ?? [];
  const quickProjectCreatedClientMissing = quickCreatedClient !== null
    && !quickProjectClientOptions.some((client) => client.id === quickCreatedClient.id)
    && (!quickProjectClientSearchText.trim() || `${quickCreatedClient.code} ${quickCreatedClient.displayName}`.toLowerCase().includes(quickProjectClientSearchText.trim().toLowerCase()));

  const stagesQuery = useProjectStages(projectId || null, props.canReadStages && projectId !== '');
  const stages = stagesQuery.data?.items ?? [];
  const stageNames = useMemo(() => new Map(stages.map((stage) => [stage.id, `${stage.code} · ${stage.name}`])), [stages]);
  const invoicesQuery = useClientInvoices({ ...(projectId ? { projectId } : {}), page: 1, pageSize: 100 }, props.canReadInvoices && projectId !== '');
  const selectedInvoiceQuery = useClientInvoice(selectedInvoiceId, props.canReadInvoices && selectedInvoiceId !== null);
  const createDirectInvoice = useCreateDirectClientInvoice();
  const quickClientMutation = useCreateClient();
  const quickProjectMutation = useCreateProject();

  const invoiceForm = useForm<DirectInvoiceForm>({ resolver: zodResolver(directInvoiceFormSchema), defaultValues: emptyDirectInvoiceForm() });
  const quickClientForm = useForm<QuickClientForm>({
    resolver: zodResolver(quickClientSchema),
    defaultValues: {
      legalName: '',
      displayName: '',
      taxNo: '',
      billingAddress: '',
      creditTermsDays: null,
      contactName: '',
      contactTitle: '',
      contactEmail: '',
      contactPhone: '',
      contactIsPrimary: false
    }
  });
  const quickProjectForm = useForm<QuickProjectForm>({
    resolver: zodResolver(quickProjectSchema),
    defaultValues: {
      name: '',
      clientId: '',
      projectModel: 'FIXED_PRICE',
      projectValue: '0.00',
      costPlusPercent: '',
      currency: 'PKR',
      startDate: '',
      plannedEndDate: '',
      location: ''
    }
  });
  const quickProjectModel = quickProjectForm.watch('projectModel');
  const quickProjectClientId = quickProjectForm.watch('clientId');
  const invoiceLines = useFieldArray({ control: invoiceForm.control, name: 'lines' });

  useEffect(() => {
    setSelectedInvoiceId(null);
    if (preserveInvoiceFormOnNextProjectChange.current) {
      preserveInvoiceFormOnNextProjectChange.current = false;
      return;
    }
    invoiceForm.reset(emptyDirectInvoiceForm());
  }, [projectId, invoiceForm]);

  useEffect(() => {
    if (!selectedInvoiceId) return undefined;
    /** Close the active invoice dialog while preserving register filters. */
    function closeInvoiceOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') setSelectedInvoiceId(null);
    }
    window.addEventListener('keydown', closeInvoiceOnEscape);
    return () => window.removeEventListener('keydown', closeInvoiceOnEscape);
  }, [selectedInvoiceId]);

  /** Search active Clients in the single invoice Client picker and clear a stale selection while typing. */
  function handleClientSearch(value: string): void {
    setClientSearchText(value);
    setClientPickerOpen(true);
    if (clientId) {
      setClientId('');
      setProjectId('');
      setProjectSearchText('');
    }
  }

  /** Select one Client from the searchable picker and reset any Project that belongs to the prior Client. */
  function handleClientSelect(client: Readonly<{ id: string; code: string; displayName: string }>): void {
    setClientId(client.id);
    setClientSearchText(client.displayName);
    setProjectId('');
    setProjectSearchText('');
    setClientPickerOpen(false);
  }

  /** Search Projects in the single invoice Project picker and clear a stale Project selection while typing. */
  function handleProjectSearch(value: string): void {
    setProjectSearchText(value);
    setProjectPickerOpen(true);
    if (projectId) setProjectId('');
  }

  /** Select one Project from the searchable picker while preserving the server-owned Client relationship. */
  function handleProjectSelect(project: Project): void {
    setProjectId(project.id);
    setProjectSearchText(project.name);
    if (!props.canReadClients) setClientId(project.clientId);
    setProjectPickerOpen(false);
  }

  /** Open the full Client Management create form from the Client Invoice selector. */
  function openQuickClientDialog(): void {
    quickClientForm.reset({
      legalName: '',
      displayName: '',
      taxNo: '',
      billingAddress: '',
      creditTermsDays: null,
      contactName: '',
      contactTitle: '',
      contactEmail: '',
      contactPhone: '',
      contactIsPrimary: false
    });
    quickClientMutation.reset();
    setClientPickerOpen(false);
    setQuickDialog('client');
  }

  /** Open the full Project Management create form with the invoice Client preselected. */
  function openQuickProjectDialog(): void {
    if (!clientId) return;
    const selectedClient = clients.find((client) => client.id === clientId)
      ?? (quickCreatedClient?.id === clientId ? quickCreatedClient : null);
    quickProjectForm.reset({
      name: '',
      clientId,
      projectModel: 'FIXED_PRICE',
      projectValue: '0.00',
      costPlusPercent: '',
      currency: 'PKR',
      startDate: '',
      plannedEndDate: '',
      location: ''
    });
    setQuickProjectClientSearchText(selectedClient?.displayName ?? clientSearchText);
    setQuickProjectClientPickerOpen(false);
    quickProjectMutation.reset();
    setProjectPickerOpen(false);
    setQuickDialog('project');
  }

  /** Search active Clients inside the full inline Project form without changing the invoice until Project creation succeeds. */
  function handleQuickProjectClientSearch(value: string): void {
    setQuickProjectClientSearchText(value);
    setQuickProjectClientPickerOpen(true);
    if (quickProjectForm.getValues('clientId')) {
      quickProjectForm.setValue('clientId', '', { shouldDirty: true, shouldValidate: true });
    }
  }

  /** Select one Client for the full inline Project form. */
  function handleQuickProjectClientSelect(client: Readonly<{ id: string; code: string; displayName: string }>): void {
    quickProjectForm.setValue('clientId', client.id, { shouldDirty: true, shouldValidate: true });
    setQuickProjectClientSearchText(client.displayName);
    setQuickProjectClientPickerOpen(false);
  }

  /** Create the same complete Client record used by Client Management and select it on the unfinished invoice. */
  async function submitQuickClient(values: QuickClientForm): Promise<void> {
    const client = await quickClientMutation.mutateAsync({
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
    setQuickCreatedClient({ id: client.id, code: client.code, displayName: client.displayName });
    setClientId(client.id);
    setClientSearchText(client.displayName);
    setProjectId('');
    setProjectSearchText('');
    quickClientForm.reset({
      legalName: '',
      displayName: '',
      taxNo: '',
      billingAddress: '',
      creditTermsDays: null,
      contactName: '',
      contactTitle: '',
      contactEmail: '',
      contactPhone: '',
      contactIsPrimary: false
    });
    setQuickDialog(null);
  }

  /** Create one complete DRAFT Project using the same editable master fields as Project Management. */
  async function submitQuickProject(values: QuickProjectForm): Promise<void> {
    const project = await quickProjectMutation.mutateAsync({
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
    setQuickCreatedProject(project);
    preserveInvoiceFormOnNextProjectChange.current = true;
    setClientId(project.clientId);
    setClientSearchText(quickProjectClientSearchText);
    setProjectId(project.id);
    setProjectSearchText(project.name);
    quickProjectForm.reset({
      name: '',
      clientId: '',
      projectModel: 'FIXED_PRICE',
      projectValue: '0.00',
      costPlusPercent: '',
      currency: 'PKR',
      startDate: '',
      plannedEndDate: '',
      location: ''
    });
    setQuickProjectClientSearchText('');
    setQuickProjectClientPickerOpen(false);
    setQuickDialog(null);
  }

  /** Return from the full Client create form to the unfinished Client Invoice. */
  function closeQuickClientDialog(): void {
    quickClientMutation.reset();
    quickClientForm.reset({
      legalName: '',
      displayName: '',
      taxNo: '',
      billingAddress: '',
      creditTermsDays: null,
      contactName: '',
      contactTitle: '',
      contactEmail: '',
      contactPhone: '',
      contactIsPrimary: false
    });
    setQuickDialog(null);
  }

  /** Return from the full Project create form to the unfinished Client Invoice. */
  function closeQuickProjectDialog(): void {
    quickProjectMutation.reset();
    quickProjectForm.reset({
      name: '',
      clientId: '',
      projectModel: 'FIXED_PRICE',
      projectValue: '0.00',
      costPlusPercent: '',
      currency: 'PKR',
      startDate: '',
      plannedEndDate: '',
      location: ''
    });
    setQuickProjectClientSearchText('');
    setQuickProjectClientPickerOpen(false);
    setQuickDialog(null);
  }

  /** Close direct Client Invoice entry and discard only the unsaved modal state. */
  function closeCreateInvoiceModal(): void {
    invoiceForm.reset(emptyDirectInvoiceForm());
    quickClientForm.reset({
      legalName: '',
      displayName: '',
      taxNo: '',
      billingAddress: '',
      creditTermsDays: null,
      contactName: '',
      contactTitle: '',
      contactEmail: '',
      contactPhone: '',
      contactIsPrimary: false
    });
    quickProjectForm.reset({
      name: '',
      clientId: '',
      projectModel: 'FIXED_PRICE',
      projectValue: '0.00',
      costPlusPercent: '',
      currency: 'PKR',
      startDate: '',
      plannedEndDate: '',
      location: ''
    });
    createDirectInvoice.reset();
    quickClientMutation.reset();
    quickProjectMutation.reset();
    setClientPickerOpen(false);
    setProjectPickerOpen(false);
    setQuickProjectClientSearchText('');
    setQuickProjectClientPickerOpen(false);
    setQuickDialog(null);
    props.onCloseCreateModal();
  }

  /** Return a Stage label while avoiding raw identifiers. */
  function stageLabel(stageId: string | null): string {
    if (!stageId) return 'Project level';
    return stageNames.get(stageId) ?? 'Linked Stage';
  }

  /** Create one direct Client Invoice with server-owned numbering and totals. */
  async function submitInvoice(values: DirectInvoiceForm): Promise<void> {
    if (!projectId) return;
    const invoice = await createDirectInvoice.mutateAsync({
      projectId,
      invoiceDate: values.invoiceDate,
      dueDate: values.dueDate || null,
      lines: values.lines.map((line) => ({ stageId: line.stageId || null, description: line.description.trim(), amount: line.amount }))
    });
    invoiceForm.reset(emptyDirectInvoiceForm());
    props.onCloseCreateModal();
    setSelectedInvoiceId(invoice.id);
  }

  if (!props.canRead) return <section className="admin-card"><p>You do not have Client Invoice read access.</p></section>;

  return (
    <div className="admin-stack">
      <section className="admin-card">
        <div className="section-heading compact-heading"><h2>Invoice register filters</h2><span className="muted">Choose a Client and Project to review invoices</span></div>
        <div className="two-column-form">
          <label>Client
            {props.canReadClients ? (
              <select value={clientId} onChange={(event) => {
                const nextClientId = event.target.value;
                const nextClient = clients.find((client) => client.id === nextClientId);
                setClientId(nextClientId);
                setClientSearchText(nextClient?.displayName ?? '');
                setProjectId('');
                setProjectSearchText('');
              }}>
                <option value="">Select client</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.code} · {client.displayName}</option>)}
              </select>
            ) : <span className="muted">Derived from selected Project</span>}
          </label>
          <label>Project
            <select value={projectId} disabled={props.canReadClients && !clientId} onChange={(event) => {
              const nextProjectId = event.target.value;
              const nextProject = projects.find((project) => project.id === nextProjectId);
              setProjectId(nextProjectId);
              setProjectSearchText(nextProject?.name ?? '');
              if (!props.canReadClients) {
                const nextClientId = nextProject?.clientId ?? '';
                setClientId(nextClientId);
                const nextClient = clients.find((client) => client.id === nextClientId);
                setClientSearchText(nextClient?.displayName ?? '');
              }
            }}>
              <option value="">Select project</option>
              {clientProjects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}
            </select>
          </label>
        </div>
      </section>

      {props.canCreateInvoices && props.createModalOpen && quickDialog === null ? (
        <div className="finance-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreateInvoiceModal(); }}>
          <section className="finance-modal finance-modal-wide client-payment-create-modal" role="dialog" aria-modal="true" aria-labelledby="client-invoice-create-title" onKeyDown={(event) => { if (event.key === 'Escape') closeCreateInvoiceModal(); }}>
            <header className="finance-modal-header">
              <div>
                <p className="eyebrow">Client invoice</p>
                <h2 id="client-invoice-create-title">New Client Invoice</h2>
                <p>Create an issued invoice for the selected Client and Project. Invoice number and totals remain server controlled.</p>
              </div>
              <button type="button" className="finance-modal-close" autoFocus aria-label="Close new invoice" onClick={closeCreateInvoiceModal}>×</button>
            </header>
            <div className="finance-modal-body">
              <form className="admin-form client-payment-create-form" aria-label="Create client invoice" onSubmit={invoiceForm.handleSubmit(submitInvoice)}>
                <div className="client-payment-create-grid">
                  <div className="project-client-field">
                    <label htmlFor="client-invoice-client-search">Client</label>
                    {props.canReadClients ? (
                      <div className="project-client-search-row">
                        <div
                          className="project-client-combobox"
                          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setClientPickerOpen(false); }}
                        >
                          <input
                            id="client-invoice-client-search"
                            type="search"
                            role="combobox"
                            aria-autocomplete="list"
                            aria-controls="client-invoice-client-options"
                            aria-expanded={clientPickerOpen}
                            value={clientSearchText}
                            onChange={(event) => handleClientSearch(event.target.value)}
                            onFocus={() => setClientPickerOpen(true)}
                            onClick={() => setClientPickerOpen(true)}
                            onKeyDown={(event) => { if (event.key === 'Escape') setClientPickerOpen(false); }}
                            placeholder="Search active clients by name or code"
                            autoComplete="off"
                          />
                          {clientPickerOpen ? (
                            <div id="client-invoice-client-options" className="project-client-options" role="listbox" aria-label="Active clients">
                              {clientOptionsQuery.isFetching ? <div className="project-client-option-state">Searching active clients…</div> : null}
                              {!clientOptionsQuery.isFetching && quickClientMissing && quickCreatedClient ? (
                                <button type="button" role="option" aria-selected={clientId === quickCreatedClient.id} className="project-client-option" onClick={() => handleClientSelect(quickCreatedClient)}>
                                  <strong>{quickCreatedClient.code}</strong><span>{quickCreatedClient.displayName}</span>
                                </button>
                              ) : null}
                              {!clientOptionsQuery.isFetching ? clientOptions.map((client) => (
                                <button type="button" role="option" aria-selected={clientId === client.id} className="project-client-option" key={client.id} onClick={() => handleClientSelect(client)}>
                                  <strong>{client.code}</strong><span>{client.displayName}</span>
                                </button>
                              )) : null}
                              {!clientOptionsQuery.isFetching && clientOptions.length === 0 && !quickClientMissing ? <div className="project-client-option-state">No active clients match this search.</div> : null}
                            </div>
                          ) : null}
                        </div>
                        {props.canCreateClients ? <button type="button" className="secondary-button project-client-create-button" onClick={openQuickClientDialog}>+ Create client</button> : null}
                      </div>
                    ) : <span className="muted">Derived from selected Project</span>}
                  </div>
                  <div className="project-client-field">
                    <label htmlFor="client-invoice-project-search">Project</label>
                    <div className="project-client-search-row">
                      <div
                        className="project-client-combobox"
                        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setProjectPickerOpen(false); }}
                      >
                        <input
                          id="client-invoice-project-search"
                          type="search"
                          role="combobox"
                          aria-autocomplete="list"
                          aria-controls="client-invoice-project-options"
                          aria-expanded={projectPickerOpen}
                          value={projectSearchText}
                          onChange={(event) => handleProjectSearch(event.target.value)}
                          onFocus={() => setProjectPickerOpen(true)}
                          onClick={() => setProjectPickerOpen(true)}
                          onKeyDown={(event) => { if (event.key === 'Escape') setProjectPickerOpen(false); }}
                          placeholder={props.canReadClients && !clientId ? 'Select a Client first' : 'Search projects by code or name'}
                          autoComplete="off"
                          disabled={props.canReadClients && !clientId}
                        />
                        {projectPickerOpen && (!props.canReadClients || clientId) ? (
                          <div id="client-invoice-project-options" className="project-client-options" role="listbox" aria-label="Projects">
                            {projectOptionsQuery.isFetching ? <div className="project-client-option-state">Searching projects…</div> : null}
                            {!projectOptionsQuery.isFetching && quickProjectMissing && quickCreatedProject ? (
                              <button type="button" role="option" aria-selected={projectId === quickCreatedProject.id} className="project-client-option" onClick={() => handleProjectSelect(quickCreatedProject)}>
                                <strong>{quickCreatedProject.projectCode}</strong><span>{quickCreatedProject.name}</span>
                              </button>
                            ) : null}
                            {!projectOptionsQuery.isFetching ? projectOptions.map((project) => (
                              <button type="button" role="option" aria-selected={projectId === project.id} className="project-client-option" key={project.id} onClick={() => handleProjectSelect(project)}>
                                <strong>{project.projectCode}</strong><span>{project.name}</span>
                              </button>
                            )) : null}
                            {!projectOptionsQuery.isFetching && projectOptions.length === 0 && !quickProjectMissing ? <div className="project-client-option-state">No Projects match this search.</div> : null}
                          </div>
                        ) : null}
                      </div>
                      {props.canCreateProjects && props.canReadClients ? <button type="button" className="secondary-button project-client-create-button" disabled={!clientId} title={!clientId ? 'Select a Client first.' : 'Create a Project for this Client'} onClick={openQuickProjectDialog}>+ Create project</button> : null}
                    </div>
                  </div>
                  <label>Invoice date<input type="date" {...invoiceForm.register('invoiceDate')} /><span className="field-error">{invoiceForm.formState.errors.invoiceDate?.message}</span></label>
                  <label>Due date (optional)<input type="date" {...invoiceForm.register('dueDate')} /><span className="field-error">{invoiceForm.formState.errors.dueDate?.message}</span></label>
                </div>

                {projectId ? <p className="muted">Client {selectedProject ? clientNames.get(selectedProject.clientId) ?? 'Selected client' : 'Selected client'} · Project {selectedProject?.name ?? 'Selected project'} · {selectedProject?.currency ?? 'Project currency'}</p> : null}

                {invoiceLines.fields.map((field, index) => (
                  <div className="admin-card" key={field.id}>
                    <div className="section-heading compact-heading"><h3>Invoice line {index + 1}</h3>{invoiceLines.fields.length > 1 ? <button type="button" className="secondary-button" onClick={() => invoiceLines.remove(index)}>Remove line</button> : null}</div>
                    <div className="client-payment-create-grid">
                      <label>Description<input {...invoiceForm.register(`lines.${index}.description`)} /><span className="field-error">{invoiceForm.formState.errors.lines?.[index]?.description?.message}</span></label>
                      <label>Amount<input inputMode="decimal" {...invoiceForm.register(`lines.${index}.amount`)} /><span className="field-error">{invoiceForm.formState.errors.lines?.[index]?.amount?.message}</span></label>
                      <label>Stage (optional)
                        <select {...invoiceForm.register(`lines.${index}.stageId`)} disabled={!projectId || !props.canReadStages}>
                          <option value="">Project level</option>
                          {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.code} · {stage.name}</option>)}
                        </select>
                      </label>
                    </div>
                  </div>
                ))}
                <div className="admin-actions">
                  <button type="button" className="secondary-button" onClick={() => invoiceLines.append({ stageId: '', description: '', amount: '' })}>Add invoice line</button>
                  <div className="admin-actions client-payment-create-actions">
                    <button type="button" className="secondary-button" disabled={createDirectInvoice.isPending} onClick={closeCreateInvoiceModal}>Cancel</button>
                    <button type="submit" disabled={createDirectInvoice.isPending || !projectId}>{createDirectInvoice.isPending ? 'Creating…' : 'Create invoice'}</button>
                  </div>
                </div>
                {mutationMessage(createDirectInvoice.error) ? <div className="form-error" role="alert">{mutationMessage(createDirectInvoice.error)}</div> : null}
              </form>
            </div>
          </section>
        </div>
      ) : null}

      {props.canCreateInvoices && props.createModalOpen && quickDialog === 'client' ? (
        <div className="client-modal-backdrop" role="presentation" onMouseDown={closeQuickClientDialog}>
          <section
            className="client-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-invoice-quick-client-title"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => { if (event.key === 'Escape') closeQuickClientDialog(); }}
          >
            <header className="client-modal-header">
              <div><p className="eyebrow">New client account</p><h2 id="client-invoice-quick-client-title">Create client</h2></div>
              <button type="button" className="client-modal-close" aria-label="Close Create client" onClick={closeQuickClientDialog}><span aria-hidden="true">×</span></button>
            </header>
            <div className="client-modal-body">
              <form className="admin-form client-modal-form" onSubmit={quickClientForm.handleSubmit(submitQuickClient)} noValidate>
                <div className="client-form-grid">
                  <label>Display name<input autoFocus {...quickClientForm.register('displayName')} /></label>
                  <label>Legal name<input {...quickClientForm.register('legalName')} /></label>
                  <label>Tax number<input {...quickClientForm.register('taxNo')} /></label>
                  <label>
                    Credit terms (days)
                    <input
                      type="number"
                      min="0"
                      {...quickClientForm.register('creditTermsDays', {
                        setValueAs: (value) => value === '' ? null : Number(value)
                      })}
                    />
                  </label>
                  <label className="client-form-wide">Billing address<textarea rows={3} {...quickClientForm.register('billingAddress')} /></label>
                  <div className="client-form-wide client-create-contact-heading">
                    <strong>Primary contact (optional)</strong>
                    <span className="muted">The client code is generated automatically by the server.</span>
                  </div>
                  <label>Contact name<input {...quickClientForm.register('contactName')} /></label>
                  <label>Contact title<input {...quickClientForm.register('contactTitle')} /></label>
                  <label>Contact email<input type="email" {...quickClientForm.register('contactEmail')} /></label>
                  <label>Contact phone<input {...quickClientForm.register('contactPhone')} /></label>
                  <label className="checkbox-row client-form-wide"><input type="checkbox" {...quickClientForm.register('contactIsPrimary')} /><span>Primary contact</span></label>
                </div>
                {Object.values(quickClientForm.formState.errors).map((error, index) => (
                  <span className="field-error" key={index}>{error?.message}</span>
                ))}
                {mutationMessage(quickClientMutation.error) ? <div className="form-error" role="alert">{mutationMessage(quickClientMutation.error)}</div> : null}
                <div className="client-modal-actions">
                  <button type="button" className="secondary-button" disabled={quickClientMutation.isPending} onClick={closeQuickClientDialog}>Cancel</button>
                  <button type="submit" disabled={quickClientMutation.isPending}>{quickClientMutation.isPending ? 'Creating…' : 'Create client'}</button>
                </div>
              </form>
            </div>
          </section>
        </div>
      ) : null}

      {props.canCreateInvoices && props.createModalOpen && quickDialog === 'project' ? (
        <div className="project-modal-backdrop" role="presentation" onMouseDown={closeQuickProjectDialog}>
          <section
            className="project-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-invoice-quick-project-title"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => { if (event.key === 'Escape') closeQuickProjectDialog(); }}
          >
            <header className="project-modal-header">
              <div><p className="eyebrow">New project</p><h2 id="client-invoice-quick-project-title">Create project</h2></div>
              <button type="button" className="project-modal-close" aria-label="Close Create project" onClick={closeQuickProjectDialog}><span aria-hidden="true">×</span></button>
            </header>
            <div className="project-modal-body">
              <form className="admin-form project-modal-form" onSubmit={quickProjectForm.handleSubmit(submitQuickProject)} noValidate>
                <div className="project-form-grid project-modal-grid">
                  <label>Project name<input autoFocus {...quickProjectForm.register('name')} /></label>
                  <div className="project-client-field">
                    <label htmlFor="client-invoice-quick-project-client-search">Client</label>
                    <div className="project-client-search-row">
                      <div
                        className="project-client-combobox"
                        onBlur={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setQuickProjectClientPickerOpen(false);
                        }}
                      >
                        <input
                          id="client-invoice-quick-project-client-search"
                          type="search"
                          role="combobox"
                          aria-autocomplete="list"
                          aria-controls="client-invoice-quick-project-client-options"
                          aria-expanded={quickProjectClientPickerOpen}
                          value={quickProjectClientSearchText}
                          onChange={(event) => handleQuickProjectClientSearch(event.target.value)}
                          onFocus={() => setQuickProjectClientPickerOpen(true)}
                          onClick={() => setQuickProjectClientPickerOpen(true)}
                          onKeyDown={(event) => { if (event.key === 'Escape') setQuickProjectClientPickerOpen(false); }}
                          placeholder="Search active clients by name or code"
                          autoComplete="off"
                        />
                        {quickProjectClientPickerOpen ? (
                          <div id="client-invoice-quick-project-client-options" className="project-client-options" role="listbox" aria-label="Active clients">
                            {quickProjectClientOptionsQuery.isFetching ? <div className="project-client-option-state">Searching active clients…</div> : null}
                            {!quickProjectClientOptionsQuery.isFetching && quickProjectCreatedClientMissing && quickCreatedClient ? (
                              <button type="button" role="option" aria-selected={quickProjectClientId === quickCreatedClient.id} className="project-client-option" onClick={() => handleQuickProjectClientSelect(quickCreatedClient)}>
                                <strong>{quickCreatedClient.code}</strong><span>{quickCreatedClient.displayName}</span>
                              </button>
                            ) : null}
                            {!quickProjectClientOptionsQuery.isFetching ? quickProjectClientOptions.map((client) => (
                              <button type="button" role="option" aria-selected={quickProjectClientId === client.id} className="project-client-option" key={client.id} onClick={() => handleQuickProjectClientSelect(client)}>
                                <strong>{client.code}</strong><span>{client.displayName}</span>
                              </button>
                            )) : null}
                            {!quickProjectClientOptionsQuery.isFetching && quickProjectClientOptions.length === 0 && !quickProjectCreatedClientMissing ? <div className="project-client-option-state">No active clients match this search.</div> : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <input type="hidden" {...quickProjectForm.register('clientId')} />
                    {quickProjectForm.formState.errors.clientId?.message ? <span className="field-error">{quickProjectForm.formState.errors.clientId.message}</span> : null}
                    {quickProjectClientOptionsQuery.error instanceof Error ? <span className="field-error">{quickProjectClientOptionsQuery.error.message}</span> : null}
                  </div>
                  <label>
                    Commercial model
                    <select {...quickProjectForm.register('projectModel')}>
                      <option value="FIXED_PRICE">Fixed Price</option>
                      <option value="COST_PLUS_PERCENTAGE">Cost + Percentage</option>
                    </select>
                  </label>
                  <label>Project value<input inputMode="decimal" {...quickProjectForm.register('projectValue')} /></label>
                  {quickProjectModel === 'COST_PLUS_PERCENTAGE' ? (
                    <label>Cost + percent<input inputMode="decimal" {...quickProjectForm.register('costPlusPercent')} /></label>
                  ) : null}
                  <label>Currency<input maxLength={3} {...quickProjectForm.register('currency')} /></label>
                  <label>Start date<input type="date" {...quickProjectForm.register('startDate')} /></label>
                  <label>Planned end date<input type="date" {...quickProjectForm.register('plannedEndDate')} /></label>
                  <label className="project-form-wide">Location (optional)<input {...quickProjectForm.register('location')} /></label>
                </div>
                <p className="muted project-edit-note">Create the Project first. Assign its Site Manager afterward from Administration → Users.</p>
                {Object.values(quickProjectForm.formState.errors).map((error, index) => (
                  <span className="field-error" key={index}>{error?.message}</span>
                ))}
                {mutationMessage(quickProjectMutation.error) ? <div className="form-error" role="alert">{mutationMessage(quickProjectMutation.error)}</div> : null}
                <div className="project-modal-actions">
                  <button type="button" className="secondary-button" disabled={quickProjectMutation.isPending} onClick={closeQuickProjectDialog}>Cancel</button>
                  <button type="submit" disabled={quickProjectMutation.isPending}>{quickProjectMutation.isPending ? 'Creating…' : 'Create Project'}</button>
                </div>
              </form>
            </div>
          </section>
        </div>
      ) : null}

      {projectId && props.canReadInvoices ? (
        <section className="admin-card">
          <h2>Client invoices</h2>
          <p className="muted">Paid and outstanding values are calculated by the server from posted Client Payment allocations.</p>
          {invoicesQuery.data ? <p className="muted">Total {invoicesQuery.data.total} · Page {invoicesQuery.data.page} · Page size {invoicesQuery.data.pageSize}</p> : null}
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Invoice</th><th>Date</th><th>Status</th><th>Total</th><th>Allocated</th><th>Outstanding</th><th>Project</th><th>Action</th></tr></thead>
              <tbody>
                {(invoicesQuery.data?.items ?? []).map((invoice) => (
                  <tr key={invoice.id}>
                    <td><strong>{invoice.invoiceNo}</strong><br /><small>{clientNames.get(invoice.clientId) ?? 'Project client'}</small></td>
                    <td>{invoice.invoiceDate}</td><td>{invoice.status}</td><td>{displayMoney(invoice.totalAmount)}</td><td>{displayMoney(invoice.allocatedAmount)}</td><td>{displayMoney(invoice.outstandingAmount)}</td><td>{selectedProject?.name ?? 'Selected project'}</td>
                    <td><button type="button" className="secondary-button" onClick={() => setSelectedInvoiceId(invoice.id)}>View</button></td>
                  </tr>
                ))}
                {(invoicesQuery.data?.items.length ?? 0) === 0 ? <tr><td colSpan={8} className="muted">No Client Invoices for this Project.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {selectedInvoiceId ? (
        <div className="finance-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedInvoiceId(null); }}>
          <section className="finance-modal finance-modal-wide" role="dialog" aria-modal="true" aria-labelledby="client-invoice-detail-title">
            <header className="finance-modal-header">
              <div><p className="eyebrow">Client invoice</p><h2 id="client-invoice-detail-title">{selectedInvoiceQuery.data ? `Invoice ${selectedInvoiceQuery.data.invoiceNo}` : 'Invoice details'}</h2>{selectedInvoiceQuery.data ? <p>{clientNames.get(selectedInvoiceQuery.data.clientId) ?? 'Project client'} · {selectedProject?.name ?? 'Selected project'}</p> : null}</div>
              <button type="button" className="finance-modal-close" autoFocus aria-label="Close invoice details" onClick={() => setSelectedInvoiceId(null)}>×</button>
            </header>
            <div className="finance-modal-body">
              {selectedInvoiceQuery.isPending ? <p className="finance-modal-state">Loading invoice details…</p> : null}
              {selectedInvoiceQuery.error instanceof Error ? <div className="form-error" role="alert">{selectedInvoiceQuery.error.message}</div> : null}
              {selectedInvoiceQuery.data ? (
                <div className="admin-stack">
                  <dl className="summary-grid client-invoice-summary-grid">
                    <div><dt>Invoice date</dt><dd>{selectedInvoiceQuery.data.invoiceDate}</dd></div><div><dt>Due date</dt><dd>{selectedInvoiceQuery.data.dueDate ?? 'No due date'}</dd></div><div><dt>Status</dt><dd>{selectedInvoiceQuery.data.status}</dd></div>
                    <div><dt>Source</dt><dd>{selectedInvoiceQuery.data.claimId ? 'Historical claim invoice' : 'Direct invoice'}</dd></div><div><dt>Subtotal</dt><dd>{selectedProject?.currency ?? ''} {displayMoney(selectedInvoiceQuery.data.subtotal)}</dd></div><div><dt>Tax</dt><dd>{selectedProject?.currency ?? ''} {displayMoney(selectedInvoiceQuery.data.taxAmount)}</dd></div>
                    <div><dt>Invoice total</dt><dd>{selectedProject?.currency ?? ''} {displayMoney(selectedInvoiceQuery.data.totalAmount)}</dd></div><div><dt>Paid / allocated</dt><dd>{selectedProject?.currency ?? ''} {displayMoney(selectedInvoiceQuery.data.allocatedAmount)}</dd></div><div><dt>Outstanding</dt><dd>{selectedProject?.currency ?? ''} {displayMoney(selectedInvoiceQuery.data.outstandingAmount)}</dd></div>
                  </dl>
                  <div><h3>Invoice lines</h3><div className="table-wrap"><table className="admin-table"><thead><tr><th>#</th><th>Description</th><th>Stage</th><th>Amount</th></tr></thead><tbody>{selectedInvoiceQuery.data.lines.map((line, index) => <tr key={line.id}><td>{index + 1}</td><td>{line.description}</td><td>{stageLabel(line.stageId)}</td><td>{selectedProject?.currency ?? ''} {displayMoney(line.amount)}</td></tr>)}</tbody><tfoot><tr><th colSpan={3}>Invoice total</th><th>{selectedProject?.currency ?? ''} {displayMoney(selectedInvoiceQuery.data.totalAmount)}</th></tr></tfoot></table></div></div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
