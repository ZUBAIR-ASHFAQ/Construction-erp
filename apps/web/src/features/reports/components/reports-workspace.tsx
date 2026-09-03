import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useVendors } from '../../vendors-subcontractors/hooks/vendors-subcontractors.js';
import {
  REPORT_CODES,
  type ReportCode,
  type ReportFilters,
  type ReportOutputFormat,
  type RunReportInput,
  type SavedReportFilter
} from '../api/reports-api.js';
import {
  useCreateReportExport,
  useReportCatalog,
  useReportDownload,
  useReportRun,
  useRunReport,
  useSaveReportFilter,
  useSavedReportFilters
} from '../hooks/reports.js';

type FilterField = Exclude<keyof ReportFilters, 'page' | 'pageSize' | 'cashBankAccountId' | 'search'>;

type ReportsWorkspaceProps = Readonly<{
  canRead: boolean;
  canExport: boolean;
  canSaveFilters: boolean;
}>;

const uuidOrEmptySchema = z.union([z.literal(''), z.string().uuid('Use a valid UUID.')]);
const dateOrEmptySchema = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')]);

const REPORT_FILTER_FIELDS: Readonly<Record<ReportCode, readonly FilterField[]>> = Object.freeze({
  'project-cost': ['projectId'],
  'budget-vs-actual': ['projectId'],
  'project-profit-loss': ['projectId', 'asOfDate'],
  'project-expenses': ['projectId', 'stageId', 'fromDate', 'toDate', 'status'],
  'project-material': ['projectId', 'stageId', 'warehouseId', 'materialId'],
  'stage-progress': ['projectId'],
  'stage-cost': ['projectId', 'stageId'],
  'stage-billing': ['projectId', 'stageId'],
  'stage-receipts': ['projectId', 'stageId'],
  'client-billing': ['clientId', 'projectId', 'fromDate', 'toDate', 'status'],
  'client-payments': ['clientId', 'projectId', 'stageId', 'fromDate', 'toDate', 'status'],
  'client-outstanding': ['clientId', 'projectId'],
  'client-advance': ['clientId', 'projectId'],
  'client-aging': ['clientId', 'projectId', 'asOfDate'],
  'supplier-purchases': ['projectId'],
  'supplier-payables': ['vendorId', 'projectId', 'fromDate', 'toDate', 'status'],
  'supplier-payments': ['vendorId', 'projectId', 'fromDate', 'toDate', 'status'],
  'supplier-aging': ['vendorId', 'projectId', 'asOfDate'],
  attendance: ['projectId', 'employeeId', 'fromDate', 'toDate'],
  payroll: [],
  'labour-cost': ['projectId', 'stageId', 'fromDate', 'toDate'],
  'cash-bank': ['status'],
  'general-ledger': ['periodId', 'accountId', 'projectId', 'stageId'],
  'profit-loss': ['periodId'],
  'balance-sheet': ['periodId'],
  'cash-flow': ['periodId']
});

const REQUIRED_FILTER_FIELDS: Readonly<Partial<Record<ReportCode, readonly FilterField[]>>> = Object.freeze({
  'project-cost': ['projectId'],
  'budget-vs-actual': ['projectId'],
  'project-profit-loss': ['projectId'],
  'stage-progress': ['projectId'],
  'stage-cost': ['projectId', 'stageId'],
  'stage-billing': ['projectId', 'stageId'],
  'stage-receipts': ['projectId', 'stageId'],
  'client-outstanding': ['clientId'],
  'client-advance': ['clientId'],
  'labour-cost': ['projectId'],
  'general-ledger': ['periodId'],
  'profit-loss': ['periodId'],
  'balance-sheet': ['periodId'],
  'cash-flow': ['periodId']
});

const PAGINATED_REPORTS = new Set<ReportCode>([
  'project-cost',
  'project-expenses',
  'project-material',
  'client-billing',
  'client-payments',
  'client-aging',
  'supplier-purchases',
  'supplier-payables',
  'supplier-payments',
  'supplier-aging',
  'attendance',
  'payroll',
  'labour-cost',
  'cash-bank',
  'general-ledger'
]);

const FILTER_LABELS: Readonly<Record<FilterField, string>> = {
  projectId: 'Project ID',
  stageId: 'Stage ID',
  clientId: 'Client ID',
  vendorId: 'Supplier',
  employeeId: 'Employee ID',
  warehouseId: 'Warehouse ID',
  materialId: 'Material ID',
  periodId: 'Fiscal period ID',
  accountId: 'GL account ID',
  fromDate: 'From date',
  toDate: 'To date',
  asOfDate: 'As-of date',
  status: 'Status',
};

const reportFilterFormSchema = z.object({
  reportCode: z.enum(REPORT_CODES),
  projectId: uuidOrEmptySchema,
  stageId: uuidOrEmptySchema,
  clientId: uuidOrEmptySchema,
  vendorId: uuidOrEmptySchema,
  employeeId: uuidOrEmptySchema,
  warehouseId: uuidOrEmptySchema,
  materialId: uuidOrEmptySchema,
  periodId: uuidOrEmptySchema,
  accountId: uuidOrEmptySchema,
  fromDate: dateOrEmptySchema,
  toDate: dateOrEmptySchema,
  asOfDate: dateOrEmptySchema,
  status: z.string().trim().max(80),
}).superRefine((value, context) => {
  if (value.fromDate && value.toDate && value.toDate < value.fromDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['toDate'], message: 'To date cannot precede from date.' });
  }
  for (const field of REQUIRED_FILTER_FIELDS[value.reportCode] ?? []) {
    if (!value[field]) context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${FILTER_LABELS[field]} is required for this report.` });
  }
});

type FilterFormValues = z.infer<typeof reportFilterFormSchema>;

const EMPTY_FORM: FilterFormValues = {
  reportCode: 'stage-progress',
  projectId: '',
  stageId: '',
  clientId: '',
  vendorId: '',
  employeeId: '',
  warehouseId: '',
  materialId: '',
  periodId: '',
  accountId: '',
  fromDate: '',
  toDate: '',
  asOfDate: '',
  status: '',
};

/** Return one readable request error without exposing backend internals. */
function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

/** Build only the selected report's documented business filters from validated form values. */
function businessFiltersFromValues(values: FilterFormValues): ReportFilters {
  const entries = REPORT_FILTER_FIELDS[values.reportCode]
    .map((field) => [field, values[field].trim()] as const)
    .filter((entry) => entry[1] !== '');
  return Object.fromEntries(entries) as ReportFilters;
}

/** Add bounded browser pagination only for reports whose server contract supports it. */
function runFiltersFromValues(values: FilterFormValues, page: number): ReportFilters {
  const filters = businessFiltersFromValues(values);
  return PAGINATED_REPORTS.has(values.reportCode) ? { ...filters, page, pageSize: 25 } : filters;
}

/** Convert one saved server filter back into the visible form fields for its report. */
function formValuesFromSavedFilter(saved: SavedReportFilter): FilterFormValues {
  const storedFields = REPORT_FILTER_FIELDS[saved.reportCode]
    .map((field) => [field, saved.filters[field]] as const)
    .filter((entry): entry is readonly [FilterField, string] => typeof entry[1] === 'string');
  return { ...EMPTY_FORM, reportCode: saved.reportCode, ...Object.fromEntries(storedFields) };
}

/** Build stable table columns directly from the server-returned report row keys. */
function reportColumns(rows: Record<string, unknown>[]): string[] {
  return [...new Set(rows.flatMap((row) => Object.keys(row)))];
}

/** Format one server-returned report cell for generic tabular display without recalculating values. */
function displayReportValue(value: unknown, column: string, vendorNames: ReadonlyMap<string, string>): string {
  if (value === null || value === undefined || value === '') return '—';
  if (column === 'vendorId' && typeof value === 'string') return vendorNames.get(value) ?? 'Unknown supplier';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Render the permission-filtered Module 20 catalog, filters, results, saved filters and export workflow. */
export function ReportsWorkspace(props: ReportsWorkspaceProps) {
  const vendorsQuery = useVendors({ status: 'ACTIVE', page: 1, pageSize: 100 }, props.canRead);
  const vendorNames = useMemo(() => new Map((vendorsQuery.data?.items ?? []).map((vendor) => [vendor.id, vendor.displayName])), [vendorsQuery.data?.items]);
  const catalogQuery = useReportCatalog(props.canRead);
  const runMutation = useRunReport();
  const exportMutation = useCreateReportExport();
  const downloadMutation = useReportDownload();
  const saveFilterMutation = useSaveReportFilter();
  const form = useForm<FilterFormValues>({ resolver: zodResolver(reportFilterFormSchema), defaultValues: EMPTY_FORM });
  const selectedReportCode = form.watch('reportCode');
  const savedFiltersQuery = useSavedReportFilters(selectedReportCode, props.canRead && props.canSaveFilters);
  const [savedFilterName, setSavedFilterName] = useState('');
  const [outputFormat, setOutputFormat] = useState<ReportOutputFormat>('PDF');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [appliedInput, setAppliedInput] = useState<RunReportInput | null>(null);
  const runQuery = useReportRun(activeRunId, props.canRead && props.canExport);
  const selectedReport = catalogQuery.data?.items.find((item) => item.code === selectedReportCode) ?? null;
  const activeFilterFields = REPORT_FILTER_FIELDS[selectedReportCode];
  const columns = reportColumns(runMutation.data?.rows ?? []);
  const currentPage = runMutation.data?.page ?? 1;
  const pageSize = runMutation.data?.pageSize ?? 25;
  const pageCount = runMutation.data?.total === undefined ? null : Math.max(1, Math.ceil(runMutation.data.total / pageSize));
  const canGoNext = runMutation.data !== undefined && (
    pageCount !== null ? currentPage < pageCount : runMutation.data.rows.length === pageSize
  );

  useEffect(() => {
    const firstAllowedReport = catalogQuery.data?.items[0]?.code;
    const selectedStillAllowed = catalogQuery.data?.items.some((item) => item.code === selectedReportCode) ?? false;
    if (firstAllowedReport && !selectedStillAllowed) form.reset({ ...EMPTY_FORM, reportCode: firstAllowedReport });
  }, [catalogQuery.data, form, selectedReportCode]);

  /** Change report and clear filters/results that belong to the previously selected report contract. */
  function handleReportChange(reportCode: ReportCode): void {
    form.reset({ ...EMPTY_FORM, reportCode });
    runMutation.reset();
    exportMutation.reset();
    downloadMutation.reset();
    setAppliedInput(null);
    setActiveRunId(null);
    setSavedFilterName('');
  }

  /** Run the selected report from validated filters and start at its first bounded page. */
  function handleRunReport(values: FilterFormValues): void {
    const baseFilters = businessFiltersFromValues(values);
    setAppliedInput({ reportCode: values.reportCode, filters: baseFilters });
    runMutation.mutate({ reportCode: values.reportCode, filters: runFiltersFromValues(values, 1) });
  }

  /** Request another bounded result page from the same submitted filter snapshot. */
  function handleResultPage(page: number): void {
    if (!appliedInput || page < 1) return;
    runMutation.mutate({
      reportCode: appliedInput.reportCode,
      filters: { ...appliedInput.filters, page, pageSize: 25 }
    });
  }

  /** Queue an export from the same validated business filters without browser pagination. */
  function handleExport(values: FilterFormValues): void {
    exportMutation.mutate({
      reportCode: values.reportCode,
      filters: businessFiltersFromValues(values),
      outputFormat
    }, {
      onSuccess: (run) => setActiveRunId(run.id)
    });
  }

  /** Save the current validated business filters under the authenticated user. */
  function handleSaveFilter(values: FilterFormValues): void {
    const name = savedFilterName.trim();
    if (!name) return;
    saveFilterMutation.mutate({
      reportCode: values.reportCode,
      name,
      filters: businessFiltersFromValues(values)
    }, {
      onSuccess: () => setSavedFilterName('')
    });
  }

  /** Apply one user-owned saved filter and clear any result from a previous filter snapshot. */
  function handleApplySavedFilter(saved: SavedReportFilter): void {
    form.reset(formValuesFromSavedFilter(saved));
    runMutation.reset();
    setAppliedInput(null);
  }

  /** Navigate to the short-lived signed URL returned for one completed export. */
  function handleDownload(): void {
    if (!runQuery.data || runQuery.data.status !== 'COMPLETED') return;
    downloadMutation.mutate(runQuery.data.id, {
      onSuccess: (download) => window.location.assign(download.url)
    });
  }

  if (!props.canRead) {
    return (
      <section className="admin-card">
        <h1>Reports & Analytics</h1>
        <p className="muted"><code>reports.read</code> permission is required to open Module 20.</p>
      </section>
    );
  }

  return (
    <div className="reports-workspace">
      <section className="admin-card">
        <div className="section-heading compact-heading">
          <h1>Reports & Analytics</h1>
          <p className="muted">Run permission-safe reports from approved source modules. Report values remain server-owned.</p>
        </div>
        {catalogQuery.isPending && <p>Loading report catalog…</p>}
        {errorMessage(catalogQuery.error) && <div className="form-error" role="alert">{errorMessage(catalogQuery.error)}</div>}
        {catalogQuery.data && catalogQuery.data.items.length === 0 && <p className="muted">No reports are available for the current permissions.</p>}
        {catalogQuery.data && catalogQuery.data.items.length > 0 && (
          <div className="reports-catalog-grid">
            <label>
              Report Catalog
              <select value={selectedReportCode} onChange={(event) => handleReportChange(event.target.value as ReportCode)}>
                {catalogQuery.data.items.map((report) => (
                  <option key={report.code} value={report.code}>{report.name} · {report.domain}</option>
                ))}
              </select>
            </label>
            {selectedReport && (
              <div className="reports-catalog-note">
                <strong>{selectedReport.name}</strong>
                <span>{selectedReport.domain} · {selectedReport.status} · Export: {selectedReport.outputFormats.join(', ')} · Permissions: {selectedReport.requiredPermissions.join(', ') || 'None'}</span>
              </div>
            )}
          </div>
        )}
      </section>

      {selectedReport && (
        <section className="admin-card">
          <h2>Report Filters</h2>
          <p className="muted">Only filters documented for the selected report are sent. Company, permissions and Project scope stay server-derived.</p>
          <form className="admin-form" onSubmit={form.handleSubmit(handleRunReport)}>
            {activeFilterFields.length === 0 ? (
              <p className="muted">This report does not require additional filters.</p>
            ) : (
              <div className="reports-filter-grid">
                {activeFilterFields.map((field) => (
                  <label key={field}>
                    {FILTER_LABELS[field]}
                    {field === 'vendorId' ? (
                      <select {...form.register(field)}><option value="">All suppliers</option>{(vendorsQuery.data?.items ?? []).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.displayName}</option>)}</select>
                    ) : (
                      <input type={field === 'fromDate' || field === 'toDate' || field === 'asOfDate' ? 'date' : 'text'} placeholder={field.endsWith('Id') ? 'UUID' : undefined} {...form.register(field)} />
                    )}
                    {form.formState.errors[field] && <span className="field-error">{form.formState.errors[field]?.message}</span>}
                  </label>
                ))}
              </div>
            )}
            <div className="reports-action-row">
              <button type="submit" disabled={runMutation.isPending}>{runMutation.isPending ? 'Running…' : 'Run Report'}</button>
              {props.canExport && (
                <>
                  <select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as ReportOutputFormat)} aria-label="Export format">
                    {(selectedReport.outputFormats ?? []).map((format) => <option key={format} value={format}>{format}</option>)}
                  </select>
                  <button type="button" className="secondary-button" disabled={exportMutation.isPending} onClick={() => void form.handleSubmit(handleExport)()}>
                    {exportMutation.isPending ? 'Queuing…' : 'Export'}
                  </button>
                </>
              )}
            </div>
          </form>
          {errorMessage(runMutation.error) && <div className="form-error" role="alert">{errorMessage(runMutation.error)}</div>}
          {errorMessage(exportMutation.error) && <div className="form-error" role="alert">{errorMessage(exportMutation.error)}</div>}
        </section>
      )}

      <section className="admin-card">
        <h2>Report Results</h2>
        {!runMutation.data && !runMutation.isPending && <p className="muted">Run a report to display its server-returned rows.</p>}
        {runMutation.data && (
          <>
            <p className="muted">Generated {new Date(runMutation.data.generatedAt).toLocaleString()}{runMutation.data.asOfDate ? ` · As of ${runMutation.data.asOfDate}` : ''}</p>
            {runMutation.data.rows.length === 0 ? <p>No matching rows.</p> : (
              <div className="table-wrap">
                <table className="admin-table reports-result-table">
                  <thead><tr>{columns.map((column) => <th key={column}>{column === 'vendorId' ? 'Supplier' : column}</th>)}</tr></thead>
                  <tbody>
                    {runMutation.data.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>{columns.map((column) => <td key={column}>{displayReportValue(row[column], column, vendorNames)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {PAGINATED_REPORTS.has(runMutation.data.reportCode) && (
              <div className="pagination-row">
                <button type="button" className="secondary-button" disabled={currentPage <= 1 || runMutation.isPending} onClick={() => handleResultPage(currentPage - 1)}>Previous</button>
                <span>Page {currentPage}{pageCount === null ? '' : ` of ${pageCount}`}{runMutation.data.total === undefined ? '' : ` · ${runMutation.data.total} row(s)`}</span>
                <button type="button" className="secondary-button" disabled={!canGoNext || runMutation.isPending} onClick={() => handleResultPage(currentPage + 1)}>Next</button>
              </div>
            )}
          </>
        )}
      </section>

      {props.canSaveFilters && selectedReport && (
        <section className="admin-card">
          <h2>Saved Filters</h2>
          <div className="reports-save-row">
            <label>
              Filter name
              <input value={savedFilterName} maxLength={100} onChange={(event) => setSavedFilterName(event.target.value)} placeholder="e.g. Current Project" />
            </label>
            <button type="button" disabled={!savedFilterName.trim() || saveFilterMutation.isPending} onClick={() => void form.handleSubmit(handleSaveFilter)()}>
              {saveFilterMutation.isPending ? 'Saving…' : 'Save current filters'}
            </button>
          </div>
          {errorMessage(saveFilterMutation.error) && <div className="form-error" role="alert">{errorMessage(saveFilterMutation.error)}</div>}
          {savedFiltersQuery.isPending && <p>Loading saved filters…</p>}
          {errorMessage(savedFiltersQuery.error) && <div className="form-error" role="alert">{errorMessage(savedFiltersQuery.error)}</div>}
          {savedFiltersQuery.data && savedFiltersQuery.data.items.length === 0 && <p className="muted">No saved filters for this report.</p>}
          {savedFiltersQuery.data && savedFiltersQuery.data.items.length > 0 && (
            <div className="reports-saved-list">
              {savedFiltersQuery.data.items.map((saved) => (
                <button key={saved.id} type="button" className="secondary-button" onClick={() => handleApplySavedFilter(saved)}>{saved.name}<span className="muted"> · {new Date(saved.createdAt).toLocaleString()} · {saved.id}</span></button>
              ))}
            </div>
          )}
        </section>
      )}

      {props.canExport && selectedReport && (
        <section className="admin-card">
          <h2>Export Status</h2>
          {!activeRunId && <p className="muted">Choose an export format and queue an export from the Report Filters section.</p>}
          {runQuery.isPending && activeRunId && <p>Checking export…</p>}
          {errorMessage(runQuery.error) && <div className="form-error" role="alert">{errorMessage(runQuery.error)}</div>}
          {runQuery.data && (
            <div className="reports-export-status">
              <div><strong>{runQuery.data.reportCode}</strong><span>{runQuery.data.outputFormat} · Run {runQuery.data.id}</span></div>
              <div><strong>{runQuery.data.status}</strong><span>{runQuery.data.errorCode ?? 'No error'} · File {runQuery.data.fileId ?? '—'}</span></div>
              <div><strong>Started</strong><span>{runQuery.data.startedAt ? new Date(runQuery.data.startedAt).toLocaleString() : '—'}</span></div>
              <div><strong>Finished</strong><span>{runQuery.data.finishedAt ? new Date(runQuery.data.finishedAt).toLocaleString() : '—'}</span></div>
              {runQuery.data.status === 'COMPLETED' && (
                <button type="button" onClick={handleDownload} disabled={downloadMutation.isPending}>{downloadMutation.isPending ? 'Authorizing…' : 'Download export'}</button>
              )}
            </div>
          )}
          {errorMessage(downloadMutation.error) && <div className="form-error" role="alert">{errorMessage(downloadMutation.error)}</div>}
          {downloadMutation.data && <p className="muted">Signed access expires {new Date(downloadMutation.data.expiresAt).toLocaleString()}.</p>}
        </section>
      )}
    </div>
  );
}
