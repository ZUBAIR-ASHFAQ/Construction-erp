import { useAuth, usePermission } from '../../administration/hooks/auth.js';
import { ProjectTeamWorkspace } from '../components/project-team-workspace.js';

/** Render Final Module 8 Project Team with company and Project-scoped permission awareness. */
export function ProjectTeamPage() {
  const auth = useAuth();
  const hasRestrictedProjectScope = auth.identity?.projectScope.kind === 'restricted'
    && auth.identity.projectScope.projectIds.length > 0;
  const canRead = usePermission('project_team.read') || hasRestrictedProjectScope;
  const canManage = usePermission('project_team.manage');

  return (
    <section className="admin-stack">
      <div className="section-heading">
        <p className="eyebrow">Module 8</p>
        <h1>Project Team / Assignment</h1>
        <p className="muted">Assign active Employees to Projects and optional Stages with effective dates, Project roles and controlled allocation.</p>
      </div>
      <ProjectTeamWorkspace canRead={canRead} canManage={canManage} />
    </section>
  );
}
