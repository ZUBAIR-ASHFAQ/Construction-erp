import { usePermission } from '../../administration/hooks/auth.js';
import { ReportsWorkspace } from '../components/reports-workspace.js';

/** Render Module 20 with browser actions hidden when the matching report permission is absent. */
export function ReportsPage() {
  return (
    <ReportsWorkspace
      canRead={usePermission('reports.read')}
      canExport={usePermission('reports.export')}
      canSaveFilters={usePermission('reports.save_filters')}
    />
  );
}
