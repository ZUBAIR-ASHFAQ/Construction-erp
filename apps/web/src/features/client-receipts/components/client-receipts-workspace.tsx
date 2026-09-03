import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useClientInvoices } from '../../client-billing/hooks/client-billing.js';
import { useClients } from '../../clients/hooks/clients.js';
import { useCashBankAccounts } from '../../finance/hooks/finance.js';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useProjects } from '../../projects/hooks/projects.js';
import type { ClientReceipt } from '../api/client-receipts-api.js';
import {
  useAllocateClientReceipt,
  useClientReceipt,
  useClientReceipts,
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
  receiptType: z.enum(['ADVANCE', 'INVOICE_PAYMENT'])
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
  receiptType: 'ADVANCE'
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
  const [allocationReceipt, setAllocationReceipt] = useState<ClientReceipt | null>(null);

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

  const allocationProjectId = allocationReceipt?.projectId ?? '';
  const allocationInvoicesQuery = useClientInvoices({ ...(allocationProjectId ? { projectId: allocationProjectId } : {}), status: 'ISSUED', page: 1, pageSize: 100 }, props.canReadInvoices && allocationProjectId !== '');
  const allocationForm = useForm<AllocationForm>({ resolver: zodResolver(allocationFormSchema), defaultValues: { clientInvoiceId: '', amount: '' } });
  const allocateReceipt = useAllocateClientReceipt(allocationReceipt?.id ?? null);
  const unallocateReceipt = useUnallocateClientReceipt(receiptDetailQuery.data?.id ?? null);
  const reverseReceipt = useReverseClientReceipt();

  useEffect(() => {
    if (!selectedReceiptId && receiptQuery.data?.items[0]) setSelectedReceiptId(receiptQuery.data.items[0].id);
  }, [receiptQuery.data?.items, selectedReceiptId]);

  useEffect(() => {
    if (!selectedReceiptProject || receiptClientId === selectedReceiptProject.clientId) return;
    receiptForm.setValue('clientId', selectedReceiptProject.clientId, { shouldValidate: true });
  }, [receiptClientId, receiptForm, selectedReceiptProject]);

  useEffect(() => {
    receiptForm.setValue('cashBankAccountId', '');
  }, [receiptPaymentMethod, receiptForm]);

  /** Create and post one Client Receipt from permission-safe selectors. */
  async function submitReceipt(values: ReceiptForm): Promise<void> {
    const created = await createReceipt.mutateAsync({
      clientId: values.clientId,
      projectId: values.projectId,
      stageId: values.stageId || null,
      receiptDate: values.receiptDate,
      amount: values.amount,
      paymentMethod: values.paymentMethod,
      cashBankAccountId: values.cashBankAccountId,
      reference: values.reference || null,
      receiptType: values.receiptType
    });
    setSelectedReceiptId(created.id);
    receiptForm.reset(EMPTY_RECEIPT_FORM);
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
          <p className="muted">Receipt cash is posted immediately to Cash/Bank and Client Advance. It is not profit, and AR changes only when the receipt is allocated to an issued Client Invoice.</p>
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
              <label>Receipt type<select {...receiptForm.register('receiptType')}><option value="ADVANCE">Advance / unallocated</option><option value="INVOICE_PAYMENT">Invoice payment</option></select></label>
              <label>Reference (optional)<input {...receiptForm.register('reference')} /></label>
            </div>
            <button type="submit" disabled={createReceipt.isPending || !props.canReadProjects || !props.canReadFinance}>{createReceipt.isPending ? 'Posting receipt…' : 'Create & post receipt'}</button>
            {!props.canReadProjects || !props.canReadFinance ? <p className="muted">Project and Finance read access are required for safe selectors; raw IDs are not accepted by this UI.</p> : null}
            {mutationMessage(createReceipt.error) && <p className="field-error">{mutationMessage(createReceipt.error)}</p>}
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
            <thead><tr><th>Receipt</th><th>Date</th><th>Client</th><th>Project</th><th>Type</th><th>Received</th><th>Allocated</th><th>Advance</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {(receiptQuery.data?.items ?? []).map((receipt) => (
                <tr key={receipt.id}>
                  <td>{receipt.receiptNo}</td><td>{receipt.receiptDate}</td><td>{clientLabel(receipt.clientId)}</td><td>{projectLabel(receipt.projectId)}</td><td>{receipt.receiptType}</td>
                  <td>{displayMoney(receipt.amount)}</td><td>{displayMoney(receipt.allocatedAmount)}</td><td>{displayMoney(receipt.unallocatedAmount)}</td><td>{receipt.status}</td>
                  <td><button type="button" className="secondary-button" onClick={() => setSelectedReceiptId(receipt.id)}>View</button></td>
                </tr>
              ))}
              {(receiptQuery.data?.items.length ?? 0) === 0 && <tr><td colSpan={10} className="muted">No Client Receipts match the current filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {receiptDetailQuery.data && (
        <section className="admin-card">
          <div className="module-row">
            <div>
              <h2>{receiptDetailQuery.data.receiptNo}</h2>
              <p className="muted">{receiptDetailQuery.data.receiptDate} · {receiptDetailQuery.data.paymentMethod} · {receiptDetailQuery.data.reference ?? 'No reference'}</p>
            </div>
            <div className="admin-actions">
              {props.canAllocate && receiptDetailQuery.data.status === 'POSTED' && Number(receiptDetailQuery.data.unallocatedAmount) > 0 ? <button type="button" onClick={() => { setAllocationReceipt(receiptDetailQuery.data); allocationForm.reset({ clientInvoiceId: '', amount: '' }); }}>Allocate</button> : null}
              {props.canReverse && receiptDetailQuery.data.status === 'POSTED' && receiptDetailQuery.data.allocations.length === 0 ? <button type="button" className="secondary-button" disabled={reverseReceipt.isPending} onClick={() => void reverseSelectedReceipt(receiptDetailQuery.data!)}>Reverse receipt</button> : null}
            </div>
          </div>
          <div className="summary-grid">
            <div><strong>Client</strong><span>{clientLabel(receiptDetailQuery.data.clientId)}</span></div>
            <div><strong>Project</strong><span>{projectLabel(receiptDetailQuery.data.projectId)}</span></div>
            <div><strong>Received</strong><span>{displayMoney(receiptDetailQuery.data.amount)}</span></div>
            <div><strong>Allocated</strong><span>{displayMoney(receiptDetailQuery.data.allocatedAmount)}</span></div>
            <div><strong>Advance / unallocated</strong><span>{displayMoney(receiptDetailQuery.data.unallocatedAmount)}</span></div>
            <div><strong>Stage</strong><span>{stageLabel(receiptDetailQuery.data.stageId)}</span></div>
          </div>
          <p className="muted">Cash/Bank account {cashBankNames.get(receiptDetailQuery.data.cashBankAccountId) ?? 'Selected account'} · Created {new Date(receiptDetailQuery.data.createdAt).toLocaleString()} · Posted {receiptDetailQuery.data.postedAt ? new Date(receiptDetailQuery.data.postedAt).toLocaleString() : '—'}</p>
          <p className="muted">Outstanding remains an Invoice-level server calculation: billed minus allocated receipts. This screen does not treat cash received as profit.</p>
          <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Allocated</th><th>Allocated at</th><th>Action</th></tr></thead><tbody>
            {receiptDetailQuery.data.allocations.map((allocation) => <tr key={allocation.id}><td>{invoiceLabel(allocation.clientInvoiceId)}</td><td>{displayMoney(allocation.amount)}</td><td>{new Date(allocation.allocatedAt).toLocaleString()}</td><td>{props.canAllocate && receiptDetailQuery.data?.status === 'POSTED' ? <button type="button" className="secondary-button" disabled={unallocateReceipt.isPending} onClick={() => void reverseAllocation(allocation.id)}>Unallocate</button> : '—'}</td></tr>)}
            {receiptDetailQuery.data.allocations.length === 0 && <tr><td colSpan={4} className="muted">No active Invoice allocations.</td></tr>}
          </tbody></table></div>
          {mutationMessage(unallocateReceipt.error) && <p className="field-error">{mutationMessage(unallocateReceipt.error)}</p>}
          {mutationMessage(reverseReceipt.error) && <p className="field-error">{mutationMessage(reverseReceipt.error)}</p>}
        </section>
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
