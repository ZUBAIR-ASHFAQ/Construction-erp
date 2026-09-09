import { usePermission } from '../../administration/hooks/auth.js';
import { ReportsWorkspace } from '../components/reports-workspace.js';

/** Render Module 20 with browser actions hidden when the matching report permission is absent. */
export function ReportsPage() {
  const canReadReportFinance = usePermission('reports.finance.read');
  const canReadFinance = usePermission('finance.read');
  const canReadProfitability = usePermission('project_profitability.read');
  const canReadProfitabilityFinance = usePermission('project_profitability.finance.read');
  const canReadProfitabilityPortfolio = usePermission('project_profitability.portfolio.read');
  const canViewOverview = canReadReportFinance
    && canReadFinance
    && canReadProfitability
    && canReadProfitabilityFinance
    && canReadProfitabilityPortfolio;
  return (
    <ReportsWorkspace
      canRead={usePermission('reports.read')}
      canViewOverview={canViewOverview}
      canExport={usePermission('reports.export')}
      canSaveFilters={usePermission('reports.save_filters')}
    />
  );
}
