import { useAuth, usePermission } from '../../administration/hooks/auth.js';
import { ClientBillingWorkspace } from '../components/client-billing-workspace.js';

/** Render the Final-21 Client Billing workspace with permission-aware actions. */
export function ClientBillingPage() {
  const auth = useAuth();
  const hasRestrictedProjects = auth.identity?.projectScope.kind === 'restricted' && auth.identity.projectScope.projectIds.length > 0;
  const canRead = usePermission('client_billing.read') || Boolean(hasRestrictedProjects);

  return (
    <section className="admin-stack" aria-labelledby="client-billing-title">
      <div className="section-heading">
        <p className="eyebrow">Commercial &amp; Finance</p>
        <h1 id="client-billing-title">Client Billing</h1>
        <p className="muted">Manage Project billing settings, Stage-aware claims and Client Invoices. Physical progress remains separate from billing, and Client Receipts remain owned by Module 16.</p>
      </div>
      <ClientBillingWorkspace
        canRead={canRead}
        canManageSettings={usePermission('client_billing.settings.manage')}
        canCreateClaims={usePermission('claims.create')}
        canEditClaims={usePermission('claims.edit')}
        canFinalizeClaims={usePermission('claims.finalize')}
        canCreateInvoices={usePermission('client_invoices.create')}
        canReadInvoices={usePermission('client_invoices.read') || canRead}
        canReadStages={usePermission('stages.read') || Boolean(hasRestrictedProjects)}
      />
    </section>
  );
}
