import type { PurchaseOrder, PurchaseRequisition } from '../api/procurement-api.js';

type ProcurementFlowProps = Readonly<{
  requisitions: readonly PurchaseRequisition[];
  purchaseOrders: readonly PurchaseOrder[];
  onOpen(sectionId: 'procurement-rfq' | 'procurement-po' | 'procurement-receipt'): void;
}>;

type FlowState = 'complete' | 'current' | 'waiting';
type SectionId = 'procurement-rfq' | 'procurement-po' | 'procurement-receipt';
type FlowStep = Readonly<{ label: string; detail: string; state: FlowState; sectionId?: SectionId }>;

/** Present the complete purchase-to-pay chain while keeping server-owned records authoritative. */
export function ProcurementFlow({ requisitions, purchaseOrders, onOpen }: ProcurementFlowProps) {
  const hasRequest = requisitions.length > 0;
  const hasApprovedRequest = requisitions.some((item) => item.status.toUpperCase() === 'APPROVED');
  const hasPo = purchaseOrders.length > 0;
  const hasIssuedPo = purchaseOrders.some((item) => item.status.toUpperCase() === 'ISSUED');
  const hasReceipt = purchaseOrders.some((order) => order.items.some((item) => Number(item.receivedQuantity) > 0));
  const state = (complete: boolean, available: boolean): FlowState => complete ? 'complete' : available ? 'current' : 'waiting';
  const steps: FlowStep[] = [
    { label: 'RFQ', detail: hasApprovedRequest ? 'Requirement approved' : hasRequest ? 'Awaiting approval' : 'Create requirement', state: state(hasApprovedRequest, true), sectionId: 'procurement-rfq' },
    { label: 'Vendor invitations', detail: 'Invite qualified suppliers', state: state(hasPo, hasApprovedRequest), sectionId: 'procurement-po' },
    { label: 'Vendor quotations', detail: 'Capture commercial offers', state: state(hasPo, hasApprovedRequest), sectionId: 'procurement-po' },
    { label: 'Quotation comparison', detail: 'Compare price and terms', state: state(hasPo, hasApprovedRequest), sectionId: 'procurement-po' },
    { label: 'Vendor selection', detail: hasPo ? 'Supplier selected' : 'Select winning offer', state: state(hasPo, hasApprovedRequest), sectionId: 'procurement-po' },
    { label: 'Purchase order', detail: hasPo ? `${purchaseOrders.length} order(s)` : 'Create draft PO', state: state(hasPo, hasApprovedRequest), sectionId: 'procurement-po' },
    { label: 'PO approval', detail: hasIssuedPo ? 'Authorized' : 'Awaiting authorization', state: state(hasIssuedPo, hasPo), sectionId: 'procurement-po' },
    { label: 'PO issue', detail: hasIssuedPo ? 'Issued to supplier' : 'Issue authorized PO', state: state(hasIssuedPo, hasPo), sectionId: 'procurement-po' },
    { label: 'Supplier delivery', detail: hasReceipt ? 'Delivery recorded' : 'Await delivery', state: state(hasReceipt, hasIssuedPo), sectionId: 'procurement-receipt' },
    { label: 'Goods receipt', detail: hasReceipt ? 'Goods received' : 'Inspect and receive', state: state(hasReceipt, hasIssuedPo), sectionId: 'procurement-receipt' },
    { label: 'Inventory / stock', detail: hasReceipt ? 'Stock updated' : 'Post accepted quantity', state: state(hasReceipt, false) },
    { label: 'Supplier invoice', detail: 'Match PO and receipt', state: state(false, hasReceipt) },
    { label: 'Finance / AP', detail: 'Post and settle payable', state: 'waiting' }
  ];

  return (
    <section className="admin-card procurement-flow-card" aria-labelledby="procurement-flow-title">
      <div className="section-heading compact-heading">
        <div><p className="eyebrow">Purchase-to-pay workflow</p><h2 id="procurement-flow-title">Procurement progress</h2></div>
        <div className="procurement-flow-legend" aria-label="Workflow status legend"><span><i className="complete" /> Complete</span><span><i className="current" /> Ready</span><span><i className="waiting" /> Waiting</span></div>
      </div>
      <ol className="procurement-flow" aria-label="Procurement workflow">
        {steps.map((step, index) => (
          <li key={step.label} className={`procurement-flow-step is-${step.state}`} aria-current={step.state === 'current' ? 'step' : undefined}>
            <button type="button" disabled={!step.sectionId || step.state === 'waiting'} onClick={() => step.sectionId && onOpen(step.sectionId)}>
              <span className="procurement-flow-number">{step.state === 'complete' ? '✓' : index + 1}</span>
              <span><strong>{step.label}</strong><small>{step.detail}</small></span>
            </button>
            {step.label === 'PO issue' && <span className="procurement-commitment-branch">Budget commitment</span>}
          </li>
        ))}
      </ol>
      <p className="procurement-flow-note">Issuing a PO creates the budget commitment. Accepted goods update Inventory; Supplier Invoice and Accounts Payable continue in Supplier Payables.</p>
    </section>
  );
}
