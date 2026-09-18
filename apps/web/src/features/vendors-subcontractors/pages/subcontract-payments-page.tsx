import { usePermission } from '../../administration/hooks/auth.js';
import { SubcontractPaymentsWorkspace } from '../components/subcontract-payments-workspace.js';

/** Bind subcontractor and Finance permissions to the dedicated payment/ledger workspace. */
export function SubcontractPaymentsPage({ view, initialSubcontractorId = null }: Readonly<{ view: 'payment' | 'ledger'; initialSubcontractorId?: string | null }>) {
  return (
    <SubcontractPaymentsWorkspace
      view={view}
      canReadSubcontractors={usePermission('subcontractors.read')}
      canManageSubcontractors={usePermission('subcontractors.manage')}
      canReadFinance={usePermission('finance.read') || usePermission('finance.accounts.manage')}
      canReadDocuments={usePermission('documents.read')}
      canUploadDocuments={usePermission('documents.upload')}
      canLinkDocuments={usePermission('documents.link')}
      canVersionDocuments={usePermission('documents.version')}
      initialSubcontractorId={initialSubcontractorId}
    />
  );
}
