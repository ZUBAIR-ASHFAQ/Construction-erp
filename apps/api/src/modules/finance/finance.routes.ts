import type { DatabaseClient } from '@construction-erp/database';
import { AuthorizationError, ValidationError } from '@construction-erp/errors';
import { hasPermission, requireRequestSecurityContext } from '@construction-erp/request-context';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from '../../plugins/authentication.js';
import {
  bankReconciliationResponseSchema,
  cashBankAccountResponseSchema,
  closeFiscalPeriodBodySchema,
  createBankReconciliationBodySchema,
  createFinanceAccountBodySchema,
  createManualJournalBodySchema,
  financeAccountResponseSchema,
  financeJournalParamsSchema,
  financeJournalResponseSchema,
  financeLedgerQuerySchema,
  financeLedgerResponseSchema,
  financePeriodParamsSchema,
  financePeriodResponseSchema,
  listCashBankAccountsQuerySchema,
  updateCashBankAccountBodySchema,
  listCashBankAccountsResponseSchema,
  listFinanceAccountsQuerySchema,
  listFinanceAccountsResponseSchema,
  listFinancePeriodsQuerySchema,
  listFinancePeriodsResponseSchema,
  listFinanceJournalsQuerySchema,
  listFinanceJournalsResponseSchema,
  postJournalBodySchema,
  reverseJournalBodySchema,
  trialBalanceQuerySchema,
  trialBalanceResponseSchema,
  type FinancePermissionCode
} from './finance.schema.js';
import { FinanceService } from './finance.service.js';

export type FinanceRoutesOptions = Readonly<{ database: DatabaseClient }>;

const BEARER_SECURITY = [{ bearerAuth: [] }];
const UUID_JSON_SCHEMA = { type: 'string', format: 'uuid' } as const;
const DATE_JSON_SCHEMA = { type: 'string', format: 'date' } as const;
const PAGINATION_PROPERTIES = {
  page: { type: 'integer', minimum: 1 },
  pageSize: { type: 'integer', minimum: 1, maximum: 100 }
} as const;
const JOURNAL_PARAMS_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['id'], properties: { id: UUID_JSON_SCHEMA } } as const;
const IDEMPOTENCY_HEADERS_JSON_SCHEMA = {
  type: 'object', additionalProperties: true, required: ['idempotency-key'],
  properties: { 'idempotency-key': { type: 'string', minLength: 1, maxLength: 200 } }
} as const;
const CREATE_ACCOUNT_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['name', 'accountType', 'openingBalance'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 300 },
    accountType: { type: 'string', enum: ['CASH', 'BANK'] },
    openingBalance: { type: 'string', pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$' },
    bankName: { type: 'string', minLength: 1, maxLength: 200 },
    accountReference: { type: 'string', minLength: 1, maxLength: 200 }
  }
} as const;
const JOURNAL_LINE_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['accountId', 'debit', 'credit', 'description'],
  properties: {
    accountId: UUID_JSON_SCHEMA,
    projectId: UUID_JSON_SCHEMA,
    stageId: UUID_JSON_SCHEMA,
    debit: { type: 'string', pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$' },
    credit: { type: 'string', pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$' },
    description: { type: 'string', minLength: 1, maxLength: 2000 }
  }
} as const;
const CREATE_JOURNAL_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['postingDate', 'description', 'lines'],
  properties: {
    postingDate: DATE_JSON_SCHEMA,
    description: { type: 'string', minLength: 1, maxLength: 2000 },
    lines: { type: 'array', minItems: 1, maxItems: 500, items: JOURNAL_LINE_BODY_JSON_SCHEMA }
  }
} as const;
const REVERSE_JOURNAL_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { postingDate: DATE_JSON_SCHEMA }
} as const;
const LIST_ACCOUNTS_QUERY_JSON_SCHEMA = { type: 'object', additionalProperties: false, properties: PAGINATION_PROPERTIES } as const;
const LIST_PERIODS_QUERY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { ...PAGINATION_PROPERTIES, status: { type: 'string', minLength: 1, maxLength: 100 } }
} as const;
const LIST_JOURNALS_QUERY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { ...PAGINATION_PROPERTIES, periodId: UUID_JSON_SCHEMA, status: { type: 'string', minLength: 1, maxLength: 100 } }
} as const;
const LEDGER_QUERY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['periodId'],
  properties: { ...PAGINATION_PROPERTIES, periodId: UUID_JSON_SCHEMA, accountId: UUID_JSON_SCHEMA, projectId: UUID_JSON_SCHEMA, stageId: UUID_JSON_SCHEMA }
} as const;
const TRIAL_BALANCE_QUERY_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['periodId'], properties: { periodId: UUID_JSON_SCHEMA } } as const;
const CASH_BANK_QUERY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { ...PAGINATION_PROPERTIES, status: { type: 'string', minLength: 1, maxLength: 100 } }
} as const;
const UPDATE_CASH_BANK_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, minProperties: 1,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 300 },
    bankName: { anyOf: [{ type: 'string', minLength: 1, maxLength: 200 }, { type: 'null' }] },
    accountReference: { anyOf: [{ type: 'string', minLength: 1, maxLength: 200 }, { type: 'null' }] },
    status: { type: 'string', enum: ['ACTIVE', 'ARCHIVED'] }
  }
} as const;
const RECONCILIATION_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['cashBankAccountId', 'statementDate'],
  properties: { cashBankAccountId: UUID_JSON_SCHEMA, statementDate: DATE_JSON_SCHEMA }
} as const;
const EMPTY_BODY_JSON_SCHEMA = { type: 'object', additionalProperties: false, maxProperties: 0 } as const;
const SUCCESS_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['data'], properties: { data: {} } } as const;
const ERROR_JSON_SCHEMA = { type: 'object', additionalProperties: true, required: ['error'], properties: { error: { type: 'object', additionalProperties: true } } } as const;
const COMMON_RESPONSES = { 400: ERROR_JSON_SCHEMA, 401: ERROR_JSON_SCHEMA, 403: ERROR_JSON_SCHEMA, 404: ERROR_JSON_SCHEMA, 409: ERROR_JSON_SCHEMA, 500: ERROR_JSON_SCHEMA } as const;

/** Parse one Finance request boundary with Zod. */
function parseRequest<T extends z.ZodTypeAny>(schema: T, value: unknown, location: 'params' | 'query' | 'body'): z.infer<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ValidationError({
    code: 'INVALID_REQUEST',
    message: 'Request validation failed.',
    fieldErrors: result.error.issues.map((issue) => ({ field: [location, ...issue.path.map(String)].join('.'), message: issue.message }))
  });
}

/** Read the required idempotency key for Finance write commands. */
function readIdempotencyKey(request: FastifyRequest): string {
  const raw = request.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 200) {
    throw new ValidationError({ fieldErrors: [{ field: 'headers.idempotency-key', message: 'Idempotency-Key is required and must be at most 200 characters.' }] });
  }
  return value;
}

/** Perform a lightweight route-level Finance access check before service resource policy. */
function requireRouteAccess(permission: FinancePermissionCode, allowProjectScope = false): void {
  if (hasPermission(permission)) return;
  if (allowProjectScope) {
    const scope = requireRequestSecurityContext().projectScope;
    if (scope.kind === 'all' || (scope.kind === 'restricted' && scope.projectIds.length > 0)) return;
  }
  throw new AuthorizationError({ code: 'FINANCE_SCOPE_FORBIDDEN', message: 'Finance access is not allowed for this request.' });
}

/** Serialize one General Ledger account without exposing Company ownership fields. */
function serializeAccount(account: Awaited<ReturnType<FinanceService['listAccounts']>>['items'][number]) {
  return financeAccountResponseSchema.parse({
    id: account.id,
    accountCode: account.accountCode,
    name: account.name,
    accountType: account.accountType,
    parentId: account.parentId,
    status: account.status
  });
}

/** Serialize one Cash/Bank account with its derived posted balance. */
function serializeCashBankAccount(account: Awaited<ReturnType<FinanceService['listCashBankAccounts']>>['items'][number]) {
  return cashBankAccountResponseSchema.parse({
    id: account.id,
    code: account.code,
    name: account.name,
    accountType: account.accountType,
    glAccountId: account.glAccountId,
    bankName: account.bankName,
    accountReference: account.accountReference,
    status: account.status,
    openingBalance: account.openingBalance,
    balance: account.balance
  });
}

/** Serialize one fiscal period without exposing Company ownership fields. */
function serializePeriod(period: Awaited<ReturnType<FinanceService['listFiscalPeriods']>>['items'][number]) {
  return financePeriodResponseSchema.parse({
    id: period.id,
    fiscalYear: period.fiscalYear,
    periodNo: period.periodNo,
    startDate: period.startDate.toISOString().slice(0, 10),
    endDate: period.endDate.toISOString().slice(0, 10),
    status: period.status
  });
}


/** Serialize one Journal and preserve Date/Decimal values without precision loss. */
function serializeJournal(journal: Awaited<ReturnType<FinanceService['listJournals']>>['items'][number]) {
  return financeJournalResponseSchema.parse({
    id: journal.id,
    journalNo: journal.journalNo,
    postingDate: journal.postingDate.toISOString().slice(0, 10),
    sourceType: journal.sourceType,
    sourceId: journal.sourceId,
    sourceKey: journal.sourceKey,
    description: journal.description,
    status: journal.status,
    periodId: journal.periodId,
    periodLabel: `FY ${journal.period.fiscalYear} · P${journal.period.periodNo} · ${journal.period.startDate.toISOString().slice(0, 10)} to ${journal.period.endDate.toISOString().slice(0, 10)}`,
    createdBy: journal.createdBy,
    createdByName: journal.creator?.name ?? null,
    postedAt: journal.postedAt?.toISOString() ?? null,
    totalDebit: journal.totalDebit.toString(),
    totalCredit: journal.totalCredit.toString(),
    lines: journal.lines.map((line) => ({
      id: line.id,
      journalId: line.journalId,
      accountId: line.accountId,
      accountCode: line.account.accountCode,
      accountName: line.account.name,
      projectId: line.projectId,
      projectCode: line.project?.projectCode ?? null,
      projectName: line.project?.name ?? null,
      stageId: line.stageId,
      stageCode: line.stage?.code ?? null,
      stageName: line.stage?.name ?? null,
      debit: line.debit.toString(),
      credit: line.credit.toString(),
      description: line.description
    }))
  });
}

/** Register the exact Final Module 18 Finance & Accounting HTTP contract. */
export async function registerFinanceRoutes(app: FastifyInstance, options: FinanceRoutesOptions): Promise<void> {
  const service = new FinanceService(options.database);
  const tag = ['Module 18 - Finance & Accounting'];

  app.get('/api/v1/finance/accounts', {
    schema: { tags: tag, operationId: 'financeListAccounts', summary: 'List Chart of Accounts', security: BEARER_SECURITY, querystring: LIST_ACCOUNTS_QUERY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRouteAccess('finance.read');
    const query = parseRequest(listFinanceAccountsQuerySchema, request.query, 'query');
    const result = await service.listAccounts(query);
    return reply.send({ data: listFinanceAccountsResponseSchema.parse({ ...result, items: result.items.map((item) => serializeAccount(item)) }) });
  });

  app.post('/api/v1/finance/accounts', {
    schema: { tags: tag, operationId: 'financeCreateAccount', summary: 'Create Cash or Bank account with automatic code and opening balance', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, body: CREATE_ACCOUNT_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRouteAccess('finance.accounts.manage');
    const body = parseRequest(createFinanceAccountBodySchema, request.body, 'body');
    return reply.code(201).send({ data: financeAccountResponseSchema.parse(await service.createAccount(body, readIdempotencyKey(request))) });
  });

  app.get('/api/v1/finance/journals', {
    schema: { tags: tag, operationId: 'financeListJournals', summary: 'List Journals', security: BEARER_SECURITY, querystring: LIST_JOURNALS_QUERY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRouteAccess('finance.read', true);
    const query = parseRequest(listFinanceJournalsQuerySchema, request.query, 'query');
    const result = await service.listJournals(query);
    return reply.send({ data: listFinanceJournalsResponseSchema.parse({ ...result, items: result.items.map((item) => serializeJournal(item)) }) });
  });

  app.post('/api/v1/finance/journals', {
    schema: { tags: tag, operationId: 'financeCreateManualJournal', summary: 'Create and post balanced manual Journal', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, body: CREATE_JOURNAL_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRouteAccess('finance.journals.create', true);
    const body = parseRequest(createManualJournalBodySchema, request.body, 'body');
    return reply.code(201).send({ data: financeJournalResponseSchema.parse(await service.createManualJournal(body, readIdempotencyKey(request))) });
  });

  app.post('/api/v1/finance/journals/:id/post', {
    schema: { tags: tag, operationId: 'financePostJournal', summary: 'Post balanced Journal', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, params: JOURNAL_PARAMS_JSON_SCHEMA, body: EMPTY_BODY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRouteAccess('finance.journals.post', true);
    const { id } = parseRequest(financeJournalParamsSchema, request.params, 'params');
    parseRequest(postJournalBodySchema, request.body ?? {}, 'body');
    return reply.send({ data: financeJournalResponseSchema.parse(await service.postJournal(id, readIdempotencyKey(request))) });
  });

  app.post('/api/v1/finance/journals/:id/reverse', {
    schema: { tags: tag, operationId: 'financeReverseJournal', summary: 'Reverse posted manual Journal', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, params: JOURNAL_PARAMS_JSON_SCHEMA, body: REVERSE_JOURNAL_BODY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRouteAccess('finance.journals.reverse', true);
    const { id } = parseRequest(financeJournalParamsSchema, request.params, 'params');
    const body = parseRequest(reverseJournalBodySchema, request.body ?? {}, 'body');
    return reply.send({ data: financeJournalResponseSchema.parse(await service.reverseJournal(id, readIdempotencyKey(request), body)) });
  });

  app.get('/api/v1/finance/ledger', {
    schema: { tags: tag, operationId: 'financeLedger', summary: 'Read General Ledger', security: BEARER_SECURITY, querystring: LEDGER_QUERY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRouteAccess('finance.read', true);
    const query = parseRequest(financeLedgerQuerySchema, request.query, 'query');
    const result = await service.getLedger(query);
    return reply.send({ data: financeLedgerResponseSchema.parse({ ...result, items: result.items.map((item) => ({ ...item, postingDate: item.postingDate.toISOString().slice(0, 10) })) }) });
  });

  app.get('/api/v1/finance/trial-balance', {
    schema: { tags: tag, operationId: 'financeTrialBalance', summary: 'Read Trial Balance', security: BEARER_SECURITY, querystring: TRIAL_BALANCE_QUERY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRouteAccess('finance.read', true);
    const query = parseRequest(trialBalanceQuerySchema, request.query, 'query');
    return reply.send({ data: trialBalanceResponseSchema.parse(await service.getTrialBalance(query)) });
  });

  app.get('/api/v1/finance/cash-bank', {
    schema: { tags: tag, operationId: 'financeCashBank', summary: 'List Cash and Bank balances', security: BEARER_SECURITY, querystring: CASH_BANK_QUERY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRouteAccess('finance.read');
    const query = parseRequest(listCashBankAccountsQuerySchema, request.query, 'query');
    const result = await service.listCashBankAccounts(query);
    return reply.send({ data: listCashBankAccountsResponseSchema.parse({ ...result, items: result.items.map((item) => serializeCashBankAccount(item)) }) });
  });

  app.get('/api/v1/finance/journals/:id', {
    schema: { tags: tag, operationId: 'financeGetJournal', summary: 'Get one Journal with visible debit and credit lines', security: BEARER_SECURITY, params: JOURNAL_PARAMS_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRouteAccess('finance.read', true);
    const { id } = parseRequest(financeJournalParamsSchema, request.params, 'params');
    return reply.send({ data: serializeJournal(await service.getJournal(id)) });
  });

  app.patch('/api/v1/finance/cash-bank/:id', {
    schema: { tags: tag, operationId: 'financeUpdateCashBank', summary: 'Update Cash or Bank account details', security: BEARER_SECURITY, params: JOURNAL_PARAMS_JSON_SCHEMA, body: UPDATE_CASH_BANK_BODY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRouteAccess('finance.accounts.manage');
    const { id } = parseRequest(financeJournalParamsSchema, request.params, 'params');
    const body = parseRequest(updateCashBankAccountBodySchema, request.body, 'body');
    await service.updateCashBankAccount(id, body);
    const result = await service.listCashBankAccounts({ page: 1, pageSize: 100 });
    const account = result.items.find((item) => item.id === id);
    if (!account) throw new ValidationError({ message: 'Account was not found after update.' });
    return reply.send({ data: serializeCashBankAccount(account) });
  });


  app.get('/api/v1/finance/periods', {
    schema: { tags: tag, operationId: 'financeListPeriods', summary: 'List fiscal periods', security: BEARER_SECURITY, querystring: LIST_PERIODS_QUERY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    if (!hasPermission('finance.read') && !hasPermission('finance.periods.close')) {
      throw new AuthorizationError({ code: 'FINANCE_SCOPE_FORBIDDEN', message: 'Finance access is not allowed for this request.' });
    }
    const query = parseRequest(listFinancePeriodsQuerySchema, request.query, 'query');
    const result = await service.listFiscalPeriods(query);
    return reply.send({ data: listFinancePeriodsResponseSchema.parse({ ...result, items: result.items.map((item) => serializePeriod(item)) }) });
  });

  app.post('/api/v1/finance/reconciliations', {
    schema: { tags: tag, operationId: 'financeCreateReconciliation', summary: 'Create Cash/Bank reconciliation', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, body: RECONCILIATION_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRouteAccess('finance.reconcile');
    const body = parseRequest(createBankReconciliationBodySchema, request.body, 'body');
    const reconciliation = await service.createBankReconciliation(body, readIdempotencyKey(request));
    return reply.code(201).send({ data: bankReconciliationResponseSchema.parse(reconciliation) });
  });

  app.post('/api/v1/finance/periods/:id/close', {
    schema: { tags: tag, operationId: 'financeClosePeriod', summary: 'Close fiscal period', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, params: JOURNAL_PARAMS_JSON_SCHEMA, body: EMPTY_BODY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRouteAccess('finance.periods.close');
    const { id } = parseRequest(financePeriodParamsSchema, request.params, 'params');
    parseRequest(closeFiscalPeriodBodySchema, request.body ?? {}, 'body');
    const period = await service.closeFiscalPeriod(id, readIdempotencyKey(request));
    return reply.send({ data: financePeriodResponseSchema.parse(period) });
  });
}
