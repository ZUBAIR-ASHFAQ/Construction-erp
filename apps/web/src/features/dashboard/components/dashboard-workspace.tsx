import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type {
  DashboardPreference,
  DashboardPreferenceFilters,
  DashboardProject,
  DashboardSavedFilter
} from '../api/dashboard-api.js';
import {
  useDashboardAlerts,
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

/** Convert a server-returned saved filter into the supported visible fields when valid. */
function valuesFromSavedFilter(saved: DashboardSavedFilter): DashboardFilterValues | null {
  if (typeof saved.filterJson !== 'object' || saved.filterJson === null || Array.isArray(saved.filterJson)) return null;
  const stored = saved.filterJson as Record<string, unknown>;
  const candidate = {
    ...EMPTY_FILTERS,
    projectId: typeof stored.projectId === 'string' ? stored.projectId : '',
    search: typeof stored.search === 'string' ? stored.search : '',
    status: typeof stored.status === 'string' ? stored.status : '',
    fromDate: typeof stored.fromDate === 'string' ? stored.fromDate : '',
    toDate: typeof stored.toDate === 'string' ? stored.toDate : '',
    asOfDate: typeof stored.asOfDate === 'string' ? stored.asOfDate : EMPTY_FILTERS.asOfDate
  };
  const parsed = dashboardFilterSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
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

/** Render the final read-oriented Dashboard workspace over server-owned source values. */
export function DashboardWorkspace(props: DashboardWorkspaceProps) {
  const form = useForm<DashboardFilterValues>({ resolver: zodResolver(dashboardFilterSchema), defaultValues: EMPTY_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState<DashboardFilterValues>(EMPTY_FILTERS);
  const [projectPage, setProjectPage] = useState(1);
  const [alertPage, setAlertPage] = useState(1);
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
  const alertsQuery = useDashboardAlerts({
    ...(selectedProjectId ? { projectId: selectedProjectId } : {}),
    ...(appliedFilters.fromDate ? { fromDate: appliedFilters.fromDate } : {}),
    ...(appliedFilters.toDate ? { toDate: appliedFilters.toDate } : {}),
    ...(appliedFilters.asOfDate ? { asOfDate: appliedFilters.asOfDate } : {}),
    page: selectedProjectId ? 1 : alertPage,
    pageSize: selectedProjectId ? 1 : 10
  }, props.canRead && props.canReadProjects);
  const preferencesMutation = useUpdateDashboardPreferences();

  const projectOptions = useMemo(() => {
    const options = new Map<string, ProjectOption>();
    for (const project of projectsQuery.data?.items ?? []) options.set(project.id, projectOption(project));
    if (projectQuery.data) options.set(projectQuery.data.project.id, projectOption(projectQuery.data.project));
    return [...options.values()];
  }, [projectQuery.data, projectsQuery.data?.items]);
  const projectPageCount = projectsQuery.data ? Math.max(1, Math.ceil(projectsQuery.data.total / projectsQuery.data.pageSize)) : 1;
  const alertPageCount = alertsQuery.data ? Math.max(1, Math.ceil(alertsQuery.data.projectTotal / alertsQuery.data.pageSize)) : 1;
  const cashBank = projectQuery.data?.cashBank ?? summaryQuery.data?.cashBank ?? null;

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
    setAlertPage(1);
  }

  /** Open one Project from the permission-scoped health table without raw identifier input. */
  function handleOpenProject(projectId: string): void {
    const next = { ...appliedFilters, projectId };
    form.reset(next);
    setAppliedFilters(next);
    setAlertPage(1);
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

  /** Apply one valid server-returned saved filter without accepting arbitrary browser expressions. */
  function handleApplySavedFilter(saved: DashboardSavedFilter): void {
    const next = valuesFromSavedFilter(saved);
    if (!next) return;
    form.reset(next);
    setAppliedFilters(next);
    setProjectPage(1);
    setAlertPage(1);
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
      <section className="admin-card">
        <div className="section-heading compact-heading">
          <h1>Dashboard</h1>
          <p className="muted">Approved source data only. Physical progress, cash received and profit remain separate.</p>
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
            Alerts from
            <input type="date" {...form.register('fromDate')} />
          </label>
          <label>
            Alerts to
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

      <section className="admin-card">
        <h2>Executive summary</h2>
        {summaryQuery.isPending && <p>Loading Dashboard summary…</p>}
        {errorMessage(summaryQuery.error) && <div className="form-error" role="alert">{errorMessage(summaryQuery.error)}</div>}
        {summaryQuery.data && (
          <>
            <div className="dashboard-metric-grid">
              <div className="dashboard-metric"><span>Projects in scope</span><strong>{summaryQuery.data.projectCount}</strong></div>
              {props.canReadFinance && summaryQuery.data.executiveSummary.financialsByCurrency?.map((item) => (
                <MoneyMetric key={`${item.currency}-profit`} label={`${item.currency} profit / loss`} value={item.profitAmount} currency={item.currency} />
              ))}
            </div>
            {props.canReadFinance && summaryQuery.data.executiveSummary.financialsByCurrency && (
              <div className="table-wrap dashboard-section-space">
                <table className="admin-table dashboard-table">
                  <thead><tr><th>Currency</th><th>Projects</th><th>Recognized revenue</th><th>Actual cost</th><th>Billed</th><th>Received</th><th>Allocated</th><th>Advance / unallocated</th><th>Outstanding</th><th>Supplier payable</th><th>Profit / loss</th></tr></thead>
                  <tbody>
                    {summaryQuery.data.executiveSummary.financialsByCurrency.map((item) => (
                      <tr key={item.currency}>
                        <td>{item.currency}</td><td>{item.projectCount}</td>
                        <td>{displayMoney(item.recognizedRevenue, item.currency)}</td><td>{displayMoney(item.actualCost, item.currency)}</td>
                        <td>{displayMoney(item.billedAmount, item.currency)}</td><td>{displayMoney(item.receivedAmount, item.currency)}</td>
                        <td>{displayMoney(item.allocatedAmount, item.currency)}</td><td>{displayMoney(item.advanceAmount, item.currency)}</td>
                        <td>{displayMoney(item.outstandingAmount, item.currency)}</td>
                        <td>{displayMoney(item.supplierPayableAmount, item.currency)}</td><td>{displayMoney(item.profitAmount, item.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {summaryQuery.data.executiveSummary.financialCoverage && (
              <p className="muted">
                Financial summary covers {summaryQuery.data.executiveSummary.financialCoverage.includedProjects} of {summaryQuery.data.executiveSummary.financialCoverage.totalProjects} Projects as of {summaryQuery.data.executiveSummary.financialCoverage.asOfDate}. Coverage is {summaryQuery.data.executiveSummary.financialCoverage.complete ? 'complete' : 'partial'}.
              </p>
            )}
            <p className="dashboard-cash-note"><strong>Cash received is not profit.</strong> Dashboard displays received cash, outstanding, advances, costs and profit as separate source-derived measures.</p>
          </>
        )}
      </section>

      {props.canReadProjects && (
        <section className="admin-card">
          <h2>Project health & progress</h2>
          {projectsQuery.isPending && <p>Loading Projects…</p>}
          {errorMessage(projectsQuery.error) && <div className="form-error" role="alert">{errorMessage(projectsQuery.error)}</div>}
          {projectsQuery.data && (
            <>
              <div className="table-wrap">
                <table className="admin-table dashboard-table">
                  <thead><tr><th>Project</th><th>Client</th><th>Status</th><th>Currency</th><th>Start</th><th>Planned end</th><th>Physical progress</th><th>Stages</th><th>Baseline</th><th></th></tr></thead>
                  <tbody>
                    {projectsQuery.data.items.map((project) => (
                      <tr key={project.id}>
                        <td>{project.projectCode}<span>{project.name}</span><span>{project.id}</span></td>
                        <td>{project.client.displayName}<span>{project.clientId}</span></td><td>{project.status}</td><td>{project.currency}</td>
                        <td>{project.startDate.slice(0, 10)}</td><td>{project.plannedEndDate.slice(0, 10)}</td>
                        <td>{project.overallPhysicalProgressPercent === null ? '—' : `${project.overallPhysicalProgressPercent}%`}</td>
                        <td>{project.stageCount ?? '—'}</td><td>{project.stageBaselineStatus ?? '—'}</td>
                        <td><button type="button" className="secondary-button" onClick={() => handleOpenProject(project.id)}>Open</button></td>
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
        <section className="admin-card">
          <h2>Project financial & physical snapshot</h2>
          {projectQuery.isPending && <p>Loading Project Dashboard…</p>}
          {errorMessage(projectQuery.error) && <div className="form-error" role="alert">{errorMessage(projectQuery.error)}</div>}
          {projectQuery.data && (
            <>
              <p><strong>{projectQuery.data.project.projectCode} · {projectQuery.data.project.name}</strong> <span className="muted">{projectQuery.data.project.client.displayName}</span></p>
              <p className="muted">Project ID <code>{projectQuery.data.project.id}</code> · Client ID <code>{projectQuery.data.project.clientId}</code> · {projectQuery.data.project.status} · {projectQuery.data.project.currency} · {projectQuery.data.project.startDate.slice(0, 10)} to {projectQuery.data.project.plannedEndDate.slice(0, 10)}</p>
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
        <section className="admin-card">
          <h2>Stage progress snapshot</h2>
          <p className="muted">Project <code>{projectQuery.data.stageProgress.projectId}</code> · Overall physical progress {projectQuery.data.stageProgress.overallPhysicalProgressPercent}%</p>
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
                    <td>{stage.code}<span>{stage.name}</span><span>{stage.id} · Project {stage.projectId}</span></td><td>{stage.sequenceNo}</td><td>{stage.status}</td><td>{stage.weightPercent}%</td><td>{stage.approvedPhysicalProgressPercent ?? '0.0000'}%</td>
                    <td>{stage.plannedAmount === null ? '—' : displayMoney(stage.plannedAmount, projectQuery.data.project.currency)}</td>
                    <td>{stage.plannedStartDate ?? '—'}</td><td>{stage.plannedEndDate ?? '—'}</td><td>{stage.actualStartDate ?? '—'}</td><td>{stage.actualEndDate ?? '—'}</td>
                    <td>{stage.financials?.plannedAmount == null ? '—' : displayMoney(stage.financials.plannedAmount, projectQuery.data.project.currency)}</td>
                    <td>{stage.financials ? displayMoney(stage.financials.actualCost, projectQuery.data.project.currency) : '—'}</td>
                    <td>{stage.financials ? displayMoney(stage.financials.billedAmount, projectQuery.data.project.currency) : '—'}</td>
                    <td>{stage.financials ? displayMoney(stage.financials.receivedAmount, projectQuery.data.project.currency) : '—'}</td>
                    <td>{stage.financials ? displayMoney(stage.financials.outstandingAmount, projectQuery.data.project.currency) : '—'}</td>
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
                      <td>{stage.code}<span>{update.stageId}</span></td><td>{update.id}</td><td>{update.progressPercent}%</td><td>{update.progressDate ?? '—'}</td><td>{update.status}</td>
                      <td>{update.note ?? '—'}</td><td>{update.evidenceDocumentId ?? '—'}</td><td>{update.enteredBy}</td><td>{update.approvedBy ?? '—'}</td><td>{update.approvedAt ?? '—'}</td><td>{update.createdAt}</td>
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
                    <td>{account.code}<span>{account.name}</span><span>{account.id}</span></td><td>{account.accountType}</td><td>{account.glAccountId}</td><td>{account.bankName ?? '—'}</td><td>{account.accountReference ?? '—'}</td><td>{account.status}</td><td>{account.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">Page {cashBank.page} · {cashBank.pageSize} per page · {cashBank.total} account(s)</p>
        </section>
      )}

      {props.canReadProjects && (
        <section className="admin-card">
          <h2>Alerts</h2>
          {alertsQuery.isPending && <p>Loading alerts…</p>}
          {errorMessage(alertsQuery.error) && <div className="form-error" role="alert">{errorMessage(alertsQuery.error)}</div>}
          {alertsQuery.data && <p className="muted">{alertsQuery.data.alertCount} alert(s) as of {alertsQuery.data.asOfDate} · Page {alertsQuery.data.page} · {alertsQuery.data.pageSize} Project(s) per scan · {alertsQuery.data.scannedProjectCount} scanned of {alertsQuery.data.projectTotal}</p>}
          {alertsQuery.data && alertsQuery.data.items.length === 0 && <p className="muted">No source-module alerts matched the current filters.</p>}
          {alertsQuery.data && alertsQuery.data.items.length > 0 && (
            <div className="dashboard-alert-list">
              {alertsQuery.data.items.map((alert, index) => (
                <article key={`${alert.code}-${alert.projectId}-${alert.stageId ?? 'project'}-${index}`} className="dashboard-alert-item">
                  <div><strong>{alert.severity} · {alert.code} · {alert.projectCode}</strong><span>{alert.projectName} · {alert.title}</span></div>
                  <span className="muted">Source {alert.sourceModule} · Project {alert.projectId}{alert.stageId ? ` · Stage ${alert.stageId}` : ''} · {alert.dueDate ? `Due ${alert.dueDate}` : 'No due date'} · {alert.value === null ? 'No value' : alert.currency ? displayMoney(alert.value, alert.currency) : `${alert.value}%`}</span>
                </article>
              ))}
            </div>
          )}
          {alertsQuery.data && !selectedProjectId && alertsQuery.data.projectTotal > alertsQuery.data.pageSize && (
            <div className="pagination-row">
              <button type="button" className="secondary-button" disabled={alertPage <= 1} onClick={() => setAlertPage((page) => Math.max(1, page - 1))}>Previous</button>
              <span>Alert scan page {alertPage} of {alertPageCount} · {alertsQuery.data.scannedProjectCount} Project(s) scanned on this page</span>
              <button type="button" className="secondary-button" disabled={alertPage >= alertPageCount} onClick={() => setAlertPage((page) => page + 1)}>Next</button>
            </div>
          )}
        </section>
      )}

      <section className="admin-card">
        <h2>Saved filters & preferences</h2>
        <p className="muted">Saved filters are read from the existing Dashboard store. The API remains authoritative for Project scope and preference changes.</p>
        {summaryQuery.data?.preference && (
          <p className="muted">
            Current preference updated {new Date(summaryQuery.data.preference.updatedAt).toLocaleString()} · Widgets {(summaryQuery.data.preference.widgetCodes ?? []).join(', ') || 'default'} · Default Project {summaryQuery.data.preference.defaultProjectId ?? 'none'} · Filters <code>{JSON.stringify(summaryQuery.data.preference.defaultFilters ?? {})}</code>
          </p>
        )}
        {summaryQuery.data?.savedFilters.length === 0 && <p className="muted">No saved Dashboard filters are available.</p>}
        {summaryQuery.data && summaryQuery.data.savedFilters.length > 0 && (
          <div className="dashboard-saved-list">
            {summaryQuery.data.savedFilters.map((saved) => {
              const values = valuesFromSavedFilter(saved);
              return <button key={saved.id} type="button" className="secondary-button" disabled={!values} onClick={() => handleApplySavedFilter(saved)}>{saved.name} · {new Date(saved.createdAt).toLocaleString()} · {saved.id} · {JSON.stringify(saved.filterJson)}</button>;
            })}
          </div>
        )}
      </section>
    </div>
  );
}
