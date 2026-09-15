import { useState } from 'react';
import { useAuth, usePermission } from '../../administration/hooks/auth.js';
import { ClientBillingWorkspace } from '../components/client-billing-workspace.js';

/** Render the direct Client Invoice workspace with permission-aware actions. */
export function ClientBillingPage() {
  const auth = useAuth();
  const hasRestrictedProjects = auth.identity?.projectScope.kind === 'restricted' && auth.identity.projectScope.projectIds.length > 0;
  const canRead = usePermission('client_invoices.read') || usePermission('client_billing.read') || Boolean(hasRestrictedProjects);
  const canCreateInvoices = usePermission('client_invoices.create');
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false);

  return (
    <section className="admin-stack" aria-labelledby="client-billing-title">
      <div className="section-heading client-payment-page-heading">
        <div className="client-payment-page-heading-copy">
          <p className="eyebrow">Client Module</p>
          <h1 id="client-billing-title">Client Invoices</h1>
          <p className="muted">Create direct Client Invoices and review billed, paid and outstanding balances.</p>
        </div>
        {canCreateInvoices ? <button type="button" className="client-payment-new-button" aria-haspopup="dialog" onClick={() => setCreateInvoiceOpen(true)}>New invoice</button> : null}
      </div>
      <ClientBillingWorkspace
        canRead={canRead}
        canReadClients={usePermission('clients.read')}
        canCreateInvoices={canCreateInvoices}
        canReadInvoices={usePermission('client_invoices.read') || canRead}
        canReadStages={usePermission('stages.read') || Boolean(hasRestrictedProjects)}
        createModalOpen={createInvoiceOpen}
        onCloseCreateModal={() => setCreateInvoiceOpen(false)}
      />
    </section>
  );
}
