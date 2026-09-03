import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useInventoryStock, useMaterials } from '../../inventory/hooks/inventory.js';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import type { PurchaseOrder } from '../api/procurement-api.js';
import { ProcurementFlow } from './procurement-flow.js';
import {
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
  canCreateRequisition: boolean;
  canApproveRequisition: boolean;
  canCreatePurchaseOrder: boolean;
  canIssuePurchaseOrder: boolean;
  canCreateGoodsReceipt: boolean;
  canReadInventory: boolean;
  canReadStages: boolean;
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
  warehouseId: uuidSchema,
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

/** Display one mutation error without exposing internal objects. */
function mutationMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

/** Render the simplified Final-21 Material Requirement -> PO -> Goods Receipt workflow. */
export function ProcurementWorkspace(props: ProcurementWorkspaceProps) {
  const requisitions = useRequisitions(props.projectId);
  const purchaseOrders = useProcurementPurchaseOrders(props.projectId);
  const vendors = useProcurementVendors();
  const vendorNames = useMemo(() => new Map((vendors.data?.items ?? []).map((vendor) => [vendor.id, vendor.displayName])), [vendors.data?.items]);
  const createRequisition = useCreateRequisition();
  const approveRequisition = useApproveRequisition();
  const createPurchaseOrder = useCreateProcurementPurchaseOrder();
  const issuePurchaseOrder = useIssueProcurementPurchaseOrder();
  const cancelPurchaseOrder = useCancelProcurementPurchaseOrder();
  const createGoodsReceipt = useCreateGoodsReceipt();
  const materials = useMaterials(props.canCreateRequisition);
  const stock = useInventoryStock(undefined, props.canReadInventory && props.canCreateGoodsReceipt);
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
    defaultValues: { purchaseOrderId: '', warehouseId: '', deliveredQuantities: {}, rejectedQuantities: {}, batchNumbers: {} }
  });

  const approvedRequisitions = useMemo(
    () => (requisitions.data?.items ?? []).filter((item) => item.status.toUpperCase() === 'APPROVED'),
    [requisitions.data]
  );
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
  const warehouseOptions = (stock.data?.warehouses ?? []).filter((item) => item.status.toUpperCase() === 'ACTIVE');
  const stageOptions = stages.data?.items ?? [];

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
  }

  /** Receive every still-open material line of the selected issued PO into one Warehouse. */
  async function handleCreateGoodsReceipt(values: GoodsReceiptFormValues): Promise<void> {
    if (!receiptPurchaseOrder) return;
    let validationMessage: string | null = null;
    const receiptLines = receiptPurchaseOrder.items.flatMap((item) => {
      const delivered = values.deliveredQuantities[item.id]?.trim() ?? '';
      if (delivered === '' || delivered === '0') return [];
      if (!positiveDecimalSchema.safeParse(delivered).success) {
        validationMessage = `Enter a valid delivered quantity for ${item.description}.`;
        return [];
      }
      const open = openQuantity(item.quantity, item.receivedQuantity);
      const rejected = values.rejectedQuantities[item.id]?.trim() || '0';
      if (!nonNegativeDecimalSchema.safeParse(rejected).success) {
        validationMessage = `Enter a valid rejected quantity for ${item.description}.`;
        return [];
      }
      if (decimalToScale4(delivered) > decimalToScale4(open)) {
        validationMessage = `${item.description}: delivered quantity cannot exceed the open quantity (${open}).`;
        return [];
      }
      if (decimalToScale4(rejected) > decimalToScale4(delivered)) {
        validationMessage = `${item.description}: rejected quantity cannot exceed delivered quantity.`;
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
      warehouseId: values.warehouseId,
      items: receiptLines
    });
    goodsReceiptForm.reset({ purchaseOrderId: receiptPurchaseOrder.id, warehouseId: values.warehouseId, deliveredQuantities: {}, rejectedQuantities: {}, batchNumbers: {} });
  }

  return (
    <div className="admin-stack">
      <ProcurementFlow
        requisitions={requisitions.data?.items ?? []}
        purchaseOrders={purchaseOrders.data?.items ?? []}
        onOpen={(sectionId) => document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      />
      <section className="admin-card procurement-stage-card" id="procurement-rfq">
        <p className="eyebrow">Step 1</p>
        <h2>RFQ / Material requirement</h2>
        <p className="muted">Define what the Project needs, then approve it before requesting commercial offers.</p>
        {props.canCreateRequisition && (
          <form className="form-grid" onSubmit={requisitionForm.handleSubmit((values) => void handleCreateRequisition(values))}>
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
            <button type="submit" disabled={createRequisition.isPending}>Create requirement</button>
          </form>
        )}
        {Object.values(requisitionForm.formState.errors)[0]?.message && <p className="error-text">{String(Object.values(requisitionForm.formState.errors)[0]?.message)}</p>}
        {createRequisition.error && <p className="error-text">{mutationMessage(createRequisition.error)}</p>}
        <div className="table-wrap">
          <table><thead><tr><th>No.</th><th>Required</th><th>Requested by</th><th>Status</th><th>Lines</th><th>Action</th></tr></thead><tbody>
            {(requisitions.data?.items ?? []).map((item) => (
              <tr key={item.id}>
                <td>{item.requestNo}<br /><small>{item.notes ?? 'No notes'}</small></td>
                <td>{item.requiredDate}</td><td>{item.requestedBy}</td><td>{item.status}</td>
                <td><details><summary>{item.items.length} line(s)</summary>{item.items.map((line) => <div key={line.id}>{line.description} · {line.quantity} {line.unit}</div>)}</details></td>
                <td>{props.canApproveRequisition && item.status.toUpperCase() === 'DRAFT' && <button type="button" onClick={() => approveRequisition.mutate(item.id)}>Approve</button>}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </section>

      <section className="admin-card procurement-stage-card" id="procurement-po">
        <p className="eyebrow">Steps 2–8</p>
        <h2>Vendor sourcing &amp; Purchase Orders</h2>
        <p className="muted">Use approved requirements to evaluate qualified vendors, record the selected commercial terms, create the PO, and issue it. PO issue posts the budget commitment.</p>
        {props.canCreatePurchaseOrder && approvedRequisitions.length > 0 && (
          <form className="form-grid" onSubmit={purchaseOrderForm.handleSubmit((values) => void handleCreatePurchaseOrder(values))}>
            <label>Approved requirement<select {...purchaseOrderForm.register('requisitionId')}><option value="">Select</option>{approvedRequisitions.map((item) => <option key={item.id} value={item.id}>{item.requestNo}</option>)}</select></label>
            <label>Vendor<select {...purchaseOrderForm.register('vendorId')}><option value="">Select</option>{(vendors.data?.items ?? []).filter((item) => item.status.toUpperCase() === 'ACTIVE' && item.qualificationStatus !== 'PENDING').map((item) => <option key={item.id} value={item.id}>{item.displayName} · {item.legalName} · {item.code} · {item.qualificationStatus ?? 'Not qualified'}</option>)}</select></label>
            <label>Order date<input type="date" {...purchaseOrderForm.register('orderDate')} /></label>
            <label>Currency<input {...purchaseOrderForm.register('currency')} /></label>
            <label>Delivery address<input {...purchaseOrderForm.register('deliveryAddress')} /></label>
            <label>Terms<input {...purchaseOrderForm.register('terms')} /></label>
            {selectedRequisition?.items.map((item) => <label key={item.id}>{item.description} unit price<input inputMode="decimal" {...purchaseOrderForm.register(`unitPrices.${item.id}`)} /></label>)}
            <button type="submit" disabled={createPurchaseOrder.isPending || !selectedRequisition}>{createPurchaseOrder.isPending ? 'Creating…' : 'Select quotation & create PO'}</button>
          </form>
        )}
        {purchaseOrderForm.formState.errors.root?.message && <p className="error-text">{purchaseOrderForm.formState.errors.root.message}</p>}
        {createPurchaseOrder.error && <p className="error-text">{mutationMessage(createPurchaseOrder.error)}</p>}
        <div className="table-wrap"><table><thead><tr><th>PO</th><th>Status</th><th>Total</th><th>Received</th><th>Open</th><th>Actions</th></tr></thead><tbody>
          {(purchaseOrders.data?.items ?? []).map((item) => <PurchaseOrderRow key={item.id} item={item} vendorName={vendorNames.get(item.vendorId) ?? 'Unknown supplier'} canIssue={props.canIssuePurchaseOrder} onIssue={() => issuePurchaseOrder.mutate(item.id)} onCancel={() => cancelPurchaseOrder.mutate({ id: item.id, reason: 'Cancelled by authorized Procurement user.' })} />)}
        </tbody></table></div>
      </section>

      {props.canCreateGoodsReceipt && issuedPurchaseOrders.length > 0 && (
        <section className="admin-card procurement-stage-card" id="procurement-receipt">
          <p className="eyebrow">Steps 9–11</p>
          <h2>Supplier delivery &amp; Goods Receipt</h2>
          <p className="muted">Receive only against an issued PO. Accepted quantities are posted to the selected warehouse and become Inventory stock.</p>
          <form className="form-grid" onSubmit={goodsReceiptForm.handleSubmit((values) => void handleCreateGoodsReceipt(values))}>
            <label>Issued PO<select {...goodsReceiptForm.register('purchaseOrderId')}><option value="">Select</option>{issuedPurchaseOrders.map((item) => <option key={item.id} value={item.id}>{item.poNo}</option>)}</select></label>
            <label>Warehouse
              <select {...goodsReceiptForm.register('warehouseId')} disabled={!props.canReadInventory}>
                <option value="">{props.canReadInventory ? 'Select warehouse' : 'Inventory read permission required'}</option>
                {warehouseOptions.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}
              </select>
            </label>
            {receiptPurchaseOrder && (
              <div className="form-grid-wide table-wrap">
                <table className="goods-receipt-lines">
                  <thead><tr><th>Material</th><th>Ordered</th><th>Previously received</th><th>Open</th><th>Delivered now</th><th>Rejected</th><th>Accepted</th><th>Batch</th></tr></thead>
                  <tbody>{receiptPurchaseOrder.items.map((item) => {
                    const open = openQuantity(item.quantity, item.receivedQuantity);
                    const delivered = goodsReceiptForm.watch(`deliveredQuantities.${item.id}`) ?? '';
                    const rejected = goodsReceiptForm.watch(`rejectedQuantities.${item.id}`) ?? '';
                    return <tr key={item.id}>
                      <td>{item.description}<small>{item.unit}</small></td>
                      <td>{item.quantity}</td><td>{item.receivedQuantity}</td><td>{open}</td>
                      <td><input aria-label={`${item.description} delivered now`} inputMode="decimal" placeholder="0" disabled={decimalToScale4(open) === 0n} {...goodsReceiptForm.register(`deliveredQuantities.${item.id}`)} /></td>
                      <td><input aria-label={`${item.description} rejected quantity`} inputMode="decimal" placeholder="0" disabled={decimalToScale4(open) === 0n} {...goodsReceiptForm.register(`rejectedQuantities.${item.id}`)} /></td>
                      <td>{acceptedQuantityPreview(delivered, rejected)}</td>
                      <td><input aria-label={`${item.description} batch number`} placeholder="Optional" disabled={decimalToScale4(open) === 0n} {...goodsReceiptForm.register(`batchNumbers.${item.id}`)} /></td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
            )}
            <button type="submit" disabled={createGoodsReceipt.isPending || !receiptPurchaseOrder || !props.canReadInventory}>{createGoodsReceipt.isPending ? 'Posting receipt…' : 'Post partial / full receipt'}</button>
          </form>
          {!props.canReadInventory && <p className="muted"><code>inventory.read</code> is required for the Warehouse selector; raw Warehouse IDs are not accepted.</p>}
          {goodsReceiptForm.formState.errors.purchaseOrderId?.message && <p className="error-text">{goodsReceiptForm.formState.errors.purchaseOrderId.message}</p>}
          {goodsReceiptForm.formState.errors.warehouseId?.message && <p className="error-text">{goodsReceiptForm.formState.errors.warehouseId.message}</p>}
          {goodsReceiptForm.formState.errors.root?.message && <p className="error-text">{goodsReceiptForm.formState.errors.root.message}</p>}
          {stock.error instanceof Error && <p className="error-text">Warehouses could not be loaded: {stock.error.message}</p>}
          {createGoodsReceipt.error && <p className="error-text">{mutationMessage(createGoodsReceipt.error)}</p>}
          {createGoodsReceipt.data && (
            <div className="muted">
              <strong>{createGoodsReceipt.data.receiptNo}</strong> · {createGoodsReceipt.data.status} · Received {new Date(createGoodsReceipt.data.receivedAt).toLocaleString()} · Supplier {vendorNames.get(createGoodsReceipt.data.vendorId) ?? 'Unknown supplier'}
              {createGoodsReceipt.data.items.map((line) => <div key={line.id}>{(materials.data?.items ?? []).find((material) => material.id === line.materialId)?.name ?? 'Material'} · Qty {line.quantity} · Accepted {line.acceptedQuantity} · Rejected {line.rejectedQuantity} · Batch {line.batchNo ?? '—'}</div>)}
            </div>
          )}
        </section>
      )}
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
    <td>{item.status}<br /><small>{item.cancelReason ?? 'No cancellation reason'}</small></td>
    <td>{item.totalAmount}<br /><small>Subtotal {item.subtotal} · Tax {item.taxAmount}</small></td>
    <td>{scale4ToDecimal(received)}</td><td>{scale4ToDecimal(open)}</td>
    <td><small>{item.deliveryAddress} · {item.terms}</small><br />{canIssue && status === 'DRAFT' && <button type="button" onClick={onIssue}>Issue</button>} {canIssue && (status === 'DRAFT' || status === 'ISSUED') && received === 0n && <button type="button" onClick={onCancel}>Cancel</button>}</td>
  </tr>;
}
