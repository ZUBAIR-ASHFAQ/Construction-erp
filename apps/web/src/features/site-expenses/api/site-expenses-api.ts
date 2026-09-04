import { authenticatedRequest } from '../../administration/api/auth-api.js';

export type SiteExpensePaymentMode = 'CASH' | 'BANK' | 'PAYABLE';
export type SiteExpenseStatus = 'DRAFT' | 'POSTED' | 'REVERSED';
export type ExpenseCategory = Readonly<{ id: string; code: string; name: string; status: string }>;

export type SiteExpense = Readonly<{
  id: string;
  projectId: string;
  stageId: string | null;
  expenseNo: string;
  expenseDate: string;
  categoryId: string;
  description: string;
  amount: string;
  paymentMode: SiteExpensePaymentMode;
  cashBankAccountId: string | null;
  status: SiteExpenseStatus;
  documentId: string | null;
  createdBy: string;
  postedAt: string | null;
}>;

export type SiteExpensePage = Readonly<{
  items: SiteExpense[];
  total: number;
  page: number;
  pageSize: number;
}>;

export type ListSiteExpensesInput = Readonly<{
  projectId?: string;
  stageId?: string;
  categoryId?: string;
  paymentMode?: SiteExpensePaymentMode;
  status?: SiteExpenseStatus;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}>;

export type CreateSiteExpenseInput = Readonly<{
  projectId: string;
  stageId?: string | null;
  expenseDate: string;
  categoryId: string;
  description: string;
  amount: string;
  paymentMode: SiteExpensePaymentMode;
  cashBankAccountId?: string | null;
  documentId?: string | null;
}>;

export type UpdateSiteExpenseInput = Partial<CreateSiteExpenseInput>;

/** Build one bounded Site Expense register query from documented filters only. */
function siteExpenseQuery(input: ListSiteExpensesInput): string {
  const query = new URLSearchParams();
  if (input.projectId) query.set('projectId', input.projectId);
  if (input.stageId) query.set('stageId', input.stageId);
  if (input.categoryId) query.set('categoryId', input.categoryId);
  if (input.paymentMode) query.set('paymentMode', input.paymentMode);
  if (input.status) query.set('status', input.status);
  if (input.fromDate) query.set('fromDate', input.fromDate);
  if (input.toDate) query.set('toDate', input.toDate);
  if (input.page !== undefined) query.set('page', String(input.page));
  if (input.pageSize !== undefined) query.set('pageSize', String(input.pageSize));
  return query.size > 0 ? `?${query.toString()}` : '';
}

/** Build the Foundation retry key required by every Site Expense write. */
function siteExpenseCommandHeaders(): HeadersInit {
  return { 'Idempotency-Key': crypto.randomUUID() };
}

/** Load active Site Expense categories for human-readable selectors. */
export function listExpenseCategories(): Promise<ExpenseCategory[]> {
  return authenticatedRequest<ExpenseCategory[]>('site-expense-categories');
}

/** Create a category; its expense posting account is provisioned by the server. */
export function createExpenseCategory(name: string): Promise<ExpenseCategory> {
  return authenticatedRequest<ExpenseCategory>('site-expense-categories', { method: 'POST', body: JSON.stringify({ name }) });
}

/** Load one permission-scoped page of Site Expenses. */
export function listSiteExpenses(input: ListSiteExpensesInput = {}): Promise<SiteExpensePage> {
  return authenticatedRequest<SiteExpensePage>(`site-expenses${siteExpenseQuery(input)}`);
}

/** Load one Site Expense detail row. */
export function getSiteExpense(expenseId: string): Promise<SiteExpense> {
  return authenticatedRequest<SiteExpense>(`site-expenses/${encodeURIComponent(expenseId)}`);
}

/** Create one server-numbered DRAFT Site Expense. */
export function createSiteExpense(input: CreateSiteExpenseInput): Promise<SiteExpense> {
  return authenticatedRequest<SiteExpense>('site-expenses', {
    method: 'POST',
    headers: siteExpenseCommandHeaders(),
    body: JSON.stringify(input)
  });
}

/** Update only business-editable fields on one DRAFT Site Expense. */
export function updateSiteExpense(expenseId: string, input: UpdateSiteExpenseInput): Promise<SiteExpense> {
  return authenticatedRequest<SiteExpense>(`site-expenses/${encodeURIComponent(expenseId)}`, {
    method: 'PATCH',
    headers: siteExpenseCommandHeaders(),
    body: JSON.stringify(input)
  });
}

/** Post one DRAFT Site Expense to Finance and Project/Stage actual cost. */
export function postSiteExpense(expenseId: string): Promise<SiteExpense> {
  return authenticatedRequest<SiteExpense>(`site-expenses/${encodeURIComponent(expenseId)}/post`, {
    method: 'POST',
    headers: siteExpenseCommandHeaders(),
    body: JSON.stringify({})
  });
}

/** Reverse one POSTED Site Expense through compensating Finance and cost entries. */
export function reverseSiteExpense(expenseId: string): Promise<SiteExpense> {
  return authenticatedRequest<SiteExpense>(`site-expenses/${encodeURIComponent(expenseId)}/reverse`, {
    method: 'POST',
    headers: siteExpenseCommandHeaders(),
    body: JSON.stringify({})
  });
}
