import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useClientInvoices } from '../../client-billing/hooks/client-billing.js';
import { useClients } from '../../clients/hooks/clients.js';
import { getDocumentDownload, listDocuments } from '../../documents-audit/api/documents-api.js';
import { useCreateDocumentLink, useUploadDocument } from '../../documents-audit/hooks/documents.js';
import { useCashBankAccounts } from '../../finance/hooks/finance.js';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useProjects } from '../../projects/hooks/projects.js';
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

type ReceiptForm = z.infer<typeof receiptFormSchema>;
type AllocationForm = z.infer<typeof allocationFormSchema>;

type ClientReceiptsWorkspaceProps = Readonly<{
  view?: 'payment' | 'ledger';
  canRead: boolean;
  canCreate: boolean;
  canAllocate: boolean;
  canReverse: boolean;
  canReadClients: boolean;
  canReadProjects: boolean;
  canReadStages: boolean;
  canReadFinance: boolean;
  canReadInvoices: boolean;
  canUploadDocuments: boolean;
  canLinkDocuments: boolean;
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
  const [detailEvidence, setDetailEvidence] = useState<File | null>(null);
  const [detailEvidenceInputKey, setDetailEvidenceInputKey] = useState(0);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null);
  const [editEvidence, setEditEvidence] = useState<File | null>(null);
  const [editEvidenceInputKey, setEditEvidenceInputKey] = useState(0);

  const clientsQuery = useClients({ status: 'ACTIVE', page: 1, pageSize: 100 }, props.canReadClients);
  const projectsQuery = useProjects({ page: 1, pageSize: 100 }, props.canReadProjects);
  const clients = clientsQuery.data?.items ?? [];
  const projects = projectsQuery.data?.items ?? [];
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
  const selectedReceiptProject = useMemo(
    () => projects.find((project) => project.id === receiptProjectId) ?? null,
    [projects, receiptProjectId]
  );
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
    () => (cashBankQuery.data?.items ?? []).filter((account) => account.accountType.toUpperCase() === receiptPaymentMethod),
    [cashBankQuery.data?.items, receiptPaymentMethod]
  );
  const cashBankNames = useMemo(() => new Map((cashBankQuery.data?.items ?? []).map((account) => [account.id, account.name])), [cashBankQuery.data?.items]);
  const createReceipt = useCreateClientReceipt();
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
    () => (cashBankQuery.data?.items ?? []).filter((account) => account.accountType.toUpperCase() === editPaymentMethod),
    [cashBankQuery.data?.items, editPaymentMethod]
  );
  const correctReceipt = useCorrectClientReceipt(editingReceipt?.id ?? null);

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
    if (!receiptEvidence) return;
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
      setReceiptEvidence(null);
      setReceiptEvidenceInputKey((value) => value + 1);
    } catch (error) {
      setReceiptEvidence(null);
      setReceiptEvidenceInputKey((value) => value + 1);
      setEvidenceError(`Payment ${created.receiptNo} was posted, but its evidence was not attached. Click View, select the file again and retry: ${error instanceof Error ? error.message : 'Upload failed.'}`);
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
      setEvidenceError(`Corrected payment ${replacement.receiptNo} was posted, but its evidence was not attached. Open it with View to retry: ${error instanceof Error ? error.message : 'Upload failed.'}`);
    } finally {
      setEditEvidence(null);
      setEditEvidenceInputKey((value) => value + 1);
    }
  }

  /** Open one receipt detail dialog and clear messages left by another record. */
  function openReceiptDetails(receiptId: string): void {
    setEvidenceMessage(null);
    setEvidenceError(null);
    setDetailEvidence(null);
    setDetailEvidenceInputKey((value) => value + 1);
    setSelectedReceiptId(receiptId);
  }

  /** Upload or retry an image/PDF for the selected posted Client Payment. */
  async function attachSelectedReceiptEvidence(): Promise<void> {
    const receipt = receiptDetailQuery.data;
    if (!receipt || !detailEvidence || !props.canUploadDocuments || !props.canLinkDocuments) return;
    setEvidenceMessage(null);
    setEvidenceError(null);
    try {
      const uploaded = await uploadReceiptDocument.mutateAsync({
        file: detailEvidence,
        title: `Client payment ${receipt.receiptNo}`,
        category: 'client_receipt',
        projectId: receipt.projectId,
        documentNo: receipt.receiptNo
      });
      await linkReceiptDocument.mutateAsync({
        documentId: uploaded.document.id,
        link: { versionId: uploaded.version.id, resourceType: 'client_receipt', resourceId: receipt.id }
      });
      setEvidenceMessage(`${detailEvidence.name} was uploaded and linked to payment ${receipt.receiptNo}.`);
      setDetailEvidence(null);
      setDetailEvidenceInputKey((value) => value + 1);
    } catch (error) {
      setEvidenceError(error instanceof Error ? error.message : 'The payment evidence could not be attached.');
    }
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
      {props.canCreate && props.view !== 'ledger' && (
        <section className="admin-card">
          <h2>New Client Receipt</h2>
          <p className="muted">Receipt cash is posted immediately to Cash/Bank and Client Advance. It is not profit: this does not treat cash received as profit, and AR changes only when the receipt is allocated to an issued Client Invoice.</p>
          <form className="admin-form" onSubmit={receiptForm.handleSubmit(submitReceipt)}>
            <div className="two-column-form">
              <label>Client
                {props.canReadClients ? (
                  <select {...receiptForm.register('clientId')}>
                    <option value="">Select client</option>
                    {clients.map((client) => <option key={client.id} value={client.id}>{client.code} · {client.displayName}</option>)}
                  </select>
                ) : <><input type="hidden" {...receiptForm.register('clientId')} /><span className="muted">Derived from selected Project</span></>}
                <span className="field-error">{receiptForm.formState.errors.clientId?.message}</span>
              </label>
              <label>Project
                <select {...receiptForm.register('projectId')}>
                  <option value="">Select project</option>
                  {projects.filter((project) => !receiptClientId || project.clientId === receiptClientId).map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}
                </select>
                <span className="field-error">{receiptForm.formState.errors.projectId?.message}</span>
              </label>
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
            <p className="muted">Select a pending Invoice here to create the payment and apply the entered amount in the same server transaction. Leave Direct payment selected to post without an Invoice; existing manual allocation remains available only for later unapplied receipts.</p>
            <button type="submit" disabled={createReceipt.isPending || uploadReceiptDocument.isPending || linkReceiptDocument.isPending || !props.canReadProjects || !props.canReadFinance}>{createReceipt.isPending || uploadReceiptDocument.isPending || linkReceiptDocument.isPending ? 'Saving payment…' : 'Create & post receipt'}</button>
            {!props.canReadProjects || !props.canReadFinance ? <p className="muted">Project and Finance read access are required for safe selectors; raw IDs are not accepted by this UI.</p> : null}
            {mutationMessage(createReceipt.error) && <p className="field-error">{mutationMessage(createReceipt.error)}</p>}
            {evidenceMessage ? <p className="muted">{evidenceMessage}</p> : null}
            {evidenceError ? <div className="form-error" role="alert">{evidenceError}</div> : null}
          </form>
        </section>
      )}

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
                      {props.canCreate && props.canReverse && props.canAllocate && receipt.status === 'POSTED'
                        ? <button type="button" className="secondary-button" onClick={() => openReceiptEditor(receipt)}>Edit</button>
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
                  {props.canUploadDocuments && props.canLinkDocuments ? (
                    <div className="admin-card">
                      <h3>Payment evidence</h3>
                      <p className="muted">Attach a client receipt, bank slip or cash evidence. You can also retry an upload that failed after the payment was posted.</p>
                      <div className="admin-actions">
                        <input key={detailEvidenceInputKey} type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => setDetailEvidence(event.target.files?.[0] ?? null)} />
                        <button type="button" disabled={!detailEvidence || uploadReceiptDocument.isPending || linkReceiptDocument.isPending} onClick={() => void attachSelectedReceiptEvidence()}>{uploadReceiptDocument.isPending || linkReceiptDocument.isPending ? 'Uploading…' : 'Attach image / PDF'}</button>
                      </div>
                    </div>
                  ) : null}
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
