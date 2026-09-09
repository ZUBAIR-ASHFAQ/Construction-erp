import { usePermission } from '../../administration/hooks/auth.js';
import { EquipmentWorkspace } from '../components/equipment-workspace.js';

/** Render the Final-21 permission-aware Equipment Management workspace. */
export function EquipmentPage() {
  const canRead = usePermission('equipment.read');
  const canManage = usePermission('equipment.manage');
  const canAssign = usePermission('equipment.assign');
  const canRecordUsage = usePermission('equipment.usage.create');

  return (
    <section className="admin-stack" aria-labelledby="equipment-title">
      <div className="section-heading">
        <p className="eyebrow">Module 12 · Resources</p>
        <h1 id="equipment-title">Equipment Management</h1>
        <p className="muted">Register owned or rented equipment, assign it to project work, complete the assignment, and post its calculated cost automatically.</p>
      </div>

      <EquipmentWorkspace
        canRead={canRead}
        canManage={canManage}
        canAssign={canAssign}
        canRecordUsage={canRecordUsage}
      />
    </section>
  );
}
