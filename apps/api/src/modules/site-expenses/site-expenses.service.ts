import { recordAudit } from '@construction-erp/audit';
import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '@construction-erp/errors';
import { executeIdempotentCommand } from '@construction-erp/idempotency';
import { allocateCompanyNumber } from '@construction-erp/numbering';
import { recordOutboxEvent } from '@construction-erp/outbox';
import { requireRequestSecurityContext } from '@construction-erp/request-context';
import { AdministrationRepository } from '../administration/administration.repository.js';
import { FinanceService } from '../finance/finance.service.js';
import {
  SiteExpensesRepository,
  type SiteExpenseRepositoryVisibility
} from './site-expenses.repository.js';
import {
  SITE_EXPENSE_PAYMENT_MODE_VALUES,
  createSiteExpenseError,
  type CreateSiteExpenseBody,
  type CreateExpenseCategoryBody,
  type ListSiteExpensesQuery,
  type SiteExpensePaymentMode,
  type SiteExpensePermissionCode,
  type UpdateSiteExpenseBody
} from './site-expenses.schema.js';

const ACTIVE = 'ACTIVE';
const DRAFT = 'DRAFT';
const POSTED = 'POSTED';
const REVERSED = 'REVERSED';
const ZERO_MONEY = '0.00';
const SITE_EXPENSE_SEQUENCE_KEY = 'site-expense';
const SITE_EXPENSE_CATEGORY_SEQUENCE_KEY = 'site-expense-category';
const SITE_EXPENSE_PAYABLE_ACCOUNT_CODE = 'SITE-EXPENSE-PAYABLE';

type DecimalLike = string | Readonly<{ toString(): string }>;
type SiteExpenseRow = Readonly<{
  id: string;
  projectId: string;
  stageId: string | null;
  expenseNo: string;
  expenseDate: Date;
  categoryId: string;
  description: string;
  amount: DecimalLike;
  paymentMode: string;
  cashBankAccountId: string | null;
  status: string;
  documentId: string | null;
  createdBy: string;
  postedAt: Date | null;
}>;

type ValidatedExpenseDependencies = Readonly<{
  expenseAccountId: string;
  settlementAccountId: string | null;
}>;

/** Parse one validated API date-only value for database persistence. */
function inputDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Serialize one database date as YYYY-MM-DD. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Serialize one stored money value with exactly two decimal places and no floating-point conversion. */
function moneyString(value: DecimalLike): string {
  const text = value.toString();
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const normalized = `${whole}.${`${fraction}00`.slice(0, 2)}`;
  return negative ? `-${normalized}` : normalized;
}

/** Return the exact negative money value used by a compensating Project cost row. */
function negativeMoneyString(value: DecimalLike): string {
  const normalized = moneyString(value);
  return normalized.startsWith('-') ? normalized.slice(1) : `-${normalized}`;
}

/** Normalize one stored payment mode and reject unsupported database values. */
function paymentMode(value: string): SiteExpensePaymentMode {
  if ((SITE_EXPENSE_PAYMENT_MODE_VALUES as readonly string[]).includes(value)) return value as SiteExpensePaymentMode;
  throw new ValidationError({ message: 'Stored Site Expense payment mode is invalid.' });
}

/** Build one deterministic bounded page window from validated query input. */
function pageWindow(query: Readonly<{ page?: number | undefined; pageSize?: number | undefined }>) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 50;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Serialize one Site Expense row for later HTTP use without exposing Company authority. */
function siteExpenseResponse(row: SiteExpenseRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    stageId: row.stageId,
    expenseNo: row.expenseNo,
    expenseDate: dateOnly(row.expenseDate),
    categoryId: row.categoryId,
    description: row.description,
    amount: moneyString(row.amount),
    paymentMode: paymentMode(row.paymentMode),
    cashBankAccountId: row.cashBankAccountId,
    status: row.status,
    documentId: row.documentId,
    createdBy: row.createdBy,
    postedAt: row.postedAt?.toISOString() ?? null
  };
}

/** Return one stable source key shared by the original Finance and Project-cost effects. */
function siteExpenseSourceKey(expenseId: string): string {
  return `site_expense:${expenseId}`;
}

/** Return one stable source key shared by compensating Finance and Project-cost effects. */
function siteExpenseReversalSourceKey(expenseId: string): string {
  return `site_expense_reversal:${expenseId}`;
}

/** Final Module 14 Site Expense business logic. */
export class SiteExpensesService {
  /** Bind Site Expense behavior to the application database. */
  constructor(private readonly db: DatabaseClient) {}

  /** Return whether the actor has one persisted Company-level Site Expense permission. */
  private async hasCompanyPermission(repository: AdministrationRepository, permission: SiteExpensePermissionCode, asOf: Date): Promise<boolean> {
    const security = requireRequestSecurityContext();
    const permissions = await repository.findEffectivePermissionCodes({
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ACTIVE],
      roleStatuses: [ACTIVE]
    });
    return permissions.includes(permission);
  }

  /** Resolve Projects visible for one Site Expense permission. */
  private async resolveVisibility(repository: AdministrationRepository, permission: SiteExpensePermissionCode, asOf: Date): Promise<SiteExpenseRepositoryVisibility> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw new AuthorizationError();
    const candidates = security.projectScope.kind === 'restricted' ? [...security.projectScope.projectIds] : null;
    if (await this.hasCompanyPermission(repository, permission, asOf)) return { allowedProjectIds: candidates };
    const projectIds = await repository.listProjectIdsWithPermission(permission, candidates, {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ACTIVE],
      roleStatuses: [ACTIVE]
    });
    if (projectIds.length === 0) throw new AuthorizationError();
    return { allowedProjectIds: projectIds };
  }

  /** Require one Site Expense permission for a Project inside authenticated scope. */
  private async requireProjectPermission(repository: AdministrationRepository, projectId: string, permission: SiteExpensePermissionCode, asOf: Date): Promise<void> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw new AuthorizationError();
    if (security.projectScope.kind === 'restricted' && !security.projectScope.projectIds.includes(projectId)) throw new AuthorizationError();
    if (await this.hasCompanyPermission(repository, permission, asOf)) return;
    const permissions = await repository.findEffectivePermissionCodesForProject(projectId, {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ACTIVE],
      roleStatuses: [ACTIVE]
    });
    if (permissions === null) throw new NotFoundError();
    if (!permissions.includes(permission)) throw new AuthorizationError();
  }

  /** Validate Project, optional Stage, category, payment account and optional evidence before persistence/posting. */
  private async validateDependencies(
    repository: SiteExpensesRepository,
    visibility: SiteExpenseRepositoryVisibility,
    input: Readonly<{
      projectId: string;
      stageId: string | null;
      categoryId: string;
      paymentMode: SiteExpensePaymentMode;
      cashBankAccountId: string | null;
      documentId: string | null;
    }>,
    requirePostingAccounts: boolean
  ): Promise<ValidatedExpenseDependencies> {
    const project = await repository.findProjectById(input.projectId, visibility);
    if (!project || project.status !== ACTIVE) throw new ConflictError({ message: 'Site Expense requires an active Project.' });

    if (input.stageId) {
      const stage = await repository.findStage(input.projectId, input.stageId, visibility);
      if (!stage) throw createSiteExpenseError('INVALID_EXPENSE_STAGE');
    }

    const category = await repository.findExpenseCategoryById(input.categoryId);
    if (!category || category.status !== ACTIVE) throw new ValidationError({ message: 'Site Expense category must be active in this company.' });

    if (input.documentId) {
      const document = await repository.findProjectEvidenceDocument(input.projectId, input.documentId, visibility);
      if (!document) throw new ValidationError({ message: 'Site Expense evidence document is not authorized for this Project.' });
    }

    if (input.paymentMode === 'CASH' || input.paymentMode === 'BANK') {
      if (!input.cashBankAccountId) throw createSiteExpenseError('INVALID_EXPENSE_ACCOUNT');
      const account = await repository.findCashBankAccountById(input.cashBankAccountId);
      if (!account || account.status !== ACTIVE || account.accountType !== input.paymentMode || account.glAccount.status !== ACTIVE) {
        throw createSiteExpenseError('INVALID_EXPENSE_ACCOUNT');
      }
      if (requirePostingAccounts && (!category.defaultGlAccount || category.defaultGlAccount.status !== ACTIVE)) {
        throw createSiteExpenseError('INVALID_EXPENSE_ACCOUNT');
      }
      return {
        expenseAccountId: category.defaultGlAccount?.id ?? '',
        settlementAccountId: account.glAccount.id
      };
    }

    if (input.cashBankAccountId) throw createSiteExpenseError('INVALID_EXPENSE_ACCOUNT');
    if (!requirePostingAccounts) {
      return { expenseAccountId: category.defaultGlAccount?.id ?? '', settlementAccountId: null };
    }
    if (!category.defaultGlAccount || category.defaultGlAccount.status !== ACTIVE) throw createSiteExpenseError('INVALID_EXPENSE_ACCOUNT');
    const payable = await repository.findGlAccountByCode(SITE_EXPENSE_PAYABLE_ACCOUNT_CODE);
    if (!payable || payable.status !== ACTIVE) throw createSiteExpenseError('INVALID_EXPENSE_ACCOUNT');
    return { expenseAccountId: category.defaultGlAccount.id, settlementAccountId: payable.id };
  }

  /** List permission-visible Site Expenses with bounded filters. */
  async listSiteExpenses(query: ListSiteExpensesQuery) {
    const visibility = await this.resolveVisibility(new AdministrationRepository(this.db), 'site_expenses.read', new Date());
    if (query.projectId && visibility.allowedProjectIds !== null && !visibility.allowedProjectIds.includes(query.projectId)) throw new AuthorizationError();
    const page = pageWindow(query);
    const result = await new SiteExpensesRepository(this.db).listSiteExpenses({
      allowedProjectIds: visibility.allowedProjectIds,
      skip: page.skip,
      take: page.take,
      projectId: query.projectId,
      stageId: query.stageId,
      categoryId: query.categoryId,
      paymentMode: query.paymentMode,
      status: query.status,
      fromDate: query.fromDate ? inputDate(query.fromDate) : undefined,
      toDate: query.toDate ? inputDate(query.toDate) : undefined
    });
    return { items: result.items.map(siteExpenseResponse), total: result.total, page: page.page, pageSize: page.pageSize };
  }

  /** List the Company's active Site Expense categories for human-readable selectors. */
  async listExpenseCategories() {
    const administration = new AdministrationRepository(this.db);
    if (!(await this.hasCompanyPermission(administration, 'site_expenses.read', new Date()))) throw new AuthorizationError();
    return new SiteExpensesRepository(this.db).listExpenseCategories();
  }

  /** Create a name-only category and its server-managed expense GL atomically. */
  async createExpenseCategory(input: CreateExpenseCategoryBody) {
    const administration = new AdministrationRepository(this.db);
    if (!(await this.hasCompanyPermission(administration, 'site_expenses.create', new Date()))) throw new AuthorizationError();
    return this.db.$transaction(async (tx) => {
      const repository = new SiteExpensesRepository(tx);
      const existing = await repository.findExpenseCategoryByName(input.name);
      if (existing) return existing;
      await repository.ensureExpenseCategorySequence();
      const allocation = await allocateCompanyNumber(tx, { sequenceKey: SITE_EXPENSE_CATEGORY_SEQUENCE_KEY });
      const category = await repository.createExpenseCategory({ code: allocation.formatted, name: input.name });
      await recordAudit(tx, { action: 'site_expense.category.created', entityType: 'expense_category', entityId: category.id, after: { code: category.code, name: category.name, status: category.status } });
      return category;
    });
  }

  /** Read one Site Expense inside the actor's Company and Project scope. */
  async getSiteExpense(expenseId: string) {
    const visibility = await this.resolveVisibility(new AdministrationRepository(this.db), 'site_expenses.read', new Date());
    const expense = await new SiteExpensesRepository(this.db).findSiteExpenseById(expenseId, visibility);
    if (!expense) throw createSiteExpenseError('EXPENSE_NOT_FOUND');
    return siteExpenseResponse(expense);
  }

  /** Create one validated DRAFT Site Expense exactly once. */
  async createSiteExpense(input: CreateSiteExpenseBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'site-expenses.create',
      idempotencyKey,
      fingerprintInput: input
    }, async (tx) => this.createSiteExpenseOnce(tx, input));
    return result.response.body;
  }

  /** Validate dependencies, allocate the server number and persist one DRAFT expense. */
  private async createSiteExpenseOnce(tx: TransactionClient, input: CreateSiteExpenseBody) {
    const users = new AdministrationRepository(tx);
    const now = new Date();
    await this.requireProjectPermission(users, input.projectId, 'site_expenses.create', now);
    const visibility: SiteExpenseRepositoryVisibility = { allowedProjectIds: [input.projectId] };
    const repository = new SiteExpensesRepository(tx);
    const normalized = {
      projectId: input.projectId,
      stageId: input.stageId ?? null,
      categoryId: input.categoryId,
      paymentMode: input.paymentMode,
      cashBankAccountId: input.cashBankAccountId ?? null,
      documentId: input.documentId ?? null
    } as const;
    await this.validateDependencies(repository, visibility, normalized, false);
    await repository.ensureSiteExpenseSequence();
    const number = await allocateCompanyNumber(tx, { sequenceKey: SITE_EXPENSE_SEQUENCE_KEY });
    const security = requireRequestSecurityContext();
    const created = await repository.createDraftSiteExpense({
      allowedProjectIds: visibility.allowedProjectIds,
      expenseNo: number.formatted,
      projectId: input.projectId,
      stageId: input.stageId ?? null,
      expenseDate: inputDate(input.expenseDate),
      categoryId: input.categoryId,
      description: input.description.trim(),
      amount: input.amount,
      paymentMode: input.paymentMode,
      cashBankAccountId: input.cashBankAccountId ?? null,
      documentId: input.documentId ?? null,
      createdBy: security.actorUserId
    });
    if (!created) throw createSiteExpenseError('EXPENSE_NOT_FOUND');
    const response = siteExpenseResponse(created);
    await recordAudit(tx, { action: 'site_expense.created', entityType: 'site_expense', entityId: created.id, projectId: created.projectId, stageId: created.stageId, after: response });
    await recordOutboxEvent(tx, { eventType: 'site_expense.created', resourceType: 'site_expense', resourceId: created.id, payload: { expenseId: created.id, projectId: created.projectId, stageId: created.stageId, expenseNo: created.expenseNo } });
    return { statusCode: 201, body: response };
  }

  /** Edit one visible DRAFT Site Expense exactly once. */
  async updateSiteExpense(expenseId: string, input: UpdateSiteExpenseBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'site-expenses.update',
      idempotencyKey,
      fingerprintInput: { expenseId, input }
    }, async (tx) => this.updateSiteExpenseOnce(tx, expenseId, input));
    return result.response.body;
  }

  /** Lock one draft, validate the merged state and persist only editable fields. */
  private async updateSiteExpenseOnce(tx: TransactionClient, expenseId: string, input: UpdateSiteExpenseBody) {
    const visibility = await this.resolveVisibility(new AdministrationRepository(tx), 'site_expenses.update', new Date());
    const repository = new SiteExpensesRepository(tx);
    const current = await repository.findSiteExpenseById(expenseId, visibility);
    if (!current) throw createSiteExpenseError('EXPENSE_NOT_FOUND');
    const locked = await repository.lockSiteExpenseForWrite(expenseId, visibility);
    if (!locked) throw createSiteExpenseError('EXPENSE_NOT_FOUND');
    if (locked.status !== DRAFT) throw createSiteExpenseError('EXPENSE_LOCKED');

    const targetProjectId = input.projectId ?? locked.projectId;
    await this.requireProjectPermission(new AdministrationRepository(tx), targetProjectId, 'site_expenses.update', new Date());
    const targetVisibility: SiteExpenseRepositoryVisibility = { allowedProjectIds: [targetProjectId] };
    const merged = {
      projectId: targetProjectId,
      stageId: input.stageId === undefined ? locked.stageId : input.stageId,
      categoryId: input.categoryId ?? locked.categoryId,
      paymentMode: input.paymentMode ?? paymentMode(locked.paymentMode),
      cashBankAccountId: input.cashBankAccountId === undefined ? locked.cashBankAccountId : input.cashBankAccountId,
      documentId: input.documentId === undefined ? locked.documentId : input.documentId
    } as const;
    await this.validateDependencies(repository, targetVisibility, merged, false);

    const before = siteExpenseResponse(locked);
    const updated = await repository.updateDraftSiteExpense(expenseId, {
      allowedProjectIds: visibility.allowedProjectIds,
      projectId: input.projectId,
      stageId: input.stageId,
      expenseDate: input.expenseDate ? inputDate(input.expenseDate) : undefined,
      categoryId: input.categoryId,
      description: input.description?.trim(),
      amount: input.amount,
      paymentMode: input.paymentMode,
      cashBankAccountId: input.cashBankAccountId,
      documentId: input.documentId
    });
    if (!updated) throw createSiteExpenseError('EXPENSE_LOCKED');
    const after = siteExpenseResponse(updated);
    await recordAudit(tx, { action: 'site_expense.updated', entityType: 'site_expense', entityId: expenseId, projectId: updated.projectId, stageId: updated.stageId, before, after });
    return { statusCode: 200, body: after };
  }

  /** Post one Site Expense atomically to Finance and Project/Stage actual cost. */
  async postSiteExpense(expenseId: string, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'site-expenses.post',
      idempotencyKey,
      fingerprintInput: { expenseId }
    }, async (tx) => this.postSiteExpenseOnce(tx, expenseId));
    return result.response.body;
  }

  /** Create one Finance effect and one `site_expense` actual-cost source before marking the expense POSTED. */
  private async postSiteExpenseOnce(tx: TransactionClient, expenseId: string) {
    const visibility = await this.resolveVisibility(new AdministrationRepository(tx), 'site_expenses.post', new Date());
    const repository = new SiteExpensesRepository(tx);
    const locked = await repository.lockSiteExpenseForWrite(expenseId, visibility);
    if (!locked) throw createSiteExpenseError('EXPENSE_NOT_FOUND');
    if (locked.status === POSTED) {
      const existing = await repository.findSiteExpenseById(expenseId, visibility);
      if (!existing) throw createSiteExpenseError('EXPENSE_NOT_FOUND');
      return { statusCode: 200, body: siteExpenseResponse(existing) };
    }
    if (locked.status !== DRAFT) throw createSiteExpenseError('EXPENSE_LOCKED');

    await this.requireProjectPermission(new AdministrationRepository(tx), locked.projectId, 'site_expenses.post', new Date());
    const directVisibility: SiteExpenseRepositoryVisibility = { allowedProjectIds: [locked.projectId] };
    const mode = paymentMode(locked.paymentMode);
    const dependencies = await this.validateDependencies(repository, directVisibility, {
      projectId: locked.projectId,
      stageId: locked.stageId,
      categoryId: locked.categoryId,
      paymentMode: mode,
      cashBankAccountId: locked.cashBankAccountId,
      documentId: locked.documentId
    }, true);
    if (!dependencies.expenseAccountId || !dependencies.settlementAccountId) throw createSiteExpenseError('INVALID_EXPENSE_ACCOUNT');

    const sourceKey = siteExpenseSourceKey(expenseId);
    const amount = moneyString(locked.amount);
    const costActual = await repository.upsertSiteExpenseCostActual({
      projectId: locked.projectId,
      stageId: locked.stageId,
      sourceType: 'site_expense',
      sourceId: expenseId,
      sourceKey,
      postingDate: locked.expenseDate,
      amount
    });
    if (costActual.projectId !== locked.projectId
      || costActual.stageId !== locked.stageId
      || costActual.sourceType !== 'site_expense'
      || costActual.sourceId !== expenseId
      || moneyString(costActual.amount) !== amount) {
      throw new ConflictError({ message: 'Site Expense cost source key is already owned by different posting data.' });
    }
    await new FinanceService(this.db).postSourceJournalInTransaction(tx, {
      sourceType: 'site_expense',
      sourceId: expenseId,
      sourceKey,
      postingDate: locked.expenseDate,
      description: `Site expense ${locked.expenseNo}: ${locked.description}`,
      lines: [
        { accountId: dependencies.expenseAccountId, projectId: locked.projectId, stageId: locked.stageId, debit: amount, credit: ZERO_MONEY, description: `Site expense ${locked.expenseNo}` },
        { accountId: dependencies.settlementAccountId, projectId: locked.projectId, stageId: locked.stageId, debit: ZERO_MONEY, credit: amount, description: `${mode} settlement ${locked.expenseNo}` }
      ]
    });

    const postedAt = new Date();
    const posted = await repository.markPosted(expenseId, postedAt, directVisibility);
    if (!posted) throw createSiteExpenseError('EXPENSE_LOCKED');
    const response = siteExpenseResponse(posted);
    await recordAudit(tx, { action: 'site_expense.posted', entityType: 'site_expense', entityId: expenseId, projectId: posted.projectId, stageId: posted.stageId, before: { status: DRAFT }, after: { status: POSTED, postedAt: response.postedAt, financeSourceKey: sourceKey, costSourceKey: sourceKey } });
    await recordOutboxEvent(tx, { eventType: 'site_expense.posted', resourceType: 'site_expense', resourceId: expenseId, payload: { expenseId, expenseNo: posted.expenseNo, projectId: posted.projectId, stageId: posted.stageId, amount, financeSourceKey: sourceKey, costSourceKey: sourceKey } });
    return { statusCode: 200, body: response };
  }

  /** Reverse one POSTED Site Expense with compensating Finance and Project-cost history. */
  async reverseSiteExpense(expenseId: string, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'site-expenses.reverse',
      idempotencyKey,
      fingerprintInput: { expenseId }
    }, async (tx) => this.reverseSiteExpenseOnce(tx, expenseId));
    return result.response.body;
  }

  /** Append opposite Finance and cost effects without deleting or rewriting the original posted history. */
  private async reverseSiteExpenseOnce(tx: TransactionClient, expenseId: string) {
    const visibility = await this.resolveVisibility(new AdministrationRepository(tx), 'site_expenses.reverse', new Date());
    const repository = new SiteExpensesRepository(tx);
    const locked = await repository.lockSiteExpenseForWrite(expenseId, visibility);
    if (!locked) throw createSiteExpenseError('EXPENSE_NOT_FOUND');
    if (locked.status === REVERSED) {
      const existing = await repository.findSiteExpenseById(expenseId, visibility);
      if (!existing) throw createSiteExpenseError('EXPENSE_NOT_FOUND');
      return { statusCode: 200, body: siteExpenseResponse(existing) };
    }
    if (locked.status !== POSTED) throw createSiteExpenseError('EXPENSE_LOCKED');
    await this.requireProjectPermission(new AdministrationRepository(tx), locked.projectId, 'site_expenses.reverse', new Date());

    const originalSourceKey = siteExpenseSourceKey(expenseId);
    const reversalSourceKey = siteExpenseReversalSourceKey(expenseId);
    const originalCost = await repository.findCostActualBySourceKey(originalSourceKey);
    if (!originalCost
      || originalCost.sourceType !== 'site_expense'
      || originalCost.sourceId !== expenseId
      || originalCost.projectId !== locked.projectId
      || originalCost.stageId !== locked.stageId) {
      throw new ConflictError({ message: 'Posted Site Expense source effects are incomplete and cannot be reversed safely.' });
    }

    const reversalDate = inputDate(dateOnly(new Date()));
    const reversalCost = await repository.upsertSiteExpenseCostActual({
      projectId: originalCost.projectId,
      stageId: originalCost.stageId,
      sourceType: 'site_expense_reversal',
      sourceId: expenseId,
      sourceKey: reversalSourceKey,
      postingDate: reversalDate,
      amount: negativeMoneyString(originalCost.amount)
    });
    if (reversalCost.sourceType !== 'site_expense_reversal'
      || reversalCost.sourceId !== expenseId
      || reversalCost.projectId !== originalCost.projectId
      || reversalCost.stageId !== originalCost.stageId
      || moneyString(reversalCost.amount) !== negativeMoneyString(originalCost.amount)) {
      throw new ConflictError({ message: 'Site Expense reversal cost source key is already owned by different posting data.' });
    }
    await new FinanceService(this.db).postSourceReversalInTransaction(tx, {
      originalSourceType: 'site_expense',
      originalSourceId: expenseId,
      originalSourceKey,
      reversalSourceType: 'site_expense_reversal',
      reversalSourceId: expenseId,
      reversalSourceKey,
      postingDate: reversalDate,
      description: `Reversal of site expense ${locked.expenseNo}`,
      lineDescription: `Reversal of ${locked.expenseNo}`
    });

    const reversed = await repository.markReversed(expenseId, { allowedProjectIds: [locked.projectId] });
    if (!reversed) throw createSiteExpenseError('EXPENSE_LOCKED');
    const response = siteExpenseResponse(reversed);
    await recordAudit(tx, { action: 'site_expense.reversed', entityType: 'site_expense', entityId: expenseId, projectId: reversed.projectId, stageId: reversed.stageId, before: { status: POSTED }, after: { status: REVERSED, originalFinanceSourceKey: originalSourceKey, reversalFinanceSourceKey: reversalSourceKey, originalCostSourceKey: originalSourceKey, reversalCostSourceKey: reversalSourceKey } });
    await recordOutboxEvent(tx, { eventType: 'site_expense.reversed', resourceType: 'site_expense', resourceId: expenseId, payload: { expenseId, expenseNo: reversed.expenseNo, projectId: reversed.projectId, stageId: reversed.stageId, reversalFinanceSourceKey: reversalSourceKey, reversalCostSourceKey: reversalSourceKey } });
    return { statusCode: 200, body: response };
  }
}
