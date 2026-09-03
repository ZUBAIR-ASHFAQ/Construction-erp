import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { usePermission } from '../../administration/hooks/auth.js';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useProjects } from '../../projects/hooks/projects.js';
import { FinanceJournalWorkspace } from '../components/finance-journal-workspace.js';
import {
  useCashBankAccounts,
  useCloseFinancePeriod,
  useCreateBankReconciliation,
  useCreateFinanceAccount,
  useFinanceAccounts,
  useFinanceJournals,
  useFinanceLedger,
  useFinancePeriods,
  useFinanceTrialBalance
} from '../hooks/finance.js';
import type { FinancePeriod, GetFinanceLedgerInput } from '../api/finance-api.js';

const accountSchema = z.object({
  name: z.string().trim().min(1, 'Account name is required.').max(300),
  accountType: z.enum(['CASH', 'BANK']),
  openingBalance: z.string().trim().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/, 'Enter a valid opening balance.')
});

const periodIdSchema = z.object({ periodId: z.string().uuid('Select a fiscal period.') });
const ledgerSchema = z.object({ periodId: z.string().uuid('Period ID is required.'), accountId: z.string().trim(), projectId: z.string().trim(), stageId: z.string().trim() }).superRefine((value, context) => {
  const uuid = z.string().uuid();
  for (const field of ['accountId', 'projectId', 'stageId'] as const) {
    if (value[field] && !uuid.safeParse(value[field]).success) context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} must be a UUID.` });
  }
  if (value.stageId && !value.projectId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['projectId'], message: 'Project ID is required with Stage ID.' });
});
const reconciliationSchema = z.object({ cashBankAccountId: z.string().uuid('Select a Cash/Bank account.'), statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Statement date is required.') });

type AccountValues = z.infer<typeof accountSchema>;
type PeriodValues = z.infer<typeof periodIdSchema>;
type LedgerValues = z.infer<typeof ledgerSchema>;
type ReconciliationValues = z.infer<typeof reconciliationSchema>;


/** Format one fiscal period for a readable selector without exposing raw UUIDs. */
function formatPeriodLabel(period: FinancePeriod): string {
  return `FY ${period.fiscalYear} · P${period.periodNo} · ${period.startDate} to ${period.endDate} · ${period.status}`;
}

type FinancePageProps = Readonly<{ view?: 'core' | 'ledger' }>;

/** Render the Final Module 18 Finance Core or its separate Account Ledger view against approved Finance APIs. */
export function FinancePage({ view = 'core' }: FinancePageProps) {
  const canReadFinance = usePermission('finance.read');
  const canReadScopedFinance = canReadFinance;
  const canManageAccounts = usePermission('finance.accounts.manage');
  const canReconcile = usePermission('finance.reconcile');
  const canClosePeriods = usePermission('finance.periods.close');
  const canReadProjects = usePermission('projects.read');
  const canReadStages = usePermission('stages.read');
  const [journalPage, setJournalPage] = useState(1);
  const [trialPeriodId, setTrialPeriodId] = useState<string | null>(null);
  const [ledgerInput, setLedgerInput] = useState<GetFinanceLedgerInput | null>(null);

  const selectorAccountsQuery = useFinanceAccounts({ page: 1, pageSize: 100 }, view === 'ledger' && canReadFinance);
  const journalsQuery = useFinanceJournals({ page: journalPage, pageSize: 25 }, view === 'core' && canReadScopedFinance);
  const cashBankQuery = useCashBankAccounts({ page: 1, pageSize: 100, status: 'ACTIVE' }, view === 'core' && canReadFinance);
  const periodsQuery = useFinancePeriods({ page: 1, pageSize: 100 }, canReadFinance || canClosePeriods);
  const projectsQuery = useProjects({ page: 1, pageSize: 100 }, view === 'ledger' && canReadScopedFinance && canReadProjects);
  const trialBalanceQuery = useFinanceTrialBalance(trialPeriodId);
  const ledgerQuery = useFinanceLedger(ledgerInput);
  const createAccountMutation = useCreateFinanceAccount();
  const reconciliationMutation = useCreateBankReconciliation();
  const closePeriodMutation = useCloseFinancePeriod();

  const accountForm = useForm<AccountValues>({ resolver: zodResolver(accountSchema), defaultValues: { name: '', accountType: 'CASH', openingBalance: '0.00' } });
  const trialForm = useForm<PeriodValues>({ resolver: zodResolver(periodIdSchema), defaultValues: { periodId: '' } });
  const closePeriodForm = useForm<PeriodValues>({ resolver: zodResolver(periodIdSchema), defaultValues: { periodId: '' } });
  const ledgerForm = useForm<LedgerValues>({ resolver: zodResolver(ledgerSchema), defaultValues: { periodId: '', accountId: '', projectId: '', stageId: '' } });
  const reconciliationForm = useForm<ReconciliationValues>({ resolver: zodResolver(reconciliationSchema), defaultValues: { cashBankAccountId: '', statementDate: new Date().toISOString().slice(0, 10) } });
  const ledgerProjectId = ledgerForm.watch('projectId');
  const ledgerStagesQuery = useProjectStages(ledgerProjectId || null, view === 'ledger' && canReadScopedFinance && canReadStages && ledgerProjectId !== '');

  /** Create one server-numbered Cash/Bank account and clear the setup form. */
  async function handleCreateAccount(values: AccountValues): Promise<void> {
    await createAccountMutation.mutateAsync(values);
    accountForm.reset({ name: '', accountType: 'CASH', openingBalance: '0.00' });
  }

  /** Run a trial-balance read for one explicit period. */
  function handleTrialBalance(values: PeriodValues): void {
    setTrialPeriodId(values.periodId);
  }

  /** Run a bounded General Ledger read with optional account/Project/Stage filters. */
  function handleLedger(values: LedgerValues): void {
    setLedgerInput({ periodId: values.periodId, ...(values.accountId ? { accountId: values.accountId } : {}), ...(values.projectId ? { projectId: values.projectId } : {}), ...(values.stageId ? { stageId: values.stageId } : {}), page: 1, pageSize: 100 });
  }

  /** Reconcile one Cash/Bank account using the server-derived balance. */
  async function handleReconciliation(values: ReconciliationValues): Promise<void> {
    await reconciliationMutation.mutateAsync(values);
  }

  /** Close one fiscal period by its explicit identifier. */
  async function handleClosePeriod(values: PeriodValues): Promise<void> {
    await closePeriodMutation.mutateAsync(values.periodId);
  }

  const selectorAccounts = selectorAccountsQuery.data?.items ?? [];
  const journals = journalsQuery.data?.items ?? [];
  const periods = periodsQuery.data?.items ?? [];
  const projects = projectsQuery.data?.items ?? [];
  const ledgerStages = ledgerStagesQuery.data?.items ?? [];
  const openPeriods = periods.filter((period) => period.status === 'OPEN');
  const journalPages = Math.max(1, Math.ceil((journalsQuery.data?.total ?? 0) / 25));

  if (view === 'ledger') {
    return (
      <section className="page-stack">
        <header className="page-heading">
          <div><p className="eyebrow">Module 18 · Finance Core</p><h1>Account Ledger</h1><p>Review posted General Ledger activity by fiscal period, account, Project and Stage.</p></div>
        </header>

        {periodsQuery.error instanceof Error && <p className="form-error" role="alert">{periodsQuery.error.message}</p>}
        {selectorAccountsQuery.error instanceof Error && <p className="form-error" role="alert">{selectorAccountsQuery.error.message}</p>}
        {projectsQuery.error instanceof Error && <p className="form-error" role="alert">{projectsQuery.error.message}</p>}
        {ledgerStagesQuery.error instanceof Error && <p className="form-error" role="alert">{ledgerStagesQuery.error.message}</p>}

        <section className="admin-card">
          <h2>General Ledger</h2>
          {canReadScopedFinance && <form className="admin-grid" onSubmit={ledgerForm.handleSubmit(handleLedger)}><label>Fiscal period<select {...ledgerForm.register('periodId')}><option value="">Select period</option>{periods.map((period) => <option key={period.id} value={period.id}>{formatPeriodLabel(period)}</option>)}</select></label><label>Account<select {...ledgerForm.register('accountId')}><option value="">All accounts</option>{selectorAccounts.map((account) => <option key={account.id} value={account.id}>{account.accountCode} · {account.name}</option>)}</select></label><label>Project<select {...ledgerForm.register('projectId')} disabled={!canReadProjects} onChange={(event) => { ledgerForm.setValue('projectId', event.target.value); ledgerForm.setValue('stageId', ''); }}><option value="">{canReadProjects ? 'All allowed Projects' : 'Project read permission required'}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}</select></label><label>Stage<select {...ledgerForm.register('stageId')} disabled={!canReadStages || !ledgerProjectId}><option value="">{ledgerProjectId ? 'All Project Stages' : 'Select a Project first'}</option>{ledgerStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.code} · {stage.name}</option>)}</select></label><button type="submit">Load ledger</button></form>}
          {ledgerQuery.data && <div className="table-wrap"><table className="admin-table"><thead><tr><th>Date</th><th>Journal</th><th>Account</th><th>Project / Stage</th><th>Description</th><th>Debit</th><th>Credit</th></tr></thead><tbody>{ledgerQuery.data.items.map((line) => <tr key={line.id}><td>{line.postingDate}</td><td>{line.journalNo}</td><td>{line.accountCode} · {line.accountName}</td><td><span>{line.projectName ? `${line.projectCode ?? ''}${line.projectCode ? ' · ' : ''}${line.projectName}` : 'Company'}</span><span>{line.stageName ? `${line.stageCode ?? ''}${line.stageCode ? ' · ' : ''}${line.stageName}` : '—'}</span></td><td>{line.description}</td><td>{line.debit}</td><td>{line.credit}</td></tr>)}</tbody></table></div>}
          {ledgerQuery.error instanceof Error && <p className="form-error" role="alert">{ledgerQuery.error.message}</p>}
        </section>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <header className="page-heading">
        <div><p className="eyebrow">Module 18</p><h1>Finance & Accounting</h1><p>Journal records, trial balance, Cash/Bank reconciliation and fiscal-period close.</p></div>
      </header>

      {canManageAccounts && <section className="admin-card">
        <h2>Create Account</h2>
        <form className="admin-grid two-columns" onSubmit={accountForm.handleSubmit(handleCreateAccount)}><label>Account name<input {...accountForm.register('name')} /></label><label>Account type<select {...accountForm.register('accountType')}><option value="CASH">Cash</option><option value="BANK">Bank</option></select></label><label>Opening balance<input type="number" min="0" step="0.01" inputMode="decimal" {...accountForm.register('openingBalance')} /></label><div className="muted">Account code is generated automatically by the server. A non-zero opening balance posts an opening Journal automatically.</div><button type="submit" disabled={createAccountMutation.isPending}>Create account</button></form>
        {createAccountMutation.error instanceof Error && <p className="form-error" role="alert">{createAccountMutation.error.message}</p>}
      </section>}

      {periodsQuery.error instanceof Error && <p className="form-error" role="alert">{periodsQuery.error.message}</p>}
      {selectorAccountsQuery.error instanceof Error && <p className="form-error" role="alert">{selectorAccountsQuery.error.message}</p>}
      <FinanceJournalWorkspace journals={journals} />
      {journalsQuery.data && <div className="pagination-row"><button type="button" className="secondary-button" disabled={journalPage <= 1} onClick={() => setJournalPage((page) => page - 1)}>Previous Journals</button><span>Page {journalPage} of {journalPages}</span><button type="button" className="secondary-button" disabled={journalPage >= journalPages} onClick={() => setJournalPage((page) => page + 1)}>Next Journals</button></div>}

      <section className="admin-card">
        <h2>Trial Balance</h2>
        {canReadScopedFinance && <form className="finance-period-form" onSubmit={trialForm.handleSubmit(handleTrialBalance)}><label>Fiscal period<select {...trialForm.register('periodId')}><option value="">Select period</option>{periods.map((period) => <option key={period.id} value={period.id}>{formatPeriodLabel(period)}</option>)}</select></label><button type="submit">Run trial balance</button></form>}
        {trialBalanceQuery.data && <div className="table-wrap"><table className="admin-table"><thead><tr><th>Account</th><th>Name</th><th>Debit</th><th>Credit</th></tr></thead><tbody>{trialBalanceQuery.data.rows.map((row) => <tr key={row.accountId}><td>{row.accountCode}<br /><small>{row.accountId}</small></td><td>{row.accountName}</td><td>{row.debit}</td><td>{row.credit}</td></tr>)}</tbody><tfoot><tr><th colSpan={2}>Total</th><th>{trialBalanceQuery.data.totalDebit}</th><th>{trialBalanceQuery.data.totalCredit}</th></tr></tfoot></table></div>}
      </section>

      <section className="admin-card">
        <h2>Cash / Bank & Reconciliation</h2>
        {cashBankQuery.data && <div className="table-wrap"><table className="admin-table"><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>GL account</th><th>Bank</th><th>Reference</th><th>Status</th><th>Balance</th></tr></thead><tbody>{cashBankQuery.data.items.map((account) => <tr key={account.id}><td>{account.code}<br /><small>{account.id}</small></td><td>{account.name}</td><td>{account.accountType}</td><td>{account.glAccountId}</td><td>{account.bankName ?? '—'}</td><td>{account.accountReference ?? '—'}</td><td>{account.status}</td><td>{account.balance}</td></tr>)}</tbody></table></div>}
        {canReconcile && <form className="finance-period-form" onSubmit={reconciliationForm.handleSubmit(handleReconciliation)}><label>Cash/Bank account<select {...reconciliationForm.register('cashBankAccountId')} disabled={!cashBankQuery.data}><option value="">{cashBankQuery.data ? 'Select account' : 'Loading Cash/Bank accounts…'}</option>{(cashBankQuery.data?.items ?? []).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label><label>Statement date<input type="date" {...reconciliationForm.register('statementDate')} /></label><button type="submit" disabled={reconciliationMutation.isPending || !cashBankQuery.data}>Reconcile</button></form>}
        {reconciliationMutation.data && <p className="muted">Reconciliation {reconciliationMutation.data.id} · Account {reconciliationMutation.data.cashBankAccountId} · Statement {reconciliationMutation.data.statementDate} · {reconciliationMutation.data.status} · Reconciled balance <strong>{reconciliationMutation.data.reconciledBalance}</strong> · Created by {reconciliationMutation.data.createdBy} at {new Date(reconciliationMutation.data.createdAt).toLocaleString()}</p>}
        {(cashBankQuery.error ?? reconciliationMutation.error) instanceof Error && <p className="form-error" role="alert">{String((cashBankQuery.error ?? reconciliationMutation.error)?.message)}</p>}
      </section>

      {canClosePeriods && <section className="admin-card"><h2>Period Control</h2><p className="muted">Only explicit close is exposed. Fiscal periods are provisioned by trusted company setup and listed here for selection.</p><form className="finance-period-form" onSubmit={closePeriodForm.handleSubmit(handleClosePeriod)}><label>Open fiscal period<select {...closePeriodForm.register('periodId')}><option value="">Select open period</option>{openPeriods.map((period) => <option key={period.id} value={period.id}>{formatPeriodLabel(period)}</option>)}</select></label><button type="submit" disabled={closePeriodMutation.isPending || openPeriods.length === 0}>Close period</button></form>{openPeriods.length === 0 && periodsQuery.data && <p className="muted">No open fiscal period is available to close.</p>}{closePeriodMutation.data && <p className="muted">Closed period {closePeriodMutation.data.fiscalYear}/{closePeriodMutation.data.periodNo}.</p>}{closePeriodMutation.error instanceof Error && <p className="form-error" role="alert">{closePeriodMutation.error.message}</p>}</section>}
    </section>
  );
}
