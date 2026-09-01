import { useAuth, usePermission } from '../../administration/hooks/auth.js';
import { SupplierPayablesWorkspace } from '../components/supplier-payables-workspace.js';

/** Bind Module 17 Supplier Payables permissions to the React workspace. */
export function SupplierPayablesPage() {
  const auth = useAuth();
  const hasRestrictedProjects = auth.identity?.projectScope.kind === 'restricted' && auth.identity.projectScope.projectIds.length > 0;
  const canRead = usePermission('supplier_payables.read') || Boolean(hasRestrictedProjects);

  return (
    <section className="admin-stack" aria-labelledby="supplier-payables-title">
      <div className="section-heading">
        <p className="eyebrow">Module 17 · Finance &amp; Procurement</p>
        <h1 id="supplier-payables-title">Supplier Payables</h1>
        <p className="muted">Post Supplier Invoices, record Supplier Payments, allocate settlements and review source-derived outstanding and aging.</p>
      </div>
      <SupplierPayablesWorkspace
        canRead={canRead}
        canCreateInvoice={usePermission('supplier_invoices.create')}
        canPostInvoice={usePermission('supplier_invoices.post')}
        canCreatePayment={usePermission('supplier_payments.create')}
        canAllocatePayment={usePermission('supplier_payments.allocate')}
        canReadProjects={usePermission('projects.read') || Boolean(hasRestrictedProjects)}
        canReadStages={usePermission('stages.read') || Boolean(hasRestrictedProjects)}
        canReadVendors={usePermission('vendors.read')}
        canReadProcurement={usePermission('procurement.read') || Boolean(hasRestrictedProjects)}
        canReadFinance={usePermission('finance.read') || Boolean(hasRestrictedProjects)}
      />
    </section>
  );
}
