import { usePermission } from '../../administration/hooks/auth.js';
import { DashboardWorkspace } from '../components/dashboard-workspace.js';

/** Render Module 1 with browser controls hidden when the matching Dashboard permission is absent. */
export function DashboardPage() {
  return (
    <DashboardWorkspace
      canRead={usePermission('dashboard.read')}
      canReadProjects={usePermission('dashboard.project.read')}
      canReadFinance={usePermission('dashboard.finance.read')}
      canManagePreferences={usePermission('dashboard.manage_preferences')}
    />
  );
}
