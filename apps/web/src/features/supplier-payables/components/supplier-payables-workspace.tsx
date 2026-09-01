import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useCashBankAccounts, useFinanceAccounts } from '../../finance/hooks/finance.js';
import { useProcurementPurchaseOrders } from '../../procurement/hooks/procurement.js';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useProjects } from '../../projects/hooks/projects.js';
import { useVendors } from '../../vendors-subcontractors/hooks/vendors-subcontractors.js';
import type { SupplierInvoice, SupplierPayment } from '../api/supplier-payables-api.js';
import {
  useAllocateSupplierPayment,
  useCreateSupplierInvoice,
  useCreateSupplierPayment,
  usePostSupplierInvoice,
  useSupplierAging,
  useSupplierInvoice,
  useSupplierInvoices,
  useSupplierPayments
} from '../hooks/supplier-payables.js';

const uuidSchema = z.string().uuid('Select a valid value.');
const optionalUuidSchema = z.string().refine((value) => value === '' || uuidSchema.safeParse(value).success, 'Use a valid UUID or leave blank.');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select a valid date.');
const positiveMoneySchema = z.string().trim().regex(/^(?:[1-9]\d{0,15})(?:\.\d{1,2})?$|^0\.(?:0[1-9]|[1-9]\d?)$/, 'Enter a positive amount with up to 2 decimals.');
const nonNegativeMoneySchema = z.string().trim().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/, 'Enter a non-negative amount with up to 2 decimals.');

const invoiceFormSchema = z.object({
  vendorId: uuidSchema,
  projectId: uuidSchema,
  invoiceNo: z.string().trim().min(1, 'Supplier invoice number is required.').max(150),
  invoiceDate: dateSchema,
  dueDate: z.string(),
  purchaseOrderId: optionalUuidSchema,
  goodsReceiptId: optionalUuidSchema,
  taxAmount: nonNegativeMoneySchema,
  lines: z.array(z.object({
    stageId: optionalUuidSchema,
    description: z.string().trim().min(1, 'Description is required.').max(4000),
    amount: positiveMoneySchema,
    expenseOrInventoryAccountId: uuidSchema
  })).min(1, 'Add at least one invoice line.')
}).superRefine((value, context) => {
  if (value.dueDate && !dateSchema.safeParse(value.dueDate).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDate'], message: 'Select a valid due date or leave blank.' });
  }
  if (value.dueDate && value.dueDate < value.invoiceDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDate'], message: 'Due date cannot be earlier than invoice date.' });
  }
});

const paymentFormSchema = z.object({
  vendorId: uuidSchema,
  projectId: optionalUuidSchema,
  paymentDate: dateSchema,
  amount: positiveMoneySchema,
  cashBankAccountId: uuidSchema,
  reference: z.string().trim().max(200)
});

const allocationFormSchema = z.object({
  supplierInvoiceId: uuidSchema,
  amount: positiveMoneySchema
});

type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;
type PaymentFormValues = z.infer<typeof paymentFormSchema>;
type AllocationFormValues = z.infer<typeof allocationFormSchema>;
type WorkspaceTab = 'invoices' | 'payments' | 'aging';

type SupplierPayablesWorkspaceProps = Readonly<{
  canRead: boolean;
  canCreateInvoice: boolean;
  canPostInvoice: boolean;
  canCreatePayment: boolean;
  canAllocatePayment: boolean;
  canReadProjects: boolean;
  canReadStages: boolean;
  canReadVendors: boolean;
  canReadProcurement: boolean;
  canReadFinance: boolean;
}>;

const EMPTY_INVOICE_FORM: InvoiceFormValues = {
  vendorId: '',
  projectId: '',
  invoiceNo: '',
  invoiceDate: '',
  dueDate: '',
  purchaseOrderId: '',
  goodsReceiptId: '',
  taxAmount: '0.00',
  lines: [{ stageId: '', description: '', amount: '', expenseOrInventoryAccountId: '' }]
};

const EMPTY_PAYMENT_FORM: PaymentFormValues = {
  vendorId: '',
  projectId: '',
  paymentDate: '',
  amount: '',
  cashBankAccountId: '',
  reference: ''
};

/** Return a safe message for one failed browser mutation. */
function mutationMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

/** Convert one money string to a readable fixed two-decimal display. */
function displayMoney(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value;
}

/** Render the focused Supplier Payables invoices, payments and aging workspace. */
export function SupplierPayablesWorkspace(props: SupplierPayablesWorkspaceProps) {
  const [tab, setTab] = useState<WorkspaceTab>('invoices');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<SupplierPayment | null>(null);
  const [vendorFilter, setVendorFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'' | 'DRAFT' | 'POSTED'>('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'' | 'DRAFT' | 'POSTED'>('');
  const [agingAsOfDate, setAgingAsOfDate] = useState('');

  const projectsQuery = useProjects({ page: 1, pageSize: 100 }, props.canReadProjects);
  const vendorsQuery = useVendors({ status: 'ACTIVE', page: 1, pageSize: 100 }, props.canReadVendors);
  const projects = projectsQuery.data?.items ?? [];
  const vendors = vendorsQuery.data?.items ?? [];

  const invoiceForm = useForm<InvoiceFormValues>({ resolver: zodResolver(invoiceFormSchema), defaultValues: EMPTY_INVOICE_FORM });
  const invoiceLines = useFieldArray({ control: invoiceForm.control, name: 'lines' });
  const watchedInvoiceProjectId = invoiceForm.watch('projectId');
  const watchedInvoiceVendorId = invoiceForm.watch('vendorId');
  const stagesQuery = useProjectStages(watchedInvoiceProjectId || null, props.canReadStages && watchedInvoiceProjectId !== '');
  const purchaseOrdersQuery = useProcurementPurchaseOrders(watchedInvoiceProjectId || null, props.canReadProcurement && watchedInvoiceProjectId !== '');
  const financeAccountsQuery = useFinanceAccounts({ page: 1, pageSize: 100 }, props.canReadFinance);

  const availablePurchaseOrders = useMemo(() => (
    (purchaseOrdersQuery.data?.items ?? []).filter((purchaseOrder) => !watchedInvoiceVendorId || purchaseOrder.vendorId === watchedInvoiceVendorId)
  ), [purchaseOrdersQuery.data?.items, watchedInvoiceVendorId]);
  const availableInvoiceAccounts = useMemo(() => (
    (financeAccountsQuery.data?.items ?? []).filter((account) => account.status === 'ACTIVE' && ['EXPENSE', 'ASSET'].includes(account.accountType.toUpperCase()))
  ), [financeAccountsQuery.data?.items]);

  const invoiceQuery = useSupplierInvoices({
    ...(vendorFilter ? { vendorId: vendorFilter } : {}),
    ...(projectFilter ? { projectId: projectFilter } : {}),
    ...(invoiceStatusFilter ? { status: invoiceStatusFilter } : {}),
    page: 1,
    pageSize: 100
  }, props.canRead);
  const invoiceDetailQuery = useSupplierInvoice(selectedInvoiceId, props.canRead);
  const createInvoice = useCreateSupplierInvoice();
  const postInvoice = usePostSupplierInvoice();

  const paymentForm = useForm<PaymentFormValues>({ resolver: zodResolver(paymentFormSchema), defaultValues: EMPTY_PAYMENT_FORM });
  const cashBankQuery = useCashBankAccounts({ page: 1, pageSize: 100, status: 'ACTIVE' }, props.canReadFinance);
  const paymentQuery = useSupplierPayments({
    ...(vendorFilter ? { vendorId: vendorFilter } : {}),
    ...(projectFilter ? { projectId: projectFilter } : {}),
    ...(paymentStatusFilter ? { status: paymentStatusFilter } : {}),
    page: 1,
    pageSize: 100
  }, props.canRead);
  const createPayment = useCreateSupplierPayment();
  const allocatePayment = useAllocateSupplierPayment(selectedPayment?.id ?? null);
  const allocationForm = useForm<AllocationFormValues>({ resolver: zodResolver(allocationFormSchema), defaultValues: { supplierInvoiceId: '', amount: '' } });

  const agingQuery = useSupplierAging({
    ...(vendorFilter ? { vendorId: vendorFilter } : {}),
    ...(projectFilter ? { projectId: projectFilter } : {}),
    ...(agingAsOfDate ? { asOfDate: agingAsOfDate } : {}),
    page: 1,
    pageSize: 100
  }, props.canRead);
  const allocationAgingQuery = useSupplierAging({
    ...(selectedPayment?.vendorId ? { vendorId: selectedPayment.vendorId } : {}),
    ...(selectedPayment?.projectId ? { projectId: selectedPayment.projectId } : {}),
    page: 1,
    pageSize: 100
  }, props.canRead && selectedPayment !== null);
  const allocationInvoiceOptions = useMemo(() => (
    (allocationAgingQuery.data?.items ?? []).filter((row) => Number(row.outstandingAmount) > 0)
  ), [allocationAgingQuery.data?.items]);

  useEffect(() => {
    if (!selectedInvoiceId && invoiceQuery.data?.items[0]) setSelectedInvoiceId(invoiceQuery.data.items[0].id);
  }, [invoiceQuery.data?.items, selectedInvoiceId]);

  /** Create one DRAFT Supplier Invoice from the validated editor. */
  async function submitInvoice(values: InvoiceFormValues): Promise<void> {
    const created = await createInvoice.mutateAsync({
      vendorId: values.vendorId,
      projectId: values.projectId,
      invoiceNo: values.invoiceNo.trim(),
      invoiceDate: values.invoiceDate,
      dueDate: values.dueDate || null,
      purchaseOrderId: values.purchaseOrderId || null,
      goodsReceiptId: values.goodsReceiptId || null,
      taxAmount: values.taxAmount,
      lines: values.lines.map((line) => ({
        stageId: line.stageId || null,
        description: line.description.trim(),
        amount: line.amount,
        expenseOrInventoryAccountId: line.expenseOrInventoryAccountId
      }))
    });
    setSelectedInvoiceId(created.id);
    invoiceForm.reset(EMPTY_INVOICE_FORM);
  }

  /** Post the selected DRAFT Supplier Invoice through the explicit server command. */
  async function postSelectedInvoice(invoice: SupplierInvoice): Promise<void> {
    await postInvoice.mutateAsync(invoice.id);
    setSelectedInvoiceId(invoice.id);
  }

  /** Create and post one Supplier Payment through the single documented payment command. */
  async function submitPayment(values: PaymentFormValues): Promise<void> {
    const created = await createPayment.mutateAsync({
      vendorId: values.vendorId,
      projectId: values.projectId || null,
      paymentDate: values.paymentDate,
      amount: values.amount,
      cashBankAccountId: values.cashBankAccountId,
      reference: values.reference.trim() || null
    });
    setSelectedPayment(created);
    paymentForm.reset(EMPTY_PAYMENT_FORM);
  }

  /** Append one allocation from the selected posted Supplier Payment to one posted Supplier Invoice. */
  async function submitAllocation(values: AllocationFormValues): Promise<void> {
    if (!selectedPayment) return;
    await allocatePayment.mutateAsync({ allocations: [{ supplierInvoiceId: values.supplierInvoiceId, amount: values.amount }] });
    allocationForm.reset({ supplierInvoiceId: '', amount: '' });
  }

  if (!props.canRead) {
    return <section className="admin-card"><p>You do not have Supplier Payables read access.</p></section>;
  }

  return (
    <div className="admin-stack">
      <section className="admin-card">
        <div className="button-row" role="tablist" aria-label="Supplier Payables views">
          <button type="button" className={tab === 'invoices' ? 'nav-button active' : 'nav-button'} onClick={() => setTab('invoices')}>Invoices</button>
          <button type="button" className={tab === 'payments' ? 'nav-button active' : 'nav-button'} onClick={() => setTab('payments')}>Payments</button>
          <button type="button" className={tab === 'aging' ? 'nav-button active' : 'nav-button'} onClick={() => setTab('aging')}>Outstanding &amp; Aging</button>
        </div>
        <div className="admin-form two-column-form">
          <label>Vendor filter
            <select value={vendorFilter} onChange={(event) => setVendorFilter(event.target.value)}>
              <option value="">All vendors</option>
              {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.code} · {vendor.displayName}</option>)}
            </select>
          </label>
          <label>Project filter
            <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
              <option value="">All allowed projects</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}
            </select>
          </label>
        </div>
      </section>

      {tab === 'invoices' && (
        <>
          {props.canCreateInvoice && (
            <section className="admin-card">
              <h2>New Supplier Invoice</h2>
              <p className="muted">Totals are calculated by the server. PO and Goods Receipt links remain references to Procurement-owned source documents.</p>
              <form className="admin-form" onSubmit={invoiceForm.handleSubmit(submitInvoice)}>
                <div className="two-column-form">
                  <label>Vendor
                    <select {...invoiceForm.register('vendorId')}>
                      <option value="">Select vendor</option>
                      {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.code} · {vendor.displayName}</option>)}
                    </select>
                    <span className="field-error">{invoiceForm.formState.errors.vendorId?.message}</span>
                  </label>
                  <label>Project
                    <select {...invoiceForm.register('projectId')}>
                      <option value="">Select project</option>
                      {projects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}
                    </select>
                    <span className="field-error">{invoiceForm.formState.errors.projectId?.message}</span>
                  </label>
                  <label>Supplier invoice no.<input {...invoiceForm.register('invoiceNo')} /></label>
                  <label>Invoice date<input type="date" {...invoiceForm.register('invoiceDate')} /></label>
                  <label>Due date (optional)<input type="date" {...invoiceForm.register('dueDate')} /></label>
                  <label>Purchase Order (optional)
                    <select {...invoiceForm.register('purchaseOrderId')}>
                      <option value="">No PO</option>
                      {availablePurchaseOrders.map((purchaseOrder) => <option key={purchaseOrder.id} value={purchaseOrder.id}>{purchaseOrder.poNo} · {purchaseOrder.status}</option>)}
                    </select>
                  </label>
                  <label>Goods Receipt ID (optional)
                    <input placeholder="UUID from Procurement receipt detail" {...invoiceForm.register('goodsReceiptId')} />
                    <small className="muted">Module 10 has no Goods Receipt list route, so this screen does not invent one.</small>
                  </label>
                  <label>Tax amount<input inputMode="decimal" {...invoiceForm.register('taxAmount')} /></label>
                </div>

                <h3>Invoice lines</h3>
                {invoiceLines.fields.map((field, index) => (
                  <div className="admin-card" key={field.id}>
                    <div className="two-column-form">
                      <label>Description<input {...invoiceForm.register(`lines.${index}.description`)} /></label>
                      <label>Amount<input inputMode="decimal" {...invoiceForm.register(`lines.${index}.amount`)} /></label>
                      <label>Stage (optional)
                        <select {...invoiceForm.register(`lines.${index}.stageId`)}>
                          <option value="">Project level</option>
                          {(stagesQuery.data?.items ?? []).map((stage) => <option key={stage.id} value={stage.id}>{stage.code} · {stage.name}</option>)}
                        </select>
                      </label>
                      <label>Expense / Inventory account
                        <select {...invoiceForm.register(`lines.${index}.expenseOrInventoryAccountId`)}>
                          <option value="">Select GL account</option>
                          {availableInvoiceAccounts.map((account) => <option key={account.id} value={account.id}>{account.accountCode} · {account.name} ({account.accountType})</option>)}
                        </select>
                      </label>
                    </div>
                    {invoiceLines.fields.length > 1 && <button type="button" className="secondary-button" onClick={() => invoiceLines.remove(index)}>Remove line</button>}
                  </div>
                ))}
                <div className="button-row">
                  <button type="button" className="secondary-button" onClick={() => invoiceLines.append({ stageId: '', description: '', amount: '', expenseOrInventoryAccountId: '' })}>Add line</button>
                  <button type="submit" disabled={createInvoice.isPending}>{createInvoice.isPending ? 'Creating…' : 'Create invoice'}</button>
                </div>
                {mutationMessage(createInvoice.error) && <p className="field-error">{mutationMessage(createInvoice.error)}</p>}
              </form>
            </section>
          )}

          <section className="admin-card">
            <div className="section-heading compact-heading">
              <h2>Supplier Invoices</h2>
              <label>Status
                <select value={invoiceStatusFilter} onChange={(event) => setInvoiceStatusFilter(event.target.value as '' | 'DRAFT' | 'POSTED')}>
                  <option value="">All</option><option value="DRAFT">Draft</option><option value="POSTED">Posted</option>
                </select>
              </label>
            </div>
            {invoiceQuery.isPending ? <p>Loading Supplier Invoices…</p> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Invoice</th><th>Date</th><th>Status</th><th>Total</th><th>Project</th><th>Action</th></tr></thead>
                  <tbody>
                    {(invoiceQuery.data?.items ?? []).map((invoice) => (
                      <tr key={invoice.id}>
                        <td>{invoice.invoiceNo}</td><td>{invoice.invoiceDate}</td><td>{invoice.status}</td><td>{displayMoney(invoice.totalAmount)}</td><td>{invoice.projectId}</td>
                        <td><button type="button" className="secondary-button" onClick={() => setSelectedInvoiceId(invoice.id)}>View</button></td>
                      </tr>
                    ))}
                    {(invoiceQuery.data?.items.length ?? 0) === 0 && <tr><td colSpan={6} className="muted">No Supplier Invoices match the current filters.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {invoiceDetailQuery.data && (
            <section className="admin-card">
              <h2>Invoice {invoiceDetailQuery.data.invoiceNo}</h2>
              <p><strong>Status:</strong> {invoiceDetailQuery.data.status} · <strong>Subtotal:</strong> {displayMoney(invoiceDetailQuery.data.subtotal)} · <strong>Tax:</strong> {displayMoney(invoiceDetailQuery.data.taxAmount)} · <strong>Total:</strong> {displayMoney(invoiceDetailQuery.data.totalAmount)}</p>
              <p className="muted">Vendor {invoiceDetailQuery.data.vendorId} · Project {invoiceDetailQuery.data.projectId} · Invoice date {invoiceDetailQuery.data.invoiceDate} · Due {invoiceDetailQuery.data.dueDate ?? '—'} · PO {invoiceDetailQuery.data.purchaseOrderId ?? 'None'} · Goods Receipt {invoiceDetailQuery.data.goodsReceiptId ?? 'None'} · Record {invoiceDetailQuery.data.id}</p>
              <div className="table-wrap">
                <table><thead><tr><th>Description</th><th>Stage</th><th>Account</th><th>Amount</th></tr></thead><tbody>
                  {invoiceDetailQuery.data.lines.map((line) => <tr key={line.id}><td>{line.description}<br /><small>Line {line.id} · Invoice {line.supplierInvoiceId}</small></td><td>{line.stageId ?? 'Project'}</td><td>{line.expenseOrInventoryAccountId ?? 'Not set'}</td><td>{displayMoney(line.amount)}</td></tr>)}
                </tbody></table>
              </div>
              {props.canPostInvoice && invoiceDetailQuery.data.status === 'DRAFT' && (
                <button type="button" onClick={() => void postSelectedInvoice(invoiceDetailQuery.data)} disabled={postInvoice.isPending}>{postInvoice.isPending ? 'Posting…' : 'Post Supplier Invoice'}</button>
              )}
              {mutationMessage(postInvoice.error) && <p className="field-error">{mutationMessage(postInvoice.error)}</p>}
            </section>
          )}
        </>
      )}

      {tab === 'payments' && (
        <>
          {props.canCreatePayment && (
            <section className="admin-card">
              <h2>New Supplier Payment</h2>
              <p className="muted">The documented payment command creates and posts the payment atomically. It reduces Supplier Payable and Cash/Bank through Finance.</p>
              <form className="admin-form" onSubmit={paymentForm.handleSubmit(submitPayment)}>
                <div className="two-column-form">
                  <label>Vendor<select {...paymentForm.register('vendorId')}><option value="">Select vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.code} · {vendor.displayName}</option>)}</select></label>
                  <label>Project (optional)<select {...paymentForm.register('projectId')}><option value="">Company-level payment</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}</select></label>
                  <label>Payment date<input type="date" {...paymentForm.register('paymentDate')} /></label>
                  <label>Amount<input inputMode="decimal" {...paymentForm.register('amount')} /></label>
                  <label>Cash / Bank account<select {...paymentForm.register('cashBankAccountId')}><option value="">Select account</option>{(cashBankQuery.data?.items ?? []).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name} · Balance {displayMoney(account.balance)}</option>)}</select></label>
                  <label>Reference (optional)<input {...paymentForm.register('reference')} /></label>
                </div>
                <button type="submit" disabled={createPayment.isPending}>{createPayment.isPending ? 'Posting payment…' : 'Create & post payment'}</button>
                {mutationMessage(createPayment.error) && <p className="field-error">{mutationMessage(createPayment.error)}</p>}
              </form>
            </section>
          )}

          <section className="admin-card">
            <div className="section-heading compact-heading"><h2>Supplier Payments</h2><label>Status<select value={paymentStatusFilter} onChange={(event) => setPaymentStatusFilter(event.target.value as '' | 'DRAFT' | 'POSTED')}><option value="">All</option><option value="DRAFT">Draft</option><option value="POSTED">Posted</option></select></label></div>
            <div className="table-wrap"><table><thead><tr><th>Payment</th><th>Date</th><th>Status</th><th>Amount</th><th>Reference</th><th>Action</th></tr></thead><tbody>
              {(paymentQuery.data?.items ?? []).map((payment) => <tr key={payment.id}><td>{payment.paymentNo}<br /><small>Vendor {payment.vendorId} · Project {payment.projectId ?? 'Company'} · Cash/Bank {payment.cashBankAccountId} · {payment.id}</small></td><td>{payment.paymentDate}</td><td>{payment.status}</td><td>{displayMoney(payment.amount)}</td><td>{payment.reference ?? '—'}</td><td>{props.canAllocatePayment && payment.status === 'POSTED' ? <button type="button" className="secondary-button" onClick={() => setSelectedPayment(payment)}>Allocate</button> : '—'}</td></tr>)}
              {(paymentQuery.data?.items.length ?? 0) === 0 && <tr><td colSpan={6} className="muted">No Supplier Payments match the current filters.</td></tr>}
            </tbody></table></div>
          </section>

          {props.canAllocatePayment && selectedPayment && (
            <section className="admin-card">
              <h2>Allocate {selectedPayment.paymentNo}</h2>
              <p className="muted">Payment amount: {displayMoney(selectedPayment.amount)}. The server prevents allocations above either the remaining payment or invoice outstanding.</p>
              <form className="admin-form two-column-form" onSubmit={allocationForm.handleSubmit(submitAllocation)}>
                <label>Posted invoice with outstanding
                  <select {...allocationForm.register('supplierInvoiceId')}>
                    <option value="">Select invoice</option>
                    {allocationInvoiceOptions.map((row) => <option key={row.supplierInvoiceId} value={row.supplierInvoiceId}>{row.invoiceNo} · Outstanding {displayMoney(row.outstandingAmount)}</option>)}
                  </select>
                </label>
                <label>Allocation amount<input inputMode="decimal" {...allocationForm.register('amount')} /></label>
                <button type="submit" disabled={allocatePayment.isPending}>{allocatePayment.isPending ? 'Allocating…' : 'Allocate payment'}</button>
              </form>
              {mutationMessage(allocatePayment.error) && <p className="field-error">{mutationMessage(allocatePayment.error)}</p>}
              {allocatePayment.data?.map((allocation) => <p className="muted" key={allocation.id}>Allocation {allocation.id} · Payment {allocation.supplierPaymentId} · Invoice {allocation.supplierInvoiceId} · Amount {displayMoney(allocation.amount)} · Allocated {new Date(allocation.allocatedAt).toLocaleString()}</p>)}
            </section>
          )}
        </>
      )}

      {tab === 'aging' && (
        <section className="admin-card">
          <div className="section-heading compact-heading"><h2>Supplier Outstanding &amp; Aging</h2><label>As of date<input type="date" value={agingAsOfDate} onChange={(event) => setAgingAsOfDate(event.target.value)} /></label></div>
          <p className="muted">Outstanding is derived from POSTED Supplier Invoices minus immutable POSTED-payment allocations. As of: {agingQuery.data?.asOfDate ?? 'current date'}.</p>
          <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Invoice date</th><th>Due</th><th>Total</th><th>Allocated</th><th>Outstanding</th><th>Age days</th></tr></thead><tbody>
            {(agingQuery.data?.items ?? []).map((row) => <tr key={row.supplierInvoiceId}><td>{row.invoiceNo}<br /><small>Invoice {row.supplierInvoiceId} · Vendor {row.vendorId} · Project {row.projectId}</small></td><td>{row.invoiceDate}</td><td>{row.dueDate ?? '—'}</td><td>{displayMoney(row.totalAmount)}</td><td>{displayMoney(row.allocatedAmount)}</td><td>{displayMoney(row.outstandingAmount)}</td><td>{row.ageDays}</td></tr>)}
            {(agingQuery.data?.items.length ?? 0) === 0 && <tr><td colSpan={7} className="muted">No outstanding Supplier Invoices match the current filters.</td></tr>}
          </tbody></table></div>
        </section>
      )}
    </div>
  );
}
