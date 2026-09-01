import { useState } from 'react';
import { useProjects } from '../../projects/hooks/projects.js';
import { useAuth, usePermission, useProjectWorkspaceVisibility } from '../../administration/hooks/auth.js';
import { BudgetJobCostWorkspace } from '../components/budget-job-cost-workspace.js';

/** Render the Final Module 9 Project selector and permission-aware budget/job-cost workspace. */
export function BudgetsJobCostPage() {
  const auth = useAuth();
  const canDiscoverProjects = useProjectWorkspaceVisibility();
  const canReadBudgetCompanyWide = usePermission('budgets.read');
  const canReadStagesCompanyWide = usePermission('stages.read');
  const canCreateBudgetCompanyWide = usePermission('budgets.create');
  const canEditBudgetCompanyWide = usePermission('budgets.edit');
  const canFreezeBudgetCompanyWide = usePermission('budgets.freeze');
  const canReadJobCostCompanyWide = usePermission('job_cost.read');
  const canUpdateForecastCompanyWide = usePermission('forecast.update');
  const [projectPage, setProjectPage] = useState(1);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const projectsQuery = useProjects({ page: projectPage, pageSize: 25 }, canDiscoverProjects);
  const projects = projectsQuery.data?.items ?? [];
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const projectPageCount = projectsQuery.data
    ? Math.max(1, Math.ceil(projectsQuery.data.total / projectsQuery.data.pageSize))
    : 1;
  const selectedIsInRestrictedScope = auth.identity?.projectScope.kind === 'restricted'
    && selectedProjectId !== null
    && auth.identity.projectScope.projectIds.includes(selectedProjectId);
  const canReadSelectedBudget = selectedProject !== null
    && (canReadBudgetCompanyWide || selectedIsInRestrictedScope);
  const canReadSelectedJobCost = selectedProject !== null
    && (canReadJobCostCompanyWide || selectedIsInRestrictedScope);
  const canReadSelectedStages = selectedProject !== null
    && (canReadStagesCompanyWide || selectedIsInRestrictedScope);

  /** Select one server-discovered Project and reset any previous browser-held Module 9 workflow state. */
  function handleSelectProject(projectId: string): void {
    setSelectedProjectId(projectId || null);
  }

  /** Move to the previous Project-register page and clear the selected Project. */
  function handlePreviousProjectPage(): void {
    setProjectPage((page) => Math.max(1, page - 1));
    setSelectedProjectId(null);
  }

  /** Move to the next Project-register page and clear the selected Project. */
  function handleNextProjectPage(): void {
    setProjectPage((page) => page + 1);
    setSelectedProjectId(null);
  }

  return (
    <section className="admin-stack" aria-labelledby="module9-title">
      <div className="section-heading">
        <p className="eyebrow">Module 9 · Project Controls & Finance</p>
        <h1 id="module9-title">Project Budget & Cost Tracking</h1>
        <p className="muted">Control Project budget versions and forecasts, then review the server-calculated budget, commitment, actual, forecast and variance position.</p>
      </div>

      <section className="admin-card">
        <h2>Select Project</h2>
        <p className="muted">Project discovery reuses the existing Project register. Every Module 9 request revalidates Company ownership and Project resource scope on the server.</p>
        {!canDiscoverProjects && (
          <p className="muted">The current identity cannot discover Projects through the existing Project register contract, so this UI does not invent a separate Project lookup endpoint.</p>
        )}
        {canDiscoverProjects && (
          <>
            <label className="module9-project-picker">
              Project
              <select value={selectedProjectId ?? ''} onChange={(event) => handleSelectProject(event.target.value)}>
                <option value="">Select a Project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.projectCode} · {project.name} · {project.status}</option>
                ))}
              </select>
            </label>
            {projectsQuery.isPending && <p>Loading Projects…</p>}
            {projectsQuery.error instanceof Error && <div className="form-error" role="alert">{projectsQuery.error.message}</div>}
            {projectsQuery.data && projects.length === 0 && <p className="muted">No Project is visible on this authorized page.</p>}
            {projectsQuery.data && (
              <div className="pagination-row">
                <button type="button" className="secondary-button" disabled={projectPage <= 1} onClick={handlePreviousProjectPage}>Previous</button>
                <span>Project page {projectPage} of {projectPageCount}</span>
                <button type="button" className="secondary-button" disabled={projectPage >= projectPageCount} onClick={handleNextProjectPage}>Next</button>
              </div>
            )}
          </>
        )}
      </section>

      {selectedProject ? (
        <BudgetJobCostWorkspace
          key={selectedProject.id}
          project={selectedProject}
          canReadBudget={canReadSelectedBudget}
          canReadStages={canReadSelectedStages}
          canCreateBudget={canCreateBudgetCompanyWide}
          canEditBudget={canEditBudgetCompanyWide}
          canFreezeBudget={canFreezeBudgetCompanyWide}
          canReadJobCost={canReadSelectedJobCost}
          canUpdateForecast={canUpdateForecastCompanyWide}
        />
      ) : (
        <section className="admin-card"><p className="muted">Select a Project to load its Budget & Cost Tracking workspace.</p></section>
      )}

      <section className="admin-card module9-contract-note">
        <h2>Permission visibility note</h2>
        <p>The API remains authoritative for every Project-scoped permission. The current <code>/auth/me</code> response exposes Company permissions and Project membership scope, but not the exact effective permission list for each Project.</p>
        <p>Read visibility therefore follows the existing restricted-Project discovery pattern. Sensitive create/edit/freeze/forecast controls are shown only for the corresponding Company-level permission instead of guessing Project-level write authority.</p>
      </section>
    </section>
  );
}
