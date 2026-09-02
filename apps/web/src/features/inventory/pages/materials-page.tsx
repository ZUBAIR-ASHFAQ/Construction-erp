import { usePermission } from '../../administration/hooks/auth.js';
import { MaterialsWorkspace } from '../components/materials-workspace.js';

/** Render the standalone Company Material master page. */
export function MaterialsPage() {
  const canManage = usePermission('materials.manage');
  const canRead = usePermission('inventory.read') || canManage;

  return (
    <section className="admin-stack" aria-labelledby="materials-title">
      <div className="section-heading">
        <p className="eyebrow">Module 11</p>
        <h1 id="materials-title">Materials</h1>
        <p className="muted">Create the shared Company material master used by Procurement, Goods Receipts and Inventory transactions. Material creation does not change stock quantity.</p>
      </div>
      <MaterialsWorkspace canRead={canRead} canManage={canManage} />
    </section>
  );
}
