import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useDocuments } from '../../documents-audit/hooks/documents.js';
import { useCashBankAccounts } from '../../finance/hooks/finance.js';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useProjects } from '../../projects/hooks/projects.js';
import type {
  ListSiteExpensesInput,
  SiteExpense,
  SiteExpensePaymentMode,
  SiteExpenseStatus
} from '../api/site-expenses-api.js';
import {
  useCreateSiteExpense,
  usePostSiteExpense,
  useReverseSiteExpense,
  useSiteExpense,
  useSiteExpenses,
  useUpdateSiteExpense
} from '../hooks/site-expenses.js';

const uuidSchema = z.string().uuid('Use a valid configured UUID.');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
const moneySchema = z.string().trim().regex(
  /^(?:[1-9]\d{0,15})(?:\.\d{1,2})?$|^0\.(?:0[1-9]|[1-9]\d?)$/,
  'Use a positive amount with up to 2 decimals.'
);
const optionalUuidSchema = z.union([z.literal(''), uuidSchema]);
const paymentModeSchema = z.enum(['CASH', 'BANK', 'PAYABLE']);

const siteExpenseFormSchema = z.object({
  projectId: uuidSchema,
  stageId: optionalUuidSchema,
  expenseDate: dateSchema,
  categoryId: uuidSchema,
  description: z.string().trim().min(1, 'Description is required.').max(2000),
  amount: moneySchema,
  paymentMode: paymentModeSchema,
  cashBankAccountId: optionalUuidSchema,
  documentId: optionalUuidSchema
}).superRefine((value, context) => {
  if ((value.paymentMode === 'CASH' || value.paymentMode === 'BANK') && value.cashBankAccountId === '') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cashBankAccountId'],
      message: 'Select or enter a Cash/Bank account for direct payment.'
    });
  }
});

type SiteExpenseFormValues = z.infer<typeof siteExpenseFormSchema>;

type SiteExpensesWorkspaceProps = Readonly<{
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canPost: boolean;
  canReverse: boolean;
  canReadProjects: boolean;
  canReadStages: boolean;
  canReadFinance: boolean;
  canReadDocuments: boolean;
}>;

type FilterState = Readonly<{
  projectId: string;
  stageId: string;
  categoryId: string;
  paymentMode: '' | SiteExpensePaymentMode;
  status: '' | SiteExpenseStatus;
  fromDate: string;
  toDate: string;
}>;

const EMPTY_FILTERS: FilterState = {
  projectId: '',
  stageId: '',
  categoryId: '',
  paymentMode: '',
  status: '',
  fromDate: '',
  toDate: ''
};

const EMPTY_FORM: SiteExpenseFormValues = {
  projectId: '',
  stageId: '',
  expenseDate: '',
  categoryId: '',
  description: '',
  amount: '',
  paymentMode: 'CASH',
  cashBankAccountId: '',
  documentId: ''
};

/** Return one readable request error without exposing backend internals. */
function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

/** Convert UI filter state into the documented bounded API query. */
function apiFilters(filters: FilterState, page: number): ListSiteExpensesInput {
  return {
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.stageId ? { stageId: filters.stageId } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.paymentMode ? { paymentMode: filters.paymentMode } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.fromDate ? { fromDate: filters.fromDate } : {}),
    ...(filters.toDate ? { toDate: filters.toDate } : {}),
    page,
    pageSize: 25
  };
}

/** Convert one persisted Site Expense into editable form values. */
function expenseFormValues(expense: SiteExpense): SiteExpenseFormValues {
  return {
    projectId: expense.projectId,
    stageId: expense.stageId ?? '',
    expenseDate: expense.expenseDate,
    categoryId: expense.categoryId,
    description: expense.description,
    amount: expense.amount,
    paymentMode: expense.paymentMode,
    cashBankAccountId: expense.cashBankAccountId ?? '',
    documentId: expense.documentId ?? ''
  };
}

/** Build the exact business-owned write payload from validated form values. */
function expenseWriteInput(values: SiteExpenseFormValues) {
  return {
    projectId: values.projectId,
    ...(values.stageId === '' ? { stageId: null } : { stageId: values.stageId }),
    expenseDate: values.expenseDate,
    categoryId: values.categoryId,
    description: values.description.trim(),
    amount: values.amount,
    paymentMode: values.paymentMode,
    ...((values.paymentMode === 'PAYABLE' || values.cashBankAccountId === '')
      ? { cashBankAccountId: null }
      : { cashBankAccountId: values.cashBankAccountId }),
    ...(values.documentId === '' ? { documentId: null } : { documentId: values.documentId })
  };
}

/** Render a Project selector and never fall back to raw identifier entry. */
function ProjectField(props: Readonly<{
  value: string;
  onChange: (projectId: string) => void;
  projects: ReturnType<typeof useProjects>['data'];
  canReadProjects: boolean;
}>) {
  return (
    <select value={props.value} onChange={(event) => props.onChange(event.target.value)} disabled={!props.canReadProjects || !props.projects}>
      <option value="">{!props.canReadProjects ? 'Project read permission required' : props.projects ? 'Select Project' : 'Loading Projects…'}</option>
      {(props.projects?.items ?? []).map((project) => (
        <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>
      ))}
    </select>
  );
}

/** Render a Stage selector for the chosen Project without raw identifier entry. */
function StageField(props: Readonly<{
  value: string;
  onChange: (stageId: string) => void;
  stages: ReturnType<typeof useProjectStages>['data'];
  canReadStages: boolean;
  projectId: string;
}>) {
  return (
    <select value={props.value} onChange={(event) => props.onChange(event.target.value)} disabled={props.projectId === '' || !props.canReadStages}>
      <option value="">{!props.canReadStages ? 'Project level · Stage read permission required' : props.stages ? 'Project-level expense' : 'Loading Stages…'}</option>
      {(props.stages?.items ?? []).map((stage) => (
        <option key={stage.id} value={stage.id}>{stage.code} · {stage.name}</option>
      ))}
    </select>
  );
}

/** Render the filterable, permission-scoped Site Expense register. */
function SiteExpenseRegister(props: Readonly<{
  canRead: boolean;
  canReadProjects: boolean;
  canReadStages: boolean;
  selectedId: string | null;
  onSelect: (expenseId: string) => void;
  knownCategoryIds: string[];
  onKnownCategoriesChange: (categoryIds: string[]) => void;
}>) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const projects = useProjects({ pageSize: 100 }, props.canReadProjects);
  const stages = useProjectStages(filters.projectId || null, props.canReadStages && filters.projectId !== '');
  const query = useSiteExpenses(apiFilters(filters, page), props.canRead);
  const pageCount = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.pageSize)) : 1;

  useEffect(() => {
    const ids = [...new Set(query.data?.items.map((item) => item.categoryId) ?? [])].sort();
    if (ids.length > 0) props.onKnownCategoriesChange(ids);
  }, [props.onKnownCategoriesChange, query.data]);

  /** Change one register filter and return to the first page. */
  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]): void {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  /** Clear all register filters without adding client-side reporting state. */
  function clearFilters(): void {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  return (
    <section className="admin-card">
      <div className="section-heading compact-heading">
        <h2>Site Expense register</h2>
        <p className="muted">Filter direct Site costs by Project, Stage, category, payment treatment, status and date.</p>
      </div>

      {!props.canRead && <p className="muted"><code>site_expenses.read</code> permission is required to load the register.</p>}

      {props.canRead && (
        <>
          <div className="form-grid">
            <label>Project
              <ProjectField
                value={filters.projectId}
                onChange={(value) => {
                  updateFilter('projectId', value);
                  updateFilter('stageId', '');
                }}
                projects={projects.data}
                canReadProjects={props.canReadProjects}
              />
            </label>
            <label>Stage
              <StageField
                value={filters.stageId}
                onChange={(value) => updateFilter('stageId', value)}
                stages={stages.data}
                canReadStages={props.canReadStages}
                projectId={filters.projectId}
              />
            </label>
            <label>Configured expense category
              <input list="site-expense-category-ids" value={filters.categoryId} onChange={(event) => updateFilter('categoryId', event.target.value)} placeholder="Configured expense category UUID" />
            </label>
            <label>Payment mode
              <select value={filters.paymentMode} onChange={(event) => updateFilter('paymentMode', event.target.value as FilterState['paymentMode'])}>
                <option value="">All</option>
                <option value="CASH">Cash</option>
                <option value="BANK">Bank</option>
                <option value="PAYABLE">Payable</option>
              </select>
            </label>
            <label>Status
              <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value as FilterState['status'])}>
                <option value="">All</option>
                <option value="DRAFT">Draft</option>
                <option value="POSTED">Posted</option>
                <option value="REVERSED">Reversed</option>
              </select>
            </label>
            <label>From<input type="date" value={filters.fromDate} onChange={(event) => updateFilter('fromDate', event.target.value)} /></label>
            <label>To<input type="date" value={filters.toDate} onChange={(event) => updateFilter('toDate', event.target.value)} /></label>
          </div>
          <button type="button" className="secondary-button" onClick={clearFilters}>Clear filters</button>
        </>
      )}

      {query.isPending && props.canRead && <p>Loading Site Expenses…</p>}
      {errorMessage(query.error) && <div className="form-error" role="alert">{errorMessage(query.error)}</div>}

      {query.data && (
        <>
          <p className="muted">{query.data.total} matching expense(s).</p>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Expense</th><th>Project / Stage</th><th>Category</th><th>Amount</th><th>Treatment</th><th>Status</th><th>Select</th></tr></thead>
              <tbody>
                {query.data.items.map((expense) => (
                  <tr key={expense.id}>
                    <td><strong>{expense.expenseNo}</strong><br />{expense.expenseDate}<br /><small className="muted">{expense.description}</small></td>
                    <td>{expense.projectId}<br /><small className="muted">{expense.stageId ?? 'Project-level'}</small></td>
                    <td><code>{expense.categoryId}</code></td>
                    <td>{expense.amount}</td>
                    <td>{expense.paymentMode}</td>
                    <td>{expense.status}</td>
                    <td>
                      <button type="button" className="secondary-button" aria-pressed={props.selectedId === expense.id} onClick={() => props.onSelect(expense.id)}>
                        {props.selectedId === expense.id ? 'Selected' : 'Select'}
                      </button>
                    </td>
                  </tr>
                ))}
                {query.data.items.length === 0 && <tr><td colSpan={7} className="muted">No Site Expenses match the current filters.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="pagination-row">
            <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
            <span>Page {page} of {pageCount}</span>
            <button type="button" className="secondary-button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>
        </>
      )}

      <datalist id="site-expense-category-ids">
        {props.knownCategoryIds.map((categoryId) => <option key={categoryId} value={categoryId} />)}
      </datalist>
    </section>
  );
}

/** Render the shared create/edit Site Expense form using server-owned Project, Finance and Document references. */
function SiteExpenseForm(props: Readonly<{
  mode: 'create' | 'edit';
  expense?: SiteExpense;
  canReadProjects: boolean;
  canReadStages: boolean;
  canReadFinance: boolean;
  canReadDocuments: boolean;
  knownCategoryIds: string[];
  onSaved?: (expenseId: string) => void;
}>) {
  const createMutation = useCreateSiteExpense();
  const updateMutation = useUpdateSiteExpense(props.expense?.id ?? '00000000-0000-0000-0000-000000000000');
  const form = useForm<SiteExpenseFormValues>({
    resolver: zodResolver(siteExpenseFormSchema),
    defaultValues: props.expense ? expenseFormValues(props.expense) : EMPTY_FORM
  });
  const projectId = form.watch('projectId');
  const paymentMode = form.watch('paymentMode');
  const projects = useProjects({ status: 'ACTIVE', pageSize: 100 }, props.canReadProjects);
  const stages = useProjectStages(projectId || null, props.canReadStages && projectId !== '');
  const cashBankAccounts = useCashBankAccounts({ status: 'ACTIVE', pageSize: 100 }, props.canReadFinance && paymentMode !== 'PAYABLE');
  const documents = useDocuments({ ...(projectId ? { projectId } : {}), status: 'active', pageSize: 100 }, props.canReadDocuments && projectId !== '');
  const mutation = props.mode === 'create' ? createMutation : updateMutation;

  useEffect(() => {
    form.reset(props.expense ? expenseFormValues(props.expense) : EMPTY_FORM);
  }, [form, props.expense]);

  /** Change Project and clear dependent Stage/evidence selections that may belong elsewhere. */
  function changeProject(nextProjectId: string): void {
    form.setValue('projectId', nextProjectId, { shouldValidate: true });
    form.setValue('stageId', '', { shouldValidate: true });
    form.setValue('documentId', '', { shouldValidate: true });
  }

  /** Change payment treatment and clear a direct-settlement account for PAYABLE expenses. */
  function changePaymentMode(nextMode: SiteExpensePaymentMode): void {
    form.setValue('paymentMode', nextMode, { shouldValidate: true });
    if (nextMode === 'PAYABLE') form.setValue('cashBankAccountId', '', { shouldValidate: true });
  }

  /** Persist one validated Site Expense draft using only browser-editable business fields. */
  async function handleSubmit(values: SiteExpenseFormValues): Promise<void> {
    const input = expenseWriteInput(values);
    const saved = props.mode === 'create'
      ? await createMutation.mutateAsync(input)
      : await updateMutation.mutateAsync(input);
    if (props.mode === 'create') form.reset(EMPTY_FORM);
    props.onSaved?.(saved.id);
  }

  return (
    <section className="admin-card">
      <h2>{props.mode === 'create' ? 'New Site Expense' : `Edit ${props.expense?.expenseNo ?? 'Site Expense'}`}</h2>
      <form className="admin-stack" onSubmit={form.handleSubmit((values) => void handleSubmit(values))}>
        <label>Project
          <Controller
            control={form.control}
            name="projectId"
            render={({ field }) => <ProjectField value={field.value} onChange={(value) => { field.onChange(value); changeProject(value); }} projects={projects.data} canReadProjects={props.canReadProjects} />}
          />
        </label>
        <label>Stage (optional)
          <Controller
            control={form.control}
            name="stageId"
            render={({ field }) => <StageField value={field.value} onChange={field.onChange} stages={stages.data} canReadStages={props.canReadStages} projectId={projectId} />}
          />
        </label>
        <label>Expense date<input type="date" {...form.register('expenseDate')} /></label>
        <label>Configured expense category
          <input list="site-expense-form-category-ids" placeholder="Configured expense category UUID" {...form.register('categoryId')} />
        </label>
        <p className="muted">The frozen Module 14 API has no separate category-catalog route, so this field uses a configured expense category UUID already observed from authorized Site Expense records without inventing an unsupported endpoint.</p>
        <label>Description<textarea rows={3} {...form.register('description')} /></label>
        <label>Amount<input inputMode="decimal" placeholder="0.00" {...form.register('amount')} /></label>
        <label>Payment treatment
          <Controller
            control={form.control}
            name="paymentMode"
            render={({ field }) => (
              <select value={field.value} onChange={(event) => { field.onChange(event.target.value); changePaymentMode(event.target.value as SiteExpensePaymentMode); }}>
                <option value="CASH">Cash</option>
                <option value="BANK">Bank</option>
                <option value="PAYABLE">Payable</option>
              </select>
            )}
          />
        </label>

        {paymentMode !== 'PAYABLE' && (
          <label>Cash / Bank account
            <Controller
              control={form.control}
              name="cashBankAccountId"
              render={({ field }) => (
                <select value={field.value} onChange={field.onChange} disabled={!props.canReadFinance || !cashBankAccounts.data}>
                  <option value="">{!props.canReadFinance ? 'Finance read permission required' : cashBankAccounts.data ? 'Select account' : 'Loading Cash/Bank accounts…'}</option>
                  {(cashBankAccounts.data?.items ?? []).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name} · {account.balance}</option>)}
                </select>
              )}
            />
          </label>
        )}

        <label>Evidence document (optional)
          <Controller
            control={form.control}
            name="documentId"
            render={({ field }) => (
              <select value={field.value} onChange={field.onChange} disabled={projectId === '' || !props.canReadDocuments || !documents.data}>
                <option value="">{!props.canReadDocuments ? 'Document read permission required' : documents.data ? 'No primary evidence document' : 'Loading Documents…'}</option>
                {(documents.data?.items ?? []).map((document) => <option key={document.id} value={document.id}>{document.title}{document.documentNo ? ` · ${document.documentNo}` : ''}</option>)}
              </select>
            )}
          />
        </label>

        {errorMessage(projects.error) && <div className="form-error">{errorMessage(projects.error)}</div>}
        {errorMessage(stages.error) && <div className="form-error">{errorMessage(stages.error)}</div>}
        {errorMessage(cashBankAccounts.error) && <div className="form-error">{errorMessage(cashBankAccounts.error)}</div>}
        {errorMessage(documents.error) && <div className="form-error">{errorMessage(documents.error)}</div>}
        {Object.values(form.formState.errors).map((error, index) => error?.message && <div key={index} className="form-error">{String(error.message)}</div>)}
        {errorMessage(mutation.error) && <div className="form-error" role="alert">{errorMessage(mutation.error)}</div>}
        <button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : props.mode === 'create' ? 'Create Draft Expense' : 'Save Draft Changes'}</button>
      </form>

      <datalist id="site-expense-form-category-ids">
        {props.knownCategoryIds.map((categoryId) => <option key={categoryId} value={categoryId} />)}
      </datalist>
    </section>
  );
}

/** Render detail, immutable-state guidance and explicit posting/reversal commands for one Site Expense. */
function SiteExpenseDetail(props: Readonly<{
  expense: SiteExpense;
  canPost: boolean;
  canReverse: boolean;
}>) {
  const postMutation = usePostSiteExpense();
  const reverseMutation = useReverseSiteExpense();

  /** Post the selected DRAFT expense through the explicit command endpoint. */
  function handlePost(): void {
    void postMutation.mutateAsync(props.expense.id);
  }

  /** Reverse the selected POSTED expense through compensating entries. */
  function handleReverse(): void {
    void reverseMutation.mutateAsync(props.expense.id);
  }

  return (
    <section className="admin-card">
      <h2>{props.expense.expenseNo}</h2>
      <div className="detail-grid">
        <div><span className="muted">Date</span><strong>{props.expense.expenseDate}</strong></div>
        <div><span className="muted">Status</span><strong>{props.expense.status}</strong></div>
        <div><span className="muted">Amount</span><strong>{props.expense.amount}</strong></div>
        <div><span className="muted">Payment</span><strong>{props.expense.paymentMode}</strong></div>
        <div><span className="muted">Project</span><code>{props.expense.projectId}</code></div>
        <div><span className="muted">Stage</span><code>{props.expense.stageId ?? 'Project-level'}</code></div>
        <div><span className="muted">Category</span><code>{props.expense.categoryId}</code></div>
        <div><span className="muted">Evidence</span><code>{props.expense.documentId ?? 'None'}</code></div>
        <div><span className="muted">Cash / Bank account</span><code>{props.expense.cashBankAccountId ?? 'None'}</code></div>
        <div><span className="muted">Created by</span><code>{props.expense.createdBy}</code></div>
        <div><span className="muted">Record ID</span><code>{props.expense.id}</code></div>
      </div>
      <p>{props.expense.description}</p>
      <p className="muted">Posted at {props.expense.postedAt ? new Date(props.expense.postedAt).toLocaleString() : 'Not posted'}</p>

      <div className="button-row">
        {props.canPost && props.expense.status === 'DRAFT' && (
          <button type="button" onClick={handlePost} disabled={postMutation.isPending}>{postMutation.isPending ? 'Posting…' : 'Post Expense'}</button>
        )}
        {props.canReverse && props.expense.status === 'POSTED' && (
          <button type="button" className="danger-button" onClick={handleReverse} disabled={reverseMutation.isPending}>{reverseMutation.isPending ? 'Reversing…' : 'Reverse Expense'}</button>
        )}
      </div>

      {props.expense.status !== 'DRAFT' && <p className="muted">Posted history is immutable. Corrections use the controlled reversal command.</p>}
      {errorMessage(postMutation.error) && <div className="form-error" role="alert">{errorMessage(postMutation.error)}</div>}
      {errorMessage(reverseMutation.error) && <div className="form-error" role="alert">{errorMessage(reverseMutation.error)}</div>}
    </section>
  );
}

/** Render the complete Final-21 Site Expense frontend without adding unsupported business routes. */
export function SiteExpensesWorkspace(props: SiteExpensesWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [knownCategoryIds, setKnownCategoryIds] = useState<string[]>([]);
  const selected = useSiteExpense(selectedId, props.canRead);
  const selectedExpense = selected.data;
  const mergedCategoryIds = useMemo(
    () => [...new Set([...knownCategoryIds, ...(selectedExpense ? [selectedExpense.categoryId] : [])])].sort(),
    [knownCategoryIds, selectedExpense]
  );

  /** Keep newly observed category IDs available to the create/edit datalist. */
  const rememberCategoryIds = useCallback((categoryIds: string[]): void => {
    setKnownCategoryIds((current) => {
      const next = [...new Set([...current, ...categoryIds])].sort();
      return next.length === current.length && next.every((value, index) => value === current[index]) ? current : next;
    });
  }, []);

  return (
    <div className="admin-stack">
      <SiteExpenseRegister
        canRead={props.canRead}
        canReadProjects={props.canReadProjects}
        canReadStages={props.canReadStages}
        selectedId={selectedId}
        onSelect={setSelectedId}
        knownCategoryIds={mergedCategoryIds}
        onKnownCategoriesChange={rememberCategoryIds}
      />

      {props.canCreate && (
        <SiteExpenseForm
          mode="create"
          canReadProjects={props.canReadProjects}
          canReadStages={props.canReadStages}
          canReadFinance={props.canReadFinance}
          canReadDocuments={props.canReadDocuments}
          knownCategoryIds={mergedCategoryIds}
          onSaved={setSelectedId}
        />
      )}

      {selectedId && selected.isPending && <section className="admin-card"><p>Loading Site Expense…</p></section>}
      {errorMessage(selected.error) && <section className="admin-card"><div className="form-error" role="alert">{errorMessage(selected.error)}</div></section>}

      {selectedExpense && (
        <>
          <SiteExpenseDetail expense={selectedExpense} canPost={props.canPost} canReverse={props.canReverse} />
          {props.canUpdate && selectedExpense.status === 'DRAFT' && (
            <SiteExpenseForm
              mode="edit"
              expense={selectedExpense}
              canReadProjects={props.canReadProjects}
              canReadStages={props.canReadStages}
              canReadFinance={props.canReadFinance}
              canReadDocuments={props.canReadDocuments}
              knownCategoryIds={mergedCategoryIds}
            />
          )}
        </>
      )}

      {!selectedId && (props.canUpdate || props.canPost || props.canReverse) && (
        <section className="admin-card"><p className="muted">Select a Site Expense to edit a draft, post it, or reverse posted history.</p></section>
      )}
    </div>
  );
}
