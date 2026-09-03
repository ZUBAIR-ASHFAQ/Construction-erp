import { usePermission } from '../../administration/hooks/auth.js';
import { VendorsSubcontractorsWorkspace } from '../components/vendors-subcontractors-workspace.js';

/** Render final Supplier & Subcontractor Management using only final permission codes. */
export function VendorsSubcontractorsPage({ entity = 'all', initialCreate = false }: Readonly<{ entity?: 'supplier' | 'subcontractor' | 'all'; initialCreate?: boolean }> = {}) {
  return (
    <VendorsSubcontractorsWorkspace
      entity={entity}
      initialCreate={initialCreate}
      canReadVendors={usePermission('vendors.read')}
      canCreateVendors={usePermission('vendors.create')}
      canUpdateVendors={usePermission('vendors.update')}
      canReadSubcontractors={usePermission('subcontractors.read')}
      canManageSubcontractors={usePermission('subcontractors.manage')}
    />
  );
}
