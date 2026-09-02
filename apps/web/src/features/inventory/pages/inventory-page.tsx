import { usePermission } from '../../administration/hooks/auth.js';
import { InventoryWorkspace } from '../components/inventory-workspace.js';

/** Render Final Module 11 Inventory stock and movement management. */
export function InventoryPage() {
  const canRead = usePermission('inventory.read');
  const canIssue = usePermission('inventory.issue');
  const canTransfer = usePermission('inventory.transfer');
  const canAdjust = usePermission('inventory.adjust');

  return (
    <section className="admin-stack" aria-labelledby="inventory-title">
      <div className="section-heading">
        <p className="eyebrow">Module 11</p>
        <h1 id="inventory-title">Inventory</h1>
        <p className="muted">See material quantity on hand by warehouse and manage Project/Stage issues, transfers and controlled adjustments through the append-only stock ledger. Material master creation is kept on the separate Materials page.</p>
      </div>
      <InventoryWorkspace canRead={canRead} canIssue={canIssue} canTransfer={canTransfer} canAdjust={canAdjust} />
    </section>
  );
}
