import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useMaterials } from '../../inventory/hooks/inventory.js';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useAllProjectSupplierInvoices } from '../../supplier-payables/hooks/supplier-payables.js';
import type { SupplierInvoice } from '../../supplier-payables/api/supplier-payables-api.js';
import type { PurchaseOrder } from '../api/procurement-api.js';
import {
  useAllProcurementPurchaseOrders,
  useApproveRequisition,
  useCancelProcurementPurchaseOrder,
  useCreateGoodsReceipt,
  useCreateProcurementPurchaseOrder,
  useCreateRequisition,
  useIssueProcurementPurchaseOrder,
  useProcurementPurchaseOrders,
  useProcurementVendors,
  useRequisitions
} from '../hooks/procurement.js';

type ProcurementWorkspaceProps = Readonly<{
  projectId: string;
  canRead: boolean;
  canCreateRequisition: boolean;
  canApproveRequisition: boolean;
  canCreatePurchaseOrder: boolean;
  canIssuePurchaseOrder: boolean;
  canCreateGoodsReceipt: boolean;
  canReadStages: boolean;
  canReadSupplierPayables: boolean;
}>;

const uuidSchema = z.string().uuid('Enter a valid UUID.');
const optionalUuidSchema = z.union([z.literal(''), uuidSchema]);
const positiveDecimalSchema = z.string().trim().regex(/^(?:[1-9]\d{0,13}(?:\.\d{1,4})?|0\.(?:\d{0,3}[1-9]))$/, 'Enter a positive number with at most 4 decimal places.');
const nonNegativeDecimalSchema = z.string().trim().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/, 'Enter zero or a positive number with at most 4 decimal places.');
const textSchema = z.string().trim().min(1, 'This field is required.');

const requisitionFormSchema = z.object({
  requiredDate: z.string().date('Choose a valid required date.'),
  materialId: uuidSchema,
  description: textSchema.max(500),
  quantity: positiveDecimalSchema,
  stageId: optionalUuidSchema,
  notes: z.string().trim().max(4000)
});

const purchaseOrderFormSchema = z.object({
  requisitionId: uuidSchema,
  vendorId: uuidSchema,
  orderDate: z.string().date('Choose a valid order date.'),
  currency: z.string().trim().length(3, 'Use a 3-letter currency code.'),
  deliveryAddress: textSchema,
  terms: textSchema,
  unitPrices: z.record(z.string())
});

const goodsReceiptFormSchema = z.object({
  purchaseOrderId: uuidSchema,
  deliveredQuantities: z.record(z.string()),
  rejectedQuantities: z.record(z.string()),
  batchNumbers: z.record(z.string())
});

type RequisitionFormValues = z.infer<typeof requisitionFormSchema>;
type PurchaseOrderFormValues = z.infer<typeof purchaseOrderFormSchema>;
type GoodsReceiptFormValues = z.infer<typeof goodsReceiptFormSchema>;

/** Convert one exact four-decimal quantity token to a scaled integer for browser-only arithmetic. */
function decimalToScale4(value: string): bigint {
  const [whole = '0', fraction = ''] = value.trim().split('.');
  return (BigInt(whole) * 10_000n) + BigInt(`${fraction}0000`.slice(0, 4));
}

/** Convert one four-decimal scaled integer back to a stable quantity token. */
function scale4ToDecimal(value: bigint): string {
  const whole = value / 10_000n;
  const fraction = (value % 10_000n).toString().padStart(4, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Return the still-open ordered quantity without floating-point arithmetic. */
function openQuantity(ordered: string, received: string): string {
  return scale4ToDecimal(decimalToScale4(ordered) - decimalToScale4(received));
}

/** Calculate an accepted-quantity preview only when both receipt inputs are valid. */
function acceptedQuantityPreview(delivered: string, rejected: string): string {
  if (!positiveDecimalSchema.safeParse(delivered).success || !nonNegativeDecimalSchema.safeParse(rejected || '0').success) return '—';
  const accepted = decimalToScale4(delivered) - decimalToScale4(rejected || '0');
  return accepted < 0n ? '—' : scale4ToDecimal(accepted);
}


/** Convert one exact two-decimal money token to integer minor units for receipt settlement summaries. */
function moneyToMinorUnits(value: string): bigint {
  const text = value.trim();
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const minorUnits = (BigInt(whole || '0') * 100n) + BigInt(`${fraction}00`.slice(0, 2));
  return negative ? -minorUnits : minorUnits;
}

/** Serialize exact minor units with two decimals for Procurement money displays. */
function minorUnitsToMoney(value: bigint): string {
  const negative = value < 0n;
  const unsigned = negative ? -value : value;
  const text = `${unsigned / 100n}.${(unsigned % 100n).toString().padStart(2, '0')}`;
  return negative ? `-${text}` : text;
}

/** Sum exact Supplier Invoice money values without browser floating-point arithmetic. */
function sumInvoiceMoney(invoices: readonly SupplierInvoice[], field: 'totalAmount' | 'allocatedAmount' | 'outstandingAmount'): bigint {
  return invoices.reduce((total, invoice) => total + moneyToMinorUnits(invoice[field]), 0n);
}

/** Display one mutation error without exposing internal objects. */
function mutationMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

/** Render the simplified Final-21 Material Requirement -> PO -> Goods Receipt workflow. */
export function ProcurementWorkspace(props: ProcurementWorkspaceProps) {
  const requisitions = useRequisitions(props.projectId);
  const purchaseOrders = useProcurementPurchaseOrders(props.projectId);
  const allPurchaseOrders = useAllProcurementPurchaseOrders(props.projectId, props.canRead || props.canCreateGoodsReceipt);
  const supplierInvoices = useAllProjectSupplierInvoices(props.projectId, props.canReadSupplierPayables);
  const vendors = useProcurementVendors(props.projectId || null, Boolean(props.projectId));
  const vendorNames = useMemo(() => new Map((vendors.data?.items ?? []).map((vendor) => [vendor.id, vendor.displayName])), [vendors.data?.items]);
  const createRequisition = useCreateRequisition();
  const approveRequisition = useApproveRequisition();
  const createPurchaseOrder = useCreateProcurementPurchaseOrder();
  const issuePurchaseOrder = useIssueProcurementPurchaseOrder();
  const cancelPurchaseOrder = useCancelProcurementPurchaseOrder();
  const createGoodsReceipt = useCreateGoodsReceipt();
  const [requisitionDialogOpen, setRequisitionDialogOpen] = useState(false);
  const [purchaseOrderDialogOpen, setPurchaseOrderDialogOpen] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const materials = useMaterials(props.projectId || undefined, props.canCreateRequisition && Boolean(props.projectId));
  const stages = useProjectStages(props.projectId, props.canReadStages && props.canCreateRequisition);

  const requisitionForm = useForm<RequisitionFormValues>({
    resolver: zodResolver(requisitionFormSchema),
    defaultValues: { requiredDate: '', materialId: '', description: '', quantity: '1', stageId: '', notes: '' }
  });
  const purchaseOrderForm = useForm<PurchaseOrderFormValues>({
    resolver: zodResolver(purchaseOrderFormSchema),
    defaultValues: { requisitionId: '', vendorId: '', orderDate: '', currency: 'PKR', deliveryAddress: '', terms: 'Standard payment terms', unitPrices: {} }
  });
  const goodsReceiptForm = useForm<GoodsReceiptFormValues>({
    resolver: zodResolver(goodsReceiptFormSchema),
    defaultValues: { purchaseOrderId: '', deliveredQuantities: {}, rejectedQuantities: {}, batchNumbers: {} }
  });

  const approvedRequisitions = useMemo(
    () => (requisitions.data?.items ?? []).filter((item) => item.status.toUpperCase() === 'APPROVED'),
    [requisitions.data]
  );
  const showRequestedBy = (requisitions.data?.items ?? []).some((item) => Boolean(item.requestedByName?.trim()));
  const selectedRequisitionId = purchaseOrderForm.watch('requisitionId');
  const selectedRequisition = approvedRequisitions.find((item) => item.id === selectedRequisitionId) ?? null;

  const issuedPurchaseOrders = useMemo(
    () => (purchaseOrders.data?.items ?? []).filter((item) => item.status.toUpperCase() === 'ISSUED'),
    [purchaseOrders.data]
  );
  const receiptPurchaseOrderId = goodsReceiptForm.watch('purchaseOrderId');
  const receiptPurchaseOrder = issuedPurchaseOrders.find((item) => item.id === receiptPurchaseOrderId) ?? null;
  const materialOptions = (materials.data?.items ?? []).filter((item) => item.status.toUpperCase() === 'ACTIVE');
  const selectedMaterialId = requisitionForm.watch('materialId');
  const selectedMaterial = materialOptions.find((item) => item.id === selectedMaterialId) ?? null;
  const latestGoodsReceipt = createGoodsReceipt.data ?? null;
  const latestReceiptPurchaseOrder = latestGoodsReceipt
    ? (purchaseOrders.data?.items ?? []).find((item) => item.id === latestGoodsReceipt.purchaseOrderId) ?? receiptPurchaseOrder
    : null;
  const stageOptions = stages.data?.items ?? [];
  const goodsReceiptRows = useMemo(() => (
    (allPurchaseOrders.data ?? []).flatMap((purchaseOrder) => purchaseOrder.goodsReceipts.map((receipt) => ({ purchaseOrder, receipt })))
      .sort((left, right) => right.receipt.receivedAt.localeCompare(left.receipt.receivedAt))
  ), [allPurchaseOrders.data]);
  const invoicesByGoodsReceipt = useMemo(() => {
    const grouped = new Map<string, SupplierInvoice[]>();
    for (const invoice of supplierInvoices.data ?? []) {
      if (!invoice.goodsReceiptId) continue;
      const current = grouped.get(invoice.goodsReceiptId) ?? [];
      current.push(invoice);
      grouped.set(invoice.goodsReceiptId, current);
    }
    return grouped;
  }, [supplierInvoices.data]);

  /** Submit one material requirement line for the selected Project. */
  async function handleCreateRequisition(values: RequisitionFormValues): Promise<void> {
    if (!selectedMaterial) {
      requisitionForm.setError('materialId', { message: 'Select an active material.' });
      return;
    }
    await createRequisition.mutateAsync({
      projectId: props.projectId,
      stageId: values.stageId || null,
      requiredDate: values.requiredDate,
      ...(values.notes ? { notes: values.notes } : {}),
      items: [{
        materialId: values.materialId,
        description: values.description,
        quantity: values.quantity,
        unit: selectedMaterial.unit,
        ...(values.stageId ? { stageId: values.stageId } : {})
      }]
    });
    requisitionForm.reset({ requiredDate: values.requiredDate, materialId: '', description: '', quantity: '1', stageId: '', notes: '' });
    setRequisitionDialogOpen(false);
  }

  /** Create one PO from all lines of the selected approved material requirement. */
  async function handleCreatePurchaseOrder(values: PurchaseOrderFormValues): Promise<void> {
    if (!selectedRequisition) return;
    const invalidLine = selectedRequisition.items.find((item) => !positiveDecimalSchema.safeParse(values.unitPrices[item.id] ?? '').success);
    if (invalidLine) {
      purchaseOrderForm.setError('root', { message: `Enter a positive unit price for ${invalidLine.description}.` });
      return;
    }

    await createPurchaseOrder.mutateAsync({
      requisitionId: selectedRequisition.id,
      vendorId: values.vendorId,
      orderDate: values.orderDate,
      currency: values.currency.toUpperCase(),
      deliveryAddress: values.deliveryAddress,
      terms: values.terms,
      items: selectedRequisition.items.map((item) => ({
        requisitionItemId: item.id,
        quantity: item.quantity,
        unitPrice: values.unitPrices[item.id] as string,
        taxRate: '0'
      }))
    });
    purchaseOrderForm.reset({ requisitionId: '', vendorId: values.vendorId, orderDate: values.orderDate, currency: values.currency.toUpperCase(), deliveryAddress: values.deliveryAddress, terms: values.terms, unitPrices: {} });
    setPurchaseOrderDialogOpen(false);
  }

  /** Receive every still-open material line of the selected issued PO into one Warehouse. */
  async function handleCreateGoodsReceipt(values: GoodsReceiptFormValues): Promise<void> {
    if (!receiptPurchaseOrder) return;
    let validationMessage: string | null = null;
    const receiptLines = receiptPurchaseOrder.items.flatMap((item) => {
      const productName = item.materialName ?? item.description;
      const delivered = values.deliveredQuantities[item.id]?.trim() ?? '';
      if (delivered === '' || delivered === '0') return [];
      if (!positiveDecimalSchema.safeParse(delivered).success) {
        validationMessage = `Enter a valid delivered quantity for ${productName}.`;
        return [];
      }
      const open = openQuantity(item.quantity, item.receivedQuantity);
      const rejected = values.rejectedQuantities[item.id]?.trim() || '0';
      if (!nonNegativeDecimalSchema.safeParse(rejected).success) {
        validationMessage = `Enter a valid rejected quantity for ${productName}.`;
        return [];
      }
      if (decimalToScale4(delivered) > decimalToScale4(open)) {
        validationMessage = `${productName}: delivered quantity cannot exceed the open quantity (${open}).`;
        return [];
      }
      if (decimalToScale4(rejected) > decimalToScale4(delivered)) {
        validationMessage = `${productName}: rejected quantity cannot exceed delivered quantity.`;
        return [];
      }
      const accepted = scale4ToDecimal(decimalToScale4(delivered) - decimalToScale4(rejected));
      const batchNo = values.batchNumbers[item.id]?.trim() ?? '';
      return item.materialId ? [{
        poItemId: item.id,
        materialId: item.materialId,
        quantity: delivered,
        acceptedQuantity: accepted,
        rejectedQuantity: rejected,
        ...(batchNo ? { batchNo } : {})
      }] : [];
    });
    if (validationMessage) {
      goodsReceiptForm.setError('root', { message: validationMessage });
      return;
    }
    if (receiptLines.length === 0) {
      goodsReceiptForm.setError('root', { message: 'Enter a delivered quantity for at least one open Purchase Order line.' });
      return;
    }

    await createGoodsReceipt.mutateAsync({
      purchaseOrderId: receiptPurchaseOrder.id,
      items: receiptLines
    });
    goodsReceiptForm.reset({ purchaseOrderId: receiptPurchaseOrder.id, deliveredQuantities: {}, rejectedQuantities: {}, batchNumbers: {} });
    setReceiptDialogOpen(false);
  }

  return (
    <div className="admin-stack">
      <section className="admin-card procurement-stage-card" id="procurement-rfq">
        <div className="client-page-heading">
          <div>
            <p className="eyebrow">Step 1</p>
            <h2>RFQ / Material requirement</h2>
            <p className="muted">Define what the Project needs, then approve it before requesting commercial offers.</p>
          </div>
          {props.canCreateRequisition && (
            <button type="button" className="client-primary-action" aria-haspopup="dialog" onClick={() => { createRequisition.reset(); requisitionForm.clearErrors(); setRequisitionDialogOpen(true); }}>
              <span aria-hidden="true">+</span> Add requirement
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>No.</th><th>Required</th><th>Product name</th><th>Quantity</th>{showRequestedBy && <th>Requested by</th>}<th>Status</th><th>Action</th></tr></thead><tbody>
            {(requisitions.data?.items ?? []).map((item) => (
              <tr key={item.id}>
                <td>{item.requestNo}<br /><small>{item.notes ?? 'No notes'}</small></td>
                <td>{item.requiredDate}</td>
                <td>{item.items.map((line) => <div key={line.id}>{line.materialName ?? line.description}</div>)}</td>
                <td>{item.items.map((line) => <div key={line.id}>{line.quantity} {line.unit}</div>)}</td>
                {showRequestedBy && <td>{item.requestedByName ?? ''}</td>}
                <td>{item.status}</td>
                <td>{props.canApproveRequisition && item.status.toUpperCase() === 'DRAFT' && <button type="button" onClick={() => approveRequisition.mutate(item.id)}>Approve</button>}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </section>

      <section className="admin-card procurement-stage-card" id="procurement-po">
        <div className="client-page-heading">
          <div>
            <p className="eyebrow">Steps 2–8</p>
            <h2>Vendor sourcing &amp; Purchase Orders</h2>
            <p className="muted">Use approved requirements to evaluate qualified vendors, record the selected commercial terms, create the PO, and issue it. PO issue posts the budget commitment.</p>
          </div>
          {props.canCreatePurchaseOrder && (
            <button type="button" className="client-primary-action" aria-haspopup="dialog" disabled={approvedRequisitions.length === 0} title={approvedRequisitions.length === 0 ? 'Approve a material requirement first.' : undefined} onClick={() => { createPurchaseOrder.reset(); purchaseOrderForm.clearErrors(); setPurchaseOrderDialogOpen(true); }}>
              <span aria-hidden="true">+</span> Add purchase order
            </button>
          )}
        </div>
        <div className="table-wrap"><table><thead><tr><th>PO</th><th>Product name</th><th>Quantity</th><th>Unit price</th><th>Status</th><th>Total</th><th>Received</th><th>Open</th><th>Actions</th></tr></thead><tbody>
          {(purchaseOrders.data?.items ?? []).map((item) => <PurchaseOrderRow key={item.id} item={item} vendorName={vendorNames.get(item.vendorId) ?? 'Unknown supplier'} canIssue={props.canIssuePurchaseOrder} onIssue={() => issuePurchaseOrder.mutate(item.id)} onCancel={() => cancelPurchaseOrder.mutate({ id: item.id, reason: 'Cancelled by authorized Procurement user.' })} />)}
        </tbody></table></div>
      </section>

      {(props.canRead || props.canCreateGoodsReceipt) && (
        <section className="admin-card procurement-stage-card" id="procurement-receipt">
          <div className="client-page-heading">
            <div>
              <p className="eyebrow">Steps 9–11</p>
              <h2>Supplier delivery &amp; Goods Receipt</h2>
              <p className="muted">Receive against an issued PO, then track each receipt through its linked Supplier Invoice and allocated Supplier Payments.</p>
            </div>
            {props.canCreateGoodsReceipt && issuedPurchaseOrders.length > 0 && (
              <button type="button" className="client-primary-action" aria-haspopup="dialog" onClick={() => { createGoodsReceipt.reset(); goodsReceiptForm.clearErrors(); setReceiptDialogOpen(true); }}>
                <span aria-hidden="true">+</span> Receive goods
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Goods receipt</th><th>PO / Supplier</th><th>Received value</th><th>Invoiced</th><th>Paid</th><th>Remaining</th><th>Supplier invoices</th></tr></thead>
              <tbody>
                {goodsReceiptRows.map(({ purchaseOrder, receipt }) => {
                  const linkedInvoices = invoicesByGoodsReceipt.get(receipt.id) ?? [];
                  const invoicedMinorUnits = sumInvoiceMoney(linkedInvoices, 'totalAmount');
                  const paidMinorUnits = sumInvoiceMoney(linkedInvoices, 'allocatedAmount');
                  const receiptMinorUnits = moneyToMinorUnits(receipt.receivedAmount);
                  const remainingMinorUnits = receiptMinorUnits > paidMinorUnits ? receiptMinorUnits - paidMinorUnits : 0n;
                  return <tr key={receipt.id}>
                    <td>{receipt.receiptNo}<br /><small>{new Date(receipt.receivedAt).toLocaleString()} · {receipt.status}</small></td>
                    <td>{purchaseOrder.poNo}<br /><small>{vendorNames.get(purchaseOrder.vendorId) ?? 'Unknown supplier'}</small></td>
                    <td>{purchaseOrder.currency} {minorUnitsToMoney(receiptMinorUnits)}</td>
                    <td>{!props.canReadSupplierPayables ? 'Restricted' : supplierInvoices.isPending ? 'Loading…' : supplierInvoices.isError ? 'Unavailable' : `${purchaseOrder.currency} ${minorUnitsToMoney(invoicedMinorUnits)}`}</td>
                    <td>{!props.canReadSupplierPayables ? 'Restricted' : supplierInvoices.isPending ? 'Loading…' : supplierInvoices.isError ? 'Unavailable' : `${purchaseOrder.currency} ${minorUnitsToMoney(paidMinorUnits)}`}</td>
                    <td>{!props.canReadSupplierPayables ? 'Restricted' : supplierInvoices.isPending ? 'Loading…' : supplierInvoices.isError ? 'Unavailable' : `${purchaseOrder.currency} ${minorUnitsToMoney(remainingMinorUnits)}`}</td>
                    <td>
                      {!props.canReadSupplierPayables ? <small>Supplier Payables read permission required.</small> : supplierInvoices.isPending ? <small>Loading Supplier Invoices…</small> : supplierInvoices.isError ? <small>Supplier settlement could not be loaded.</small> : linkedInvoices.length === 0 ? <small>No Supplier Invoice linked yet.</small> : (
                        <details>
                          <summary>{linkedInvoices.length} invoice(s)</summary>
                          {linkedInvoices.map((invoice) => <div key={invoice.id}>{invoice.invoiceNo} · {invoice.status} · Total {purchaseOrder.currency} {invoice.totalAmount} · Paid {purchaseOrder.currency} {invoice.allocatedAmount} · Remaining {purchaseOrder.currency} {invoice.outstandingAmount}</div>)}
                        </details>
                      )}
                    </td>
                  </tr>;
                })}
                {allPurchaseOrders.isPending && <tr><td colSpan={7} className="muted">Loading Goods Receipts…</td></tr>}
                {allPurchaseOrders.isError && <tr><td colSpan={7} className="error-text">Goods Receipts could not be loaded.</td></tr>}
                {allPurchaseOrders.isSuccess && goodsReceiptRows.length === 0 && <tr><td colSpan={7} className="muted">No Goods Receipts have been posted for this Project yet.</td></tr>}
              </tbody>
            </table>
          </div>
          {latestGoodsReceipt && (
            <div className="goods-receipt-result" aria-live="polite">
              <div className="goods-receipt-result-header">
                <div>
                  <p className="eyebrow">Latest goods receipt</p>
                  <h3>{latestGoodsReceipt.receiptNo}</h3>
                </div>
                <span className="goods-receipt-result-status">{latestGoodsReceipt.status}</span>
              </div>
              <dl className="goods-receipt-result-meta">
                <div><dt>Purchase order</dt><dd>{latestReceiptPurchaseOrder?.poNo ?? '—'}</dd></div>
                <div><dt>Supplier</dt><dd>{vendorNames.get(latestGoodsReceipt.vendorId) ?? 'Unknown supplier'}</dd></div>
                <div><dt>Warehouse</dt><dd>MAIN · Main Warehouse</dd></div>
                <div><dt>Received at</dt><dd>{new Date(latestGoodsReceipt.receivedAt).toLocaleString()}</dd></div>
              </dl>
              <div className="table-wrap goods-receipt-result-lines">
                <table>
                  <thead><tr><th>Product</th><th>Delivered</th><th>Unit price</th><th>Accepted</th><th>Rejected</th><th>Batch</th></tr></thead>
                  <tbody>{latestGoodsReceipt.items.map((line) => {
                    const poLine = latestReceiptPurchaseOrder?.items.find((item) => item.id === line.poItemId);
                    const productName = poLine?.materialName ?? poLine?.description ?? 'Material';
                    return <tr key={line.id}>
                      <td>{productName}{poLine?.unit && <small>{poLine.unit}</small>}</td>
                      <td>{line.quantity}</td>
                      <td>{poLine && latestReceiptPurchaseOrder ? `${latestReceiptPurchaseOrder.currency} ${poLine.unitPrice} / ${poLine.unit}` : '—'}</td>
                      <td>{line.acceptedQuantity}</td>
                      <td>{line.rejectedQuantity}</td>
                      <td>{line.batchNo ?? '—'}</td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
              <button type="button" className="secondary-button" onClick={() => { createGoodsReceipt.reset(); goodsReceiptForm.clearErrors(); setReceiptDialogOpen(true); }}>Receive another delivery</button>
            </div>
          )}
        </section>
      )}

      {requisitionDialogOpen && props.canCreateRequisition && (
        <ProcurementModal titleId="procurement-requisition-dialog-title" eyebrow="Material requirement" title="Add requirement" onClose={() => setRequisitionDialogOpen(false)}>
          <form className="admin-form client-modal-form" onSubmit={requisitionForm.handleSubmit((values) => void handleCreateRequisition(values))}>
            <div className="client-form-grid">
              <label>Required date<input type="date" {...requisitionForm.register('requiredDate')} /></label>
              <label>Description<input {...requisitionForm.register('description')} /></label>
              <label>Quantity<input inputMode="decimal" {...requisitionForm.register('quantity')} /></label>
              <label>Unit<input value={selectedMaterial?.unit ?? ''} placeholder="Select material" readOnly /></label>
              <label>Material
                <select {...requisitionForm.register('materialId')}>
                  <option value="">Select material</option>
                  {materialOptions.map((material) => <option key={material.id} value={material.id}>{material.code} · {material.name} · {material.unit}</option>)}
                </select>
              </label>
              <label>Stage (optional)
                <select {...requisitionForm.register('stageId')} disabled={!props.canReadStages}>
                  <option value="">{props.canReadStages ? 'Project level' : 'Project level · Stage read permission required'}</option>
                  {stageOptions.map((stage) => <option key={stage.id} value={stage.id}>{stage.code} · {stage.name}</option>)}
                </select>
              </label>
              <label className="form-grid-wide">Notes<input {...requisitionForm.register('notes')} /></label>
            </div>
            {Object.values(requisitionForm.formState.errors)[0]?.message && <p className="error-text">{String(Object.values(requisitionForm.formState.errors)[0]?.message)}</p>}
            {createRequisition.error && <p className="error-text">{mutationMessage(createRequisition.error)}</p>}
            <div className="client-modal-actions">
              <button type="button" className="secondary-button" onClick={() => setRequisitionDialogOpen(false)}>Cancel</button>
              <button type="submit" disabled={createRequisition.isPending}>{createRequisition.isPending ? 'Creating…' : 'Create requirement'}</button>
            </div>
          </form>
        </ProcurementModal>
      )}

      {purchaseOrderDialogOpen && props.canCreatePurchaseOrder && approvedRequisitions.length > 0 && (
        <ProcurementModal titleId="procurement-po-dialog-title" eyebrow="Purchase order" title="Add purchase order" onClose={() => setPurchaseOrderDialogOpen(false)}>
          <form className="admin-form client-modal-form" onSubmit={purchaseOrderForm.handleSubmit((values) => void handleCreatePurchaseOrder(values))}>
            <div className="client-form-grid">
              <label>Approved requirement<select {...purchaseOrderForm.register('requisitionId')}><option value="">Select</option>{approvedRequisitions.map((item) => <option key={item.id} value={item.id}>{item.requestNo}</option>)}</select></label>
              <label>Vendor<select {...purchaseOrderForm.register('vendorId')}><option value="">Select</option>{(vendors.data?.items ?? []).filter((item) => item.status.toUpperCase() === 'ACTIVE' && item.qualificationStatus !== 'PENDING').map((item) => <option key={item.id} value={item.id}>{item.displayName} · {item.legalName} · {item.code} · {item.qualificationStatus ?? 'Not qualified'}</option>)}</select></label>
              <label>Order date<input type="date" {...purchaseOrderForm.register('orderDate')} /></label>
              <label>Currency<input {...purchaseOrderForm.register('currency')} /></label>
              <label>Delivery address<input {...purchaseOrderForm.register('deliveryAddress')} /></label>
              <label>Terms<input {...purchaseOrderForm.register('terms')} /></label>
              {selectedRequisition?.items.map((item) => <label key={item.id}>{item.description} unit price<input inputMode="decimal" {...purchaseOrderForm.register(`unitPrices.${item.id}`)} /></label>)}
            </div>
            {purchaseOrderForm.formState.errors.root?.message && <p className="error-text">{purchaseOrderForm.formState.errors.root.message}</p>}
            {createPurchaseOrder.error && <p className="error-text">{mutationMessage(createPurchaseOrder.error)}</p>}
            <div className="client-modal-actions">
              <button type="button" className="secondary-button" onClick={() => setPurchaseOrderDialogOpen(false)}>Cancel</button>
              <button type="submit" disabled={createPurchaseOrder.isPending || !selectedRequisition}>{createPurchaseOrder.isPending ? 'Creating…' : 'Select quotation & create PO'}</button>
            </div>
          </form>
        </ProcurementModal>
      )}

      {receiptDialogOpen && props.canCreateGoodsReceipt && issuedPurchaseOrders.length > 0 && (
        <ProcurementModal titleId="procurement-receipt-dialog-title" eyebrow="Goods receipt" title="Receive supplier delivery" onClose={() => setReceiptDialogOpen(false)} wide>
          <form className="admin-form client-modal-form" onSubmit={goodsReceiptForm.handleSubmit((values) => void handleCreateGoodsReceipt(values))}>
            <div className="client-form-grid">
              <label>Issued PO<select {...goodsReceiptForm.register('purchaseOrderId')}><option value="">Select</option>{issuedPurchaseOrders.map((item) => <option key={item.id} value={item.id}>{item.poNo} · {item.items.map((line) => line.materialName ?? line.description).join(', ')} · {item.currency} {item.totalAmount}</option>)}</select></label>
              <label>Main Warehouse<input value="MAIN · Main Warehouse" readOnly /></label>
            </div>
            {receiptPurchaseOrder && (
              <div className="table-wrap">
                <table className="goods-receipt-lines">
                  <thead><tr><th>Material</th><th>Ordered</th><th>Previously received</th><th>Open</th><th>Delivered now</th><th>Rejected</th><th>Accepted</th><th>Batch</th></tr></thead>
                  <tbody>{receiptPurchaseOrder.items.map((item) => {
                    const productName = item.materialName ?? item.description;
                    const open = openQuantity(item.quantity, item.receivedQuantity);
                    const delivered = goodsReceiptForm.watch(`deliveredQuantities.${item.id}`) ?? '';
                    const rejected = goodsReceiptForm.watch(`rejectedQuantities.${item.id}`) ?? '';
                    return <tr key={item.id}>
                      <td>{productName}<small>{item.unit}</small></td>
                      <td>{item.quantity}</td><td>{item.receivedQuantity}</td><td>{open}</td>
                      <td><input aria-label={`${productName} delivered now`} inputMode="decimal" placeholder="0" disabled={decimalToScale4(open) === 0n} {...goodsReceiptForm.register(`deliveredQuantities.${item.id}`)} /></td>
                      <td><input aria-label={`${productName} rejected quantity`} inputMode="decimal" placeholder="0" disabled={decimalToScale4(open) === 0n} {...goodsReceiptForm.register(`rejectedQuantities.${item.id}`)} /></td>
                      <td>{acceptedQuantityPreview(delivered, rejected)}</td>
                      <td><input aria-label={`${productName} batch number`} placeholder="Optional" disabled={decimalToScale4(open) === 0n} {...goodsReceiptForm.register(`batchNumbers.${item.id}`)} /></td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
            )}
            {goodsReceiptForm.formState.errors.purchaseOrderId?.message && <p className="error-text">{goodsReceiptForm.formState.errors.purchaseOrderId.message}</p>}
            {goodsReceiptForm.formState.errors.root?.message && <p className="error-text">{goodsReceiptForm.formState.errors.root.message}</p>}
            {createGoodsReceipt.error && <p className="error-text">{mutationMessage(createGoodsReceipt.error)}</p>}
            <div className="client-modal-actions">
              <button type="button" className="secondary-button" onClick={() => setReceiptDialogOpen(false)}>Cancel</button>
              <button type="submit" disabled={createGoodsReceipt.isPending || !receiptPurchaseOrder}>{createGoodsReceipt.isPending ? 'Posting receipt…' : 'Post partial / full receipt'}</button>
            </div>
          </form>
        </ProcurementModal>
      )}
    </div>
  );
}


/** Render one accessible Procurement create modal using the shared admin dialog styling. */
function ProcurementModal(props: Readonly<{ titleId: string; eyebrow: string; title: string; onClose: () => void; children: ReactNode; wide?: boolean }>) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') props.onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [props.onClose]);

  return (
    <div className="client-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <section className={`client-modal${props.wide ? ' client-modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={props.titleId}>
        <header className="client-modal-header">
          <div><p className="eyebrow">{props.eyebrow}</p><h2 id={props.titleId}>{props.title}</h2></div>
          <button type="button" className="client-modal-close" onClick={props.onClose} aria-label={`Close ${props.title}`}><span aria-hidden="true">×</span></button>
        </header>
        <div className="client-modal-body">{props.children}</div>
      </section>
    </div>
  );
}

type PurchaseOrderRowProps = Readonly<{ item: PurchaseOrder; vendorName: string; canIssue: boolean; onIssue(): void; onCancel(): void }>;

/** Render one Purchase Order row with only final lifecycle commands. */
function PurchaseOrderRow({ item, vendorName, canIssue, onIssue, onCancel }: PurchaseOrderRowProps) {
  const status = item.status.toUpperCase();
  const received = item.items.reduce((total, line) => total + decimalToScale4(line.receivedQuantity), 0n);
  const open = item.items.reduce((total, line) => total + decimalToScale4(openQuantity(line.quantity, line.receivedQuantity)), 0n);
  return <tr>
    <td>{item.poNo}<br /><small>Supplier {vendorName} · {item.orderDate} · {item.currency}</small><details><summary>{item.items.length} line(s)</summary>{item.items.map((line) => <div key={line.id}>{line.description} · {line.quantity} {line.unit} × {line.unitPrice} · Tax {line.taxRate} · Line total {line.lineTotal} · Received {line.receivedQuantity}</div>)}</details></td>
    <td>{item.items.map((line) => <div key={line.id}>{line.materialName ?? line.description}</div>)}</td>
    <td>{item.items.map((line) => <div key={line.id}>{line.quantity} {line.unit}</div>)}</td>
    <td>{item.items.map((line) => <div key={line.id}>{item.currency} {line.unitPrice}<small>per {line.unit}</small></div>)}</td>
    <td>{item.status}<br /><small>{item.cancelReason ?? 'No cancellation reason'}</small></td>
    <td>{item.totalAmount}<br /><small>Subtotal {item.subtotal} · Tax {item.taxAmount}</small></td>
    <td>{scale4ToDecimal(received)}</td><td>{scale4ToDecimal(open)}</td>
    <td><small>{item.deliveryAddress} · {item.terms}</small><br />{canIssue && status === 'DRAFT' && <button type="button" onClick={onIssue}>Issue</button>} {canIssue && (status === 'DRAFT' || status === 'ISSUED') && received === 0n && <button type="button" onClick={onCancel}>Cancel</button>}</td>
  </tr>;
}
