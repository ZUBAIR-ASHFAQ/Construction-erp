import { useState } from 'react';
import { useAuth, usePermission } from '../../administration/hooks/auth.js';
import { useProjects } from '../../projects/hooks/projects.js';
import { ProjectStagesWorkspace } from '../components/project-stages-workspace.js';

/** Render the permission-aware Final Module 7 Project Stages / Progress page. */
export function ProjectStagesPage() {
  const auth = useAuth();
  const [projectId, setProjectId] = useState('');
  const hasRestrictedProjects = auth.identity?.projectScope.kind === 'restricted'
    && auth.identity.projectScope.projectIds.length > 0;
  const canRead = usePermission('stages.read') || Boolean(hasRestrictedProjects);
  const canManage = usePermission('stages.manage');
  const canFreeze = usePermission('stages.baseline.freeze');
  const canRecordProgress = usePermission('stages.progress.update');
  const canApproveProgress = usePermission('stages.progress.approve');
  const projectsQuery = useProjects({ page: 1, pageSize: 100 }, canRead);
  const selectedProject = (projectsQuery.data?.items ?? []).find((project) => project.id === projectId) ?? null;

  return (
    <section className="admin-stack" aria-labelledby="project-stages-title">
      <div className="section-heading">
        <p className="eyebrow">Module 7</p>
        <h1 id="project-stages-title">Project Stages / Progress</h1>
        <p className="muted">Configure the 100% Stage baseline, record approved physical progress and read Stage financial hooks without treating billing, cash or cost as physical completion.</p>
      </div>

      <section className="admin-card">
        <label>Project
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Select Project</option>
            {(projectsQuery.data?.items ?? []).map((project) => (
              <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>
            ))}
          </select>
        </label>
        {projectsQuery.isPending && <p>Loading Projects…</p>}
        {projectsQuery.error instanceof Error && <div className="form-error" role="alert">{projectsQuery.error.message}</div>}
      </section>

      {projectId !== '' && (
        <ProjectStagesWorkspace
          key={projectId}
          projectId={projectId}
          projectModel={selectedProject?.projectModel ?? 'FIXED_PRICE'}
          projectCostPlusPercent={selectedProject?.costPlusPercent ?? null}
          canManage={canManage}
          canFreeze={canFreeze}
          canRecordProgress={canRecordProgress}
          canApproveProgress={canApproveProgress}
        />
      )}
    </section>
  );
}
