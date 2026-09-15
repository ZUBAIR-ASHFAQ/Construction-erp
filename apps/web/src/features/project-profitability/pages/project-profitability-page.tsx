import { usePermission } from '../../administration/hooks/auth.js';
import { ProjectProfitabilityWorkspace } from '../components/project-profitability-workspace.js';

/** Render the Final-21 Module 19 analytical workspace with permission-aware read visibility. */
export function ProjectProfitabilityPage() {
  const canRead = usePermission('project_profitability.read');
  const canReadFinance = usePermission('project_profitability.finance.read');
  const canReadPortfolio = usePermission('project_profitability.portfolio.read');

  return (
    <section className="admin-stack" aria-labelledby="project-profitability-title">
      <div className="section-heading">
        <p className="eyebrow">Module 19 · Project Finance Analytics</p>
        <h1 id="project-profitability-title">Project Profitability</h1>
        <p className="muted">Review recognized revenue, actual cost and profit together with billed, received, advance, outstanding and Supplier payable values without treating cash as profit.</p>
      </div>
      <ProjectProfitabilityWorkspace
        canRead={canRead && canReadFinance}
        canReadPortfolio={canReadPortfolio}
      />
    </section>
  );
}
