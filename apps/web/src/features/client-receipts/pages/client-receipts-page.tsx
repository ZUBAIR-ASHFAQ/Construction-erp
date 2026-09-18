import { useState } from 'react';
import { useAuth, usePermission } from '../../administration/hooks/auth.js';
import { ClientReceiptsWorkspace } from '../components/client-receipts-workspace.js';

/** Bind Final Module 16 Client Receipt permissions to the React workspace. */
export function ClientReceiptsPage({ view = 'ledger' }: Readonly<{ view?: 'payment' | 'ledger' }> = {}) {
  const auth = useAuth();
  const hasRestrictedProjects = auth.identity?.projectScope.kind === 'restricted' && auth.identity.projectScope.projectIds.length > 0;
  const canRead = usePermission('client_receipts.read') || Boolean(hasRestrictedProjects);
  const canReadDocuments = usePermission('documents.read');
  const canCreate = usePermission('client_receipts.create');
  const [createPaymentOpen, setCreatePaymentOpen] = useState(false);

  return (
    <section className="admin-stack" aria-labelledby="client-receipts-title">
      <div className="section-heading client-payment-page-heading">
        <div className="client-payment-page-heading-copy">
          <p className="eyebrow">Module 16 · Finance &amp; Collections</p>
          <h1 id="client-receipts-title">Client {view === 'payment' ? 'New Payment' : 'Ledger'}</h1>
          <p className="muted">Record posted Client cash, preserve advance/unallocated history, allocate receipts to issued Client Invoices and reverse through controlled compensating entries.</p>
        </div>
        {view === 'payment' && canCreate ? <button type="button" className="client-payment-new-button" aria-haspopup="dialog" onClick={() => setCreatePaymentOpen(true)}>New payment</button> : null}
      </div>
      <ClientReceiptsWorkspace
        view={view}
        canRead={canRead}
        canCreate={canCreate}
        createModalOpen={createPaymentOpen}
        onCloseCreateModal={() => setCreatePaymentOpen(false)}
        canAllocate={usePermission('client_receipts.allocate')}
        canReverse={usePermission('client_receipts.reverse')}
        canReadClients={usePermission('clients.read')}
        canCreateClients={usePermission('clients.create')}
        canReadProjects={usePermission('projects.read') || Boolean(hasRestrictedProjects)}
        canCreateProjects={usePermission('projects.create')}
        canReadStages={usePermission('stages.read') || Boolean(hasRestrictedProjects)}
        canReadFinance={usePermission('finance.read') || Boolean(hasRestrictedProjects)}
        canReadInvoices={usePermission('client_invoices.read') || Boolean(hasRestrictedProjects)}
        canUploadDocuments={usePermission('documents.upload')}
        canLinkDocuments={usePermission('documents.link')}
        canVersionDocuments={usePermission('documents.version')}
        canReadDocuments={canReadDocuments}
      />
    </section>
  );
}
