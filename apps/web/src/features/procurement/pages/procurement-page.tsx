import { useState } from 'react';
import { useProjects } from '../../projects/hooks/projects.js';
import { usePermission } from '../../administration/hooks/auth.js';
import { ProcurementWorkspace } from '../components/procurement-workspace.js';

/** Render one Project-scoped Final-21 Procurement workflow. */
export function ProcurementPage() {
  const canRead = usePermission('procurement.read');
  const canCreateRequisition = usePermission('requisitions.create');
  const canApproveRequisition = usePermission('requisitions.approve');
  const canCreatePurchaseOrder = usePermission('purchase_orders.create');
  const canIssuePurchaseOrder = usePermission('purchase_orders.issue');
  const canCreateGoodsReceipt = usePermission('goods_receipts.create');
  const canReadInventory = usePermission('inventory.read');
  const canReadStages = usePermission('stages.read');
  const projects = useProjects({ page: 1, pageSize: 100 }, canRead || canCreateRequisition || canCreatePurchaseOrder);
  const [projectId, setProjectId] = useState('');

  return (
    <section className="admin-stack" aria-labelledby="procurement-title">
      <div className="section-heading">
        <p className="eyebrow">Final Module 10</p>
        <h1 id="procurement-title">Procurement / Purchase</h1>
        <p className="muted">Material Requirement → Purchase Order → Goods Receipt.</p>
      </div>
      <section className="admin-card">
        <label>Project<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Select a Project</option>{(projects.data?.items ?? []).map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}</select></label>
      </section>
      {projectId && <ProcurementWorkspace projectId={projectId} canRead={canRead} canCreateRequisition={canCreateRequisition} canApproveRequisition={canApproveRequisition} canCreatePurchaseOrder={canCreatePurchaseOrder} canIssuePurchaseOrder={canIssuePurchaseOrder} canCreateGoodsReceipt={canCreateGoodsReceipt} canReadInventory={canReadInventory} canReadStages={canReadStages} />}
    </section>
  );
}
