import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useClientInvoices } from '../../client-billing/hooks/client-billing.js';
import { useClients, useCreateClient } from '../../clients/hooks/clients.js';
import { getDocumentDownload, listDocuments } from '../../documents-audit/api/documents-api.js';
import { PaymentProofActions } from '../../documents-audit/components/payment-proof-actions.js';
import { useCreateDocumentLink, useUploadDocument } from '../../documents-audit/hooks/documents.js';
import { useCashBankAccounts } from '../../finance/hooks/finance.js';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useCreateProject, useProjects } from '../../projects/hooks/projects.js';
import type { Project } from '../../projects/api/projects-api.js';
import type { ClientReceipt } from '../api/client-receipts-api.js';
import {
  useAllocateClientReceipt,
  useClientReceipt,
  useClientReceipts,
  useCorrectClientReceipt,
  useCreateClientReceipt,
  useReverseClientReceipt,
  useUnallocateClientReceipt
} from '../hooks/client-receipts.js';

const uuidSchema = z.string().uuid('Select a valid value.');
const optionalUuidSchema = z.string().refine((value) => value === '' || uuidSchema.safeParse(value).success, 'Select a valid value or leave blank.');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select a valid date.');
const positiveMoneySchema = z.string().trim().regex(/^(?:[1-9]\d{0,15})(?:\.\d{1,2})?$|^0\.(?:0[1-9]|[1-9]\d?)$/, 'Enter a positive amount with up to 2 decimals.');

const receiptFormSchema = z.object({
  clientId: uuidSchema,
  projectId: uuidSchema,
  stageId: optionalUuidSchema,
  receiptDate: dateSchema,
  amount: positiveMoneySchema,
  paymentMethod: z.enum(['CASH', 'BANK']),
  cashBankAccountId: uuidSchema,
  reference: z.string().trim().max(200),
  receiptType: z.enum(['ADVANCE', 'INVOICE_PAYMENT']),
  clientInvoiceId: optionalUuidSchema
});

const allocationFormSchema = z.object({
  clientInvoiceId: uuidSchema,
  amount: positiveMoneySchema
});

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
  clientId: z.string().uuid('Select a valid Client.'),
  projectModel: z.enum(['FIXED_PRICE', 'COST_PLUS_PERCENTAGE']),
  projectValue: z.string().trim().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/, 'Enter a valid non-negative Project value with at most 2 decimals.'),
  costPlusPercent: z.string().trim(),
  currency: z.string().trim().length(3, 'Currency must use three letters.').regex(/^[A-Za-z]{3}$/, 'Currency must use letters only.'),
  startDate: dateSchema,
  plannedEndDate: dateSchema,
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

type ReceiptForm = z.infer<typeof receiptFormSchema>;
type AllocationForm = z.infer<typeof allocationFormSchema>;
type QuickClientForm = z.infer<typeof quickClientSchema>;
type QuickProjectForm = z.infer<typeof quickProjectSchema>;
type QuickCreateDialog = 'client' | 'project' | null;

type ClientReceiptsWorkspaceProps = Readonly<{
  view?: 'payment' | 'ledger';
  canRead: boolean;
  canCreate: boolean;
  createModalOpen: boolean;
  onCloseCreateModal: () => void;
  canAllocate: boolean;
  canReverse: boolean;
  canReadClients: boolean;
  canCreateClients: boolean;
  canReadProjects: boolean;
  canCreateProjects: boolean;
  canReadStages: boolean;
  canReadFinance: boolean;
  canReadInvoices: boolean;
  canUploadDocuments: boolean;
  canLinkDocuments: boolean;
  canVersionDocuments: boolean;
  canReadDocuments: boolean;
}>;

const EMPTY_RECEIPT_FORM: ReceiptForm = {
  clientId: '',
  projectId: '',
  stageId: '',
  receiptDate: '',
  amount: '',
  paymentMethod: 'BANK',
  cashBankAccountId: '',
  reference: '',
  receiptType: 'ADVANCE',
  clientInvoiceId: ''
};

/** Return a readable message for one failed browser mutation. */
function mutationMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

/** Format one server money string for display without making browser arithmetic authoritative. */
function displayMoney(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value;
}

/** Render the Final-21 Client Receipt register, posting, allocation and history workspace. */
export function ClientReceiptsWorkspace(props: ClientReceiptsWorkspaceProps) {
  const [clientFilter, setClientFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'POSTED' | 'REVERSED'>('');
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [editingReceipt, setEditingReceipt] = useState<ClientReceipt | null>(null);
  const [allocationReceipt, setAllocationReceipt] = useState<ClientReceipt | null>(null);
  const [receiptEvidence, setReceiptEvidence] = useState<File | null>(null);
  const [receiptEvidenceInputKey, setReceiptEvidenceInputKey] = useState(0);
  const [evidenceMessage, setEvidenceMessage] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null);
  const [editEvidence, setEditEvidence] = useState<File | null>(null);
  const [editEvidenceInputKey, setEditEvidenceInputKey] = useState(0);
  const [clientSearchText, setClientSearchText] = useState('');
  const [projectSearchText, setProjectSearchText] = useState('');
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [quickDialog, setQuickDialog] = useState<QuickCreateDialog>(null);
  const [quickCreatedClient, setQuickCreatedClient] = useState<Readonly<{ id: string; code: string; displayName: string }> | null>(null);
  const [quickCreatedProject, setQuickCreatedProject] = useState<Project | null>(null);
  const [quickProjectClientSearchText, setQuickProjectClientSearchText] = useState('');
  const [quickProjectClientPickerOpen, setQuickProjectClientPickerOpen] = useState(false);

  const clientsQuery = useClients({ status: 'ACTIVE', page: 1, pageSize: 100 }, props.canReadClients);
  const projectsQuery = useProjects({ page: 1, pageSize: 100 }, props.canReadProjects);
  const clients = clientsQuery.data?.items ?? [];
  const projects = projectsQuery.data?.items ?? [];
  const clientOptionsQuery = useClients({
    status: 'ACTIVE',
    ...(clientSearchText.trim() ? { search: clientSearchText.trim() } : {}),
    page: 1,
    pageSize: 100
  }, props.canReadClients && props.createModalOpen && quickDialog === null);
  const clientOptions = clientOptionsQuery.data?.items ?? [];
  const quickProjectClientOptionsQuery = useClients({
    status: 'ACTIVE',
    ...(quickProjectClientSearchText.trim() ? { search: quickProjectClientSearchText.trim() } : {}),
    page: 1,
    pageSize: 100
  }, props.canReadClients && props.createModalOpen && quickDialog === 'project');
  const quickProjectClientOptions = quickProjectClientOptionsQuery.data?.items ?? [];
  const filteredProjects = useMemo(
    () => projects.filter((project) => !clientFilter || project.clientId === clientFilter),
    [clientFilter, projects]
  );

  const receiptQuery = useClientReceipts({
    ...(clientFilter ? { clientId: clientFilter } : {}),
    ...(projectFilter ? { projectId: projectFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    page: 1,
    pageSize: 100
  }, props.canRead);
  const receiptDetailQuery = useClientReceipt(selectedReceiptId, props.canRead);

  const receiptForm = useForm<ReceiptForm>({ resolver: zodResolver(receiptFormSchema), defaultValues: EMPTY_RECEIPT_FORM });
  const receiptProjectId = receiptForm.watch('projectId');
  const receiptPaymentMethod = receiptForm.watch('paymentMethod');
  const receiptClientId = receiptForm.watch('clientId');
  const projectOptionsQuery = useProjects({
    ...(props.canReadClients && receiptClientId ? { clientId: receiptClientId } : {}),
    ...(projectSearchText.trim() ? { search: projectSearchText.trim() } : {}),
    page: 1,
    pageSize: 100
  }, props.canReadProjects && props.createModalOpen && quickDialog === null && (!props.canReadClients || receiptClientId !== ''));
  const projectOptions = projectOptionsQuery.data?.items ?? [];
  const selectedReceiptProject = useMemo(
    () => projects.find((project) => project.id === receiptProjectId) ?? (quickCreatedProject?.id === receiptProjectId ? quickCreatedProject : null),
    [projects, quickCreatedProject, receiptProjectId]
  );
  const quickClientMissing = quickCreatedClient !== null
    && !clientOptions.some((client) => client.id === quickCreatedClient.id)
    && (!clientSearchText.trim() || `${quickCreatedClient.code} ${quickCreatedClient.displayName}`.toLowerCase().includes(clientSearchText.trim().toLowerCase()));
  const quickProjectMissing = quickCreatedProject !== null
    && quickCreatedProject.clientId === receiptClientId
    && !projectOptions.some((project) => project.id === quickCreatedProject.id)
    && (!projectSearchText.trim() || `${quickCreatedProject.projectCode} ${quickCreatedProject.name}`.toLowerCase().includes(projectSearchText.trim().toLowerCase()));
  const quickProjectCreatedClientMissing = quickCreatedClient !== null
    && !quickProjectClientOptions.some((client) => client.id === quickCreatedClient.id)
    && (!quickProjectClientSearchText.trim() || `${quickCreatedClient.code} ${quickCreatedClient.displayName}`.toLowerCase().includes(quickProjectClientSearchText.trim().toLowerCase()));
  const receiptStagesQuery = useProjectStages(receiptProjectId || null, props.canReadStages && receiptProjectId !== '');
  const receiptInvoicesQuery = useClientInvoices(
    { ...(receiptProjectId ? { projectId: receiptProjectId } : {}), status: 'ISSUED', page: 1, pageSize: 100 },
    props.canReadInvoices && receiptProjectId !== ''
  );
  const pendingReceiptInvoices = useMemo(
    () => (receiptInvoicesQuery.data?.items ?? []).filter((invoice) => invoice.clientId === receiptClientId && invoice.outstandingAmount !== '0.00'),
    [receiptClientId, receiptInvoicesQuery.data?.items]
  );
  const detailProjectId = receiptDetailQuery.data?.projectId ?? '';
  const detailStagesQuery = useProjectStages(detailProjectId || null, props.canReadStages && detailProjectId !== '');
  const detailInvoicesQuery = useClientInvoices({ ...(detailProjectId ? { projectId: detailProjectId } : {}), status: 'ISSUED', page: 1, pageSize: 100 }, props.canReadInvoices && detailProjectId !== '');
  const cashBankQuery = useCashBankAccounts({ status: 'ACTIVE', page: 1, pageSize: 100 }, props.canReadFinance);
  const matchingCashBankAccounts = useMemo(
    () => (cashBankQuery.data?.items ?? []).filter((account) => account.accountType.toUpperCase() === receiptPaymentMethod && (!receiptProjectId || account.projectId === receiptProjectId || account.projectId === null)),
    [cashBankQuery.data?.items, receiptPaymentMethod, receiptProjectId]
  );
  const cashBankNames = useMemo(() => new Map((cashBankQuery.data?.items ?? []).map((account) => [account.id, account.name])), [cashBankQuery.data?.items]);
  const createReceipt = useCreateClientReceipt();
  const quickClientMutation = useCreateClient();
  const quickProjectMutation = useCreateProject();
  const quickClientForm = useForm<QuickClientForm>({
    resolver: zodResolver(quickClientSchema),
    defaultValues: {
      legalName: '', displayName: '', taxNo: '', billingAddress: '', creditTermsDays: null,
      contactName: '', contactTitle: '', contactEmail: '', contactPhone: '', contactIsPrimary: false
    }
  });
  const quickProjectForm = useForm<QuickProjectForm>({
    resolver: zodResolver(quickProjectSchema),
    defaultValues: {
      name: '', clientId: '', projectModel: 'FIXED_PRICE', projectValue: '0.00', costPlusPercent: '',
      currency: 'PKR', startDate: '', plannedEndDate: '', location: ''
    }
  });
  const quickProjectModel = quickProjectForm.watch('projectModel');
  const quickProjectClientId = quickProjectForm.watch('clientId');
  const uploadReceiptDocument = useUploadDocument();
  const linkReceiptDocument = useCreateDocumentLink();

  const allocationProjectId = allocationReceipt?.projectId ?? '';
  const allocationInvoicesQuery = useClientInvoices({ ...(allocationProjectId ? { projectId: allocationProjectId } : {}), status: 'ISSUED', page: 1, pageSize: 100 }, props.canReadInvoices && allocationProjectId !== '');
  const allocationForm = useForm<AllocationForm>({ resolver: zodResolver(allocationFormSchema), defaultValues: { clientInvoiceId: '', amount: '' } });
  const allocateReceipt = useAllocateClientReceipt(allocationReceipt?.id ?? null);
  const unallocateReceipt = useUnallocateClientReceipt(receiptDetailQuery.data?.id ?? null);
  const reverseReceipt = useReverseClientReceipt();

  const editForm = useForm<ReceiptForm>({ resolver: zodResolver(receiptFormSchema), defaultValues: EMPTY_RECEIPT_FORM });
  const editProjectId = editForm.watch('projectId');
  const editClientId = editForm.watch('clientId');
  const editPaymentMethod = editForm.watch('paymentMethod');
  const editStagesQuery = useProjectStages(editProjectId || null, props.canReadStages && editProjectId !== '');
  const editInvoicesQuery = useClientInvoices(
    { ...(editProjectId ? { projectId: editProjectId } : {}), status: 'ISSUED', page: 1, pageSize: 100 },
    props.canReadInvoices && editProjectId !== ''
  );
  const editInvoices = useMemo(
    () => (editInvoicesQuery.data?.items ?? []).filter((invoice) => invoice.clientId === editClientId),
    [editClientId, editInvoicesQuery.data?.items]
  );
  const editAccounts = useMemo(
    () => (cashBankQuery.data?.items ?? []).filter((account) => account.accountType.toUpperCase() === editPaymentMethod && (!editProjectId || account.projectId === editProjectId || account.projectId === null)),
    [cashBankQuery.data?.items, editPaymentMethod, editProjectId]
  );
  const correctReceipt = useCorrectClientReceipt(editingReceipt?.id ?? null);

  /** Close the New Payment dialog and clear draft-only browser state. */
  function closeCreateReceiptModal(): void {
    receiptForm.reset(EMPTY_RECEIPT_FORM);
    quickClientForm.reset({
      legalName: '', displayName: '', taxNo: '', billingAddress: '', creditTermsDays: null,
      contactName: '', contactTitle: '', contactEmail: '', contactPhone: '', contactIsPrimary: false
    });
    quickProjectForm.reset({
      name: '', clientId: '', projectModel: 'FIXED_PRICE', projectValue: '0.00', costPlusPercent: '',
      currency: 'PKR', startDate: '', plannedEndDate: '', location: ''
    });
    setClientSearchText('');
    setProjectSearchText('');
    setClientPickerOpen(false);
    setProjectPickerOpen(false);
    setQuickProjectClientSearchText('');
    setQuickProjectClientPickerOpen(false);
    setQuickDialog(null);
    setReceiptEvidence(null);
    setReceiptEvidenceInputKey((value) => value + 1);
    setEvidenceMessage(null);
    setEvidenceError(null);
    createReceipt.reset();
    quickClientMutation.reset();
    quickProjectMutation.reset();
    props.onCloseCreateModal();
  }

  /** Search active Clients in the single New Payment Client picker and clear stale dependent selections while typing. */
  function handleReceiptClientSearch(value: string): void {
    setClientSearchText(value);
    setClientPickerOpen(true);
    if (receiptClientId) {
      receiptForm.setValue('clientId', '', { shouldDirty: true, shouldValidate: true });
      receiptForm.setValue('projectId', '');
      receiptForm.setValue('stageId', '');
      receiptForm.setValue('clientInvoiceId', '');
      setProjectSearchText('');
    }
  }

  /** Select one Client in the New Payment form and reset Project-owned dependent fields. */
  function handleReceiptClientSelect(client: Readonly<{ id: string; code: string; displayName: string }>): void {
    receiptForm.setValue('clientId', client.id, { shouldDirty: true, shouldValidate: true });
    receiptForm.setValue('projectId', '');
    receiptForm.setValue('stageId', '');
    receiptForm.setValue('clientInvoiceId', '');
    setClientSearchText(client.displayName);
    setProjectSearchText('');
    setClientPickerOpen(false);
  }

  /** Search Projects in the New Payment Project picker and clear a stale selected Project while typing. */
  function handleReceiptProjectSearch(value: string): void {
    setProjectSearchText(value);
    setProjectPickerOpen(true);
    if (receiptProjectId) {
      receiptForm.setValue('projectId', '', { shouldDirty: true, shouldValidate: true });
      receiptForm.setValue('stageId', '');
      receiptForm.setValue('clientInvoiceId', '');
    }
  }

  /** Select one Project and keep the receipt Client synchronized with the server-owned Project relationship. */
  function handleReceiptProjectSelect(project: Project): void {
    receiptForm.setValue('projectId', project.id, { shouldDirty: true, shouldValidate: true });
    receiptForm.setValue('clientId', project.clientId, { shouldDirty: true, shouldValidate: true });
    receiptForm.setValue('stageId', '');
    receiptForm.setValue('clientInvoiceId', '');
    setProjectSearchText(project.name);
    const client = clients.find((item) => item.id === project.clientId)
      ?? (quickCreatedClient?.id === project.clientId ? quickCreatedClient : null);
    if (client) setClientSearchText(client.displayName);
    setProjectPickerOpen(false);
  }

  /** Open the complete Client Management create form without losing the unfinished Client Receipt. */
  function openQuickClientDialog(): void {
    quickClientForm.reset({
      legalName: '', displayName: '', taxNo: '', billingAddress: '', creditTermsDays: null,
      contactName: '', contactTitle: '', contactEmail: '', contactPhone: '', contactIsPrimary: false
    });
    quickClientMutation.reset();
    setClientPickerOpen(false);
    setQuickDialog('client');
  }

  /** Open the complete Project Management create form with the currently selected Client preselected. */
  function openQuickProjectDialog(): void {
    if (!receiptClientId) return;
    const selectedClient = clients.find((client) => client.id === receiptClientId)
      ?? (quickCreatedClient?.id === receiptClientId ? quickCreatedClient : null);
    quickProjectForm.reset({
      name: '',
      clientId: receiptClientId,
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

  /** Search active Clients inside the inline Project form without changing the unfinished receipt. */
  function handleQuickProjectClientSearch(value: string): void {
    setQuickProjectClientSearchText(value);
    setQuickProjectClientPickerOpen(true);
    if (quickProjectForm.getValues('clientId')) {
      quickProjectForm.setValue('clientId', '', { shouldDirty: true, shouldValidate: true });
    }
  }

  /** Select one Client for the inline Project form. */
  function handleQuickProjectClientSelect(client: Readonly<{ id: string; code: string; displayName: string }>): void {
    quickProjectForm.setValue('clientId', client.id, { shouldDirty: true, shouldValidate: true });
    setQuickProjectClientSearchText(client.displayName);
    setQuickProjectClientPickerOpen(false);
  }

  /** Create the normal full Client record and select it on the unfinished Client Receipt. */
  async function submitQuickClient(values: QuickClientForm): Promise<void> {
    const client = await quickClientMutation.mutateAsync({
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
    setQuickCreatedClient({ id: client.id, code: client.code, displayName: client.displayName });
    receiptForm.setValue('clientId', client.id, { shouldDirty: true, shouldValidate: true });
    receiptForm.setValue('projectId', '');
    receiptForm.setValue('stageId', '');
    receiptForm.setValue('clientInvoiceId', '');
    setClientSearchText(client.displayName);
    setProjectSearchText('');
    setQuickDialog(null);
  }

  /** Create the normal complete DRAFT Project and select it on the unfinished Client Receipt. */
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
    receiptForm.setValue('clientId', project.clientId, { shouldDirty: true, shouldValidate: true });
    receiptForm.setValue('projectId', project.id, { shouldDirty: true, shouldValidate: true });
    receiptForm.setValue('stageId', '');
    receiptForm.setValue('clientInvoiceId', '');
    setClientSearchText(quickProjectClientSearchText);
    setProjectSearchText(project.name);
    setQuickProjectClientPickerOpen(false);
    setQuickDialog(null);
  }

  /** Return from inline Client creation to the unfinished New Client Receipt. */
  function closeQuickClientDialog(): void {
    quickClientMutation.reset();
    setQuickDialog(null);
  }

  /** Return from inline Project creation to the unfinished New Client Receipt. */
  function closeQuickProjectDialog(): void {
    quickProjectMutation.reset();
    setQuickProjectClientPickerOpen(false);
    setQuickDialog(null);
  }

  useEffect(() => {
    if (!selectedReceiptId && !editingReceipt) return undefined;
    /** Close the active receipt detail dialog without changing register filters. */
    function closeReceiptOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setSelectedReceiptId(null);
        setEditingReceipt(null);
      }
    }
    window.addEventListener('keydown', closeReceiptOnEscape);
    return () => window.removeEventListener('keydown', closeReceiptOnEscape);
  }, [editingReceipt, selectedReceiptId]);

  useEffect(() => {
    if (!selectedReceiptProject || receiptClientId === selectedReceiptProject.clientId) return;
    receiptForm.setValue('clientId', selectedReceiptProject.clientId, { shouldValidate: true });
  }, [receiptClientId, receiptForm, selectedReceiptProject]);

  useEffect(() => {
    receiptForm.setValue('cashBankAccountId', '');
  }, [receiptPaymentMethod, receiptForm]);

  useEffect(() => {
    receiptForm.setValue('clientInvoiceId', '');
  }, [receiptProjectId, receiptForm]);

  /** Create and post one Client Receipt from permission-safe selectors. */
  async function submitReceipt(values: ReceiptForm): Promise<void> {
    setEvidenceMessage(null);
    setEvidenceError(null);
    const created = await createReceipt.mutateAsync({
      clientId: values.clientId,
      projectId: values.projectId,
      stageId: values.stageId || null,
      receiptDate: values.receiptDate,
      amount: values.amount,
      paymentMethod: values.paymentMethod,
      cashBankAccountId: values.cashBankAccountId,
      reference: values.reference || null,
      receiptType: values.clientInvoiceId ? 'INVOICE_PAYMENT' : 'ADVANCE',
      clientInvoiceId: values.clientInvoiceId || null
    });
    receiptForm.reset(EMPTY_RECEIPT_FORM);
    setClientSearchText('');
    setProjectSearchText('');
    if (!receiptEvidence) {
      closeCreateReceiptModal();
      return;
    }
    if (!props.canUploadDocuments || !props.canLinkDocuments) {
      setEvidenceError(`Payment ${created.receiptNo} was posted, but your role cannot upload and link its evidence.`);
      return;
    }
    try {
      const uploaded = await uploadReceiptDocument.mutateAsync({
        file: receiptEvidence,
        title: `Client payment ${created.receiptNo}`,
        category: 'client_receipt',
        projectId: created.projectId,
        documentNo: created.receiptNo
      });
      await linkReceiptDocument.mutateAsync({
        documentId: uploaded.document.id,
        link: { versionId: uploaded.version.id, resourceType: 'client_receipt', resourceId: created.id }
      });
      setEvidenceMessage(`Payment ${created.receiptNo} and ${receiptEvidence.name} were saved successfully.`);
      closeCreateReceiptModal();
    } catch (error) {
      setReceiptEvidence(null);
      setReceiptEvidenceInputKey((value) => value + 1);
      setEvidenceError(`Payment ${created.receiptNo} was posted, but its evidence was not saved. Use Edit proof in the payment row to retry: ${error instanceof Error ? error.message : 'Upload failed.'}`);
    }
  }

  /** Open the correction dialog with every editable payment field populated from the register row. */
  function openReceiptEditor(receipt: ClientReceipt): void {
    setSelectedReceiptId(null);
    setEvidenceMessage(null);
    setEvidenceError(null);
    setEditEvidence(null);
    setEditEvidenceInputKey((value) => value + 1);
    editForm.reset({
      clientId: receipt.clientId,
      projectId: receipt.projectId,
      stageId: receipt.stageId ?? '',
      receiptDate: receipt.receiptDate,
      amount: receipt.amount,
      paymentMethod: receipt.paymentMethod,
      cashBankAccountId: receipt.cashBankAccountId,
      reference: receipt.reference ?? '',
      receiptType: receipt.receiptType,
      clientInvoiceId: receipt.allocations.length === 1 ? receipt.allocations[0]!.clientInvoiceId : ''
    });
    setEditingReceipt(receipt);
  }

  /** Apply an accounting-safe correction and optionally attach new evidence to the replacement receipt. */
  async function submitReceiptCorrection(values: ReceiptForm): Promise<void> {
    if (!editingReceipt) return;
    setEvidenceMessage(null);
    setEvidenceError(null);
    const replacement = await correctReceipt.mutateAsync({
      clientId: values.clientId,
      projectId: values.projectId,
      stageId: values.stageId || null,
      receiptDate: values.receiptDate,
      amount: values.amount,
      paymentMethod: values.paymentMethod,
      cashBankAccountId: values.cashBankAccountId,
      reference: values.reference || null,
      receiptType: values.clientInvoiceId ? 'INVOICE_PAYMENT' : 'ADVANCE',
      clientInvoiceId: values.clientInvoiceId || null
    });

    setEditingReceipt(null);
    editForm.reset(EMPTY_RECEIPT_FORM);
    if (!editEvidence) {
      setEvidenceMessage(`Payment ${editingReceipt.receiptNo} was reversed and replaced by ${replacement.receiptNo}.`);
      return;
    }
    if (!props.canUploadDocuments || !props.canLinkDocuments) {
      setEvidenceError(`Corrected payment ${replacement.receiptNo} was posted, but your role cannot attach its evidence.`);
      return;
    }
    try {
      const uploaded = await uploadReceiptDocument.mutateAsync({
        file: editEvidence,
        title: `Client payment ${replacement.receiptNo}`,
        category: 'client_receipt',
        projectId: replacement.projectId,
        documentNo: replacement.receiptNo
      });
      await linkReceiptDocument.mutateAsync({
        documentId: uploaded.document.id,
        link: { versionId: uploaded.version.id, resourceType: 'client_receipt', resourceId: replacement.id }
      });
      setEvidenceMessage(`Payment was corrected as ${replacement.receiptNo}, and ${editEvidence.name} was attached.`);
    } catch (error) {
      setEvidenceError(`Corrected payment ${replacement.receiptNo} was posted, but its evidence was not saved. Use Edit proof in the payment row to retry: ${error instanceof Error ? error.message : 'Upload failed.'}`);
    } finally {
      setEditEvidence(null);
      setEditEvidenceInputKey((value) => value + 1);
    }
  }

  /** Open one receipt detail dialog and clear messages left by another record. */
  function openReceiptDetails(receiptId: string): void {
    setEvidenceMessage(null);
    setEvidenceError(null);
    setSelectedReceiptId(receiptId);
  }

  /** Download the selected receipt evidence through an authorized short-lived URL. */
  async function downloadReceiptEvidence(receipt: ClientReceipt): Promise<void> {
    setEvidenceError(null);
    setDownloadingReceiptId(receipt.id);
    try {
      const documents = await listDocuments({ projectId: receipt.projectId, resourceType: 'client_receipt', resourceId: receipt.id, page: 1, pageSize: 1 });
      const document = documents.items[0];
      if (!document) throw new Error(`No image or PDF is attached to payment ${receipt.receiptNo}.`);
      const download = await getDocumentDownload(document.id);
      const response = await fetch(download.url);
      if (!response.ok) throw new Error(`Payment evidence download failed with status ${response.status}.`);
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = window.document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = download.version.originalName || document.fileName || `client-payment-${receipt.receiptNo}`;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch (error) {
      setEvidenceError(error instanceof Error ? error.message : 'The payment evidence could not be downloaded.');
    } finally {
      setDownloadingReceiptId(null);
    }
  }

  /** Allocate the selected posted Receipt to one issued Client Invoice. */
  async function submitAllocation(values: AllocationForm): Promise<void> {
    if (!allocationReceipt) return;
    const updated = await allocateReceipt.mutateAsync(values);
    setSelectedReceiptId(updated.id);
    setAllocationReceipt(updated);
    allocationForm.reset({ clientInvoiceId: '', amount: '' });
  }

  /** Reverse one existing Receipt allocation through the explicit server command. */
  async function reverseAllocation(allocationId: string): Promise<void> {
    const updated = await unallocateReceipt.mutateAsync({ allocationId });
    setSelectedReceiptId(updated.id);
  }

  /** Reverse one posted Receipt only after its allocations have been cleared. */
  async function reverseSelectedReceipt(receipt: ClientReceipt): Promise<void> {
    const updated = await reverseReceipt.mutateAsync(receipt.id);
    setSelectedReceiptId(updated.id);
    if (allocationReceipt?.id === updated.id) setAllocationReceipt(null);
  }

  /** Return a readable Project label without exposing a raw identifier when Project data is restricted. */
  function projectLabel(projectId: string): string {
    const project = projects.find((item) => item.id === projectId);
    return project ? `${project.projectCode} · ${project.name}` : 'Assigned Project';
  }

  /** Return a readable Client label without exposing a raw identifier when Client data is restricted. */
  function clientLabel(clientId: string): string {
    const client = clients.find((item) => item.id === clientId);
    return client ? `${client.code} · ${client.displayName}` : 'Project Client';
  }

  /** Return a readable Stage label while keeping Project-level receipts explicit. */
  function stageLabel(stageId: string | null): string {
    if (!stageId) return 'Project level';
    const stage = detailStagesQuery.data?.items.find((item) => item.id === stageId);
    return stage ? `${stage.code} · ${stage.name}` : 'Linked Stage';
  }

  /** Return a readable Invoice label without exposing raw Invoice IDs. */
  function invoiceLabel(invoiceId: string): string {
    const invoice = detailInvoicesQuery.data?.items.find((item) => item.id === invoiceId);
    return invoice ? `${invoice.invoiceNo} · Billed ${displayMoney(invoice.totalAmount)}` : 'Linked Client Invoice';
  }

  if (!props.canRead) return <section className="admin-card"><p>You do not have Client Receipts read access.</p></section>;

  return (
    <div className="admin-stack">
      {props.canCreate && props.view !== 'ledger' && props.createModalOpen && quickDialog === null && (
        <div className="finance-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreateReceiptModal(); }}>
          <section className="finance-modal finance-modal-wide client-payment-create-modal" role="dialog" aria-modal="true" aria-labelledby="client-payment-create-title" onKeyDown={(event) => { if (event.key === 'Escape') closeCreateReceiptModal(); }}>
            <header className="finance-modal-header">
              <div>
                <p className="eyebrow">Client payment</p>
                <h2 id="client-payment-create-title">New Client Receipt</h2>
                <p>Record a Client payment against the selected Project and Cash / Bank account.</p>
              </div>
              <button type="button" className="finance-modal-close" autoFocus aria-label="Close new payment" onClick={closeCreateReceiptModal}>×</button>
            </header>
            <div className="finance-modal-body">
              <p className="client-payment-create-note">Receipt cash is posted immediately to Cash/Bank and Client Advance. It is not profit: this does not treat cash received as profit, and AR changes only when the receipt is allocated to an issued Client Invoice.</p>
              <form className="admin-form client-payment-create-form" onSubmit={receiptForm.handleSubmit(submitReceipt)}>
                <div className="client-payment-create-grid">
                  <div className="project-client-field">
                    <label htmlFor="client-payment-client-search">Client</label>
                    {props.canReadClients ? (
                      <div className="project-client-search-row">
                        <div className="project-client-combobox" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setClientPickerOpen(false); }}>
                          <input
                            id="client-payment-client-search"
                            type="search"
                            role="combobox"
                            aria-autocomplete="list"
                            aria-controls="client-payment-client-options"
                            aria-expanded={clientPickerOpen}
                            value={clientSearchText}
                            onChange={(event) => handleReceiptClientSearch(event.target.value)}
                            onFocus={() => setClientPickerOpen(true)}
                            onClick={() => setClientPickerOpen(true)}
                            onKeyDown={(event) => { if (event.key === 'Escape') setClientPickerOpen(false); }}
                            placeholder="Search active clients by name or code"
                            autoComplete="off"
                          />
                          {clientPickerOpen ? (
                            <div id="client-payment-client-options" className="project-client-options" role="listbox" aria-label="Active clients">
                              {clientOptionsQuery.isFetching ? <div className="project-client-option-state">Searching active clients…</div> : null}
                              {!clientOptionsQuery.isFetching && quickClientMissing && quickCreatedClient ? (
                                <button type="button" role="option" aria-selected={receiptClientId === quickCreatedClient.id} className="project-client-option" onClick={() => handleReceiptClientSelect(quickCreatedClient)}>
                                  <strong>{quickCreatedClient.code}</strong><span>{quickCreatedClient.displayName}</span>
                                </button>
                              ) : null}
                              {!clientOptionsQuery.isFetching ? clientOptions.map((client) => (
                                <button type="button" role="option" aria-selected={receiptClientId === client.id} className="project-client-option" key={client.id} onClick={() => handleReceiptClientSelect(client)}>
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
                    <input type="hidden" {...receiptForm.register('clientId')} />
                    <span className="field-error">{receiptForm.formState.errors.clientId?.message}</span>
                  </div>
                  <div className="project-client-field">
                    <label htmlFor="client-payment-project-search">Project</label>
                    <div className="project-client-search-row">
                      <div className="project-client-combobox" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setProjectPickerOpen(false); }}>
                        <input
                          id="client-payment-project-search"
                          type="search"
                          role="combobox"
                          aria-autocomplete="list"
                          aria-controls="client-payment-project-options"
                          aria-expanded={projectPickerOpen}
                          value={projectSearchText}
                          onChange={(event) => handleReceiptProjectSearch(event.target.value)}
                          onFocus={() => setProjectPickerOpen(true)}
                          onClick={() => setProjectPickerOpen(true)}
                          onKeyDown={(event) => { if (event.key === 'Escape') setProjectPickerOpen(false); }}
                          placeholder={props.canReadClients && !receiptClientId ? 'Select a Client first' : 'Search projects by code or name'}
                          autoComplete="off"
                          disabled={props.canReadClients && !receiptClientId}
                        />
                        {projectPickerOpen && (!props.canReadClients || receiptClientId) ? (
                          <div id="client-payment-project-options" className="project-client-options" role="listbox" aria-label="Projects">
                            {projectOptionsQuery.isFetching ? <div className="project-client-option-state">Searching projects…</div> : null}
                            {!projectOptionsQuery.isFetching && quickProjectMissing && quickCreatedProject ? (
                              <button type="button" role="option" aria-selected={receiptProjectId === quickCreatedProject.id} className="project-client-option" onClick={() => handleReceiptProjectSelect(quickCreatedProject)}>
                                <strong>{quickCreatedProject.projectCode}</strong><span>{quickCreatedProject.name}</span>
                              </button>
                            ) : null}
                            {!projectOptionsQuery.isFetching ? projectOptions.map((project) => (
                              <button type="button" role="option" aria-selected={receiptProjectId === project.id} className="project-client-option" key={project.id} onClick={() => handleReceiptProjectSelect(project)}>
                                <strong>{project.projectCode}</strong><span>{project.name}</span>
                              </button>
                            )) : null}
                            {!projectOptionsQuery.isFetching && projectOptions.length === 0 && !quickProjectMissing ? <div className="project-client-option-state">No Projects match this search.</div> : null}
                          </div>
                        ) : null}
                      </div>
                      {props.canCreateProjects && props.canReadClients ? <button type="button" className="secondary-button project-client-create-button" disabled={!receiptClientId} title={!receiptClientId ? 'Select a Client first.' : 'Create a Project for this Client'} onClick={openQuickProjectDialog}>+ Create project</button> : null}
                    </div>
                    <input type="hidden" {...receiptForm.register('projectId')} />
                    <span className="field-error">{receiptForm.formState.errors.projectId?.message}</span>
                  </div>
                  <label>Stage (optional)
                    <select {...receiptForm.register('stageId')} disabled={!receiptProjectId || !props.canReadStages}>
                      <option value="">Project level</option>
                      {(receiptStagesQuery.data?.items ?? []).map((stage) => <option key={stage.id} value={stage.id}>{stage.code} · {stage.name}</option>)}
                    </select>
                    {!props.canReadStages ? <small className="muted">Stage selection requires Project Stage read access.</small> : null}
                  </label>
                  <label>Receipt date<input type="date" {...receiptForm.register('receiptDate')} /><span className="field-error">{receiptForm.formState.errors.receiptDate?.message}</span></label>
                  <label>Amount<input inputMode="decimal" {...receiptForm.register('amount')} /><span className="field-error">{receiptForm.formState.errors.amount?.message}</span></label>
                  <label>Payment method<select {...receiptForm.register('paymentMethod')}><option value="BANK">Bank</option><option value="CASH">Cash</option></select></label>
                  <label>Cash / Bank account
                    <select {...receiptForm.register('cashBankAccountId')} disabled={!props.canReadFinance}>
                      <option value="">Select matching account</option>
                      {matchingCashBankAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name} · Balance {displayMoney(account.balance)}</option>)}
                    </select>
                    <span className="field-error">{receiptForm.formState.errors.cashBankAccountId?.message}</span>
                  </label>
                  <input type="hidden" {...receiptForm.register('receiptType')} />
                  <label>Pending Client Invoice (optional)
                    <select {...receiptForm.register('clientInvoiceId')} disabled={!receiptProjectId || !props.canReadInvoices}>
                      <option value="">Direct payment (no invoice)</option>
                      {pendingReceiptInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNo} · Total {displayMoney(invoice.totalAmount)} · Paid {displayMoney(invoice.allocatedAmount)} · Due {displayMoney(invoice.outstandingAmount)}</option>)}
                    </select>
                    <span className="field-error">{receiptForm.formState.errors.clientInvoiceId?.message}</span>
                    {receiptProjectId && props.canReadInvoices && !receiptInvoicesQuery.isLoading && pendingReceiptInvoices.length === 0 ? <small className="muted">No pending Client Invoices for the selected Client and Project. Leave Direct payment selected to post without an Invoice.</small> : null}
                  </label>
                  <label>Reference (optional)<input {...receiptForm.register('reference')} /></label>
                  <label>Payment evidence (optional)
                    <input key={receiptEvidenceInputKey} type="file" accept="image/jpeg,image/png,application/pdf" disabled={!props.canUploadDocuments || !props.canLinkDocuments} onChange={(event) => setReceiptEvidence(event.target.files?.[0] ?? null)} />
                    <small className="muted">Upload the client payment receipt, bank slip or cash evidence as JPG, PNG or PDF.</small>
                  </label>
                </div>
                <p className="muted client-payment-create-help">Select a pending Invoice to create the payment and apply the entered amount in the same server transaction. Leave Direct payment selected to post without an Invoice.</p>
                {!props.canReadProjects || !props.canReadFinance ? <p className="muted">Project and Finance read access are required for safe selectors; raw IDs are not accepted by this UI.</p> : null}
                {mutationMessage(createReceipt.error) && <p className="field-error">{mutationMessage(createReceipt.error)}</p>}
                {evidenceMessage ? <p className="muted">{evidenceMessage}</p> : null}
                {evidenceError ? <div className="form-error" role="alert">{evidenceError}</div> : null}
                <div className="form-actions client-payment-create-actions">
                  <button type="button" className="secondary-button" disabled={createReceipt.isPending || uploadReceiptDocument.isPending || linkReceiptDocument.isPending} onClick={closeCreateReceiptModal}>Cancel</button>
                  <button type="submit" disabled={createReceipt.isPending || uploadReceiptDocument.isPending || linkReceiptDocument.isPending || !props.canReadProjects || !props.canReadFinance}>{createReceipt.isPending || uploadReceiptDocument.isPending || linkReceiptDocument.isPending ? 'Saving payment…' : 'Create & post receipt'}</button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}

      {props.canCreate && props.createModalOpen && quickDialog === 'client' ? (
        <div className="client-modal-backdrop" role="presentation" onMouseDown={closeQuickClientDialog}>
          <section className="client-modal" role="dialog" aria-modal="true" aria-labelledby="client-payment-quick-client-title" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Escape') closeQuickClientDialog(); }}>
            <header className="client-modal-header">
              <div><p className="eyebrow">New client account</p><h2 id="client-payment-quick-client-title">Create client</h2></div>
              <button type="button" className="client-modal-close" aria-label="Close Create client" onClick={closeQuickClientDialog}><span aria-hidden="true">×</span></button>
            </header>
            <div className="client-modal-body">
              <form className="admin-form client-modal-form" onSubmit={quickClientForm.handleSubmit(submitQuickClient)} noValidate>
                <div className="client-form-grid">
                  <label>Display name<input autoFocus {...quickClientForm.register('displayName')} /></label>
                  <label>Legal name<input {...quickClientForm.register('legalName')} /></label>
                  <label>Tax number<input {...quickClientForm.register('taxNo')} /></label>
                  <label>Credit terms (days)<input type="number" min="0" {...quickClientForm.register('creditTermsDays', { setValueAs: (value) => value === '' ? null : Number(value) })} /></label>
                  <label className="client-form-wide">Billing address<textarea rows={3} {...quickClientForm.register('billingAddress')} /></label>
                  <div className="client-form-wide client-create-contact-heading"><strong>Primary contact (optional)</strong><span className="muted">The client code is generated automatically by the server.</span></div>
                  <label>Contact name<input {...quickClientForm.register('contactName')} /></label>
                  <label>Contact title<input {...quickClientForm.register('contactTitle')} /></label>
                  <label>Contact email<input type="email" {...quickClientForm.register('contactEmail')} /></label>
                  <label>Contact phone<input {...quickClientForm.register('contactPhone')} /></label>
                  <label className="checkbox-row client-form-wide"><input type="checkbox" {...quickClientForm.register('contactIsPrimary')} /><span>Primary contact</span></label>
                </div>
                {Object.values(quickClientForm.formState.errors).map((error, index) => <span className="field-error" key={index}>{error?.message}</span>)}
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

      {props.canCreate && props.createModalOpen && quickDialog === 'project' ? (
        <div className="project-modal-backdrop" role="presentation" onMouseDown={closeQuickProjectDialog}>
          <section className="project-modal" role="dialog" aria-modal="true" aria-labelledby="client-payment-quick-project-title" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Escape') closeQuickProjectDialog(); }}>
            <header className="project-modal-header">
              <div><p className="eyebrow">New project</p><h2 id="client-payment-quick-project-title">Create project</h2></div>
              <button type="button" className="project-modal-close" aria-label="Close Create project" onClick={closeQuickProjectDialog}><span aria-hidden="true">×</span></button>
            </header>
            <div className="project-modal-body">
              <form className="admin-form project-modal-form" onSubmit={quickProjectForm.handleSubmit(submitQuickProject)} noValidate>
                <div className="project-form-grid project-modal-grid">
                  <label>Project name<input autoFocus {...quickProjectForm.register('name')} /></label>
                  <div className="project-client-field">
                    <label htmlFor="client-payment-quick-project-client-search">Client</label>
                    <div className="project-client-search-row">
                      <div className="project-client-combobox" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setQuickProjectClientPickerOpen(false); }}>
                        <input
                          id="client-payment-quick-project-client-search"
                          type="search"
                          role="combobox"
                          aria-autocomplete="list"
                          aria-controls="client-payment-quick-project-client-options"
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
                          <div id="client-payment-quick-project-client-options" className="project-client-options" role="listbox" aria-label="Active clients">
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
                  <label>Commercial model<select {...quickProjectForm.register('projectModel')}><option value="FIXED_PRICE">Fixed Price</option><option value="COST_PLUS_PERCENTAGE">Cost + Percentage</option></select></label>
                  <label>Project value<input inputMode="decimal" {...quickProjectForm.register('projectValue')} /></label>
                  {quickProjectModel === 'COST_PLUS_PERCENTAGE' ? <label>Cost + percent<input inputMode="decimal" {...quickProjectForm.register('costPlusPercent')} /></label> : null}
                  <label>Currency<input maxLength={3} {...quickProjectForm.register('currency')} /></label>
                  <label>Start date<input type="date" {...quickProjectForm.register('startDate')} /></label>
                  <label>Planned end date<input type="date" {...quickProjectForm.register('plannedEndDate')} /></label>
                  <label className="project-form-wide">Location (optional)<input {...quickProjectForm.register('location')} /></label>
                </div>
                <p className="muted project-edit-note">Create the Project first. Assign its Site Manager afterward from Administration → Users.</p>
                {Object.values(quickProjectForm.formState.errors).map((error, index) => <span className="field-error" key={index}>{error?.message}</span>)}
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

      <section className="admin-card">
        <div className="section-heading compact-heading"><h2>Client Receipt register</h2><span className="muted">Total {receiptQuery.data?.total ?? 0} · Page {receiptQuery.data?.page ?? 1} · Page size {receiptQuery.data?.pageSize ?? 100}</span></div>
        <p className="muted">Filter the same register to review Client or Project payment history. Received, allocated and advance balances below come directly from Module 16.</p>
        <div className="two-column-form">
          {props.canReadClients && <label>Client filter<select value={clientFilter} onChange={(event) => { setClientFilter(event.target.value); setProjectFilter(''); }}><option value="">All clients</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.code} · {client.displayName}</option>)}</select></label>}
          <label>Project filter<select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="">All allowed Projects</option>{filteredProjects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}</select></label>
          <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as '' | 'POSTED' | 'REVERSED')}><option value="">All</option><option value="POSTED">Posted</option><option value="REVERSED">Reversed</option></select></label>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Receipt</th><th>Date</th><th>Client</th><th>Project</th><th>Type</th><th>Received</th><th>Allocated</th><th>Unapplied / direct</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {(receiptQuery.data?.items ?? []).map((receipt) => (
                <tr key={receipt.id}>
                  <td>{receipt.receiptNo}</td><td>{receipt.receiptDate}</td><td>{clientLabel(receipt.clientId)}</td><td>{projectLabel(receipt.projectId)}</td><td>{receipt.receiptType}</td>
                  <td>{displayMoney(receipt.amount)}</td><td>{displayMoney(receipt.allocatedAmount)}</td><td>{displayMoney(receipt.unallocatedAmount)}</td><td>{receipt.status}</td>
                  <td>
                    <div className="admin-actions">
                      <button type="button" className="secondary-button" onClick={() => openReceiptDetails(receipt.id)}>View</button>
                      <PaymentProofActions id={receipt.id} paymentNo={receipt.receiptNo} projectId={receipt.projectId} resourceType="client_receipt" titlePrefix="Client payment proof" category="client_receipt" canRead={props.canReadDocuments} canEdit={props.view !== 'ledger' && props.canUploadDocuments && props.canLinkDocuments && props.canVersionDocuments} />
                      {props.canCreate && props.canReverse && props.canAllocate && receipt.status === 'POSTED'
                        ? <button type="button" className="secondary-button" onClick={() => openReceiptEditor(receipt)}>Edit payment</button>
                        : null}
                    </div>
                  </td>
                </tr>
              ))}
              {(receiptQuery.data?.items.length ?? 0) === 0 && <tr><td colSpan={10} className="muted">No Client Receipts match the current filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {editingReceipt && (
        <div className="finance-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingReceipt(null); }}>
          <section className="finance-modal finance-modal-wide" role="dialog" aria-modal="true" aria-labelledby="client-payment-edit-title">
            <header className="finance-modal-header">
              <div>
                <p className="eyebrow">Correct client payment</p>
                <h2 id="client-payment-edit-title">Edit {editingReceipt.receiptNo}</h2>
                <p>The posted record stays in the audit trail as reversed; a corrected replacement is posted atomically.</p>
              </div>
              <button type="button" className="finance-modal-close" autoFocus aria-label="Close payment editor" onClick={() => setEditingReceipt(null)}>×</button>
            </header>
            <div className="finance-modal-body">
              <form className="admin-form" onSubmit={editForm.handleSubmit(submitReceiptCorrection)}>
                <div className="two-column-form">
                  <label>Client
                    <select {...editForm.register('clientId', { onChange: () => { editForm.setValue('projectId', ''); editForm.setValue('stageId', ''); editForm.setValue('clientInvoiceId', ''); } })}>
                      <option value="">Select client</option>
                      {clients.map((client) => <option key={client.id} value={client.id}>{client.code} · {client.displayName}</option>)}
                    </select>
                    <span className="field-error">{editForm.formState.errors.clientId?.message}</span>
                  </label>
                  <label>Project
                    <select {...editForm.register('projectId', { onChange: (event) => {
                      const project = projects.find((item) => item.id === event.target.value);
                      if (project) editForm.setValue('clientId', project.clientId, { shouldValidate: true });
                      editForm.setValue('stageId', '');
                      editForm.setValue('clientInvoiceId', '');
                    } })}>
                      <option value="">Select project</option>
                      {projects.filter((project) => !editClientId || project.clientId === editClientId).map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}
                    </select>
                    <span className="field-error">{editForm.formState.errors.projectId?.message}</span>
                  </label>
                  <label>Stage (optional)
                    <select {...editForm.register('stageId')} disabled={!editProjectId || !props.canReadStages}>
                      <option value="">Project level</option>
                      {(editStagesQuery.data?.items ?? []).map((stage) => <option key={stage.id} value={stage.id}>{stage.code} · {stage.name}</option>)}
                    </select>
                  </label>
                  <label>Receipt date<input type="date" {...editForm.register('receiptDate')} /><span className="field-error">{editForm.formState.errors.receiptDate?.message}</span></label>
                  <label>Amount<input inputMode="decimal" {...editForm.register('amount')} /><span className="field-error">{editForm.formState.errors.amount?.message}</span></label>
                  <label>Payment method
                    <select {...editForm.register('paymentMethod', { onChange: () => editForm.setValue('cashBankAccountId', '') })}><option value="BANK">Bank</option><option value="CASH">Cash</option></select>
                  </label>
                  <label>Cash / Bank account
                    <select {...editForm.register('cashBankAccountId')} disabled={!props.canReadFinance}>
                      <option value="">Select matching account</option>
                      {editAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name} · Balance {displayMoney(account.balance)}</option>)}
                    </select>
                    <span className="field-error">{editForm.formState.errors.cashBankAccountId?.message}</span>
                  </label>
                  <label>Client Invoice (optional)
                    <select {...editForm.register('clientInvoiceId')} disabled={!editProjectId || !props.canReadInvoices}>
                      <option value="">Direct payment (no invoice)</option>
                      {editInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNo} · Total {displayMoney(invoice.totalAmount)} · Current due {displayMoney(invoice.outstandingAmount)}</option>)}
                    </select>
                    <span className="field-error">{editForm.formState.errors.clientInvoiceId?.message}</span>
                  </label>
                  <label>Reference (optional)<input {...editForm.register('reference')} /></label>
                  <label>Replacement evidence (optional)
                    <input key={editEvidenceInputKey} type="file" accept="image/jpeg,image/png,application/pdf" disabled={!props.canUploadDocuments || !props.canLinkDocuments} onChange={(event) => setEditEvidence(event.target.files?.[0] ?? null)} />
                    <small className="muted">Existing evidence remains with the reversed record for audit. Attach corrected evidence here if needed.</small>
                  </label>
                  <input type="hidden" {...editForm.register('receiptType')} />
                </div>
                {editingReceipt.allocations.length > 1 ? <div className="form-error" role="alert">This payment has multiple Invoice allocations. Saving removes those allocations and applies the full corrected amount only to the Invoice selected above, or leaves it as a direct payment.</div> : null}
                <div className="admin-actions">
                  <button type="submit" disabled={correctReceipt.isPending || uploadReceiptDocument.isPending || linkReceiptDocument.isPending}>{correctReceipt.isPending ? 'Posting correction…' : 'Save corrected payment'}</button>
                  <button type="button" className="secondary-button" onClick={() => setEditingReceipt(null)}>Cancel</button>
                </div>
                {mutationMessage(correctReceipt.error) ? <div className="form-error" role="alert">{mutationMessage(correctReceipt.error)}</div> : null}
              </form>
            </div>
          </section>
        </div>
      )}

      {selectedReceiptId && (
        <div className="finance-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedReceiptId(null); }}>
          <section className="finance-modal finance-modal-wide" role="dialog" aria-modal="true" aria-labelledby="client-payment-detail-title">
            <header className="finance-modal-header">
              <div>
                <p className="eyebrow">Client payment</p>
                <h2 id="client-payment-detail-title">{receiptDetailQuery.data?.receiptNo ?? 'Payment details'}</h2>
                {receiptDetailQuery.data ? <p>{receiptDetailQuery.data.receiptDate} · {receiptDetailQuery.data.paymentMethod} · {receiptDetailQuery.data.status}</p> : null}
              </div>
              <button type="button" className="finance-modal-close" autoFocus aria-label="Close payment details" onClick={() => setSelectedReceiptId(null)}>×</button>
            </header>
            <div className="finance-modal-body">
              {receiptDetailQuery.isPending ? <p className="finance-modal-state">Loading payment details…</p> : null}
              {receiptDetailQuery.error instanceof Error ? <div className="form-error" role="alert">{receiptDetailQuery.error.message}</div> : null}
              {receiptDetailQuery.data ? (
                <div className="admin-stack">
                  <dl className="summary-grid client-payment-summary-grid">
                    <div><dt>Client</dt><dd>{clientLabel(receiptDetailQuery.data.clientId)}</dd></div>
                    <div><dt>Project</dt><dd>{projectLabel(receiptDetailQuery.data.projectId)}</dd></div>
                    <div><dt>Stage</dt><dd>{stageLabel(receiptDetailQuery.data.stageId)}</dd></div>
                    <div><dt>Received</dt><dd>{displayMoney(receiptDetailQuery.data.amount)}</dd></div>
                    <div><dt>Allocated</dt><dd>{displayMoney(receiptDetailQuery.data.allocatedAmount)}</dd></div>
                    <div><dt>Advance / unallocated</dt><dd>{displayMoney(receiptDetailQuery.data.unallocatedAmount)}</dd></div>
                    <div><dt>Account</dt><dd>{cashBankNames.get(receiptDetailQuery.data.cashBankAccountId) ?? 'Selected account'}</dd></div>
                    <div><dt>Reference</dt><dd>{receiptDetailQuery.data.reference ?? 'No reference'}</dd></div>
                    <div><dt>Payment type</dt><dd>{receiptDetailQuery.data.receiptType === 'INVOICE_PAYMENT' ? 'Invoice payment' : 'Direct / advance'}</dd></div>
                  </dl>
                  <p className="muted">Created {new Date(receiptDetailQuery.data.createdAt).toLocaleString()} · Posted {receiptDetailQuery.data.postedAt ? new Date(receiptDetailQuery.data.postedAt).toLocaleString() : '—'}</p>
                  <div className="admin-actions">
                    {props.canReadDocuments ? <button type="button" className="secondary-button" disabled={downloadingReceiptId === receiptDetailQuery.data.id} onClick={() => void downloadReceiptEvidence(receiptDetailQuery.data!)}>{downloadingReceiptId === receiptDetailQuery.data.id ? 'Downloading…' : 'Download evidence'}</button> : null}
                    {props.canAllocate && receiptDetailQuery.data.status === 'POSTED' && Number(receiptDetailQuery.data.unallocatedAmount) > 0 ? <button type="button" onClick={() => { setAllocationReceipt(receiptDetailQuery.data!); allocationForm.reset({ clientInvoiceId: '', amount: '' }); setSelectedReceiptId(null); }}>Allocate</button> : null}
                    {props.canReverse && receiptDetailQuery.data.status === 'POSTED' && receiptDetailQuery.data.allocations.length === 0 ? <button type="button" className="secondary-button" disabled={reverseReceipt.isPending} onClick={() => void reverseSelectedReceipt(receiptDetailQuery.data!)}>Reverse receipt</button> : null}
                  </div>
                  {evidenceMessage ? <p className="muted">{evidenceMessage}</p> : null}
                  {evidenceError ? <div className="form-error" role="alert">{evidenceError}</div> : null}
                  <div>
                    <h3>Invoice allocations</h3>
                    <div className="table-wrap"><table className="admin-table"><thead><tr><th>Invoice</th><th>Allocated</th><th>Allocated at</th><th>Action</th></tr></thead><tbody>
                      {receiptDetailQuery.data.allocations.map((allocation) => <tr key={allocation.id}><td>{invoiceLabel(allocation.clientInvoiceId)}</td><td>{displayMoney(allocation.amount)}</td><td>{new Date(allocation.allocatedAt).toLocaleString()}</td><td>{props.canAllocate && receiptDetailQuery.data?.status === 'POSTED' ? <button type="button" className="secondary-button" disabled={unallocateReceipt.isPending} onClick={() => void reverseAllocation(allocation.id)}>Unallocate</button> : '—'}</td></tr>)}
                      {receiptDetailQuery.data.allocations.length === 0 && <tr><td colSpan={4} className="muted">No active Invoice allocations.</td></tr>}
                    </tbody></table></div>
                  </div>
                  {mutationMessage(unallocateReceipt.error) && <p className="field-error">{mutationMessage(unallocateReceipt.error)}</p>}
                  {mutationMessage(reverseReceipt.error) && <p className="field-error">{mutationMessage(reverseReceipt.error)}</p>}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      )}

      {allocationReceipt && props.canAllocate && (
        <section className="admin-card">
          <h2>Allocate {allocationReceipt.receiptNo}</h2>
          <p className="muted">Available receipt amount: {displayMoney(allocationReceipt.unallocatedAmount)}. Select an issued Invoice from the same Project; the server rechecks current Invoice outstanding and prevents over-allocation.</p>
          {props.canReadInvoices ? (
            <form className="admin-form two-column-form" onSubmit={allocationForm.handleSubmit(submitAllocation)}>
              <label>Issued Client Invoice
                <select {...allocationForm.register('clientInvoiceId')}>
                  <option value="">Select invoice</option>
                  {(allocationInvoicesQuery.data?.items ?? []).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNo} · Billed {displayMoney(invoice.totalAmount)}</option>)}
                </select>
                <span className="field-error">{allocationForm.formState.errors.clientInvoiceId?.message}</span>
              </label>
              <label>Allocation amount<input inputMode="decimal" {...allocationForm.register('amount')} /><span className="field-error">{allocationForm.formState.errors.amount?.message}</span></label>
              <div className="admin-actions"><button type="submit" disabled={allocateReceipt.isPending}>{allocateReceipt.isPending ? 'Allocating…' : 'Allocate receipt'}</button><button type="button" className="secondary-button" onClick={() => setAllocationReceipt(null)}>Cancel</button></div>
            </form>
          ) : <p className="muted">Client Invoice read access is required for safe Invoice selection; this UI does not accept raw Invoice IDs.</p>}
          {mutationMessage(allocateReceipt.error) && <p className="field-error">{mutationMessage(allocateReceipt.error)}</p>}
        </section>
      )}
    </div>
  );
}
