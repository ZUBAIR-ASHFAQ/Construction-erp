import { usePermission } from '../../administration/hooks/auth.js';
import { VendorsSubcontractorsWorkspace } from '../components/vendors-subcontractors-workspace.js';

/** Render final Supplier & Subcontractor Management using only final permission codes. */
export function VendorsSubcontractorsPage({ entity = 'all', initialCreate = false, onOpenSupplierLedger, onOpenSubcontractorLedger }: Readonly<{ entity?: 'supplier' | 'subcontractor' | 'all'; initialCreate?: boolean; onOpenSupplierLedger?: (vendorId: string) => void; onOpenSubcontractorLedger?: (subcontractorId: string) => void }> = {}) {
  return (
    <VendorsSubcontractorsWorkspace
      entity={entity}
      initialCreate={initialCreate}
      canReadVendors={usePermission('vendors.read')}
      canCreateVendors={usePermission('vendors.create')}
      canUpdateVendors={usePermission('vendors.update')}
      canReadSubcontractors={usePermission('subcontractors.read')}
      canManageSubcontractors={usePermission('subcontractors.manage')}
      canReadProjects={usePermission('projects.read')}
      canCreateProjects={usePermission('projects.create')}
      canReadClients={usePermission('clients.read')}
      canCreateClients={usePermission('clients.create')}
      {...(onOpenSupplierLedger ? { onOpenSupplierLedger } : {})}
      {...(onOpenSubcontractorLedger ? { onOpenSubcontractorLedger } : {})}
    />
  );
}
