import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useProjectWorkspaceVisibility } from '../../administration/hooks/auth.js';
import { useProjects } from '../../projects/hooks/projects.js';
import type {
  ProjectProfitabilityFinancialValues,
  ProjectProfitabilityPortfolioItem,
  ProjectProfitabilityTrendGranularity
} from '../api/project-profitability-api.js';
import {
  useProjectProfitabilityPortfolio,
  useProjectProfitabilityStages,
  useProjectProfitabilitySummary,
  useProjectProfitabilityTrend
} from '../hooks/project-profitability.js';

const MAX_TREND_DAYS = 366;

/** Check that one date-only filter is a real calendar date. */
function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

/** Convert one validated date-only filter to a UTC day ordinal for bounded range checks. */
function dateOrdinal(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / 86_400_000);
}

const validDateSchema = z.string().refine(isValidDateOnly, 'Use a valid YYYY-MM-DD date.');
const filtersSchema = z.object({
  asOfDate: validDateSchema,
  fromDate: validDateSchema,
  toDate: validDateSchema,
  granularity: z.enum(['DAY', 'WEEK', 'MONTH']),
  search: z.string().trim().max(200)
}).superRefine((value, context) => {
  if (value.toDate < value.fromDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['toDate'], message: 'To date cannot precede from date.' });
    return;
  }
  const inclusiveDays = dateOrdinal(value.toDate) - dateOrdinal(value.fromDate) + 1;
  if (inclusiveDays > MAX_TREND_DAYS) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['toDate'], message: `Trend range cannot exceed ${MAX_TREND_DAYS} days.` });
  }
});

type FiltersForm = z.infer<typeof filtersSchema>;
type ProjectOption = Readonly<{ id: string; label: string }>;

/** Return today's local browser date in the API date-only format. */
function todayDateOnly(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Return a local browser date N calendar days before today. */
function daysBeforeToday(days: number): string {
  const value = new Date();
  value.setDate(value.getDate() - days);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Format one exact server decimal for display without changing the authoritative stored value. */
function displayMoney(value: string, currency: string): string {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [integer = '0', fraction = ''] = unsigned.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimals = fraction.padEnd(2, '0').slice(0, 2);
  return `${currency} ${negative ? '-' : ''}${grouped}.${decimals}`;
}

/** Format one Project option from the existing Project register. */
function projectOptionLabel(projectCode: string, projectName: string): string {
  return `${projectCode} · ${projectName}`;
}

/** Convert one portfolio row into the same safe Project-selector shape. */
function portfolioProjectOption(item: ProjectProfitabilityPortfolioItem): ProjectOption {
  return { id: item.projectId, label: projectOptionLabel(item.projectCode, item.projectName) };
}

/** Render the nine source-derived financial measures without recalculating them in the browser. */
function FinancialGrid({ values, currency }: { values: ProjectProfitabilityFinancialValues; currency: string }) {
  const metrics = [
    ['Recognized revenue', values.recognizedRevenue],
    ['Actual cost', values.actualCost],
    ['Profit / loss', values.profitAmount],
    ['Billed', values.billedAmount],
    ['Received', values.receivedAmount],
    ['Allocated receipts', values.allocatedAmount],
    ['Advance / unallocated', values.advanceAmount],
    ['Outstanding', values.outstandingAmount],
    ['Supplier payable', values.supplierPayableAmount]
  ] as const;

  return (
    <dl className="profitability-metric-grid">
      {metrics.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{displayMoney(value, currency)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Render the read-only Module 19 Project, Stage, trend and portfolio analytical workspace. */
export function ProjectProfitabilityWorkspace({
  canRead,
  canReadPortfolio
}: Readonly<{ canRead: boolean; canReadPortfolio: boolean }>) {
  const canDiscoverProjects = useProjectWorkspaceVisibility();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectPage, setProjectPage] = useState(1);
  const [portfolioPage, setPortfolioPage] = useState(1);
  const [appliedFilters, setAppliedFilters] = useState<FiltersForm>({
    asOfDate: todayDateOnly(),
    fromDate: daysBeforeToday(29),
    toDate: todayDateOnly(),
    granularity: 'DAY',
    search: ''
  });
  const filterForm = useForm<FiltersForm>({
    resolver: zodResolver(filtersSchema),
    defaultValues: appliedFilters
  });

  const projectsQuery = useProjects({ page: projectPage, pageSize: 25 }, canDiscoverProjects);
  const portfolioQuery = useProjectProfitabilityPortfolio({
    asOfDate: appliedFilters.asOfDate,
    ...(appliedFilters.search ? { search: appliedFilters.search } : {}),
    page: portfolioPage,
    pageSize: 25
  }, canRead && canReadPortfolio);
  const summaryQuery = useProjectProfitabilitySummary(
    selectedProjectId,
    { asOfDate: appliedFilters.asOfDate },
    canRead
  );
  const stagesQuery = useProjectProfitabilityStages(
    selectedProjectId,
    { asOfDate: appliedFilters.asOfDate },
    canRead
  );
  const trendQuery = useProjectProfitabilityTrend(
    selectedProjectId,
    {
      fromDate: appliedFilters.fromDate,
      toDate: appliedFilters.toDate,
      granularity: appliedFilters.granularity as ProjectProfitabilityTrendGranularity
    },
    canRead
  );

  const projectOptions = useMemo<ProjectOption[]>(() => {
    const options = new Map<string, ProjectOption>();
    for (const project of projectsQuery.data?.items ?? []) {
      options.set(project.id, { id: project.id, label: projectOptionLabel(project.projectCode, project.name) });
    }
    for (const item of portfolioQuery.data?.items ?? []) options.set(item.projectId, portfolioProjectOption(item));
    if (summaryQuery.data) {
      options.set(summaryQuery.data.projectId, {
        id: summaryQuery.data.projectId,
        label: projectOptionLabel(summaryQuery.data.projectCode, summaryQuery.data.projectName)
      });
    }
    return [...options.values()];
  }, [portfolioQuery.data?.items, projectsQuery.data?.items, summaryQuery.data]);

  const projectPageCount = projectsQuery.data
    ? Math.max(1, Math.ceil(projectsQuery.data.total / projectsQuery.data.pageSize))
    : 1;
  const portfolioPageCount = portfolioQuery.data
    ? Math.max(1, Math.ceil(portfolioQuery.data.total / portfolioQuery.data.pageSize))
    : 1;

  /** Apply validated read filters and restart the bounded portfolio page. */
  function handleApplyFilters(values: FiltersForm): void {
    setAppliedFilters(values);
    setPortfolioPage(1);
  }

  /** Select one authorized Project candidate without accepting raw identifier input. */
  function handleSelectProject(projectId: string): void {
    setSelectedProjectId(projectId || null);
  }

  /** Move through the existing Project register and clear an out-of-page selection. */
  function handlePreviousProjectPage(): void {
    setProjectPage((page) => Math.max(1, page - 1));
    setSelectedProjectId(null);
  }

  /** Move through the existing Project register and clear an out-of-page selection. */
  function handleNextProjectPage(): void {
    setProjectPage((page) => page + 1);
    setSelectedProjectId(null);
  }

  /** Select one Project directly from the permission-scoped portfolio table. */
  function handleSelectPortfolioProject(projectId: string): void {
    setSelectedProjectId(projectId);
  }

  if (!canRead) {
    return (
      <section className="admin-card">
        <h2>Project profitability access required</h2>
        <p className="muted">Project profitability reads require both profitability read and finance-read authority. The API revalidates effective Project permissions before returning financial values.</p>
      </section>
    );
  }

  return (
    <div className="profitability-workspace">
      <section className="admin-card">
        <div className="profitability-heading-row">
          <div>
            <h2>Filters</h2>
            <p className="muted">All financial values remain server-derived from approved or posted source modules.</p>
          </div>
        </div>
        <form className="profitability-filter-grid" onSubmit={filterForm.handleSubmit(handleApplyFilters)}>
          <label>
            As of date
            <input type="date" {...filterForm.register('asOfDate')} />
            {filterForm.formState.errors.asOfDate && <span className="field-error">{filterForm.formState.errors.asOfDate.message}</span>}
          </label>
          <label>
            Trend from
            <input type="date" {...filterForm.register('fromDate')} />
            {filterForm.formState.errors.fromDate && <span className="field-error">{filterForm.formState.errors.fromDate.message}</span>}
          </label>
          <label>
            Trend to
            <input type="date" {...filterForm.register('toDate')} />
            {filterForm.formState.errors.toDate && <span className="field-error">{filterForm.formState.errors.toDate.message}</span>}
          </label>
          <label>
            Trend granularity
            <select {...filterForm.register('granularity')}>
              <option value="DAY">Day</option>
              <option value="WEEK">Week</option>
              <option value="MONTH">Month</option>
            </select>
          </label>
          <label className="profitability-span-2">
            Portfolio search
            <input type="search" placeholder="Project code or name" {...filterForm.register('search')} />
          </label>
          <div className="profitability-filter-action"><button type="submit">Apply filters</button></div>
        </form>
      </section>

      <section className="admin-card">
        <h2>Select Project</h2>
        <p className="muted">Project options come from the existing permission-scoped Project register, with the Module 19 portfolio as a read-only fallback. No raw Project ID field is exposed.</p>
        <label className="profitability-project-picker">
          Project
          <select value={selectedProjectId ?? ''} onChange={(event) => handleSelectProject(event.target.value)}>
            <option value="">Select a Project</option>
            {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.label}</option>)}
          </select>
        </label>
        {projectsQuery.isPending && canDiscoverProjects && <p>Loading Projects…</p>}
        {projectsQuery.error instanceof Error && <div className="form-error" role="alert">{projectsQuery.error.message}</div>}
        {projectsQuery.data && (
          <div className="pagination-row">
            <button type="button" className="secondary-button" disabled={projectPage <= 1} onClick={handlePreviousProjectPage}>Previous</button>
            <span>Project page {projectPage} of {projectPageCount}</span>
            <button type="button" className="secondary-button" disabled={projectPage >= projectPageCount} onClick={handleNextProjectPage}>Next</button>
          </div>
        )}
      </section>

      <section className="admin-card">
        <h2>Project profit / loss</h2>
        {!selectedProjectId && <p className="muted">Select a Project to load its profitability summary.</p>}
        {summaryQuery.isPending && selectedProjectId && <p>Loading profitability…</p>}
        {summaryQuery.error instanceof Error && <div className="form-error" role="alert">{summaryQuery.error.message}</div>}
        {summaryQuery.data && (
          <>
            <p><strong>{summaryQuery.data.projectCode} · {summaryQuery.data.projectName}</strong> <span className="muted">as of {summaryQuery.data.asOfDate}</span></p>
            <FinancialGrid values={summaryQuery.data} currency={summaryQuery.data.currency} />
            <p className="profitability-cash-note"><strong>Cash is separate from profit.</strong> Client received cash and advances are displayed for financial position only. Profit remains recognized revenue minus actual cost.</p>
          </>
        )}
      </section>

      <section className="admin-card">
        <h2>Stage financial position</h2>
        {stagesQuery.isPending && selectedProjectId && <p>Loading Stage profitability…</p>}
        {stagesQuery.error instanceof Error && <div className="form-error" role="alert">{stagesQuery.error.message}</div>}
        {stagesQuery.data && (
          <>
            <div className="table-wrap">
              <table className="admin-table profitability-table">
                <thead><tr><th>Stage</th><th>Weight</th><th>Physical</th><th>Planned</th><th>Revenue</th><th>Cost</th><th>Profit</th><th>Billed</th><th>Received</th><th>Outstanding</th></tr></thead>
                <tbody>
                  {stagesQuery.data.stages.map((stage) => (
                    <tr key={stage.stageId}>
                      <td>{stage.stageCode}<span>{stage.stageName}</span></td>
                      <td>{stage.weightPercent}%</td>
                      <td>{stage.physicalProgressPercent}%</td>
                      <td>{stage.plannedAmount === null ? '—' : displayMoney(stage.plannedAmount, stagesQuery.data.currency)}</td>
                      <td>{displayMoney(stage.recognizedRevenue, stagesQuery.data.currency)}</td>
                      <td>{displayMoney(stage.actualCost, stagesQuery.data.currency)}</td>
                      <td>{displayMoney(stage.profitAmount, stagesQuery.data.currency)}</td>
                      <td>{displayMoney(stage.billedAmount, stagesQuery.data.currency)}</td>
                      <td>{displayMoney(stage.receivedAmount, stagesQuery.data.currency)}</td>
                      <td>{displayMoney(stage.outstandingAmount, stagesQuery.data.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="profitability-reconciliation-grid">
              <div><h3>Project-only</h3><p className="muted">Values without an authoritative Stage tag stay here. They are never distributed by Stage weight.</p><FinancialGrid values={stagesQuery.data.projectOnly} currency={stagesQuery.data.currency} /></div>
              <div><h3>Project total</h3><p className="muted">Server-verified total for Stage rows plus Project-only values.</p><FinancialGrid values={stagesQuery.data.projectTotal} currency={stagesQuery.data.currency} /></div>
            </div>
          </>
        )}
      </section>

      <section className="admin-card">
        <h2>Revenue, cost and profit trend</h2>
        {trendQuery.isPending && selectedProjectId && <p>Loading trend…</p>}
        {trendQuery.error instanceof Error && <div className="form-error" role="alert">{trendQuery.error.message}</div>}
        {trendQuery.data && (
          <div className="table-wrap">
            <table className="admin-table profitability-table">
              <thead><tr><th>Period</th><th>Recognized revenue</th><th>Actual cost</th><th>Profit / loss</th></tr></thead>
              <tbody>
                {trendQuery.data.points.map((point) => (
                  <tr key={`${point.periodStart}-${point.periodEnd}`}>
                    <td>{point.periodStart}{point.periodEnd !== point.periodStart ? ` to ${point.periodEnd}` : ''}</td>
                    <td>{displayMoney(point.recognizedRevenue, trendQuery.data.currency)}</td>
                    <td>{displayMoney(point.actualCost, trendQuery.data.currency)}</td>
                    <td>{displayMoney(point.profitAmount, trendQuery.data.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-card">
        <h2>Portfolio comparison</h2>
        {!canReadPortfolio && <p className="muted">Portfolio comparison requires the dedicated portfolio permission.</p>}
        {portfolioQuery.isPending && <p>Loading portfolio…</p>}
        {portfolioQuery.error instanceof Error && <div className="form-error" role="alert">{portfolioQuery.error.message}</div>}
        {portfolioQuery.data && (
          <>
            <p className="muted">Each row keeps its own currency. This UI does not create unsafe cross-currency grand totals.</p>
            <div className="table-wrap">
              <table className="admin-table profitability-table">
                <thead><tr><th>Project</th><th>Revenue</th><th>Cost</th><th>Profit</th><th>Billed</th><th>Received</th><th>Advance</th><th>Outstanding</th><th>Supplier payable</th></tr></thead>
                <tbody>
                  {portfolioQuery.data.items.map((item) => (
                    <tr key={item.projectId}>
                      <td><button type="button" className="link-button" onClick={() => handleSelectPortfolioProject(item.projectId)}>{item.projectCode}</button><span>{item.projectName} · {item.currency}</span></td>
                      <td>{displayMoney(item.recognizedRevenue, item.currency)}</td>
                      <td>{displayMoney(item.actualCost, item.currency)}</td>
                      <td>{displayMoney(item.profitAmount, item.currency)}</td>
                      <td>{displayMoney(item.billedAmount, item.currency)}</td>
                      <td>{displayMoney(item.receivedAmount, item.currency)}</td>
                      <td>{displayMoney(item.advanceAmount, item.currency)}</td>
                      <td>{displayMoney(item.outstandingAmount, item.currency)}</td>
                      <td>{displayMoney(item.supplierPayableAmount, item.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination-row">
              <button type="button" className="secondary-button" disabled={portfolioPage <= 1} onClick={() => setPortfolioPage((page) => Math.max(1, page - 1))}>Previous</button>
              <span>Portfolio page {portfolioPage} of {portfolioPageCount}</span>
              <button type="button" className="secondary-button" disabled={portfolioPage >= portfolioPageCount} onClick={() => setPortfolioPage((page) => page + 1)}>Next</button>
            </div>
          </>
        )}
      </section>

      <section className="admin-card profitability-contract-note">
        <h2>Read-only contract</h2>
        <p>Module 19 owns no browser-created financial values. Recognized revenue, actual cost, profit, billed, received, allocated, advance, outstanding and Supplier payable values are read from the four frozen GET operations and remain subject to server-side Company, Project and permission checks.</p>
      </section>
    </div>
  );
}
