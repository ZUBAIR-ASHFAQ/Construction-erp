import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getDocumentDownload, listDocuments } from '../../documents-audit/api/documents-api.js';
import { useCreateDocumentLink, useUploadDocument } from '../../documents-audit/hooks/documents.js';
import { useCashBankAccounts } from '../../finance/hooks/finance.js';
import { useProcurementPurchaseOrders } from '../../procurement/hooks/procurement.js';
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

// Invoice entry no longer needs useProjectStages or useFinanceAccounts; the server derives those accounting details.

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
    expenseOrInventoryAccountId: optionalUuidSchema
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
  supplierInvoiceId: optionalUuidSchema,
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
  initialTab?: WorkspaceTab;
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
  canUploadDocuments: boolean;
  canLinkDocuments: boolean;
  canReadDocuments: boolean;
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
  supplierInvoiceId: '',
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
  const [tab, setTab] = useState<WorkspaceTab>(props.initialTab ?? 'invoices');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<SupplierPayment | null>(null);
  const [vendorFilter, setVendorFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'' | 'DRAFT' | 'POSTED'>('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'' | 'DRAFT' | 'POSTED'>('');
  const [agingAsOfDate, setAgingAsOfDate] = useState('');
  const [invoiceImage, setInvoiceImage] = useState<File | null>(null);
  const [invoiceImageInputKey, setInvoiceImageInputKey] = useState(0);
  const [attachmentMessage, setAttachmentMessage] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [detailInvoiceImage, setDetailInvoiceImage] = useState<File | null>(null);
  const [detailInvoiceImageInputKey, setDetailInvoiceImageInputKey] = useState(0);
  const [detailAttachmentMessage, setDetailAttachmentMessage] = useState<string | null>(null);
  const [detailAttachmentError, setDetailAttachmentError] = useState<string | null>(null);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const projectsQuery = useProjects({ page: 1, pageSize: 100 }, props.canReadProjects);
  const vendorsQuery = useVendors({ status: 'ACTIVE', page: 1, pageSize: 100 }, props.canReadVendors);
  const projects = projectsQuery.data?.items ?? [];
  const vendors = vendorsQuery.data?.items ?? [];
  const vendorNames = useMemo(() => new Map(vendors.map((vendor) => [vendor.id, vendor.displayName])), [vendors]);
  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);

  const invoiceForm = useForm<InvoiceFormValues>({ resolver: zodResolver(invoiceFormSchema), defaultValues: EMPTY_INVOICE_FORM });
  const invoiceLines = useFieldArray({ control: invoiceForm.control, name: 'lines' });
  const watchedInvoiceProjectId = invoiceForm.watch('projectId');
  const watchedInvoiceVendorId = invoiceForm.watch('vendorId');
  const watchedPurchaseOrderId = invoiceForm.watch('purchaseOrderId');
  const purchaseOrdersQuery = useProcurementPurchaseOrders(watchedInvoiceProjectId || null, props.canReadProcurement && watchedInvoiceProjectId !== '');
  const allPurchaseOrdersQuery = useProcurementPurchaseOrders('', props.canReadProcurement);

  const availablePurchaseOrders = useMemo(() => (
    (purchaseOrdersQuery.data?.items ?? []).filter((purchaseOrder) => (
      purchaseOrder.status.toUpperCase() === 'ISSUED'
      && (!watchedInvoiceVendorId || purchaseOrder.vendorId === watchedInvoiceVendorId)
    ))
  ), [purchaseOrdersQuery.data?.items, watchedInvoiceVendorId]);
  const availableGoodsReceipts = useMemo(() => (
    availablePurchaseOrders
      .find((purchaseOrder) => purchaseOrder.id === watchedPurchaseOrderId)
      ?.goodsReceipts.filter((receipt) => receipt.status.toUpperCase() === 'RECEIVED') ?? []
  ), [availablePurchaseOrders, watchedPurchaseOrderId]);
  const purchaseOrderNames = useMemo(() => new Map((allPurchaseOrdersQuery.data?.items ?? []).map((order) => [order.id, order.poNo])), [allPurchaseOrdersQuery.data?.items]);
  const goodsReceiptNames = useMemo(() => new Map((allPurchaseOrdersQuery.data?.items ?? []).flatMap((order) => order.goodsReceipts.map((receipt) => [receipt.id, receipt.receiptNo] as const))), [allPurchaseOrdersQuery.data?.items]);

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
  const uploadInvoiceDocument = useUploadDocument();
  const linkInvoiceDocument = useCreateDocumentLink();

  const paymentForm = useForm<PaymentFormValues>({ resolver: zodResolver(paymentFormSchema), defaultValues: EMPTY_PAYMENT_FORM });
  const watchedPaymentVendorId = paymentForm.watch('vendorId');
  const watchedPaymentProjectId = paymentForm.watch('projectId');
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
  const allocationInvoicesQuery = useSupplierInvoices({
    ...(selectedPayment?.vendorId ? { vendorId: selectedPayment.vendorId } : {}),
    ...(selectedPayment?.projectId ? { projectId: selectedPayment.projectId } : {}),
    status: 'POSTED',
    page: 1,
    pageSize: 100
  }, props.canRead && selectedPayment !== null);
  const allocationInvoiceOptions = useMemo(() => (
    (allocationInvoicesQuery.data?.items ?? []).filter((invoice) => Number(invoice.outstandingAmount) > 0)
  ), [allocationInvoicesQuery.data?.items]);
  const payableInvoicesQuery = useSupplierInvoices({
    ...(watchedPaymentVendorId ? { vendorId: watchedPaymentVendorId } : {}),
    ...(watchedPaymentProjectId ? { projectId: watchedPaymentProjectId } : {}),
    status: 'POSTED',
    page: 1,
    pageSize: 100
  }, props.canRead && watchedPaymentVendorId !== '' && watchedPaymentProjectId !== '');
  const payableInvoiceOptions = useMemo(() => (
    (payableInvoicesQuery.data?.items ?? []).filter((invoice) => Number(invoice.outstandingAmount) > 0)
  ), [payableInvoicesQuery.data?.items]);

  useEffect(() => {
    if (!selectedInvoiceId && invoiceQuery.data?.items[0]) setSelectedInvoiceId(invoiceQuery.data.items[0].id);
  }, [invoiceQuery.data?.items, selectedInvoiceId]);

  useEffect(() => {
    setDetailInvoiceImage(null);
    setDetailInvoiceImageInputKey((value) => value + 1);
    setDetailAttachmentMessage(null);
    setDetailAttachmentError(null);
  }, [selectedInvoiceId]);

  useEffect(() => {
    const selectedPurchaseOrderId = invoiceForm.getValues('purchaseOrderId');
    if (selectedPurchaseOrderId && !availablePurchaseOrders.some((order) => order.id === selectedPurchaseOrderId)) {
      invoiceForm.setValue('purchaseOrderId', '');
    }
  }, [availablePurchaseOrders, invoiceForm]);

  useEffect(() => {
    const selectedGoodsReceiptId = invoiceForm.getValues('goodsReceiptId');
    if (selectedGoodsReceiptId && !availableGoodsReceipts.some((receipt) => receipt.id === selectedGoodsReceiptId)) {
      invoiceForm.setValue('goodsReceiptId', '');
    }
  }, [availableGoodsReceipts, invoiceForm]);

  /** Create and post one Supplier Invoice so it immediately contributes to payable. */
  async function submitInvoice(values: InvoiceFormValues): Promise<void> {
    setAttachmentMessage(null);
    setAttachmentError(null);
    if (!invoiceImage || !props.canUploadDocuments || !props.canLinkDocuments) {
      setAttachmentError('A supplier invoice image or PDF is required before this invoice can be created and posted.');
      return;
    }
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
        expenseOrInventoryAccountId: line.expenseOrInventoryAccountId || null
      }))
    });
    setSelectedInvoiceId(created.id);
    try {
      const uploaded = await uploadInvoiceDocument.mutateAsync({
        file: invoiceImage,
        title: `Supplier invoice ${created.invoiceNo}`,
        category: 'supplier_invoice',
        projectId: created.projectId,
        documentNo: created.invoiceNo
      });
      await linkInvoiceDocument.mutateAsync({
        documentId: uploaded.document.id,
        link: { versionId: uploaded.version.id, resourceType: 'supplier_invoice', resourceId: created.id }
      });
      if (props.canPostInvoice) await postInvoice.mutateAsync(created.id);
      setAttachmentMessage(`Invoice ${created.invoiceNo} and attachment ${invoiceImage.name} were saved successfully.`);
      setInvoiceImage(null);
      setInvoiceImageInputKey((value) => value + 1);
      invoiceForm.reset(EMPTY_INVOICE_FORM);
    } catch (error) {
      setAttachmentError(`Supplier Invoice ${created.invoiceNo} remains a draft. Attach its image and post it from the invoice details: ${error instanceof Error ? error.message : 'Upload failed.'}`);
    }
  }

  /** Post the selected DRAFT Supplier Invoice through the explicit server command. */
  async function postSelectedInvoice(invoice: SupplierInvoice): Promise<void> {
    await postInvoice.mutateAsync(invoice.id);
    setSelectedInvoiceId(invoice.id);
  }

  /** Upload or retry evidence for an already-created Supplier Invoice. */
  async function attachSelectedInvoiceEvidence(): Promise<void> {
    const invoice = invoiceDetailQuery.data;
    if (!invoice || !detailInvoiceImage || !props.canUploadDocuments || !props.canLinkDocuments) return;
    setDetailAttachmentMessage(null);
    setDetailAttachmentError(null);
    try {
      const uploaded = await uploadInvoiceDocument.mutateAsync({
        file: detailInvoiceImage,
        title: `Supplier invoice ${invoice.invoiceNo}`,
        category: 'supplier_invoice',
        projectId: invoice.projectId,
        documentNo: invoice.invoiceNo
      });
      await linkInvoiceDocument.mutateAsync({
        documentId: uploaded.document.id,
        link: { versionId: uploaded.version.id, resourceType: 'supplier_invoice', resourceId: invoice.id }
      });
      setDetailAttachmentMessage(`${detailInvoiceImage.name} uploaded and linked to invoice ${invoice.invoiceNo}.`);
      setDetailInvoiceImage(null);
      setDetailInvoiceImageInputKey((value) => value + 1);
    } catch (error) {
      setDetailAttachmentError(error instanceof Error ? error.message : 'The invoice image could not be attached.');
    }
  }

  /** Create and post one Supplier Payment through the single documented payment command. */
  async function submitPayment(values: PaymentFormValues): Promise<void> {
    const created = await createPayment.mutateAsync({
      vendorId: values.vendorId,
      supplierInvoiceId: values.supplierInvoiceId || null,
      projectId: values.projectId || null,
      paymentDate: values.paymentDate,
      amount: values.amount,
      cashBankAccountId: values.cashBankAccountId,
      reference: values.reference.trim() || null
    });
    setSelectedPayment(Number(created.remainingAmount) > 0 ? created : null);
    paymentForm.reset(EMPTY_PAYMENT_FORM);
  }

  /** Append one allocation from the selected posted Supplier Payment to one posted Supplier Invoice. */
  async function submitAllocation(values: AllocationFormValues): Promise<void> {
    if (!selectedPayment) return;
    await allocatePayment.mutateAsync({ allocations: [{ supplierInvoiceId: values.supplierInvoiceId, amount: values.amount }] });
    allocationForm.reset({ supplierInvoiceId: '', amount: '' });
    setSelectedPayment(null);
  }

  /** Resolve the linked document and force a local browser download without removing the action. */
  async function downloadInvoiceAttachment(invoice: Readonly<{ id: string; projectId: string; invoiceNo: string }>): Promise<void> {
    setDownloadError(null);
    setDownloadingInvoiceId(invoice.id);
    try {
      const documents = await listDocuments({
        projectId: invoice.projectId,
        resourceType: 'supplier_invoice',
        resourceId: invoice.id,
        page: 1,
        pageSize: 1
      });
      const document = documents.items[0];
      if (!document) throw new Error(`No image or PDF is attached to invoice ${invoice.invoiceNo}.`);
      const download = await getDocumentDownload(document.id);
      const response = await fetch(download.url);
      if (!response.ok) throw new Error(`Invoice file download failed with status ${response.status}.`);
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = window.document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = download.version.originalName || document.fileName || `supplier-invoice-${invoice.invoiceNo}`;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'The invoice attachment could not be downloaded.');
    } finally {
      setDownloadingInvoiceId(null);
    }
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
              <p className="muted">For a Procurement invoice, select its PO and Goods Receipt. For a direct purchase or service, choose Direct invoice (no PO); no receipt is required.</p>
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
                  <label>Supplier invoice no.<input {...invoiceForm.register('invoiceNo')} /><span className="field-error">{invoiceForm.formState.errors.invoiceNo?.message}</span></label>
                  <label>Invoice date<input type="date" {...invoiceForm.register('invoiceDate')} /><span className="field-error">{invoiceForm.formState.errors.invoiceDate?.message}</span></label>
                  <label>Due date (optional)<input type="date" {...invoiceForm.register('dueDate')} /><span className="field-error">{invoiceForm.formState.errors.dueDate?.message}</span></label>
                  <label>Purchase Order (optional)
                    <select {...invoiceForm.register('purchaseOrderId')}>
                      <option value="">Direct invoice (no PO)</option>
                      {availablePurchaseOrders.map((purchaseOrder) => <option key={purchaseOrder.id} value={purchaseOrder.id}>{purchaseOrder.poNo} · {purchaseOrder.status}</option>)}
                    </select>
                  </label>
                  <label>Goods Receipt (optional)
                    {/* Module 10 has no Goods Receipt list route, so this screen does not invent one; receipt choices come from the selected PO. */}
                    <select {...invoiceForm.register('goodsReceiptId')} disabled={!watchedPurchaseOrderId}>
                      <option value="">{watchedPurchaseOrderId ? 'No Goods Receipt' : 'Not applicable for direct invoice'}</option>
                      {availableGoodsReceipts.map((receipt) => (
                        <option key={receipt.id} value={receipt.id}>{receipt.receiptNo} · {new Date(receipt.receivedAt).toLocaleDateString()}</option>
                      ))}
                    </select>
                    <small className="muted">Only received deliveries for the selected issued PO are shown.</small>
                    <span className="field-error">{invoiceForm.formState.errors.goodsReceiptId?.message}</span>
                  </label>
                  <label>Tax amount<input inputMode="decimal" {...invoiceForm.register('taxAmount')} /><span className="field-error">{invoiceForm.formState.errors.taxAmount?.message}</span></label>
                  <label>Supplier invoice image / PDF (required)
                    <input key={invoiceImageInputKey} type="file" accept="image/jpeg,image/png,application/pdf" disabled={!props.canUploadDocuments || !props.canLinkDocuments} onChange={(event) => setInvoiceImage(event.target.files?.[0] ?? null)} />
                    <small className="muted">Every supplier invoice must have its original JPG, PNG or PDF attached before posting.</small>
                  </label>
                </div>

                <h3>Invoice lines</h3>
                {invoiceLines.fields.map((field, index) => (
                  <div className="admin-card" key={field.id}>
                    <div className="two-column-form">
                      <label>Description<input {...invoiceForm.register(`lines.${index}.description`)} /><span className="field-error">{invoiceForm.formState.errors.lines?.[index]?.description?.message}</span></label>
                      <label>Amount<input inputMode="decimal" {...invoiceForm.register(`lines.${index}.amount`)} /><span className="field-error">{invoiceForm.formState.errors.lines?.[index]?.amount?.message}</span></label>
                        <input type="hidden" {...invoiceForm.register(`lines.${index}.stageId`)} />
                        <input type="hidden" {...invoiceForm.register(`lines.${index}.expenseOrInventoryAccountId`)} />
                    </div>
                    {invoiceLines.fields.length > 1 && <button type="button" className="secondary-button" onClick={() => invoiceLines.remove(index)}>Remove line</button>}
                  </div>
                ))}
                <div className="button-row">
                  <button type="button" className="secondary-button" onClick={() => invoiceLines.append({ stageId: '', description: '', amount: '', expenseOrInventoryAccountId: '' })}>Add line</button>
                  <button type="submit" disabled={!invoiceImage || !props.canUploadDocuments || !props.canLinkDocuments || createInvoice.isPending || postInvoice.isPending || uploadInvoiceDocument.isPending || linkInvoiceDocument.isPending}>{createInvoice.isPending || postInvoice.isPending || uploadInvoiceDocument.isPending || linkInvoiceDocument.isPending ? 'Saving invoice…' : props.canPostInvoice ? 'Create invoice & post' : 'Create invoice draft'}</button>
                </div>
                {mutationMessage(createInvoice.error) && <p className="field-error">{mutationMessage(createInvoice.error)}</p>}
                {mutationMessage(postInvoice.error) && <p className="field-error">Invoice was saved as a draft but could not be posted: {mutationMessage(postInvoice.error)}</p>}
                {attachmentMessage && <p className="muted">{attachmentMessage}</p>}
                {attachmentError && <div className="form-error" role="alert">{attachmentError}</div>}
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
                  <thead><tr><th>Invoice</th><th>Date</th><th>Status</th><th>Total</th><th>Allocated</th><th>Outstanding</th><th>Project</th><th>Action</th></tr></thead>
                  <tbody>
                    {(invoiceQuery.data?.items ?? []).map((invoice) => (
                      <tr key={invoice.id}>
                        <td>{invoice.invoiceNo}</td><td>{invoice.invoiceDate}</td><td>{invoice.status}</td><td>{displayMoney(invoice.totalAmount)}</td><td>{displayMoney(invoice.allocatedAmount)}</td><td>{displayMoney(invoice.outstandingAmount)}</td><td>{projectNames.get(invoice.projectId) ?? 'Unknown project'}</td>
                        <td><div className="button-row"><button type="button" className="secondary-button" onClick={() => setSelectedInvoiceId(invoice.id)}>View</button><button type="button" className="secondary-button" disabled={!props.canReadDocuments || downloadingInvoiceId === invoice.id} onClick={() => void downloadInvoiceAttachment(invoice)}>Download</button></div></td>
                      </tr>
                    ))}
                    {(invoiceQuery.data?.items.length ?? 0) === 0 && <tr><td colSpan={8} className="muted">No Supplier Invoices match the current filters.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            {invoiceQuery.error instanceof Error && <div className="form-error" role="alert">{invoiceQuery.error.message}</div>}
            {downloadError && <div className="form-error" role="alert">{downloadError}</div>}
            {purchaseOrdersQuery.error instanceof Error && <div className="form-error" role="alert">Purchase Orders could not be loaded: {purchaseOrdersQuery.error.message}</div>}
          </section>

          {invoiceDetailQuery.data && (
            <section className="admin-card">
              <h2>Invoice {invoiceDetailQuery.data.invoiceNo}</h2>
              <p><strong>Status:</strong> {invoiceDetailQuery.data.status} · <strong>Subtotal:</strong> {displayMoney(invoiceDetailQuery.data.subtotal)} · <strong>Tax:</strong> {displayMoney(invoiceDetailQuery.data.taxAmount)} · <strong>Total:</strong> {displayMoney(invoiceDetailQuery.data.totalAmount)} · <strong>Allocated:</strong> {displayMoney(invoiceDetailQuery.data.allocatedAmount)} · <strong>Outstanding:</strong> {displayMoney(invoiceDetailQuery.data.outstandingAmount)}</p>
              <p className="muted">Supplier {vendorNames.get(invoiceDetailQuery.data.vendorId) ?? 'Unknown supplier'} · Project {projectNames.get(invoiceDetailQuery.data.projectId) ?? 'Unknown project'} · Invoice date {invoiceDetailQuery.data.invoiceDate} · Due {invoiceDetailQuery.data.dueDate ?? '—'} · PO {invoiceDetailQuery.data.purchaseOrderId ? purchaseOrderNames.get(invoiceDetailQuery.data.purchaseOrderId) ?? 'Unknown PO' : 'Direct invoice'} · Goods Receipt {invoiceDetailQuery.data.goodsReceiptId ? goodsReceiptNames.get(invoiceDetailQuery.data.goodsReceiptId) ?? 'Unknown receipt' : 'None'}</p>
              <button type="button" className="secondary-button" disabled={!props.canReadDocuments || downloadingInvoiceId === invoiceDetailQuery.data.id} onClick={() => void downloadInvoiceAttachment(invoiceDetailQuery.data)}>Download attached invoice</button>
              <div className="table-wrap">
                  <table><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody>
                  {invoiceDetailQuery.data.lines.map((line) => <tr key={line.id}><td>{line.description}</td><td>{displayMoney(line.amount)}</td></tr>)}
                </tbody></table>
              </div>
              {props.canUploadDocuments && props.canLinkDocuments ? (
                <div className="admin-card">
                  <h3>Invoice evidence</h3>
                  <p className="muted">Attach an image or PDF now, or retry an upload that failed when this invoice was created.</p>
                  <div className="admin-actions">
                    <input key={detailInvoiceImageInputKey} type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => setDetailInvoiceImage(event.target.files?.[0] ?? null)} />
                    <button type="button" disabled={!detailInvoiceImage || uploadInvoiceDocument.isPending || linkInvoiceDocument.isPending} onClick={() => void attachSelectedInvoiceEvidence()}>{uploadInvoiceDocument.isPending || linkInvoiceDocument.isPending ? 'Uploading…' : 'Attach image / PDF'}</button>
                  </div>
                  {detailAttachmentMessage ? <p className="muted">{detailAttachmentMessage}</p> : null}
                  {detailAttachmentError ? <div className="form-error" role="alert">{detailAttachmentError}</div> : null}
                </div>
              ) : null}
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
              <h2>New Supplier Payment — partial or full</h2>
              <p className="muted">Enter any partial amount and select the cash/bank account paying it. Invoice allocation is optional, so this also supports direct payments without an invoice. To pay from two accounts, create one partial payment from each account, then optionally allocate both to the same invoice.</p>
              <form className="admin-form" onSubmit={paymentForm.handleSubmit(submitPayment)}>
                <div className="two-column-form">
                  <label>Vendor<select {...paymentForm.register('vendorId')} onChange={(event) => { paymentForm.setValue('vendorId', event.target.value, { shouldValidate: true }); paymentForm.setValue('supplierInvoiceId', ''); paymentForm.setValue('projectId', ''); }}><option value="">Select vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.code} · {vendor.displayName}</option>)}</select><span className="field-error">{paymentForm.formState.errors.vendorId?.message}</span></label>
                  <label>Project (optional)<select {...paymentForm.register('projectId')} onChange={(event) => { paymentForm.setValue('projectId', event.target.value, { shouldValidate: true }); paymentForm.setValue('supplierInvoiceId', ''); }}><option value="">Company-level direct payment</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}</select><small className="muted">Select a project to load that project&apos;s supplier invoices.</small></label>
                  <label>Invoice (optional)
                    <select {...paymentForm.register('supplierInvoiceId')} disabled={!watchedPaymentVendorId || !watchedPaymentProjectId || payableInvoicesQuery.isPending}>
                      <option value="">Direct payment (no invoice)</option>
                      {payableInvoiceOptions.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNo} · Total {displayMoney(invoice.totalAmount)} · Outstanding {displayMoney(invoice.outstandingAmount)}</option>)}
                    </select>
                    <small className="muted">Only posted invoices with an outstanding balance for the selected supplier and project are shown.</small>
                    <span className="field-error">{paymentForm.formState.errors.supplierInvoiceId?.message}</span>
                  </label>
                  <label>Payment date<input type="date" {...paymentForm.register('paymentDate')} /></label>
                  <label>Payment amount (partial or full)<input inputMode="decimal" {...paymentForm.register('amount')} /></label>
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
            <div className="table-wrap"><table><thead><tr><th>Payment</th><th>Date</th><th>Status</th><th>Total</th><th>Allocated</th><th>Remaining</th><th>Reference</th><th>Action</th></tr></thead><tbody>
              {(paymentQuery.data?.items ?? []).map((payment) => <tr key={payment.id}><td>{payment.paymentNo}<br /><small>Supplier {vendorNames.get(payment.vendorId) ?? 'Unknown supplier'} · Project {payment.projectId ? projectNames.get(payment.projectId) ?? 'Unknown project' : 'Company'}</small></td><td>{payment.paymentDate}</td><td>{payment.status}</td><td>{displayMoney(payment.amount)}</td><td>{displayMoney(payment.allocatedAmount)}</td><td>{displayMoney(payment.remainingAmount)}</td><td>{payment.reference ?? '—'}</td><td>{props.canAllocatePayment && payment.status === 'POSTED' && Number(payment.remainingAmount) > 0 ? <button type="button" className="secondary-button" onClick={() => { setSelectedPayment(payment); allocationForm.reset({ supplierInvoiceId: '', amount: '' }); }}>Allocate</button> : '—'}</td></tr>)}
              {(paymentQuery.data?.items.length ?? 0) === 0 && <tr><td colSpan={8} className="muted">No Supplier Payments match the current filters.</td></tr>}
            </tbody></table></div>
          </section>

          {props.canAllocatePayment && selectedPayment && (
            <section className="admin-card">
               <h2>Allocate {selectedPayment.paymentNo}</h2>
               <p className="muted">Payment total: {displayMoney(selectedPayment.amount)} · Already allocated: {displayMoney(selectedPayment.allocatedAmount)} · Available to allocate: {displayMoney(selectedPayment.remainingAmount)}. The server prevents allocations above either the remaining payment or invoice outstanding.</p>
               {allocationInvoicesQuery.isPending && <p className="muted">Loading posted invoices for this supplier...</p>}
               {allocationInvoicesQuery.error instanceof Error && <div className="form-error" role="alert">Invoices could not be loaded: {allocationInvoicesQuery.error.message}</div>}
               {allocationInvoicesQuery.isSuccess && allocationInvoiceOptions.length === 0 && <p className="muted">No eligible invoice was found. The invoice must be POSTED, belong to this supplier and selected project, and have an outstanding balance.</p>}
               <form className="admin-form two-column-form" onSubmit={allocationForm.handleSubmit(submitAllocation)}>
                 <label>Posted invoice with outstanding
                   <select {...allocationForm.register('supplierInvoiceId')} disabled={allocationInvoicesQuery.isPending || allocationInvoiceOptions.length === 0}>
                     <option value="">Select invoice</option>
                     {allocationInvoiceOptions.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNo} · Project {projectNames.get(invoice.projectId) ?? 'Unknown project'} · Outstanding {displayMoney(invoice.outstandingAmount)}</option>)}
                   </select>
                   <span className="field-error">{allocationForm.formState.errors.supplierInvoiceId?.message}</span>
                 </label>
                 <label>Allocation amount<input inputMode="decimal" {...allocationForm.register('amount')} /><span className="field-error">{allocationForm.formState.errors.amount?.message}</span></label>
                 <button type="submit" disabled={allocatePayment.isPending || allocationInvoicesQuery.isPending || allocationInvoiceOptions.length === 0}>{allocatePayment.isPending ? 'Allocating…' : 'Allocate payment'}</button>
              </form>
              {mutationMessage(allocatePayment.error) && <p className="field-error">{mutationMessage(allocatePayment.error)}</p>}
               {allocatePayment.data?.map((allocation) => <p className="muted" key={allocation.id}>Allocated {displayMoney(allocation.amount)} to {allocationInvoiceOptions.find((invoice) => invoice.id === allocation.supplierInvoiceId)?.invoiceNo ?? 'supplier invoice'} on {new Date(allocation.allocatedAt).toLocaleString()}</p>)}
            </section>
          )}
        </>
      )}

      {tab === 'aging' && (
        <section className="admin-card">
          <div className="section-heading compact-heading"><h2>Supplier Ledger — Supplier Outstanding &amp; Aging</h2><label>As of date<input type="date" value={agingAsOfDate} onChange={(event) => setAgingAsOfDate(event.target.value)} /></label></div>
          <p className="muted">Outstanding is derived from POSTED Supplier Invoices minus immutable POSTED-payment allocations. As of: {agingQuery.data?.asOfDate ?? 'current date'}.</p>
          <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Invoice date</th><th>Due</th><th>Total</th><th>Allocated</th><th>Outstanding</th><th>Age days</th><th>Document</th></tr></thead><tbody>
            {(agingQuery.data?.items ?? []).map((row) => <tr key={row.supplierInvoiceId}><td>{row.invoiceNo}<br /><small>Supplier {vendorNames.get(row.vendorId) ?? 'Unknown supplier'} · Project {projectNames.get(row.projectId) ?? 'Unknown project'}</small></td><td>{row.invoiceDate}</td><td>{row.dueDate ?? '—'}</td><td>{displayMoney(row.totalAmount)}</td><td>{displayMoney(row.allocatedAmount)}</td><td>{displayMoney(row.outstandingAmount)}</td><td>{row.ageDays}</td><td><button type="button" className="secondary-button" disabled={!props.canReadDocuments || downloadingInvoiceId === row.supplierInvoiceId} onClick={() => void downloadInvoiceAttachment({ id: row.supplierInvoiceId, projectId: row.projectId, invoiceNo: row.invoiceNo })}>Download</button></td></tr>)}
            {(agingQuery.data?.items.length ?? 0) === 0 && <tr><td colSpan={8} className="muted">No outstanding Supplier Invoices match the current filters.</td></tr>}
          </tbody></table></div>
          {downloadError && <div className="form-error" role="alert">{downloadError}</div>}
          <h3>Supplier Payment History</h3>
          <p className="muted">Every posted supplier payment remains in this ledger. Allocated is the amount applied to invoices; remaining is an available direct/unallocated payment balance.</p>
          <div className="table-wrap"><table><thead><tr><th>Payment</th><th>Date</th><th>Supplier / Project</th><th>Total paid</th><th>Invoice allocated</th><th>Unallocated</th><th>Reference</th></tr></thead><tbody>
            {(paymentQuery.data?.items ?? []).map((payment) => <tr key={payment.id}><td>{payment.paymentNo}</td><td>{payment.paymentDate}</td><td>{vendorNames.get(payment.vendorId) ?? 'Unknown supplier'}<br /><small>{payment.projectId ? projectNames.get(payment.projectId) ?? 'Unknown project' : 'Company-level'}</small></td><td>{displayMoney(payment.amount)}</td><td>{displayMoney(payment.allocatedAmount)}</td><td>{displayMoney(payment.remainingAmount)}</td><td>{payment.reference ?? '—'}</td></tr>)}
            {(paymentQuery.data?.items.length ?? 0) === 0 && <tr><td colSpan={7} className="muted">No Supplier Payments match the current filters.</td></tr>}
          </tbody></table></div>
        </section>
      )}
    </div>
  );
}
