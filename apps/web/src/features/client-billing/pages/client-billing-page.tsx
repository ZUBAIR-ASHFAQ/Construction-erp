import { useAuth, usePermission } from '../../administration/hooks/auth.js';
import { ClientBillingWorkspace } from '../components/client-billing-workspace.js';

/** Render the direct Client Invoice workspace with permission-aware actions. */
export function ClientBillingPage() {
  const auth = useAuth();
  const hasRestrictedProjects = auth.identity?.projectScope.kind === 'restricted' && auth.identity.projectScope.projectIds.length > 0;
  const canRead = usePermission('client_invoices.read') || usePermission('client_billing.read') || Boolean(hasRestrictedProjects);

  return (
    <section className="admin-stack" aria-labelledby="client-billing-title">
      <div className="section-heading">
        <p className="eyebrow">Client Module</p>
        <h1 id="client-billing-title">Client Invoices</h1>
        <p className="muted">Create direct Client Invoices and review billed, paid and outstanding balances.</p>
      </div>
      <ClientBillingWorkspace
        canRead={canRead}
        canCreateInvoices={usePermission('client_invoices.create')}
        canReadInvoices={usePermission('client_invoices.read') || canRead}
        canReadStages={usePermission('stages.read') || Boolean(hasRestrictedProjects)}
      />
    </section>
  );
}
