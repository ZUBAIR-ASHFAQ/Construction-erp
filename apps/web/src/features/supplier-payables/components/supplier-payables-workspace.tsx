import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getDocumentDownload, listDocuments } from '../../documents-audit/api/documents-api.js';
import { PaymentProofActions, savePaymentProof } from '../../documents-audit/components/payment-proof-actions.js';
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
  useReverseSupplierPayment,
  useSupplierAging,
  useSupplierInvoice,
  useSupplierLedger,
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
  initialVendorId?: string | null;
  initialPaymentId?: string | null;
  canRead: boolean;
  canCreateInvoice: boolean;
  createInvoiceModalOpen: boolean;
  onCloseCreateInvoiceModal: () => void;
  canPostInvoice: boolean;
  canCreatePayment: boolean;
  createPaymentModalOpen: boolean;
  onCloseCreatePaymentModal: () => void;
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
  const [vendorFilter, setVendorFilter] = useState(props.initialVendorId ?? '');
  const [projectFilter, setProjectFilter] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'' | 'DRAFT' | 'POSTED'>('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'' | 'DRAFT' | 'POSTED' | 'REVERSED'>('');
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
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [paymentProofInputKey, setPaymentProofInputKey] = useState(0);
  const [paymentProofMessage, setPaymentProofMessage] = useState<string | null>(null);

  const projectsQuery = useProjects({ page: 1, pageSize: 100 }, props.canReadProjects);
  const vendorsQuery = useVendors({ ...(tab === 'aging' ? {} : { status: 'ACTIVE' as const }), page: 1, pageSize: 100 }, props.canReadVendors);
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
  const selectedPurchaseOrder = useMemo(
    () => availablePurchaseOrders.find((purchaseOrder) => purchaseOrder.id === watchedPurchaseOrderId) ?? null,
    [availablePurchaseOrders, watchedPurchaseOrderId]
  );
  const availableGoodsReceipts = useMemo(() => (
    selectedPurchaseOrder?.goodsReceipts.filter((receipt) => receipt.status.toUpperCase() === 'RECEIVED') ?? []
  ), [selectedPurchaseOrder]);
  const watchedGoodsReceiptId = invoiceForm.watch('goodsReceiptId');
  const selectedGoodsReceipt = useMemo(
    () => availableGoodsReceipts.find((receipt) => receipt.id === watchedGoodsReceiptId) ?? null,
    [availableGoodsReceipts, watchedGoodsReceiptId]
  );
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
  const paymentCashBankAccounts = useMemo(() => (cashBankQuery.data?.items ?? []).filter((account) => !watchedPaymentProjectId || account.projectId === watchedPaymentProjectId || account.projectId === null), [cashBankQuery.data?.items, watchedPaymentProjectId]);
  const paymentQuery = useSupplierPayments({
    ...(vendorFilter ? { vendorId: vendorFilter } : {}),
    ...(projectFilter ? { projectId: projectFilter } : {}),
    ...(paymentStatusFilter ? { status: paymentStatusFilter } : {}),
    page: 1,
    pageSize: 100
  }, props.canRead);

  useEffect(() => {
    if (!props.initialPaymentId || tab !== 'payments' || !paymentQuery.data) return;
    window.document.getElementById(`supplier-payment-${props.initialPaymentId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [paymentQuery.data, props.initialPaymentId, tab]);
  const createPayment = useCreateSupplierPayment();
  const reversePayment = useReverseSupplierPayment();
  const allocatePayment = useAllocateSupplierPayment(selectedPayment?.id ?? null);
  const allocationForm = useForm<AllocationFormValues>({ resolver: zodResolver(allocationFormSchema), defaultValues: { supplierInvoiceId: '', amount: '' } });
  const watchedAllocationInvoiceId = allocationForm.watch('supplierInvoiceId');

  const agingQuery = useSupplierAging({
    ...(vendorFilter ? { vendorId: vendorFilter } : {}),
    ...(projectFilter ? { projectId: projectFilter } : {}),
    ...(agingAsOfDate ? { asOfDate: agingAsOfDate } : {}),
    page: 1,
    pageSize: 100
  }, props.canRead);
  const ledgerQuery = useSupplierLedger(vendorFilter ? {
    vendorId: vendorFilter,
    ...(projectFilter ? { projectId: projectFilter } : {})
  } : null, props.canRead && tab === 'aging');
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
  }, props.canRead && watchedPaymentVendorId !== '');
  const payableInvoiceOptions = useMemo(() => (
    (payableInvoicesQuery.data?.items ?? []).filter((invoice) => Number(invoice.outstandingAmount) > 0)
  ), [payableInvoicesQuery.data?.items]);
  const selectedAllocationInvoice = useMemo(() => (
    allocationInvoiceOptions.find((invoice) => invoice.id === watchedAllocationInvoiceId) ?? null
  ), [allocationInvoiceOptions, watchedAllocationInvoiceId]);

  /** Close the Supplier Invoice dialog and discard only its browser-side draft state. */
  function closeCreateInvoiceModal(): void {
    invoiceForm.reset(EMPTY_INVOICE_FORM);
    setInvoiceImage(null);
    setInvoiceImageInputKey((value) => value + 1);
    setAttachmentError(null);
    createInvoice.reset();
    postInvoice.reset();
    uploadInvoiceDocument.reset();
    linkInvoiceDocument.reset();
    props.onCloseCreateInvoiceModal();
  }

  /** Close the Supplier New Payment dialog and discard only its browser-side draft state. */
  function closeCreatePaymentModal(): void {
    paymentForm.reset(EMPTY_PAYMENT_FORM);
    setPaymentProof(null);
    setPaymentProofInputKey((value) => value + 1);
    createPayment.reset();
    props.onCloseCreatePaymentModal();
  }

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
      if (props.initialTab === 'invoices') props.onCloseCreateInvoiceModal();
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
    if (paymentProof) {
      try {
        await savePaymentProof({
          id: created.id,
          paymentNo: created.paymentNo,
          projectId: created.projectId,
          resourceType: 'supplier_payment',
          titlePrefix: 'Supplier payment proof',
          category: 'supplier_payment_proof'
        }, paymentProof);
        setPaymentProofMessage(`Payment ${created.paymentNo} and ${paymentProof.name} were saved successfully.`);
      } catch (error) {
        setPaymentProofMessage(`Payment ${created.paymentNo} was posted, but its optional proof could not be stored: ${error instanceof Error ? error.message : 'Upload failed.'} Use Attach proof in the payment row to retry.`);
      }
    } else {
      setPaymentProofMessage(`Payment ${created.paymentNo} was posted successfully.`);
    }
    setSelectedPayment(Number(created.remainingAmount) > 0 ? created : null);
    closeCreatePaymentModal();
  }

  /** Reverse one posted Supplier Payment and clear any now-invalid allocation selection. */
  async function reverseSelectedPayment(payment: SupplierPayment): Promise<void> {
    if (!window.confirm(`Reverse Supplier Payment ${payment.paymentNo}? This restores Cash/Bank, Supplier payable and any invoice allocation effect.`)) return;
    const reversed = await reversePayment.mutateAsync(payment.id);
    if (selectedPayment?.id === reversed.id) setSelectedPayment(null);
  }

  /** Append one allocation from the selected posted Supplier Payment to one posted Supplier Invoice. */
  async function submitAllocation(values: AllocationFormValues): Promise<void> {
    if (!selectedPayment) return;
    const paymentId = selectedPayment.id;
    await allocatePayment.mutateAsync({ allocations: [{ supplierInvoiceId: values.supplierInvoiceId, amount: values.amount }] });
    const refreshedPayments = await paymentQuery.refetch();
    const refreshedPayment = refreshedPayments.data?.items.find((payment) => payment.id === paymentId) ?? null;
    allocationForm.reset({ supplierInvoiceId: '', amount: '' });
    setSelectedPayment(refreshedPayment && Number(refreshedPayment.remainingAmount) > 0 ? refreshedPayment : null);
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
      {props.initialTab === 'invoices' && props.canCreateInvoice && props.createInvoiceModalOpen && (
        <div className="finance-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreateInvoiceModal(); }}>
          <section className="finance-modal finance-modal-wide client-payment-create-modal" role="dialog" aria-modal="true" aria-labelledby="supplier-invoice-create-title" onKeyDown={(event) => { if (event.key === 'Escape') closeCreateInvoiceModal(); }}>
            <header className="finance-modal-header">
              <div>
                <p className="eyebrow">Supplier invoice</p>
                <h2 id="supplier-invoice-create-title">New Supplier Invoice</h2>
                <p>Record a direct or Purchase Order-backed Supplier invoice with its original evidence.</p>
              </div>
              <button type="button" className="finance-modal-close" autoFocus aria-label="Close new supplier invoice" onClick={closeCreateInvoiceModal}>×</button>
            </header>
            <div className="finance-modal-body">
              <p className="client-payment-create-note">Select the Supplier and Project, optionally link an issued Purchase Order and received delivery, then attach the original invoice image or PDF. Accounting and posting rules remain server-controlled.</p>
              <form className="admin-form client-payment-create-form" onSubmit={invoiceForm.handleSubmit(submitInvoice)}>
                <div className="client-payment-create-grid">
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
                    <select {...invoiceForm.register('goodsReceiptId')} disabled={!watchedPurchaseOrderId}>
                      <option value="">{watchedPurchaseOrderId ? 'No Goods Receipt' : 'Not applicable for direct invoice'}</option>
                      {availableGoodsReceipts.map((receipt) => (
                        <option key={receipt.id} value={receipt.id}>{receipt.receiptNo} · {new Date(receipt.receivedAt).toLocaleDateString()} · {selectedPurchaseOrder?.currency ?? ''} {displayMoney(receipt.receivedAmount)}</option>
                      ))}
                    </select>
                    <small className="muted">{selectedGoodsReceipt && selectedPurchaseOrder ? `Selected receipt amount: ${selectedPurchaseOrder.currency} ${displayMoney(selectedGoodsReceipt.receivedAmount)}. ` : ''}Only received deliveries for the selected issued PO are shown.</small>
                    <span className="field-error">{invoiceForm.formState.errors.goodsReceiptId?.message}</span>
                  </label>
                  <label>Tax amount<input inputMode="decimal" {...invoiceForm.register('taxAmount')} /><span className="field-error">{invoiceForm.formState.errors.taxAmount?.message}</span></label>
                  <label>Supplier invoice image / PDF (required)
                    <input key={invoiceImageInputKey} type="file" accept="image/jpeg,image/png,application/pdf" disabled={!props.canUploadDocuments || !props.canLinkDocuments} onChange={(event) => setInvoiceImage(event.target.files?.[0] ?? null)} />
                    <small className="muted">Every Supplier invoice must have its original JPG, PNG or PDF attached before posting.</small>
                  </label>
                </div>

                <h3>Invoice lines</h3>
                {invoiceLines.fields.map((field, index) => (
                  <div className="admin-card" key={field.id}>
                    <div className="client-payment-create-grid">
                      <label>Description<input {...invoiceForm.register(`lines.${index}.description`)} /><span className="field-error">{invoiceForm.formState.errors.lines?.[index]?.description?.message}</span></label>
                      <label>Amount<input inputMode="decimal" {...invoiceForm.register(`lines.${index}.amount`)} /><span className="field-error">{invoiceForm.formState.errors.lines?.[index]?.amount?.message}</span></label>
                      <input type="hidden" {...invoiceForm.register(`lines.${index}.stageId`)} />
                      <input type="hidden" {...invoiceForm.register(`lines.${index}.expenseOrInventoryAccountId`)} />
                    </div>
                    {invoiceLines.fields.length > 1 && <button type="button" className="secondary-button" onClick={() => invoiceLines.remove(index)}>Remove line</button>}
                  </div>
                ))}
                <div className="form-actions client-payment-create-actions">
                  <button type="button" className="secondary-button" onClick={() => invoiceLines.append({ stageId: '', description: '', amount: '', expenseOrInventoryAccountId: '' })}>Add line</button>
                  <button type="button" className="secondary-button" disabled={createInvoice.isPending || postInvoice.isPending || uploadInvoiceDocument.isPending || linkInvoiceDocument.isPending} onClick={closeCreateInvoiceModal}>Cancel</button>
                  <button type="submit" disabled={!invoiceImage || !props.canUploadDocuments || !props.canLinkDocuments || createInvoice.isPending || postInvoice.isPending || uploadInvoiceDocument.isPending || linkInvoiceDocument.isPending}>{createInvoice.isPending || postInvoice.isPending || uploadInvoiceDocument.isPending || linkInvoiceDocument.isPending ? 'Saving invoice…' : props.canPostInvoice ? 'Create invoice & post' : 'Create invoice draft'}</button>
                </div>
                {mutationMessage(createInvoice.error) && <p className="field-error">{mutationMessage(createInvoice.error)}</p>}
                {mutationMessage(postInvoice.error) && <p className="field-error">Invoice was saved as a draft but could not be posted: {mutationMessage(postInvoice.error)}</p>}
                {attachmentError && <div className="form-error" role="alert">{attachmentError}</div>}
              </form>
            </div>
          </section>
        </div>
      )}

      {props.initialTab === 'payments' && props.canCreatePayment && props.createPaymentModalOpen && (
        <div className="finance-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreatePaymentModal(); }}>
          <section className="finance-modal finance-modal-wide client-payment-create-modal" role="dialog" aria-modal="true" aria-labelledby="supplier-payment-create-title" onKeyDown={(event) => { if (event.key === 'Escape') closeCreatePaymentModal(); }}>
            <header className="finance-modal-header">
              <div>
                <p className="eyebrow">Supplier payment</p>
                <h2 id="supplier-payment-create-title">New Supplier Payment</h2>
                <p>Post a partial or full Supplier payment from the selected Cash / Bank account.</p>
              </div>
              <button type="button" className="finance-modal-close" autoFocus aria-label="Close new supplier payment" onClick={closeCreatePaymentModal}>×</button>
            </header>
            <div className="finance-modal-body">
              <p className="client-payment-create-note">Select a Supplier and optionally a Project and posted Supplier Invoice. Direct payments remain supported; invoice allocation is optional and all posting rules stay server-controlled.</p>
              <form className="admin-form client-payment-create-form" onSubmit={paymentForm.handleSubmit(submitPayment)}>
                <div className="client-payment-create-grid">
                  <label>Vendor<select {...paymentForm.register('vendorId')} onChange={(event) => { paymentForm.setValue('vendorId', event.target.value, { shouldValidate: true }); paymentForm.setValue('supplierInvoiceId', ''); paymentForm.setValue('projectId', ''); }}><option value="">Select vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.code} · {vendor.displayName}</option>)}</select><span className="field-error">{paymentForm.formState.errors.vendorId?.message}</span></label>
                  <label>Project (optional)<select {...paymentForm.register('projectId')} onChange={(event) => { paymentForm.setValue('projectId', event.target.value, { shouldValidate: true }); paymentForm.setValue('supplierInvoiceId', ''); }}><option value="">Company-level direct payment</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}</select><small className="muted">Select a project to load that project&apos;s supplier invoices.</small></label>
                  <label>Invoice (optional)
                    <select {...paymentForm.register('supplierInvoiceId')} disabled={!watchedPaymentVendorId || payableInvoicesQuery.isPending}>
                      <option value="">Direct payment (no invoice)</option>
                      {payableInvoiceOptions.map((invoice) => <option key={invoice.id} value={invoice.id}>Invoice #{invoice.invoiceNo} · Total {displayMoney(invoice.totalAmount)} · Paid {displayMoney(invoice.allocatedAmount)} · Remaining {displayMoney(invoice.outstandingAmount)}</option>)}
                    </select>
                    <small className="muted">Choose an invoice to allocate this payment. Paid is already allocated to that invoice; Remaining is still unpaid. Leave Direct payment selected to post without invoice allocation.</small>
                    <span className="field-error">{paymentForm.formState.errors.supplierInvoiceId?.message}</span>
                  </label>
                  <label>Payment date<input type="date" {...paymentForm.register('paymentDate')} /><span className="field-error">{paymentForm.formState.errors.paymentDate?.message}</span></label>
                  <label>Payment amount (partial or full)<input inputMode="decimal" {...paymentForm.register('amount')} /><span className="field-error">{paymentForm.formState.errors.amount?.message}</span></label>
                  <label>Cash / Bank account<select {...paymentForm.register('cashBankAccountId')}><option value="">Select account</option>{paymentCashBankAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name} · Balance {displayMoney(account.balance)}</option>)}</select><span className="field-error">{paymentForm.formState.errors.cashBankAccountId?.message}</span></label>
                  <label>Reference (optional)<input {...paymentForm.register('reference')} /><span className="field-error">{paymentForm.formState.errors.reference?.message}</span></label>
                  <label>Payment proof (optional)<input key={paymentProofInputKey} type="file" accept="image/jpeg,image/png,application/pdf" disabled={!props.canUploadDocuments || !props.canLinkDocuments} onChange={(event) => setPaymentProof(event.target.files?.[0] ?? null)} /><small className="muted">Attach a bank slip, receipt image, or PDF. You can also attach it later.</small></label>
                </div>
                <p className="muted client-payment-create-help">To pay from two accounts, post one partial payment from each account and allocate them independently if required.</p>
                {mutationMessage(createPayment.error) && <p className="field-error">{mutationMessage(createPayment.error)}</p>}
                <div className="form-actions client-payment-create-actions">
                  <button type="button" className="secondary-button" disabled={createPayment.isPending} onClick={closeCreatePaymentModal}>Cancel</button>
                  <button type="submit" disabled={createPayment.isPending}>{createPayment.isPending ? 'Posting payment…' : 'Create & post payment'}</button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}

      <section className="admin-card">
        <div className="button-row" role="tablist" aria-label="Supplier Payables views">
          <button type="button" className={tab === 'invoices' ? 'nav-button active' : 'nav-button'} onClick={() => setTab('invoices')}>Invoices</button>
          <button type="button" className={tab === 'payments' ? 'nav-button active' : 'nav-button'} onClick={() => setTab('payments')}>Payments</button>
          <button type="button" className={tab === 'aging' ? 'nav-button active' : 'nav-button'} onClick={() => setTab('aging')}>Ledger &amp; Aging</button>
        </div>
        <div className="admin-form two-column-form">
          <label>Vendor filter
            <select value={vendorFilter} onChange={(event) => setVendorFilter(event.target.value)}>
              <option value="">All vendors</option>
              {vendorFilter && !vendors.some((vendor) => vendor.id === vendorFilter) && <option value={vendorFilter}>{ledgerQuery.data?.supplier.id === vendorFilter ? `${ledgerQuery.data.supplier.code} · ${ledgerQuery.data.supplier.displayName}` : 'Selected supplier'}</option>}
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
          {props.canCreateInvoice && props.initialTab !== 'invoices' && (
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
                        <option key={receipt.id} value={receipt.id}>{receipt.receiptNo} · {new Date(receipt.receivedAt).toLocaleDateString()} · {selectedPurchaseOrder?.currency ?? ''} {displayMoney(receipt.receivedAmount)}</option>
                      ))}
                    </select>
                    <small className="muted">{selectedGoodsReceipt && selectedPurchaseOrder ? `Selected receipt amount: ${selectedPurchaseOrder.currency} ${displayMoney(selectedGoodsReceipt.receivedAmount)}. ` : ''}Only received deliveries for the selected issued PO are shown.</small>
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
          {props.canCreatePayment && props.initialTab !== 'payments' && (
            <section className="admin-card">
              <h2>New Supplier Payment — partial or full</h2>
              <p className="muted">Enter any partial amount and select the cash/bank account paying it. Invoice allocation is optional, so this also supports direct payments without an invoice. To pay from two accounts, create one partial payment from each account, then optionally allocate both to the same invoice.</p>
              <form className="admin-form" onSubmit={paymentForm.handleSubmit(submitPayment)}>
                <div className="two-column-form">
                  <label>Vendor<select {...paymentForm.register('vendorId')} onChange={(event) => { paymentForm.setValue('vendorId', event.target.value, { shouldValidate: true }); paymentForm.setValue('supplierInvoiceId', ''); paymentForm.setValue('projectId', ''); }}><option value="">Select vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.code} · {vendor.displayName}</option>)}</select><span className="field-error">{paymentForm.formState.errors.vendorId?.message}</span></label>
                  <label>Project (optional)<select {...paymentForm.register('projectId')} onChange={(event) => { paymentForm.setValue('projectId', event.target.value, { shouldValidate: true }); paymentForm.setValue('supplierInvoiceId', ''); }}><option value="">Company-level direct payment</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}</select><small className="muted">Select a project to load that project&apos;s supplier invoices.</small></label>
                  <label>Invoice (optional)
                    <select {...paymentForm.register('supplierInvoiceId')} disabled={!watchedPaymentVendorId || payableInvoicesQuery.isPending}>
                      <option value="">Direct payment (no invoice)</option>
                      {payableInvoiceOptions.map((invoice) => <option key={invoice.id} value={invoice.id}>Invoice #{invoice.invoiceNo} · Total {displayMoney(invoice.totalAmount)} · Paid {displayMoney(invoice.allocatedAmount)} · Remaining {displayMoney(invoice.outstandingAmount)}</option>)}
                    </select>
                    <small className="muted">Choose an invoice to allocate this payment. Paid is already allocated to that invoice; Remaining is still unpaid. Leave Direct payment selected to post without invoice allocation.</small>
                    <span className="field-error">{paymentForm.formState.errors.supplierInvoiceId?.message}</span>
                  </label>
                  <label>Payment date<input type="date" {...paymentForm.register('paymentDate')} /></label>
                  <label>Payment amount (partial or full)<input inputMode="decimal" {...paymentForm.register('amount')} /></label>
                  <label>Cash / Bank account<select {...paymentForm.register('cashBankAccountId')}><option value="">Select account</option>{paymentCashBankAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name} · Balance {displayMoney(account.balance)}</option>)}</select></label>
                  <label>Reference (optional)<input {...paymentForm.register('reference')} /></label>
                  <label>Payment proof (optional)<input key={paymentProofInputKey} type="file" accept="image/jpeg,image/png,application/pdf" disabled={!props.canUploadDocuments || !props.canLinkDocuments} onChange={(event) => setPaymentProof(event.target.files?.[0] ?? null)} /><small className="muted">Bank slip, receipt image, or PDF. The file is optional.</small></label>
                </div>
                <button type="submit" disabled={createPayment.isPending}>{createPayment.isPending ? 'Posting payment…' : 'Create & post payment'}</button>
                {mutationMessage(createPayment.error) && <p className="field-error">{mutationMessage(createPayment.error)}</p>}
              </form>
            </section>
          )}

          <section className="admin-card">
            <div className="section-heading compact-heading"><h2>Supplier Payments</h2><label>Status<select value={paymentStatusFilter} onChange={(event) => setPaymentStatusFilter(event.target.value as '' | 'DRAFT' | 'POSTED' | 'REVERSED')}><option value="">All</option><option value="DRAFT">Draft</option><option value="POSTED">Posted</option><option value="REVERSED">Reversed</option></select></label></div>
            {paymentProofMessage && <p className="muted" role="status">{paymentProofMessage}</p>}
            <div className="table-wrap"><table><thead><tr><th>Payment</th><th>Date</th><th>Status</th><th>Total</th><th>Allocated</th><th>Remaining</th><th>Reference</th><th>Action</th></tr></thead><tbody>
              {(paymentQuery.data?.items ?? []).map((payment) => <tr id={`supplier-payment-${payment.id}`} className={payment.id === props.initialPaymentId ? 'finance-source-focus' : undefined} key={payment.id}><td>{payment.paymentNo}<br /><small>Supplier {vendorNames.get(payment.vendorId) ?? 'Unknown supplier'} · Project {payment.projectId ? projectNames.get(payment.projectId) ?? 'Unknown project' : 'Company'}</small></td><td>{payment.paymentDate}</td><td>{payment.status}</td><td>{displayMoney(payment.amount)}</td><td>{displayMoney(payment.allocatedAmount)}</td><td>{displayMoney(payment.remainingAmount)}</td><td>{payment.reference ?? '—'}</td><td><div className="admin-actions">{props.canAllocatePayment && payment.status === 'POSTED' && Number(payment.remainingAmount) > 0 ? <button type="button" className="secondary-button" onClick={() => { setSelectedPayment(payment); allocationForm.reset({ supplierInvoiceId: '', amount: '' }); }}>Allocate</button> : null}{props.canCreatePayment && payment.status === 'POSTED' ? <button type="button" className="secondary-button" disabled={reversePayment.isPending} onClick={() => void reverseSelectedPayment(payment)}>{reversePayment.isPending ? 'Reversing…' : 'Reverse'}</button> : null}<PaymentProofActions id={payment.id} paymentNo={payment.paymentNo} projectId={payment.projectId} resourceType="supplier_payment" titlePrefix="Supplier payment proof" category="supplier_payment_proof" canRead={props.canReadDocuments} canAttach={props.canUploadDocuments && props.canLinkDocuments} /></div></td></tr>)}
              {(paymentQuery.data?.items.length ?? 0) === 0 && <tr><td colSpan={8} className="muted">No Supplier Payments match the current filters.</td></tr>}
            </tbody></table></div>
            {mutationMessage(reversePayment.error) && <p className="field-error">{mutationMessage(reversePayment.error)}</p>}
          </section>

          {props.canAllocatePayment && selectedPayment && (
            <section className="admin-card">
               <h2>Allocate {selectedPayment.paymentNo}</h2>
               <p className="muted">Payment total: {displayMoney(selectedPayment.amount)} · Already allocated: {displayMoney(selectedPayment.allocatedAmount)} · Available to allocate: {displayMoney(selectedPayment.remainingAmount)}. The server prevents allocations above either the remaining payment or invoice outstanding.</p>
               {allocationInvoicesQuery.isPending && <p className="muted">Loading posted invoices for this supplier...</p>}
               {allocationInvoicesQuery.error instanceof Error && <div className="form-error" role="alert">Invoices could not be loaded: {allocationInvoicesQuery.error.message}</div>}
               {allocationInvoicesQuery.isSuccess && allocationInvoiceOptions.length === 0 && <p className="muted">No eligible invoice was found. The invoice must be POSTED, belong to this supplier and selected project, and have an outstanding balance.</p>}
               <form className="admin-form two-column-form" onSubmit={allocationForm.handleSubmit(submitAllocation)}>
                 <label>Pending invoice
                   <select {...allocationForm.register('supplierInvoiceId')} disabled={allocationInvoicesQuery.isPending || allocationInvoiceOptions.length === 0}>
                     <option value="">Select invoice</option>
                     {allocationInvoiceOptions.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNo} · Project {projectNames.get(invoice.projectId) ?? 'Unknown project'} · Outstanding {displayMoney(invoice.outstandingAmount)}</option>)}
                   </select>
                   <span className="field-error">{allocationForm.formState.errors.supplierInvoiceId?.message}</span>
                 </label>
                 <label>Allocation amount<input inputMode="decimal" {...allocationForm.register('amount')} /><small className="muted">{selectedAllocationInvoice ? `Invoice outstanding: ${displayMoney(selectedAllocationInvoice.outstandingAmount)} · Payment remaining: ${displayMoney(selectedPayment.remainingAmount)}` : 'Enter the amount to apply from this payment.'}</small><span className="field-error">{allocationForm.formState.errors.amount?.message}</span></label>
                 <button type="submit" disabled={allocatePayment.isPending || allocationInvoicesQuery.isPending || allocationInvoiceOptions.length === 0}>{allocatePayment.isPending ? 'Allocating…' : 'Allocate payment'}</button>
              </form>
              {mutationMessage(allocatePayment.error) && <p className="field-error">{mutationMessage(allocatePayment.error)}</p>}
               {allocatePayment.data?.map((allocation) => <p className="muted" key={allocation.id}>Allocated {displayMoney(allocation.amount)} to {allocationInvoiceOptions.find((invoice) => invoice.id === allocation.supplierInvoiceId)?.invoiceNo ?? 'supplier invoice'} on {new Date(allocation.allocatedAt).toLocaleString()}</p>)}
            </section>
          )}
        </>
      )}

      {tab === 'aging' && (
        <>
          <section className="admin-card">
            <div className="section-heading compact-heading">
              <div>
                <h2>Supplier Ledger</h2>
                <p className="muted">Chronological posted account activity. Supplier Invoices increase the payable, payments reduce it, and reversals restore the payable.</p>
              </div>
            </div>
            {!vendorFilter && <p className="muted">Select a supplier above to view its complete ledger.</p>}
            {vendorFilter && ledgerQuery.isPending && <p className="muted">Loading Supplier ledger…</p>}
            {ledgerQuery.error instanceof Error && <div className="form-error" role="alert">{ledgerQuery.error.message}</div>}
            {ledgerQuery.data && (
              <>
                <div className="section-heading compact-heading">
                  <div>
                    <h3>{ledgerQuery.data.supplier.code} · {ledgerQuery.data.supplier.displayName}</h3>
                    <p className="muted">{projectFilter ? `Project: ${projectNames.get(projectFilter) ?? 'Selected project'} · ` : 'All permitted projects · '}{ledgerQuery.data.supplier.currency ?? 'Currency not set'}</p>
                  </div>
                </div>
                <dl className="summary-grid">
                  <div><dt>Total invoiced</dt><dd>{displayMoney(ledgerQuery.data.summary.totalInvoiced)}</dd></div>
                  <div><dt>Total payments</dt><dd>{displayMoney(ledgerQuery.data.summary.totalPaid)}</dd></div>
                  <div><dt>Reversed payments</dt><dd>{displayMoney(ledgerQuery.data.summary.totalReversed)}</dd></div>
                  <div><dt>Net paid</dt><dd>{displayMoney(ledgerQuery.data.summary.netPaid)}</dd></div>
                  <div><dt>Balance payable</dt><dd>{displayMoney(ledgerQuery.data.summary.balance)}</dd></div>
                </dl>
                <p className="muted">Debit = Supplier Payment, Credit = Supplier Invoice or payment reversal. Allocation rows show how payments were applied without changing the ledger balance again. A negative balance represents a Supplier advance.</p>
                <div className="table-wrap">
                  <table className="admin-table">
                    <thead><tr><th>Date</th><th>Type</th><th>Project</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Allocated</th><th>Balance</th><th>Note</th><th>Proof</th></tr></thead>
                    <tbody>
                      {ledgerQuery.data.entries.map((entry) => <tr key={entry.id}><td>{entry.entryDate}</td><td>{entry.entryType === 'PAYMENT_REVERSAL' ? 'Payment reversal' : entry.entryType === 'ALLOCATION' ? 'Allocation' : entry.entryType === 'PAYMENT' ? 'Payment' : 'Invoice'}</td><td>{entry.projectName ?? 'Company-level'}</td><td><strong>{entry.reference}</strong></td><td>{displayMoney(entry.debit)}</td><td>{displayMoney(entry.credit)}</td><td>{displayMoney(entry.allocationAmount)}</td><td><strong>{displayMoney(entry.balance)}</strong></td><td>{entry.note ?? '—'}</td><td>{entry.entryType === 'PAYMENT' || entry.entryType === 'PAYMENT_REVERSAL' ? <PaymentProofActions id={entry.sourceId} paymentNo={entry.reference.replace(/ reversed$/i, '')} projectId={entry.projectId} resourceType="supplier_payment" titlePrefix="Supplier payment proof" category="supplier_payment_proof" canRead={props.canReadDocuments} canAttach={props.canUploadDocuments && props.canLinkDocuments} /> : '—'}</td></tr>)}
                      {ledgerQuery.data.entries.length === 0 && <tr><td colSpan={10} className="muted">No posted Supplier Invoice or Payment activity exists for this supplier.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className="admin-card">
            <div className="section-heading compact-heading"><h2>Supplier Outstanding &amp; Aging</h2><label>As of date<input type="date" value={agingAsOfDate} onChange={(event) => setAgingAsOfDate(event.target.value)} /></label></div>
            <p className="muted">Outstanding is derived from POSTED Supplier Invoices minus immutable POSTED-payment allocations. As of: {agingQuery.data?.asOfDate ?? 'current date'}.</p>
            <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Invoice date</th><th>Due</th><th>Total</th><th>Allocated</th><th>Outstanding</th><th>Age days</th><th>Document</th></tr></thead><tbody>
              {(agingQuery.data?.items ?? []).map((row) => <tr key={row.supplierInvoiceId}><td>{row.invoiceNo}<br /><small>Supplier {vendorNames.get(row.vendorId) ?? 'Unknown supplier'} · Project {projectNames.get(row.projectId) ?? 'Unknown project'}</small></td><td>{row.invoiceDate}</td><td>{row.dueDate ?? '—'}</td><td>{displayMoney(row.totalAmount)}</td><td>{displayMoney(row.allocatedAmount)}</td><td>{displayMoney(row.outstandingAmount)}</td><td>{row.ageDays}</td><td><button type="button" className="secondary-button" disabled={!props.canReadDocuments || downloadingInvoiceId === row.supplierInvoiceId} onClick={() => void downloadInvoiceAttachment({ id: row.supplierInvoiceId, projectId: row.projectId, invoiceNo: row.invoiceNo })}>Download</button></td></tr>)}
              {(agingQuery.data?.items.length ?? 0) === 0 && <tr><td colSpan={8} className="muted">No outstanding Supplier Invoices match the current filters.</td></tr>}
            </tbody></table></div>
            {downloadError && <div className="form-error" role="alert">{downloadError}</div>}
          </section>
        </>
      )}
    </div>
  );
}
