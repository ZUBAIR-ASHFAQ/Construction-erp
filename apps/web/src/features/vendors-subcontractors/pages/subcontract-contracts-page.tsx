import { usePermission } from '../../administration/hooks/auth.js';
import { SubcontractContractsWorkspace } from '../components/subcontract-contracts-workspace.js';

/** Render the subcontract Project-contract page with existing module permissions. */
export function SubcontractContractsPage() {
  return (
    <SubcontractContractsWorkspace
      canReadSubcontractors={usePermission('subcontractors.read')}
      canManageSubcontractors={usePermission('subcontractors.manage')}
      canReadProjects={usePermission('projects.read')}
    />
  );
}
