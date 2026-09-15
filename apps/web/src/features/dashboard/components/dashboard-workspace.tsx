import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type {
  DashboardPreference,
  DashboardPreferenceFilters,
  DashboardProject
} from '../api/dashboard-api.js';
import {
  useDashboardProjects,
  useDashboardSummary,
  useProjectDashboard,
  useUpdateDashboardPreferences
} from '../hooks/dashboard.js';

type DashboardWorkspaceProps = Readonly<{
  canRead: boolean;
  canReadProjects: boolean;
  canReadFinance: boolean;
  canManagePreferences: boolean;
}>;

type ProjectOption = Readonly<{ id: string; label: string }>;

const dateOrEmptySchema = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')]);
const uuidOrEmptySchema = z.union([z.literal(''), z.string().uuid('Select a valid Project.')]);
const dashboardFilterSchema = z.object({
  projectId: uuidOrEmptySchema,
  search: z.string().trim().max(200),
  status: z.string().trim().max(80),
  fromDate: dateOrEmptySchema,
  toDate: dateOrEmptySchema,
  asOfDate: dateOrEmptySchema
}).superRefine((value, context) => {
  if (value.fromDate && value.toDate && value.toDate < value.fromDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['toDate'], message: 'To date cannot precede from date.' });
  }
});

type DashboardFilterValues = z.infer<typeof dashboardFilterSchema>;

const EMPTY_FILTERS: DashboardFilterValues = {
  projectId: '',
  search: '',
  status: '',
  fromDate: '',
  toDate: '',
  asOfDate: new Date().toISOString().slice(0, 10)
};

/** Return one readable request error without exposing backend internals. */
function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

/** Format exact decimal money text without converting it to floating-point arithmetic. */
function displayMoney(value: string, currency: string): string {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [integer = '0', fraction = ''] = unsigned.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currency} ${negative ? '-' : ''}${grouped}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}

/** Build one readable Project option from a permission-scoped Project response. */
function projectOption(project: DashboardProject): ProjectOption {
  return { id: project.id, label: `${project.projectCode} · ${project.name}` };
}

/** Keep only the filter fields that the Dashboard preference endpoint accepts. */
function preferenceFilters(values: DashboardFilterValues): DashboardPreferenceFilters {
  return {
    ...(values.projectId ? { projectId: values.projectId } : {}),
    ...(values.search ? { search: values.search } : {}),
    ...(values.status ? { status: values.status } : {}),
    ...(values.fromDate ? { fromDate: values.fromDate } : {}),
    ...(values.toDate ? { toDate: values.toDate } : {}),
    ...(values.asOfDate ? { asOfDate: values.asOfDate } : {})
  };
}

/** Convert one stored preference into validated visible Dashboard filter values. */
function valuesFromPreference(preference: DashboardPreference): DashboardFilterValues {
  const filters = preference.defaultFilters ?? {};
  return {
    ...EMPTY_FILTERS,
    projectId: preference.defaultProjectId ?? filters.projectId ?? '',
    search: filters.search ?? '',
    status: filters.status ?? '',
    fromDate: filters.fromDate ?? '',
    toDate: filters.toDate ?? '',
    asOfDate: filters.asOfDate ?? EMPTY_FILTERS.asOfDate
  };
}

/** Render one source-derived money metric without recomputing business values in the browser. */
function MoneyMetric({ label, value, currency }: Readonly<{ label: string; value: string; currency: string }>) {
  return (
    <div className="dashboard-metric">
      <span>{label}</span>
      <strong>{displayMoney(value, currency)}</strong>
    </div>
  );
}

/** Convert source-owned percentage text into a safe visual range without changing the stored value. */
function visualPercent(value: string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
}

/** Render one accessible physical-progress bar from the server-approved percentage. */
function ProgressBar(props: Readonly<{ value: string | null | undefined; label: string; compact?: boolean }>) {
  const percent = visualPercent(props.value);
  return (
    <div className={props.compact ? 'dashboard-progress dashboard-progress-compact' : 'dashboard-progress'}>
      <div className="dashboard-progress-copy"><span>{props.label}</span><strong>{percent.toFixed(1)}%</strong></div>
      <div className="dashboard-progress-track" role="progressbar" aria-label={props.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** Render an executive circular progress indicator for one selected Project. */
function ProgressRing(props: Readonly<{ value: string | null | undefined; label: string }>) {
  const percent = visualPercent(props.value);
  const circumference = 2 * Math.PI * 46;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <div className="dashboard-progress-ring" role="img" aria-label={`${props.label}: ${percent.toFixed(1)}%`}>
      <svg viewBox="0 0 112 112" aria-hidden="true">
        <circle className="dashboard-ring-track" cx="56" cy="56" r="46" />
        <circle className="dashboard-ring-value" cx="56" cy="56" r="46" strokeDasharray={circumference} strokeDashoffset={offset} />
      </svg>
      <div><strong>{percent.toFixed(1)}%</strong><span>{props.label}</span></div>
    </div>
  );
}

/** Render the final read-oriented Dashboard workspace over server-owned source values. */
export function DashboardWorkspace(props: DashboardWorkspaceProps) {
  const form = useForm<DashboardFilterValues>({ resolver: zodResolver(dashboardFilterSchema), defaultValues: EMPTY_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState<DashboardFilterValues>(EMPTY_FILTERS);
  const [projectPage, setProjectPage] = useState(1);
  const [preferencesApplied, setPreferencesApplied] = useState(false);

  const summaryQuery = useDashboardSummary({
    ...(appliedFilters.fromDate ? { fromDate: appliedFilters.fromDate } : {}),
    ...(appliedFilters.toDate ? { toDate: appliedFilters.toDate } : {}),
    ...(appliedFilters.asOfDate ? { asOfDate: appliedFilters.asOfDate } : {})
  }, props.canRead);
  const projectsQuery = useDashboardProjects({
    ...(appliedFilters.search ? { search: appliedFilters.search } : {}),
    ...(appliedFilters.status ? { status: appliedFilters.status } : {}),
    page: projectPage,
    pageSize: 10
  }, props.canRead && props.canReadProjects);
  const selectedProjectId = appliedFilters.projectId || null;
  const projectQuery = useProjectDashboard(selectedProjectId, {
    ...(appliedFilters.fromDate ? { fromDate: appliedFilters.fromDate } : {}),
    ...(appliedFilters.toDate ? { toDate: appliedFilters.toDate } : {}),
    ...(appliedFilters.asOfDate ? { asOfDate: appliedFilters.asOfDate } : {})
  }, props.canRead && props.canReadProjects);
  const preferencesMutation = useUpdateDashboardPreferences();

  const projectOptions = useMemo(() => {
    const options = new Map<string, ProjectOption>();
    for (const project of projectsQuery.data?.items ?? []) options.set(project.id, projectOption(project));
    if (projectQuery.data) options.set(projectQuery.data.project.id, projectOption(projectQuery.data.project));
    return [...options.values()];
  }, [projectQuery.data, projectsQuery.data?.items]);
  const projectPageCount = projectsQuery.data ? Math.max(1, Math.ceil(projectsQuery.data.total / projectsQuery.data.pageSize)) : 1;
  const cashBank = projectQuery.data?.cashBank ?? summaryQuery.data?.cashBank ?? null;
  const visibleProgress = useMemo(() => {
    const items = projectsQuery.data?.items ?? [];
    const reported = items.filter((project) => project.overallPhysicalProgressPercent !== null);
    const average = reported.length === 0
      ? 0
      : reported.reduce((sum, project) => sum + visualPercent(project.overallPhysicalProgressPercent), 0) / reported.length;
    return { items, reportedCount: reported.length, average };
  }, [projectsQuery.data?.items]);

  useEffect(() => {
    if (preferencesApplied || !summaryQuery.data?.preference) return;
    const preferred = valuesFromPreference(summaryQuery.data.preference);
    form.reset(preferred);
    setAppliedFilters(preferred);
    setPreferencesApplied(true);
  }, [form, preferencesApplied, summaryQuery.data?.preference]);

  /** Apply validated Project/date filters and restart the bounded Project page. */
  function handleApplyFilters(values: DashboardFilterValues): void {
    setAppliedFilters(values);
    setProjectPage(1);
  }

  /** Open one Project from the permission-scoped health table without raw identifier input. */
  function handleOpenProject(projectId: string): void {
    const next = { ...appliedFilters, projectId };
    form.reset(next);
    setAppliedFilters(next);
  }

  /** Save the current validated Dashboard view as the authenticated user's default preference. */
  function handleSavePreferences(): void {
    void form.handleSubmit((values) => {
      preferencesMutation.mutate({
        defaultProjectId: values.projectId || null,
        defaultFilters: preferenceFilters(values)
      });
    })();
  }

  if (!props.canRead) {
    return (
      <section className="admin-card">
        <h1>Dashboard</h1>
        <p className="muted"><code>dashboard.read</code> permission is required to open Module 1.</p>
      </section>
    );
  }

  return (
    <div className="dashboard-workspace">
      <section className="admin-card dashboard-hero">
        <div className="section-heading compact-heading dashboard-hero-heading">
          <div>
            <p className="eyebrow">Executive overview</p>
            <h1>Project command center</h1>
            <p className="muted">Monitor physical progress, project health and financial position from approved source records.</p>
          </div>
          <div className="dashboard-asof-badge"><span>Reporting date</span><strong>{appliedFilters.asOfDate || 'Today'}</strong></div>
        </div>
        <form className="dashboard-filter-grid" onSubmit={form.handleSubmit(handleApplyFilters)}>
          {props.canReadProjects && (
            <label>
              Project
              <select {...form.register('projectId')}>
                <option value="">All Projects</option>
                {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.label}</option>)}
              </select>
            </label>
          )}
          {props.canReadProjects && (
            <>
              <label>
                Project search
                <input type="search" placeholder="Code or name" {...form.register('search')} />
              </label>
              <label>
                Project status
                <input type="text" placeholder="e.g. ACTIVE" {...form.register('status')} />
              </label>
            </>
          )}
          <label>
            From date
            <input type="date" {...form.register('fromDate')} />
          </label>
          <label>
            To date
            <input type="date" {...form.register('toDate')} />
            {form.formState.errors.toDate && <span className="field-error">{form.formState.errors.toDate.message}</span>}
          </label>
          <label>
            As of date
            <input type="date" {...form.register('asOfDate')} />
          </label>
          <div className="dashboard-filter-actions">
            <button type="submit">Apply filters</button>
            {props.canManagePreferences && (
              <button type="button" className="secondary-button" disabled={preferencesMutation.isPending} onClick={handleSavePreferences}>
                {preferencesMutation.isPending ? 'Saving…' : 'Save current view'}
              </button>
            )}
          </div>
        </form>
        {errorMessage(preferencesMutation.error) && <div className="form-error" role="alert">{errorMessage(preferencesMutation.error)}</div>}
        {preferencesMutation.data && <p className="muted">Preferences saved {new Date(preferencesMutation.data.updatedAt).toLocaleString()}.</p>}
      </section>

      <section className="admin-card dashboard-executive-card">
        <div className="dashboard-card-heading"><div><p className="eyebrow">Company position</p><h2>Executive summary</h2></div><span className="dashboard-live-indicator">Source derived</span></div>
        {summaryQuery.isPending && <p>Loading Dashboard summary…</p>}
        {errorMessage(summaryQuery.error) && <div className="form-error" role="alert">{errorMessage(summaryQuery.error)}</div>}
        {summaryQuery.data && (
          <>
            <div className="dashboard-metric-grid">
              <div className="dashboard-metric dashboard-metric-primary"><span>Total projects</span><strong>{summaryQuery.data.projectCount}</strong><small>Permission-filtered portfolio</small></div>
              {props.canReadFinance && (
                <>
                  <div className="dashboard-metric">
                    <span>Total revenue</span>
                    {(summaryQuery.data.executiveSummary.financialsByCurrency ?? []).length === 0
                      ? <strong>—</strong>
                      : summaryQuery.data.executiveSummary.financialsByCurrency?.map((item) => <strong key={`${item.currency}-revenue`}>{displayMoney(item.recognizedRevenue, item.currency)}</strong>)}
                    <small>All permission-visible Projects · kept separate by currency</small>
                  </div>
                  <div className="dashboard-metric">
                    <span>Supplier payables</span>
                    {(summaryQuery.data.executiveSummary.financialsByCurrency ?? []).length === 0
                      ? <strong>—</strong>
                      : summaryQuery.data.executiveSummary.financialsByCurrency?.map((item) => <strong key={`${item.currency}-supplier-payable`}>{displayMoney(item.supplierPayableAmount, item.currency)}</strong>)}
                    <small>All permission-visible Projects · kept separate by currency</small>
                  </div>
                  <div className="dashboard-metric">
                    <span>Client received</span>
                    {(summaryQuery.data.executiveSummary.financialsByCurrency ?? []).length === 0
                      ? <strong>—</strong>
                      : summaryQuery.data.executiveSummary.financialsByCurrency?.map((item) => <strong key={`${item.currency}-received`}>{displayMoney(item.receivedAmount, item.currency)}</strong>)}
                    <small>All permission-visible Projects · kept separate by currency</small>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </section>

      {props.canReadProjects && (
        <section className="admin-card dashboard-project-card">
          <div className="dashboard-card-heading"><div><p className="eyebrow">Delivery performance</p><h2>Project health & progress</h2></div><span className="muted">Current page · approved physical progress</span></div>
          {projectsQuery.isPending && <p>Loading Projects…</p>}
          {errorMessage(projectsQuery.error) && <div className="form-error" role="alert">{errorMessage(projectsQuery.error)}</div>}
          {projectsQuery.data && (
            <>
              <div className="dashboard-progress-panel">
                <div className="dashboard-progress-chart" aria-label="Physical progress by Project">
                  {projectsQuery.data.items.map((project) => (
                    <button key={project.id} type="button" className="dashboard-progress-row" onClick={() => handleOpenProject(project.id)}>
                      <span className="dashboard-progress-project"><strong>{project.name}</strong><small>{project.projectCode} · {project.status}</small></span>
                      <span className="dashboard-progress-bar"><span style={{ width: `${visualPercent(project.overallPhysicalProgressPercent)}%` }} /></span>
                      <strong className="dashboard-progress-value">{project.overallPhysicalProgressPercent === null ? '—' : `${visualPercent(project.overallPhysicalProgressPercent).toFixed(1)}%`}</strong>
                    </button>
                  ))}
                  {projectsQuery.data.items.length === 0 && <div className="dashboard-empty-chart">No Projects match the current filters.</div>}
                </div>
                <div className="dashboard-progress-summary">
                  <ProgressRing value={String(visibleProgress.average)} label="Average progress" />
                  <div className="dashboard-progress-stat"><span>Progress reported</span><strong>{visibleProgress.reportedCount} / {visibleProgress.items.length}</strong></div>
                  <div className="dashboard-progress-stat"><span>Portfolio records</span><strong>{projectsQuery.data.total}</strong></div>
                </div>
              </div>
              <div className="dashboard-table-heading"><h3>Project portfolio</h3><span>Select Open or a graph row for full details</span></div>
              <div className="table-wrap">
                <table className="admin-table dashboard-table">
                  <thead><tr><th>Project</th><th>Client</th><th>Status</th><th>Currency</th><th>Start</th><th>Planned end</th><th>Physical progress</th><th>Stages</th><th>Baseline</th><th></th></tr></thead>
                  <tbody>
                    {projectsQuery.data.items.map((project) => (
                      <tr key={project.id}>
                        <td data-label="Project">{project.projectCode}<span>{project.name}</span></td>
                        <td data-label="Client">{project.client.displayName}</td><td data-label="Status"><span className={`dashboard-status dashboard-status-${project.status.toLowerCase()}`}>{project.status}</span></td><td data-label="Currency">{project.currency}</td>
                        <td data-label="Start">{project.startDate.slice(0, 10)}</td><td data-label="Planned end">{project.plannedEndDate.slice(0, 10)}</td>
                        <td data-label="Physical progress">{project.overallPhysicalProgressPercent === null ? '—' : `${project.overallPhysicalProgressPercent}%`}</td>
                        <td data-label="Stages">{project.stageCount ?? '—'}</td><td data-label="Baseline">{project.stageBaselineStatus ?? '—'}</td>
                        <td data-label="Action"><button type="button" className="secondary-button" onClick={() => handleOpenProject(project.id)}>Open</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pagination-row">
                <button type="button" className="secondary-button" disabled={projectPage <= 1} onClick={() => setProjectPage((page) => Math.max(1, page - 1))}>Previous</button>
                <span>Page {projectsQuery.data.page} of {projectPageCount} · {projectsQuery.data.total} Project(s) · {projectsQuery.data.pageSize} per page</span>
                <button type="button" className="secondary-button" disabled={projectPage >= projectPageCount} onClick={() => setProjectPage((page) => page + 1)}>Next</button>
              </div>
            </>
          )}
        </section>
      )}

      {selectedProjectId && props.canReadProjects && (
        <section className="admin-card dashboard-project-snapshot">
          <div className="dashboard-card-heading"><div><p className="eyebrow">Selected Project</p><h2>Financial & physical snapshot</h2></div>{projectQuery.data && <ProgressRing value={projectQuery.data.overallPhysicalProgressPercent} label="Physical progress" />}</div>
          {projectQuery.isPending && <p>Loading Project Dashboard…</p>}
          {errorMessage(projectQuery.error) && <div className="form-error" role="alert">{errorMessage(projectQuery.error)}</div>}
          {projectQuery.data && (
            <>
              <p><strong>{projectQuery.data.project.projectCode} · {projectQuery.data.project.name}</strong> <span className="muted">{projectQuery.data.project.client.displayName}</span></p>
              <p className="muted">{projectQuery.data.project.status} · {projectQuery.data.project.currency} · {projectQuery.data.project.startDate.slice(0, 10)} to {projectQuery.data.project.plannedEndDate.slice(0, 10)}</p>
              <div className="dashboard-metric-grid">
                <div className="dashboard-metric"><span>Overall physical progress</span><strong>{projectQuery.data.overallPhysicalProgressPercent ?? '—'}{projectQuery.data.overallPhysicalProgressPercent === null ? '' : '%'}</strong></div>
                {props.canReadFinance && projectQuery.data.budgetVsActual && (
                  <>
                    <MoneyMetric label="Budget" value={projectQuery.data.budgetVsActual.budgetCost} currency={projectQuery.data.project.currency} />
                    <MoneyMetric label="Committed cost" value={projectQuery.data.budgetVsActual.committedCost} currency={projectQuery.data.project.currency} />
                    <MoneyMetric label="Actual cost" value={projectQuery.data.budgetVsActual.actualCost} currency={projectQuery.data.project.currency} />
                    <MoneyMetric label="Forecast cost" value={projectQuery.data.budgetVsActual.forecastCost} currency={projectQuery.data.project.currency} />
                    <MoneyMetric label="Budget variance" value={projectQuery.data.budgetVsActual.variance} currency={projectQuery.data.project.currency} />
                  </>
                )}
                {props.canReadFinance && projectQuery.data.financialPosition && (
                  <>
                    <MoneyMetric label="Recognized revenue" value={projectQuery.data.financialPosition.recognizedRevenue} currency={projectQuery.data.project.currency} />
                    <MoneyMetric label="Profitability actual cost" value={projectQuery.data.financialPosition.actualCost} currency={projectQuery.data.project.currency} />
                    <MoneyMetric label="Billed" value={projectQuery.data.financialPosition.billedAmount} currency={projectQuery.data.project.currency} />
                    <MoneyMetric label="Received" value={projectQuery.data.financialPosition.receivedAmount} currency={projectQuery.data.project.currency} />
                    <MoneyMetric label="Allocated receipts" value={projectQuery.data.financialPosition.allocatedAmount} currency={projectQuery.data.project.currency} />
                    <MoneyMetric label="Outstanding" value={projectQuery.data.financialPosition.outstandingAmount} currency={projectQuery.data.project.currency} />
                    <MoneyMetric label="Advance / unallocated" value={projectQuery.data.financialPosition.advanceAmount} currency={projectQuery.data.project.currency} />
                    <MoneyMetric label="Supplier payable" value={projectQuery.data.financialPosition.supplierPayableAmount} currency={projectQuery.data.project.currency} />
                    <MoneyMetric label="Profit / loss" value={projectQuery.data.financialPosition.profitAmount} currency={projectQuery.data.project.currency} />
                  </>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {selectedProjectId && projectQuery.data?.stageProgress && (
        <section className="admin-card dashboard-stage-card">
          <div className="dashboard-card-heading"><div><p className="eyebrow">Work breakdown</p><h2>Stage progress snapshot</h2></div><strong>{projectQuery.data.stageProgress.overallPhysicalProgressPercent}% overall</strong></div>
          <div className="dashboard-stage-progress-grid">
            {projectQuery.data.stageProgress.items.map((stage) => <ProgressBar key={stage.id} value={stage.approvedPhysicalProgressPercent} label={`${stage.sequenceNo}. ${stage.name}`} compact />)}
          </div>
          {projectQuery.data.stageProgress.baseline && (
            <p className="muted">
              Baseline <code>{projectQuery.data.stageProgress.baseline.id}</code> · Project <code>{projectQuery.data.stageProgress.baseline.projectId}</code> · Version {projectQuery.data.stageProgress.baseline.versionNo} · {projectQuery.data.stageProgress.baseline.status} · Total weight {projectQuery.data.stageProgress.baseline.totalWeightPercent}% · Frozen {projectQuery.data.stageProgress.baseline.frozenAt ?? '—'} by {projectQuery.data.stageProgress.baseline.frozenBy ?? '—'}
            </p>
          )}
          <div className="table-wrap">
            <table className="admin-table dashboard-table">
              <thead><tr><th>Stage</th><th>Sequence</th><th>Status</th><th>Weight</th><th>Physical</th><th>Planned amount</th><th>Planned start</th><th>Planned end</th><th>Actual start</th><th>Actual end</th><th>Financial planned</th><th>Actual cost</th><th>Billed</th><th>Received</th><th>Outstanding</th></tr></thead>
              <tbody>
                {projectQuery.data.stageProgress.items.map((stage) => (
                  <tr key={stage.id}>
                    <td data-label="Stage">{stage.code}<span>{stage.name}</span><span>{stage.id} · Project {stage.projectId}</span></td><td data-label="Sequence">{stage.sequenceNo}</td><td data-label="Status">{stage.status}</td><td data-label="Weight">{stage.weightPercent}%</td><td data-label="Physical">{stage.approvedPhysicalProgressPercent ?? '0.0000'}%</td>
                    <td data-label="Planned amount">{stage.plannedAmount === null ? '—' : displayMoney(stage.plannedAmount, projectQuery.data.project.currency)}</td>
                    <td data-label="Planned start">{stage.plannedStartDate ?? '—'}</td><td data-label="Planned end">{stage.plannedEndDate ?? '—'}</td><td data-label="Actual start">{stage.actualStartDate ?? '—'}</td><td data-label="Actual end">{stage.actualEndDate ?? '—'}</td>
                    <td data-label="Financial planned">{stage.financials?.plannedAmount == null ? '—' : displayMoney(stage.financials.plannedAmount, projectQuery.data.project.currency)}</td>
                    <td data-label="Actual cost">{stage.financials ? displayMoney(stage.financials.actualCost, projectQuery.data.project.currency) : '—'}</td>
                    <td data-label="Billed">{stage.financials ? displayMoney(stage.financials.billedAmount, projectQuery.data.project.currency) : '—'}</td>
                    <td data-label="Received">{stage.financials ? displayMoney(stage.financials.receivedAmount, projectQuery.data.project.currency) : '—'}</td>
                    <td data-label="Outstanding">{stage.financials ? displayMoney(stage.financials.outstandingAmount, projectQuery.data.project.currency) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {projectQuery.data.stageProgress.items.some((stage) => (stage.progressUpdates?.length ?? 0) > 0) && (
            <div className="table-wrap dashboard-section-space">
              <table className="admin-table dashboard-table">
                <thead><tr><th>Stage</th><th>Update</th><th>Progress</th><th>Progress date</th><th>Status</th><th>Note</th><th>Evidence</th><th>Entered by</th><th>Approved by</th><th>Approved at</th><th>Created at</th></tr></thead>
                <tbody>
                  {projectQuery.data.stageProgress.items.flatMap((stage) => (stage.progressUpdates ?? []).map((update) => (
                    <tr key={update.id}>
                      <td data-label="Stage">{stage.code}<span>{update.stageId}</span></td><td data-label="Update">{update.id}</td><td data-label="Progress">{update.progressPercent}%</td><td data-label="Progress date">{update.progressDate ?? '—'}</td><td data-label="Status">{update.status}</td>
                      <td data-label="Note">{update.note ?? '—'}</td><td data-label="Evidence">{update.evidenceDocumentId ?? '—'}</td><td data-label="Entered by">{update.enteredBy}</td><td data-label="Approved by">{update.approvedBy ?? '—'}</td><td data-label="Approved at">{update.approvedAt ?? '—'}</td><td data-label="Created at">{update.createdAt}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {props.canReadFinance && cashBank && (
        <section className="admin-card">
          <h2>Cash / Bank</h2>
          <div className="table-wrap">
            <table className="admin-table dashboard-table">
              <thead><tr><th>Account</th><th>Type</th><th>GL account</th><th>Bank</th><th>Reference</th><th>Status</th><th>Balance</th></tr></thead>
              <tbody>
                {cashBank.items.map((account) => (
                  <tr key={account.id}>
                    <td data-label="Account">{account.code}<span>{account.name}</span><span>{account.id}</span></td><td data-label="Type">{account.accountType}</td><td data-label="GL account">{account.glAccountId}</td><td data-label="Bank">{account.bankName ?? '—'}</td><td data-label="Reference">{account.accountReference ?? '—'}</td><td data-label="Status">{account.status}</td><td data-label="Balance">{account.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">Page {cashBank.page} · {cashBank.pageSize} per page · {cashBank.total} account(s)</p>
        </section>
      )}

    </div>
  );
}
