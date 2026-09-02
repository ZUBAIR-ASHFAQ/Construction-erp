import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useInventoryStock, useMaterials } from '../../inventory/hooks/inventory.js';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import type { PurchaseOrder } from '../api/procurement-api.js';
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
const textSchema = z.string().trim().min(1, 'This field is required.');

const requisitionFormSchema = z.object({
  requiredDate: z.string().date('Choose a valid required date.'),
  materialId: uuidSchema,
  description: textSchema.max(500),
  quantity: positiveDecimalSchema,
  unit: textSchema.max(64),
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
  warehouseId: uuidSchema
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

/** Display one mutation error without exposing internal objects. */
function mutationMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

/** Render the simplified Final-21 Material Requirement -> PO -> Goods Receipt workflow. */
export function ProcurementWorkspace(props: ProcurementWorkspaceProps) {
  const requisitions = useRequisitions(props.projectId);
  const purchaseOrders = useProcurementPurchaseOrders(props.projectId);
  const vendors = useProcurementVendors();
  const createRequisition = useCreateRequisition();
  const approveRequisition = useApproveRequisition();
  const createPurchaseOrder = useCreateProcurementPurchaseOrder();
  const issuePurchaseOrder = useIssueProcurementPurchaseOrder();
  const cancelPurchaseOrder = useCancelProcurementPurchaseOrder();
  const createGoodsReceipt = useCreateGoodsReceipt();
  const materials = useMaterials(props.canCreateRequisition);
  const stock = useInventoryStock(props.canReadInventory && props.canCreateGoodsReceipt);
  const stages = useProjectStages(props.projectId, props.canReadStages && props.canCreateRequisition);

  const requisitionForm = useForm<RequisitionFormValues>({
    resolver: zodResolver(requisitionFormSchema),
    defaultValues: { requiredDate: '', materialId: '', description: '', quantity: '1', unit: 'unit', stageId: '', notes: '' }
  });
  const purchaseOrderForm = useForm<PurchaseOrderFormValues>({
    resolver: zodResolver(purchaseOrderFormSchema),
    defaultValues: { requisitionId: '', vendorId: '', orderDate: '', currency: 'PKR', deliveryAddress: '', terms: 'Standard payment terms', unitPrices: {} }
  });
  const goodsReceiptForm = useForm<GoodsReceiptFormValues>({
    resolver: zodResolver(goodsReceiptFormSchema),
    defaultValues: { purchaseOrderId: '', warehouseId: '' }
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
  const warehouseOptions = (stock.data?.warehouses ?? []).filter((item) => item.status.toUpperCase() === 'ACTIVE');
  const stageOptions = stages.data?.items ?? [];

  /** Submit one material requirement line for the selected Project. */
  async function handleCreateRequisition(values: RequisitionFormValues): Promise<void> {
    await createRequisition.mutateAsync({
      projectId: props.projectId,
      stageId: values.stageId || null,
      requiredDate: values.requiredDate,
      ...(values.notes ? { notes: values.notes } : {}),
      items: [{
        materialId: values.materialId,
        description: values.description,
        quantity: values.quantity,
        unit: values.unit,
        ...(values.stageId ? { stageId: values.stageId } : {})
      }]
    });
    requisitionForm.reset({ requiredDate: values.requiredDate, materialId: '', description: '', quantity: '1', unit: values.unit, stageId: '', notes: '' });
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
    const openItems = receiptPurchaseOrder.items
      .map((item) => ({ item, open: openQuantity(item.quantity, item.receivedQuantity) }))
      .filter(({ item, open }) => item.materialId !== null && decimalToScale4(open) > 0n);
    if (openItems.length === 0) {
      goodsReceiptForm.setError('root', { message: 'This Purchase Order has no open material quantity to receive.' });
      return;
    }

    await createGoodsReceipt.mutateAsync({
      purchaseOrderId: receiptPurchaseOrder.id,
      warehouseId: values.warehouseId,
      items: openItems.map(({ item, open }) => ({
        poItemId: item.id,
        materialId: item.materialId as string,
        quantity: open,
        acceptedQuantity: open,
        rejectedQuantity: '0'
      }))
    });
  }

  return (
    <div className="admin-stack">
      <section className="admin-card">
        <h2>Material requirements</h2>
        {props.canCreateRequisition && (
          <form className="form-grid" onSubmit={requisitionForm.handleSubmit((values) => void handleCreateRequisition(values))}>
            <label>Required date<input type="date" {...requisitionForm.register('requiredDate')} /></label>
            <label>Description<input {...requisitionForm.register('description')} /></label>
            <label>Quantity<input inputMode="decimal" {...requisitionForm.register('quantity')} /></label>
            <label>Unit<input {...requisitionForm.register('unit')} /></label>
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
                <td>{item.requestNo}<br /><small>Project {item.projectId} · Stage {item.stageId ?? 'Project level'} · {item.notes ?? 'No notes'} · {item.id}</small></td>
                <td>{item.requiredDate}</td><td>{item.requestedBy}</td><td>{item.status}</td>
                <td><details><summary>{item.items.length} line(s)</summary>{item.items.map((line) => <div key={line.id}>{line.description} · {line.quantity} {line.unit} · Material {line.materialId ?? '—'} · Stage {line.stageId ?? 'Project level'} · Line {line.id} · Requisition {line.requisitionId}</div>)}</details></td>
                <td>{props.canApproveRequisition && item.status.toUpperCase() === 'DRAFT' && <button type="button" onClick={() => approveRequisition.mutate(item.id)}>Approve</button>}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </section>

      <section className="admin-card">
        <h2>Purchase Orders</h2>
        {props.canCreatePurchaseOrder && approvedRequisitions.length > 0 && (
          <form className="form-grid" onSubmit={purchaseOrderForm.handleSubmit((values) => void handleCreatePurchaseOrder(values))}>
            <label>Approved requirement<select {...purchaseOrderForm.register('requisitionId')}><option value="">Select</option>{approvedRequisitions.map((item) => <option key={item.id} value={item.id}>{item.requestNo}</option>)}</select></label>
            <label>Vendor<select {...purchaseOrderForm.register('vendorId')}><option value="">Select</option>{(vendors.data?.items ?? []).filter((item) => item.status.toUpperCase() === 'ACTIVE' && item.qualificationStatus !== 'PENDING').map((item) => <option key={item.id} value={item.id}>{item.displayName} · {item.legalName} · {item.code} · {item.qualificationStatus ?? 'Not qualified'}</option>)}</select></label>
            <label>Order date<input type="date" {...purchaseOrderForm.register('orderDate')} /></label>
            <label>Currency<input {...purchaseOrderForm.register('currency')} /></label>
            <label>Delivery address<input {...purchaseOrderForm.register('deliveryAddress')} /></label>
            <label>Terms<input {...purchaseOrderForm.register('terms')} /></label>
            {selectedRequisition?.items.map((item) => <label key={item.id}>{item.description} unit price<input inputMode="decimal" {...purchaseOrderForm.register(`unitPrices.${item.id}`)} /></label>)}
            <button type="submit" disabled={createPurchaseOrder.isPending || !selectedRequisition}>Create PO</button>
          </form>
        )}
        {purchaseOrderForm.formState.errors.root?.message && <p className="error-text">{purchaseOrderForm.formState.errors.root.message}</p>}
        {createPurchaseOrder.error && <p className="error-text">{mutationMessage(createPurchaseOrder.error)}</p>}
        <div className="table-wrap"><table><thead><tr><th>PO</th><th>Status</th><th>Total</th><th>Received</th><th>Open</th><th>Actions</th></tr></thead><tbody>
          {(purchaseOrders.data?.items ?? []).map((item) => <PurchaseOrderRow key={item.id} item={item} canIssue={props.canIssuePurchaseOrder} onIssue={() => issuePurchaseOrder.mutate(item.id)} onCancel={() => cancelPurchaseOrder.mutate({ id: item.id, reason: 'Cancelled by authorized Procurement user.' })} />)}
        </tbody></table></div>
      </section>

      {props.canCreateGoodsReceipt && issuedPurchaseOrders.length > 0 && (
        <section className="admin-card">
          <h2>Goods Receipt</h2>
          <form className="form-grid" onSubmit={goodsReceiptForm.handleSubmit((values) => void handleCreateGoodsReceipt(values))}>
            <label>Issued PO<select {...goodsReceiptForm.register('purchaseOrderId')}><option value="">Select</option>{issuedPurchaseOrders.map((item) => <option key={item.id} value={item.id}>{item.poNo}</option>)}</select></label>
            <label>Warehouse
              <select {...goodsReceiptForm.register('warehouseId')} disabled={!props.canReadInventory}>
                <option value="">{props.canReadInventory ? 'Select warehouse' : 'Inventory read permission required'}</option>
                {warehouseOptions.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}
              </select>
            </label>
            <button type="submit" disabled={createGoodsReceipt.isPending || !receiptPurchaseOrder || !props.canReadInventory}>Receive open quantities</button>
          </form>
          {!props.canReadInventory && <p className="muted"><code>inventory.read</code> is required for the Warehouse selector; raw Warehouse IDs are not accepted.</p>}
          {goodsReceiptForm.formState.errors.root?.message && <p className="error-text">{goodsReceiptForm.formState.errors.root.message}</p>}
          {createGoodsReceipt.error && <p className="error-text">{mutationMessage(createGoodsReceipt.error)}</p>}
          {createGoodsReceipt.data && (
            <div className="muted">
              <strong>{createGoodsReceipt.data.receiptNo}</strong> · {createGoodsReceipt.data.status} · Received {new Date(createGoodsReceipt.data.receivedAt).toLocaleString()} by {createGoodsReceipt.data.receivedBy} · Project {createGoodsReceipt.data.projectId} · Vendor {createGoodsReceipt.data.vendorId} · Warehouse {createGoodsReceipt.data.warehouseId} · PO {createGoodsReceipt.data.purchaseOrderId} · Receipt {createGoodsReceipt.data.id}
              {createGoodsReceipt.data.items.map((line) => <div key={line.id}>Item {line.id} · GR {line.goodsReceiptId} · PO line {line.poItemId} · Material {line.materialId} · Stage {line.stageId ?? 'Project level'} · Qty {line.quantity} · Accepted {line.acceptedQuantity} · Rejected {line.rejectedQuantity} · Batch {line.batchNo ?? '—'}</div>)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

type PurchaseOrderRowProps = Readonly<{ item: PurchaseOrder; canIssue: boolean; onIssue(): void; onCancel(): void }>;

/** Render one Purchase Order row with only final lifecycle commands. */
function PurchaseOrderRow({ item, canIssue, onIssue, onCancel }: PurchaseOrderRowProps) {
  const status = item.status.toUpperCase();
  const received = item.items.reduce((total, line) => total + decimalToScale4(line.receivedQuantity), 0n);
  const open = item.items.reduce((total, line) => total + decimalToScale4(openQuantity(line.quantity, line.receivedQuantity)), 0n);
  return <tr>
    <td>{item.poNo}<br /><small>Project {item.projectId} · Requisition {item.requisitionId ?? '—'} · Vendor {item.vendorId} · {item.orderDate} · {item.currency} · {item.id}</small><details><summary>{item.items.length} line(s)</summary>{item.items.map((line) => <div key={line.id}>{line.description} · {line.quantity} {line.unit} × {line.unitPrice} · Tax {line.taxRate} · Line total {line.lineTotal} · Received {line.receivedQuantity} · Material {line.materialId ?? '—'} · Stage {line.stageId ?? 'Project level'} · Requisition line {line.requisitionItemId ?? '—'} · PO line {line.id} · PO {line.purchaseOrderId}</div>)}</details></td>
    <td>{item.status}<br /><small>{item.cancelReason ?? 'No cancellation reason'}</small></td>
    <td>{item.totalAmount}<br /><small>Subtotal {item.subtotal} · Tax {item.taxAmount}</small></td>
    <td>{scale4ToDecimal(received)}</td><td>{scale4ToDecimal(open)}</td>
    <td><small>{item.deliveryAddress} · {item.terms}</small><br />{canIssue && status === 'DRAFT' && <button type="button" onClick={onIssue}>Issue</button>} {canIssue && (status === 'DRAFT' || status === 'ISSUED') && received === 0n && <button type="button" onClick={onCancel}>Cancel</button>}</td>
  </tr>;
}
