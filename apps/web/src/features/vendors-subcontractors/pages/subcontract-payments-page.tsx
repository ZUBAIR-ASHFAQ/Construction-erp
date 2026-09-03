import { usePermission } from '../../administration/hooks/auth.js';
import { SubcontractPaymentsWorkspace } from '../components/subcontract-payments-workspace.js';

/** Bind subcontractor and Finance permissions to the dedicated payment/ledger workspace. */
export function SubcontractPaymentsPage({ view }: Readonly<{ view: 'payment' | 'ledger' }>) {
  return (
    <SubcontractPaymentsWorkspace
      view={view}
      canReadSubcontractors={usePermission('subcontractors.read')}
      canManageSubcontractors={usePermission('subcontractors.manage')}
      canReadFinance={usePermission('finance.read')}
    />
  );
}
