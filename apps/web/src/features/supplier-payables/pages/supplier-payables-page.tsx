import { useState } from 'react';
import { useAuth, usePermission } from '../../administration/hooks/auth.js';
import { SupplierPayablesWorkspace } from '../components/supplier-payables-workspace.js';

/** Bind Module 17 Supplier Payables permissions to the React workspace. */
export function SupplierPayablesPage({ initialTab = 'invoices', accountLabel = 'Supplier', initialVendorId = null, initialPaymentId = null }: Readonly<{ initialTab?: 'invoices' | 'payments' | 'aging'; accountLabel?: 'Supplier' | 'Subcontractor'; initialVendorId?: string | null; initialPaymentId?: string | null }> = {}) {
  const auth = useAuth();
  const hasRestrictedProjects = auth.identity?.projectScope.kind === 'restricted' && auth.identity.projectScope.projectIds.length > 0;
  const canRead = usePermission('supplier_payables.read') || Boolean(hasRestrictedProjects);
  const canCreateInvoice = usePermission('supplier_invoices.create');
  const canCreatePayment = usePermission('supplier_payments.create');
  const hasDocumentReadPermission = usePermission('documents.read');
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false);
  const [createPaymentOpen, setCreatePaymentOpen] = useState(false);

  return (
    <section className="admin-stack" aria-labelledby="supplier-payables-title">
      <div className="section-heading client-payment-page-heading">
        <div className="client-payment-page-heading-copy">
          <p className="eyebrow">Module 17 · Finance &amp; Procurement</p>
          <h1 id="supplier-payables-title">{accountLabel} {initialTab === 'payments' ? 'New Payment' : initialTab === 'aging' ? 'Ledger' : 'Invoices'}</h1>
          <p className="muted">Post Supplier Invoices, record Supplier Payments, allocate settlements and review source-derived outstanding and aging.</p>
        </div>
        {initialTab === 'invoices' && canCreateInvoice ? <button type="button" className="client-payment-new-button" aria-haspopup="dialog" onClick={() => setCreateInvoiceOpen(true)}>New invoice</button> : null}
        {initialTab === 'payments' && canCreatePayment ? <button type="button" className="client-payment-new-button" aria-haspopup="dialog" onClick={() => setCreatePaymentOpen(true)}>New payment</button> : null}
      </div>
      <SupplierPayablesWorkspace
        initialTab={initialTab}
        initialVendorId={initialVendorId}
        initialPaymentId={initialPaymentId}
        canRead={canRead}
        canCreateInvoice={canCreateInvoice}
        createInvoiceModalOpen={initialTab === 'invoices' && createInvoiceOpen}
        onCloseCreateInvoiceModal={() => setCreateInvoiceOpen(false)}
        canPostInvoice={usePermission('supplier_invoices.post')}
        canCreatePayment={canCreatePayment}
        createPaymentModalOpen={initialTab === 'payments' && createPaymentOpen}
        onCloseCreatePaymentModal={() => setCreatePaymentOpen(false)}
        canAllocatePayment={usePermission('supplier_payments.allocate')}
        canReadProjects={usePermission('projects.read') || Boolean(hasRestrictedProjects)}
        canReadStages={usePermission('stages.read') || Boolean(hasRestrictedProjects)}
        canReadVendors={usePermission('vendors.read')}
        canReadProcurement={usePermission('procurement.read') || Boolean(hasRestrictedProjects)}
        canReadFinance={usePermission('finance.read') || Boolean(hasRestrictedProjects)}
        canUploadDocuments={usePermission('documents.upload')}
        canLinkDocuments={usePermission('documents.link')}
        canVersionDocuments={usePermission('documents.version')}
        canReadDocuments={hasDocumentReadPermission}
      />
    </section>
  );
}
