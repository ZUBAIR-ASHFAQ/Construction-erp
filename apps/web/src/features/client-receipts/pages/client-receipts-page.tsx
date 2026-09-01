import { useAuth, usePermission } from '../../administration/hooks/auth.js';
import { ClientReceiptsWorkspace } from '../components/client-receipts-workspace.js';

/** Bind Final Module 16 Client Receipt permissions to the React workspace. */
export function ClientReceiptsPage() {
  const auth = useAuth();
  const hasRestrictedProjects = auth.identity?.projectScope.kind === 'restricted' && auth.identity.projectScope.projectIds.length > 0;
  const canRead = usePermission('client_receipts.read') || Boolean(hasRestrictedProjects);

  return (
    <section className="admin-stack" aria-labelledby="client-receipts-title">
      <div className="section-heading">
        <p className="eyebrow">Module 16 · Finance &amp; Collections</p>
        <h1 id="client-receipts-title">Client Receipts / Payments</h1>
        <p className="muted">Record posted Client cash, preserve advance/unallocated history, allocate receipts to issued Client Invoices and reverse through controlled compensating entries.</p>
      </div>
      <ClientReceiptsWorkspace
        canRead={canRead}
        canCreate={usePermission('client_receipts.create')}
        canAllocate={usePermission('client_receipts.allocate')}
        canReverse={usePermission('client_receipts.reverse')}
        canReadClients={usePermission('clients.read')}
        canReadProjects={usePermission('projects.read') || Boolean(hasRestrictedProjects)}
        canReadStages={usePermission('stages.read') || Boolean(hasRestrictedProjects)}
        canReadFinance={usePermission('finance.read') || Boolean(hasRestrictedProjects)}
        canReadInvoices={usePermission('client_invoices.read') || Boolean(hasRestrictedProjects)}
      />
    </section>
  );
}
