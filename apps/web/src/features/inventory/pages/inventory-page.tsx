import { usePermission } from '../../administration/hooks/auth.js';
import { InventoryWorkspace } from '../components/inventory-workspace.js';

/** Render Final Module 11 Inventory / Material Management. */
export function InventoryPage() {
  const canRead = usePermission('inventory.read');
  const canManageMaterials = usePermission('materials.manage');
  const canIssue = usePermission('inventory.issue');
  const canTransfer = usePermission('inventory.transfer');
  const canAdjust = usePermission('inventory.adjust');

  return (
    <section className="admin-stack" aria-labelledby="inventory-title">
      <div className="section-heading">
        <p className="eyebrow">Module 11</p>
        <h1 id="inventory-title">Inventory / Material Management</h1>
        <p className="muted">Track material receipt, warehouse stock, Project/Stage issues, transfers and controlled adjustments through one append-only stock ledger. Material issues create source-derived Project cost; posted stock history is never deleted.</p>
      </div>
      <InventoryWorkspace canRead={canRead} canManageMaterials={canManageMaterials} canIssue={canIssue} canTransfer={canTransfer} canAdjust={canAdjust} />
    </section>
  );
}
