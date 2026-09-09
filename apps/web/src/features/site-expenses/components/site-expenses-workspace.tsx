import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useDocuments } from '../../documents-audit/hooks/documents.js';
import { useCashBankAccounts } from '../../finance/hooks/finance.js';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useProjects } from '../../projects/hooks/projects.js';
import type { SiteExpensePaymentMode } from '../api/site-expenses-api.js';
import { useCreateSiteExpense, useCreateExpenseCategory, useExpenseCategories, useReverseSiteExpense, useSiteExpenses } from '../hooks/site-expenses.js';

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
      message: 'Select a Cash/Bank account for direct payment.'
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

const EMPTY_FORM: SiteExpenseFormValues = {
  projectId: '',
  stageId: '',
  expenseDate: new Date().toISOString().slice(0, 10),
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

/** Build the exact business-owned Site Expense payload from validated form values. */
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

/** Render the single direct-entry Site Expense form; the server creates and posts it atomically. */
function SiteExpenseForm(props: SiteExpensesWorkspaceProps) {
  const createMutation = useCreateSiteExpense();
  const categories = useExpenseCategories(true);
  const createCategory = useCreateExpenseCategory();
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const form = useForm<SiteExpenseFormValues>({ resolver: zodResolver(siteExpenseFormSchema), defaultValues: EMPTY_FORM });
  const projectId = form.watch('projectId');
  const paymentMode = form.watch('paymentMode');
  const projects = useProjects({ status: 'ACTIVE', pageSize: 100 }, props.canReadProjects);
  const stages = useProjectStages(projectId || null, props.canReadStages && projectId !== '');
  const cashBankAccounts = useCashBankAccounts({ status: 'ACTIVE', pageSize: 100 }, props.canReadFinance && paymentMode !== 'PAYABLE');
  const documents = useDocuments({ ...(projectId ? { projectId } : {}), status: 'active', pageSize: 100 }, props.canReadDocuments && projectId !== '');
  const canSubmit = props.canCreate && props.canPost;

  /** Change Project and clear dependent Stage/evidence selections that may belong elsewhere. */
  function changeProject(nextProjectId: string): void {
    form.setValue('projectId', nextProjectId, { shouldValidate: true });
    form.setValue('stageId', '', { shouldValidate: true });
    form.setValue('documentId', '', { shouldValidate: true });
  }

  /** Change payment treatment and clear a direct-settlement account for PAYABLE expenses. */
  function changePaymentMode(nextMode: SiteExpensePaymentMode): void {
    form.setValue('paymentMode', nextMode, { shouldValidate: true });
    form.setValue('cashBankAccountId', '', { shouldValidate: nextMode === 'PAYABLE' });
  }

  /** Add and select a category, then close the centered catalog popup. */
  async function addCategory(): Promise<void> {
    const name = newCategoryName.trim();
    if (!name) return;
    const category = await createCategory.mutateAsync(name);
    form.setValue('categoryId', category.id, { shouldValidate: true });
    setNewCategoryName('');
    setCategoryModalOpen(false);
  }

  /** Create and post one validated Site Expense in one backend transaction. */
  async function handleSubmit(values: SiteExpenseFormValues): Promise<void> {
    if (!canSubmit) return;
    await createMutation.mutateAsync(expenseWriteInput(values));
    form.reset({ ...EMPTY_FORM, expenseDate: new Date().toISOString().slice(0, 10) });
  }

  return (
    <section className="admin-card">
      <div className="section-heading-row"><h2>New Site Expense</h2><button type="button" className="secondary-button" onClick={() => setCategoryModalOpen(true)}>Categories</button></div>
      <p className="muted">Saving posts the expense to Project Cost and Finance immediately. Cash/Bank payments reduce the selected account balance.</p>

      {!canSubmit && <p className="muted"><code>site_expenses.create</code> and <code>site_expenses.post</code> permissions are required to add an expense.</p>}

      <form className="admin-stack" onSubmit={form.handleSubmit((values) => void handleSubmit(values))}>
        <label>Project
          <Controller control={form.control} name="projectId" render={({ field }) => <ProjectField value={field.value} onChange={(value) => { field.onChange(value); changeProject(value); }} projects={projects.data} canReadProjects={props.canReadProjects} />} />
        </label>
        <label>Stage (optional)
          <Controller control={form.control} name="stageId" render={({ field }) => <StageField value={field.value} onChange={field.onChange} stages={stages.data} canReadStages={props.canReadStages} projectId={projectId} />} />
        </label>
        <label>Expense date<input type="date" {...form.register('expenseDate')} /></label>
        <label>Expense category<select {...form.register('categoryId')} disabled={!categories.data}><option value="">{categories.data ? 'Select category' : 'Loading categories…'}</option>{(categories.data ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>Description<textarea rows={3} {...form.register('description')} /></label>
        <label>Amount<input inputMode="decimal" placeholder="0.00" {...form.register('amount')} /></label>
        <label>Payment treatment
          <Controller control={form.control} name="paymentMode" render={({ field }) => (
            <select value={field.value} onChange={(event) => { field.onChange(event.target.value); changePaymentMode(event.target.value as SiteExpensePaymentMode); }}>
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
              <option value="PAYABLE">Payable</option>
            </select>
          )} />
        </label>

        {paymentMode !== 'PAYABLE' && (
          <label>Cash / Bank account
            <Controller control={form.control} name="cashBankAccountId" render={({ field }) => (
              <select value={field.value} onChange={field.onChange} disabled={!props.canReadFinance || !cashBankAccounts.data}>
                <option value="">{!props.canReadFinance ? 'Finance read permission required' : cashBankAccounts.data ? 'Select account' : 'Loading Cash/Bank accounts…'}</option>
                {(cashBankAccounts.data?.items ?? []).filter((account) => account.accountType === paymentMode).map((account) => <option key={account.id} value={account.id}>{account.name}{account.bankName ? ` · ${account.bankName}` : ''} · Balance {account.balance}</option>)}
              </select>
            )} />
          </label>
        )}

        <label>Evidence document (optional)
          <Controller control={form.control} name="documentId" render={({ field }) => (
            <select value={field.value} onChange={field.onChange} disabled={projectId === '' || !props.canReadDocuments || !documents.data}>
              <option value="">{!props.canReadDocuments ? 'Document read permission required' : documents.data ? 'No primary evidence document' : 'Loading Documents…'}</option>
              {(documents.data?.items ?? []).map((document) => <option key={document.id} value={document.id}>{document.title}{document.documentNo ? ` · ${document.documentNo}` : ''}</option>)}
            </select>
          )} />
        </label>

        {errorMessage(projects.error) && <div className="form-error">{errorMessage(projects.error)}</div>}
        {errorMessage(stages.error) && <div className="form-error">{errorMessage(stages.error)}</div>}
        {errorMessage(cashBankAccounts.error) && <div className="form-error">{errorMessage(cashBankAccounts.error)}</div>}
        {errorMessage(documents.error) && <div className="form-error">{errorMessage(documents.error)}</div>}
        {Object.values(form.formState.errors).map((error, index) => error?.message && <div key={index} className="form-error">{String(error.message)}</div>)}
        {errorMessage(createMutation.error) && <div className="form-error" role="alert">{errorMessage(createMutation.error)}</div>}
        {createMutation.data && <p className="muted" role="status">{createMutation.data.expenseNo} posted successfully.</p>}
        <button type="submit" disabled={!canSubmit || createMutation.isPending}>{createMutation.isPending ? 'Posting…' : 'Add Site Expense'}</button>
      </form>

      {categoryModalOpen && <div className="finance-modal-backdrop" role="presentation"><section className="finance-modal" role="dialog" aria-modal="true" aria-labelledby="expense-category-title"><header className="finance-modal-header"><div><p className="eyebrow">Site expense setup</p><h2 id="expense-category-title">Expense Categories</h2></div><button type="button" className="finance-modal-close" aria-label="Close categories" onClick={() => setCategoryModalOpen(false)}>×</button></header><div className="finance-modal-body"><div className="expense-category-list">{(categories.data ?? []).map((category) => <button key={category.id} type="button" className="expense-category-row" onClick={() => { form.setValue('categoryId', category.id, { shouldValidate: true }); setCategoryModalOpen(false); }}><span><strong>{category.name}</strong><small>{category.code}</small></span><span>Select</span></button>)}{categories.data?.length === 0 && <p className="muted">No categories have been added yet.</p>}</div><div className="expense-category-add"><label>New category name<input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="e.g. Site utilities" /></label><button type="button" onClick={() => void addCategory()} disabled={!newCategoryName.trim() || createCategory.isPending}>{createCategory.isPending ? 'Adding…' : 'Add Category'}</button>{errorMessage(createCategory.error) && <div className="form-error" role="alert">{errorMessage(createCategory.error)}</div>}</div></div></section></div>}
    </section>
  );
}

/** Render posted Site Expense history with the one allowed lifecycle action: reversal. */
function SiteExpenseList(props: Pick<SiteExpensesWorkspaceProps, 'canRead' | 'canReverse' | 'canReadProjects'>) {
  const expenses = useSiteExpenses({ page: 1, pageSize: 100 }, props.canRead);
  const categories = useExpenseCategories(props.canRead);
  const projects = useProjects({ pageSize: 100 }, props.canRead && props.canReadProjects);
  const reverseMutation = useReverseSiteExpense();
  const visibleExpenses = (expenses.data?.items ?? []).filter((expense) => expense.status !== 'DRAFT');
  const projectNames = new Map((projects.data?.items ?? []).map((project) => [project.id, `${project.projectCode} · ${project.name}`]));
  const categoryNames = new Map((categories.data ?? []).map((category) => [category.id, category.name]));

  /** Reverse one posted expense only after the operator confirms the compensating financial effect. */
  async function handleReverse(expenseId: string, expenseNo: string): Promise<void> {
    if (!props.canReverse) return;
    if (!window.confirm(`Reverse Site Expense ${expenseNo}? This restores its Project Cost and Cash/Bank or payable Finance effect.`)) return;
    await reverseMutation.mutateAsync(expenseId);
  }

  return (
    <section className="admin-card">
      <div className="section-heading compact-heading">
        <h2>Expense List</h2>
        <p className="muted">Posted and reversed expenses remain as immutable history. Reverse creates compensating Cost and Finance entries.</p>
      </div>
      {!props.canRead && <p className="muted"><code>site_expenses.read</code> permission is required to load expenses.</p>}
      {expenses.isPending && props.canRead && <p>Loading Site Expenses…</p>}
      {errorMessage(expenses.error) && <div className="form-error" role="alert">{errorMessage(expenses.error)}</div>}
      {errorMessage(reverseMutation.error) && <div className="form-error" role="alert">{errorMessage(reverseMutation.error)}</div>}
      {expenses.data && (
        <div className="table-scroll">
          <table>
            <thead><tr><th>Expense</th><th>Project</th><th>Category</th><th>Amount</th><th>Payment</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {visibleExpenses.map((expense) => {
                const reversing = reverseMutation.isPending && reverseMutation.variables === expense.id;
                return (
                  <tr key={expense.id}>
                    <td><strong>{expense.expenseNo}</strong><br />{expense.expenseDate}<br /><small className="muted">{expense.description}</small></td>
                    <td>{projectNames.get(expense.projectId) ?? expense.projectId}<br /><small className="muted">{expense.stageId ? 'Stage expense' : 'Project-level'}</small></td>
                    <td>{categoryNames.get(expense.categoryId) ?? expense.categoryId}</td>
                    <td>{expense.amount}</td>
                    <td>{expense.paymentMode}</td>
                    <td>{expense.status}</td>
                    <td>{props.canReverse && expense.status === 'POSTED' ? <button type="button" className="secondary-button" disabled={reverseMutation.isPending} onClick={() => void handleReverse(expense.id, expense.expenseNo)}>{reversing ? 'Reversing…' : 'Reverse'}</button> : '—'}</td>
                  </tr>
                );
              })}
              {visibleExpenses.length === 0 && <tr><td colSpan={7} className="muted">No Site Expenses have been posted yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Render direct Site Expense entry plus immutable expense history and reversal only. */
export function SiteExpensesWorkspace(props: SiteExpensesWorkspaceProps) {
  return <div className="admin-stack"><SiteExpenseForm {...props} /><SiteExpenseList canRead={props.canRead} canReverse={props.canReverse} canReadProjects={props.canReadProjects} /></div>;
}
