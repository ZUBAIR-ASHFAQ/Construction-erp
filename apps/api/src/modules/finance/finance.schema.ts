import {
  AppError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError
} from '@construction-erp/errors';
import { z } from 'zod';

/** Stable Finance boundary limits for pagination and manual Journal size. */
export const FINANCE_MAX_PAGE_SIZE = 100;
export const FINANCE_MAX_JOURNAL_LINES = 500;

export const FINANCE_PERMISSION_CODES = Object.freeze([
  'finance.read',
  'finance.accounts.manage',
  'finance.journals.create',
  'finance.journals.post',
  'finance.journals.reverse',
  'finance.periods.close',
  'finance.reconcile'
] as const);

export const FINANCE_ERROR_CODES = Object.freeze([
  'JOURNAL_UNBALANCED',
  'FISCAL_PERIOD_CLOSED',
  'DUPLICATE_POSTING_SOURCE',
  'GL_ACCOUNT_INVALID',
  'SOURCE_JOURNAL_REVERSAL_FORBIDDEN',
  'FINANCE_SCOPE_FORBIDDEN'
] as const);

export const FINANCE_EVENT_TYPES = Object.freeze([
  'journal.posted',
  'journal.reversed',
  'period.closed',
  'bank_reconciliation.completed'
] as const);

export const FINANCE_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/finance/accounts' }),
  Object.freeze({ method: 'POST', route: '/api/v1/finance/accounts' }),
  Object.freeze({ method: 'GET', route: '/api/v1/finance/journals' }),
  Object.freeze({ method: 'POST', route: '/api/v1/finance/journals' }),
  Object.freeze({ method: 'POST', route: '/api/v1/finance/journals/:id/post' }),
  Object.freeze({ method: 'POST', route: '/api/v1/finance/journals/:id/reverse' }),
  Object.freeze({ method: 'GET', route: '/api/v1/finance/ledger' }),
  Object.freeze({ method: 'GET', route: '/api/v1/finance/trial-balance' }),
  Object.freeze({ method: 'GET', route: '/api/v1/finance/cash-bank' }),
  Object.freeze({ method: 'GET', route: '/api/v1/finance/periods' }),
  Object.freeze({ method: 'POST', route: '/api/v1/finance/reconciliations' }),
  Object.freeze({ method: 'POST', route: '/api/v1/finance/periods/:id/close' })
] as const);

export type FinancePermissionCode = (typeof FINANCE_PERMISSION_CODES)[number];
export type FinanceErrorCode = (typeof FINANCE_ERROR_CODES)[number];
export type FinanceEventType = (typeof FINANCE_EVENT_TYPES)[number];

export const financePermissionCodeSchema = z.enum(FINANCE_PERMISSION_CODES);
export const financeErrorCodeSchema = z.enum(FINANCE_ERROR_CODES);

const uuidSchema = z.string().uuid();
const tokenSchema = z.string().trim().min(1).max(100);
const accountCodeSchema = z.string().trim().min(1).max(100);
const accountNameSchema = z.string().trim().min(1).max(300);
const descriptionSchema = z.string().trim().min(1).max(2000);
const moneySchema = z.string().trim().regex(
  /^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/,
  'money must be a decimal string with at most 16 whole digits and 2 decimal places'
);
const nonNegativeMoneySchema = z.string().trim().regex(
  /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/,
  'money must be a non-negative decimal string with at most 16 whole digits and 2 decimal places'
);
const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
    return date.getUTCFullYear() === year
      && date.getUTCMonth() === (month ?? 0) - 1
      && date.getUTCDate() === day;
  }, 'date must be a valid calendar date');

const paginationQueryShape = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(FINANCE_MAX_PAGE_SIZE).optional()
} as const;

/** Path contract for one Journal command. */
export const financeJournalParamsSchema = z.object({ id: uuidSchema }).strict();

/** Path contract for one fiscal-period close command. */
export const financePeriodParamsSchema = z.object({ id: uuidSchema }).strict();

/** Bounded Chart-of-Accounts read query. */
export const listFinanceAccountsQuerySchema = z.object({ ...paginationQueryShape }).strict();

/** Create one active Company General Ledger account. */
export const createFinanceAccountBodySchema = z.object({
  accountCode: accountCodeSchema,
  name: accountNameSchema,
  accountType: tokenSchema,
  parentId: uuidSchema.nullable().optional()
}).strict();

/** One manual Journal line using only Final-21 Project and optional Stage dimensions. */
export const manualJournalLineInputSchema = z.object({
  accountId: uuidSchema,
  projectId: uuidSchema.optional(),
  stageId: uuidSchema.optional(),
  debit: nonNegativeMoneySchema,
  credit: nonNegativeMoneySchema,
  description: descriptionSchema
}).strict().superRefine((value, context) => {
  if (value.stageId && !value.projectId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['projectId'], message: 'projectId is required when stageId is provided' });
  }
});

/** Create one draft manual Journal while numbering, period, status and totals stay server-owned. */
export const createManualJournalBodySchema = z.object({
  postingDate: dateSchema,
  description: descriptionSchema,
  lines: z.array(manualJournalLineInputSchema).min(1).max(FINANCE_MAX_JOURNAL_LINES)
}).strict();

/** Posting is an explicit bodyless command. */
export const postJournalBodySchema = z.object({}).strict();

/** Reversal may select an open-period posting date while preserving the original date by default. */
export const reverseJournalBodySchema = z.object({
  postingDate: dateSchema.optional()
}).strict();

/** Bounded fiscal-period selector query for Finance reads and close commands. */
export const listFinancePeriodsQuerySchema = z.object({
  ...paginationQueryShape,
  status: tokenSchema.optional()
}).strict();

/** Bounded Journal history filters. */
export const listFinanceJournalsQuerySchema = z.object({
  ...paginationQueryShape,
  periodId: uuidSchema.optional(),
  status: tokenSchema.optional()
}).strict();

/** General Ledger query with optional account, Project and Stage filters. */
export const financeLedgerQuerySchema = z.object({
  ...paginationQueryShape,
  periodId: uuidSchema,
  accountId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  stageId: uuidSchema.optional()
}).strict().superRefine((value, context) => {
  if (value.stageId && !value.projectId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['projectId'], message: 'projectId is required when stageId is provided' });
  }
});

/** Trial balance is requested for one explicit fiscal period. */
export const trialBalanceQuerySchema = z.object({ periodId: uuidSchema }).strict();

/** Cash/Bank list is bounded and optionally filtered by lifecycle status. */
export const listCashBankAccountsQuerySchema = z.object({
  ...paginationQueryShape,
  status: tokenSchema.optional()
}).strict();

/** Reconciliation captures only the account and statement date; the balance is derived server-side. */
export const createBankReconciliationBodySchema = z.object({
  cashBankAccountId: uuidSchema,
  statementDate: dateSchema
}).strict();

/** Period close is an explicit bodyless command. */
export const closeFiscalPeriodBodySchema = z.object({}).strict();

/** Safe Chart-of-Accounts response row. */
export const financeAccountResponseSchema = z.object({
  id: uuidSchema,
  accountCode: accountCodeSchema,
  name: accountNameSchema,
  accountType: tokenSchema,
  parentId: uuidSchema.nullable(),
  status: tokenSchema
}).strict();

/** Paginated Chart-of-Accounts response. */
export const listFinanceAccountsResponseSchema = z.object({
  items: z.array(financeAccountResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(FINANCE_MAX_PAGE_SIZE)
}).strict();

/** Safe persisted Journal line. */
export const financeJournalLineResponseSchema = z.object({
  id: uuidSchema,
  journalId: uuidSchema,
  accountId: uuidSchema,
  projectId: uuidSchema.nullable(),
  stageId: uuidSchema.nullable(),
  debit: nonNegativeMoneySchema,
  credit: nonNegativeMoneySchema,
  description: descriptionSchema
}).strict();

/** Safe Journal readback with explicit stable source identity. */
export const financeJournalResponseSchema = z.object({
  id: uuidSchema,
  journalNo: tokenSchema,
  postingDate: dateSchema,
  sourceType: tokenSchema,
  sourceId: z.string().trim().min(1).max(200).nullable(),
  sourceKey: z.string().trim().min(1).max(700).nullable(),
  description: descriptionSchema,
  status: tokenSchema,
  periodId: uuidSchema,
  createdBy: uuidSchema.nullable(),
  postedAt: z.string().datetime().nullable(),
  totalDebit: nonNegativeMoneySchema,
  totalCredit: nonNegativeMoneySchema,
  lines: z.array(financeJournalLineResponseSchema)
}).strict();

/** Paginated Journal history response. */
export const listFinanceJournalsResponseSchema = z.object({
  items: z.array(financeJournalResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(FINANCE_MAX_PAGE_SIZE)
}).strict();

/** One General Ledger line with account and Journal context. */
export const financeLedgerLineResponseSchema = z.object({
  id: uuidSchema,
  journalId: uuidSchema,
  journalNo: tokenSchema,
  postingDate: dateSchema,
  accountId: uuidSchema,
  accountCode: accountCodeSchema,
  accountName: accountNameSchema,
  projectId: uuidSchema.nullable(),
  stageId: uuidSchema.nullable(),
  debit: nonNegativeMoneySchema,
  credit: nonNegativeMoneySchema,
  description: descriptionSchema
}).strict();

/** Paginated General Ledger response. */
export const financeLedgerResponseSchema = z.object({
  items: z.array(financeLedgerLineResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(FINANCE_MAX_PAGE_SIZE)
}).strict();

/** One account row in the trial balance. */
export const trialBalanceRowResponseSchema = z.object({
  accountId: uuidSchema,
  accountCode: accountCodeSchema,
  accountName: accountNameSchema,
  debit: nonNegativeMoneySchema,
  credit: nonNegativeMoneySchema
}).strict();

/** Trial-balance response. */
export const trialBalanceResponseSchema = z.object({
  periodId: uuidSchema,
  rows: z.array(trialBalanceRowResponseSchema),
  totalDebit: nonNegativeMoneySchema,
  totalCredit: nonNegativeMoneySchema
}).strict();

/** Safe Cash/Bank account response with a derived posted balance. */
export const cashBankAccountResponseSchema = z.object({
  id: uuidSchema,
  code: accountCodeSchema,
  name: accountNameSchema,
  accountType: tokenSchema,
  glAccountId: uuidSchema,
  bankName: z.string().trim().min(1).max(200).nullable(),
  accountReference: z.string().trim().min(1).max(200).nullable(),
  status: tokenSchema,
  balance: moneySchema
}).strict();

/** Paginated Cash/Bank account response. */
export const listCashBankAccountsResponseSchema = z.object({
  items: z.array(cashBankAccountResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(FINANCE_MAX_PAGE_SIZE)
}).strict();

/** Safe Bank Reconciliation response. */
export const bankReconciliationResponseSchema = z.object({
  id: uuidSchema,
  cashBankAccountId: uuidSchema,
  statementDate: dateSchema,
  status: tokenSchema,
  reconciledBalance: moneySchema,
  createdBy: uuidSchema,
  createdAt: z.string().datetime()
}).strict();

/** Safe fiscal-period response used by reads and the close command. */
export const financePeriodResponseSchema = z.object({
  id: uuidSchema,
  fiscalYear: z.number().int(),
  periodNo: z.number().int().min(1),
  startDate: dateSchema,
  endDate: dateSchema,
  status: tokenSchema
}).strict();

/** Paginated fiscal-period response used by Finance period selectors. */
export const listFinancePeriodsResponseSchema = z.object({
  items: z.array(financePeriodResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(FINANCE_MAX_PAGE_SIZE)
}).strict();

export type FinanceJournalParams = z.infer<typeof financeJournalParamsSchema>;
export type FinancePeriodParams = z.infer<typeof financePeriodParamsSchema>;
export type ListFinanceAccountsQuery = z.infer<typeof listFinanceAccountsQuerySchema>;
export type CreateFinanceAccountBody = z.infer<typeof createFinanceAccountBodySchema>;
export type ManualJournalLineInput = z.infer<typeof manualJournalLineInputSchema>;
export type CreateManualJournalBody = z.infer<typeof createManualJournalBodySchema>;
export type PostJournalBody = z.infer<typeof postJournalBodySchema>;
export type ReverseJournalBody = z.infer<typeof reverseJournalBodySchema>;
export type ListFinancePeriodsQuery = z.infer<typeof listFinancePeriodsQuerySchema>;
export type ListFinanceJournalsQuery = z.infer<typeof listFinanceJournalsQuerySchema>;
export type FinanceLedgerQuery = z.infer<typeof financeLedgerQuerySchema>;
export type TrialBalanceQuery = z.infer<typeof trialBalanceQuerySchema>;
export type ListCashBankAccountsQuery = z.infer<typeof listCashBankAccountsQuerySchema>;
export type CreateBankReconciliationBody = z.infer<typeof createBankReconciliationBodySchema>;
export type CloseFiscalPeriodBody = z.infer<typeof closeFiscalPeriodBodySchema>;
export type FinanceAccountResponse = z.infer<typeof financeAccountResponseSchema>;
export type ListFinanceAccountsResponse = z.infer<typeof listFinanceAccountsResponseSchema>;
export type FinanceJournalLineResponse = z.infer<typeof financeJournalLineResponseSchema>;
export type FinanceJournalResponse = z.infer<typeof financeJournalResponseSchema>;
export type ListFinanceJournalsResponse = z.infer<typeof listFinanceJournalsResponseSchema>;
export type FinanceLedgerLineResponse = z.infer<typeof financeLedgerLineResponseSchema>;
export type FinanceLedgerResponse = z.infer<typeof financeLedgerResponseSchema>;
export type TrialBalanceRowResponse = z.infer<typeof trialBalanceRowResponseSchema>;
export type TrialBalanceResponse = z.infer<typeof trialBalanceResponseSchema>;
export type CashBankAccountResponse = z.infer<typeof cashBankAccountResponseSchema>;
export type ListCashBankAccountsResponse = z.infer<typeof listCashBankAccountsResponseSchema>;
export type BankReconciliationResponse = z.infer<typeof bankReconciliationResponseSchema>;
export type FinancePeriodResponse = z.infer<typeof financePeriodResponseSchema>;
export type ListFinancePeriodsResponse = z.infer<typeof listFinancePeriodsResponseSchema>;

const FINANCE_ERROR_MESSAGES: Readonly<Record<FinanceErrorCode, string>> = Object.freeze({
  JOURNAL_UNBALANCED: 'Journal debit and credit totals must balance before posting.',
  FISCAL_PERIOD_CLOSED: 'The posting date belongs to a closed or unavailable fiscal period.',
  DUPLICATE_POSTING_SOURCE: 'This financial source has already been posted.',
  GL_ACCOUNT_INVALID: 'The requested General Ledger account is unavailable.',
  SOURCE_JOURNAL_REVERSAL_FORBIDDEN: 'Source-module Journals cannot be reversed independently from Finance.',
  FINANCE_SCOPE_FORBIDDEN: 'Finance access is outside the authenticated Company or Project scope.'
});

/** Create one stable Final-21 Finance business error without leaking database details. */
export function createFinanceError(code: FinanceErrorCode): AppError {
  const message = FINANCE_ERROR_MESSAGES[code];
  switch (code) {
    case 'JOURNAL_UNBALANCED':
    case 'GL_ACCOUNT_INVALID':
      return new ValidationError({ code, message });
    case 'FISCAL_PERIOD_CLOSED':
    case 'DUPLICATE_POSTING_SOURCE':
    case 'SOURCE_JOURNAL_REVERSAL_FORBIDDEN':
      return new ConflictError({ code, message });
    case 'FINANCE_SCOPE_FORBIDDEN':
      return new AuthorizationError({ code, message });
  }
}

/** Create a not-found error for a missing Finance record without exposing tenant boundaries. */
export function createFinanceNotFoundError(): AppError {
  return new NotFoundError({ message: 'The requested Finance record was not found.' });
}
