import { usePermission } from '../../administration/hooks/auth.js';
import { SiteExpensesWorkspace } from '../components/site-expenses-workspace.js';

/** Bind Final-21 Site Expense permissions and supporting read capabilities to the workspace. */
export function SiteExpensesPage() {
  return (
    <section className="admin-stack" aria-labelledby="site-expenses-title">
      <div className="section-heading">
        <p className="eyebrow">Module 14 · Projects & Finance</p>
        <h1 id="site-expenses-title">Site Expense Management</h1>
        <p className="muted">Capture direct Project/Site costs, attach evidence, then post or reverse them through controlled Finance and Job Cost commands.</p>
      </div>

      <SiteExpensesWorkspace
        canRead={usePermission('site_expenses.read')}
        canCreate={usePermission('site_expenses.create')}
        canUpdate={usePermission('site_expenses.update')}
        canPost={usePermission('site_expenses.post')}
        canReverse={usePermission('site_expenses.reverse')}
        canReadProjects={usePermission('projects.read')}
        canReadStages={usePermission('stages.read')}
        canReadFinance={usePermission('finance.read')}
        canReadDocuments={usePermission('documents.read')}
      />
    </section>
  );
}
