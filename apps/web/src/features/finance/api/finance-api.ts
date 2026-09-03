import { authenticatedRequest } from '../../administration/api/auth-api.js';

export type FinanceAccount = Readonly<{
  id: string;
  accountCode: string;
  name: string;
  accountType: string;
  parentId: string | null;
  status: string;
}>;

export type FinanceAccountPage = Readonly<{ items: FinanceAccount[]; total: number; page: number; pageSize: number }>;
export type ListFinanceAccountsInput = Readonly<{ page?: number; pageSize?: number }>;
export type CreateFinanceAccountInput = Readonly<{ name: string; accountType: 'CASH' | 'BANK'; openingBalance: string }>;

export type ManualJournalLineInput = Readonly<{
  accountId: string;
  projectId?: string;
  stageId?: string;
  debit: string;
  credit: string;
  description: string;
}>;

export type CreateManualJournalInput = Readonly<{
  postingDate: string;
  description: string;
  lines: ManualJournalLineInput[];
}>;

export type FinanceJournalLine = Readonly<{
  id: string;
  journalId: string;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  projectId: string | null;
  projectCode?: string | null;
  projectName?: string | null;
  stageId: string | null;
  stageCode?: string | null;
  stageName?: string | null;
  debit: string;
  credit: string;
  description: string;
}>;

export type FinanceJournal = Readonly<{
  id: string;
  journalNo: string;
  postingDate: string;
  sourceType: string;
  sourceId: string | null;
  sourceKey: string | null;
  description: string;
  status: string;
  periodId: string;
  periodLabel?: string;
  createdBy: string | null;
  createdByName?: string | null;
  postedAt: string | null;
  totalDebit: string;
  totalCredit: string;
  lines: FinanceJournalLine[];
}>;

export type FinanceJournalPage = Readonly<{ items: FinanceJournal[]; total: number; page: number; pageSize: number }>;
export type ListFinanceJournalsInput = Readonly<{ page?: number; pageSize?: number; periodId?: string; status?: string }>;
export type ReverseFinanceJournalInput = Readonly<{ journalId: string; postingDate?: string }>;

export type FinanceLedgerLine = Readonly<{
  id: string;
  journalId: string;
  journalNo: string;
  postingDate: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  stageId: string | null;
  stageCode: string | null;
  stageName: string | null;
  debit: string;
  credit: string;
  description: string;
}>;

export type FinanceLedgerPage = Readonly<{ items: FinanceLedgerLine[]; total: number; page: number; pageSize: number }>;
export type GetFinanceLedgerInput = Readonly<{
  periodId: string;
  accountId?: string;
  projectId?: string;
  stageId?: string;
  page?: number;
  pageSize?: number;
}>;

export type TrialBalanceRow = Readonly<{ accountId: string; accountCode: string; accountName: string; debit: string; credit: string }>;
export type TrialBalance = Readonly<{ periodId: string; rows: TrialBalanceRow[]; totalDebit: string; totalCredit: string }>;

export type CashBankAccount = Readonly<{
  id: string;
  code: string;
  name: string;
  accountType: string;
  glAccountId: string;
  bankName: string | null;
  accountReference: string | null;
  status: string;
  balance: string;
}>;

export type CashBankAccountPage = Readonly<{ items: CashBankAccount[]; total: number; page: number; pageSize: number }>;
export type ListCashBankAccountsInput = Readonly<{ page?: number; pageSize?: number; status?: string }>;
export type CreateBankReconciliationInput = Readonly<{ cashBankAccountId: string; statementDate: string }>;
export type BankReconciliation = Readonly<{
  id: string;
  cashBankAccountId: string;
  statementDate: string;
  status: string;
  reconciledBalance: string;
  createdBy: string;
  createdAt: string;
}>;

export type ListFinancePeriodsInput = Readonly<{ page?: number; pageSize?: number; status?: string }>;

export type FinancePeriod = Readonly<{
  id: string;
  fiscalYear: number;
  periodNo: number;
  startDate: string;
  endDate: string;
  status: string;
}>;
export type FinancePeriodPage = Readonly<{ items: FinancePeriod[]; total: number; page: number; pageSize: number }>;

/** Add an idempotency key to one Finance write command. */
function financeWriteInit(method: 'POST', body?: unknown): RequestInit {
  return {
    method,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  };
}

/** Load one bounded Chart-of-Accounts page. */
export function listFinanceAccounts(input: ListFinanceAccountsInput = {}): Promise<FinanceAccountPage> {
  const query = new URLSearchParams();
  if (input.page !== undefined) query.set('page', String(input.page));
  if (input.pageSize !== undefined) query.set('pageSize', String(input.pageSize));
  return authenticatedRequest<FinanceAccountPage>(`finance/accounts${query.size ? `?${query}` : ''}`);
}

/** Create one General Ledger account. */
export function createFinanceAccount(input: CreateFinanceAccountInput): Promise<FinanceAccount> {
  return authenticatedRequest<FinanceAccount>('finance/accounts', financeWriteInit('POST', input));
}

/** List bounded Journal history for the current Finance scope. */
export function listFinanceJournals(input: ListFinanceJournalsInput = {}): Promise<FinanceJournalPage> {
  const query = new URLSearchParams();
  if (input.page !== undefined) query.set('page', String(input.page));
  if (input.pageSize !== undefined) query.set('pageSize', String(input.pageSize));
  if (input.periodId) query.set('periodId', input.periodId);
  if (input.status) query.set('status', input.status);
  return authenticatedRequest<FinanceJournalPage>(`finance/journals${query.size ? `?${query}` : ''}`);
}

/** Create one manual draft Journal. */
export function createManualJournal(input: CreateManualJournalInput): Promise<FinanceJournal> {
  return authenticatedRequest<FinanceJournal>('finance/journals', financeWriteInit('POST', input));
}

/** Post one balanced draft Journal. */
export function postFinanceJournal(journalId: string): Promise<FinanceJournal> {
  return authenticatedRequest<FinanceJournal>(`finance/journals/${encodeURIComponent(journalId)}/post`, financeWriteInit('POST'));
}

/** Reverse one posted manual Journal, optionally selecting an open-period posting date. */
export function reverseFinanceJournal(journalId: string, postingDate?: string): Promise<FinanceJournal> {
  const body = postingDate ? { postingDate } : undefined;
  return authenticatedRequest<FinanceJournal>(`finance/journals/${encodeURIComponent(journalId)}/reverse`, financeWriteInit('POST', body));
}

/** Load one bounded General Ledger slice. */
export function getFinanceLedger(input: GetFinanceLedgerInput): Promise<FinanceLedgerPage> {
  const query = new URLSearchParams({ periodId: input.periodId });
  if (input.accountId) query.set('accountId', input.accountId);
  if (input.projectId) query.set('projectId', input.projectId);
  if (input.stageId) query.set('stageId', input.stageId);
  if (input.page !== undefined) query.set('page', String(input.page));
  if (input.pageSize !== undefined) query.set('pageSize', String(input.pageSize));
  return authenticatedRequest<FinanceLedgerPage>(`finance/ledger?${query}`);
}

/** Load the authorized trial balance for one fiscal period. */
export function getFinanceTrialBalance(periodId: string): Promise<TrialBalance> {
  return authenticatedRequest<TrialBalance>(`finance/trial-balance?${new URLSearchParams({ periodId })}`);
}

/** List Cash/Bank accounts with posted balances. */
export function listCashBankAccounts(input: ListCashBankAccountsInput = {}): Promise<CashBankAccountPage> {
  const query = new URLSearchParams();
  if (input.page !== undefined) query.set('page', String(input.page));
  if (input.pageSize !== undefined) query.set('pageSize', String(input.pageSize));
  if (input.status) query.set('status', input.status);
  return authenticatedRequest<CashBankAccountPage>(`finance/cash-bank${query.size ? `?${query}` : ''}`);
}


/** List bounded Company fiscal periods for Finance selectors. */
export function listFinancePeriods(input: ListFinancePeriodsInput = {}): Promise<FinancePeriodPage> {
  const query = new URLSearchParams();
  if (input.page !== undefined) query.set('page', String(input.page));
  if (input.pageSize !== undefined) query.set('pageSize', String(input.pageSize));
  if (input.status) query.set('status', input.status);
  return authenticatedRequest<FinancePeriodPage>(`finance/periods${query.size ? `?${query}` : ''}`);
}

/** Create one reconciliation from the server-derived Cash/Bank balance. */
export function createBankReconciliation(input: CreateBankReconciliationInput): Promise<BankReconciliation> {
  return authenticatedRequest<BankReconciliation>('finance/reconciliations', financeWriteInit('POST', input));
}

/** Close one fiscal period through the explicit Finance command. */
export function closeFinancePeriod(periodId: string): Promise<FinancePeriod> {
  return authenticatedRequest<FinancePeriod>(`finance/periods/${encodeURIComponent(periodId)}/close`, financeWriteInit('POST'));
}
