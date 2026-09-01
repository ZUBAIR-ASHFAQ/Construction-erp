import { recordAudit } from '@construction-erp/audit';
import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { ConflictError, ValidationError } from '@construction-erp/errors';
import { executeIdempotentCommand } from '@construction-erp/idempotency';
import { allocateCompanyNumber } from '@construction-erp/numbering';
import { recordOutboxEvent } from '@construction-erp/outbox';
import { hasPermission, requireRequestSecurityContext } from '@construction-erp/request-context';
import { AdministrationRepository } from '../administration/administration.repository.js';
import {
  FinanceRepository,
  type CreateJournalLineRepositoryInput,
  type FinanceProjectVisibilityRepositoryInput
} from './finance.repository.js';
import {
  createFinanceError,
  createFinanceNotFoundError,
  type CreateBankReconciliationBody,
  type CreateFinanceAccountBody,
  type CreateManualJournalBody,
  type FinanceLedgerQuery,
  type BankReconciliationResponse,
  type FinanceAccountResponse,
  type FinanceJournalResponse,
  type FinancePeriodResponse,
  type FinancePermissionCode,
  type ListCashBankAccountsQuery,
  type ListFinanceAccountsQuery,
  type ListFinancePeriodsQuery,
  type ListFinanceJournalsQuery,
  type ReverseJournalBody,
  type TrialBalanceQuery
} from './finance.schema.js';

const JOURNAL_SEQUENCE_KEY = 'finance.journal';
const JOURNAL_SOURCE_MANUAL = 'MANUAL';
const JOURNAL_SOURCE_REVERSAL = 'REVERSAL';
const JOURNAL_DRAFT = 'DRAFT';
const JOURNAL_POSTED = 'POSTED';
const JOURNAL_REVERSED = 'REVERSED';
const PERIOD_OPEN = 'OPEN';
const PERIOD_CLOSED = 'CLOSED';
const ACCOUNT_ACTIVE = 'ACTIVE';
const RECONCILIATION_COMPLETED = 'COMPLETED';
const ROLE_ASSIGNMENT_ACTIVE = 'ACTIVE';
const ROLE_ACTIVE = 'ACTIVE';
const MAX_MONEY_MINOR_UNITS = 999_999_999_999_999_999n;

type JournalLineScopeInput = Readonly<{ projectId?: string | null | undefined; stageId?: string | null | undefined }>;

export type SourceJournalPostingInput = Readonly<{
  sourceType: string;
  sourceId?: string | null;
  sourceKey: string;
  postingDate: Date;
  description: string;
  lines: readonly CreateJournalLineRepositoryInput[];
}>;

export type SourceJournalReversalInput = Readonly<{
  originalSourceType: string;
  originalSourceId?: string | null;
  originalSourceKey: string;
  reversalSourceType: string;
  reversalSourceId?: string | null;
  reversalSourceKey: string;
  postingDate: Date;
  description: string;
  lineDescription?: string | null;
}>;

/** Return unique non-null identifiers while preserving first-seen order. */
function uniqueIds(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

/** Convert one validated two-decimal money string into exact minor units. */
function moneyToMinorUnits(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return (BigInt(whole) * 100n) + BigInt(`${fraction}00`.slice(0, 2));
}

/** Convert exact non-negative minor units into a stable two-decimal money string. */
function minorUnitsToMoney(value: bigint): string {
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, '0');
  return `${whole}.${fraction}`;
}

/** Calculate exact debit and credit totals and reject DECIMAL(18,2) overflow. */
function calculateJournalTotals(lines: readonly Readonly<{ debit: string; credit: string }>[]) {
  let debit = 0n;
  let credit = 0n;
  for (const line of lines) {
    debit += moneyToMinorUnits(line.debit);
    credit += moneyToMinorUnits(line.credit);
    if (debit > MAX_MONEY_MINOR_UNITS || credit > MAX_MONEY_MINOR_UNITS) {
      throw new ValidationError({ message: 'Journal totals exceed the supported DECIMAL(18,2) range.' });
    }
  }
  return { debitMinorUnits: debit, creditMinorUnits: credit, totalDebit: minorUnitsToMoney(debit), totalCredit: minorUnitsToMoney(credit) };
}

/** Reject empty or double-sided Journal lines before persistence. */
function validateJournalLines(lines: readonly Readonly<{ debit: string; credit: string }>[]): void {
  for (const [index, line] of lines.entries()) {
    const debit = moneyToMinorUnits(line.debit);
    const credit = moneyToMinorUnits(line.credit);
    if ((debit === 0n && credit === 0n) || (debit > 0n && credit > 0n)) {
      throw new ValidationError({ message: `Journal line ${index + 1} must contain either a debit or a credit amount.` });
    }
  }
}

/** Return one database date in stable YYYY-MM-DD form. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

type FinanceAccountRow = Awaited<ReturnType<FinanceRepository['createAccount']>>;
type FinanceJournalRow = NonNullable<Awaited<ReturnType<FinanceRepository['findJournalById']>>>;
type FinancePeriodRow = NonNullable<Awaited<ReturnType<FinanceRepository['findFiscalPeriodById']>>>;
type BankReconciliationRow = Awaited<ReturnType<FinanceRepository['createBankReconciliation']>>;

/** Build the stable replay-safe Finance account response. */
function financeAccountResponseBody(account: FinanceAccountRow): FinanceAccountResponse {
  return {
    id: account.id,
    accountCode: account.accountCode,
    name: account.name,
    accountType: account.accountType,
    parentId: account.parentId,
    status: account.status
  };
}

/** Build the stable replay-safe Finance Journal response. */
function financeJournalResponseBody(journal: FinanceJournalRow): FinanceJournalResponse {
  return {
    id: journal.id,
    journalNo: journal.journalNo,
    postingDate: dateOnly(journal.postingDate),
    sourceType: journal.sourceType,
    sourceId: journal.sourceId,
    sourceKey: journal.sourceKey,
    description: journal.description,
    status: journal.status,
    periodId: journal.periodId,
    createdBy: journal.createdBy,
    postedAt: journal.postedAt?.toISOString() ?? null,
    totalDebit: journal.totalDebit.toString(),
    totalCredit: journal.totalCredit.toString(),
    lines: journal.lines.map((line) => ({
      id: line.id,
      journalId: line.journalId,
      accountId: line.accountId,
      projectId: line.projectId,
      stageId: line.stageId,
      debit: line.debit.toString(),
      credit: line.credit.toString(),
      description: line.description
    }))
  };
}

/** Build the stable replay-safe fiscal-period response. */
function financePeriodResponseBody(period: FinancePeriodRow): FinancePeriodResponse {
  return {
    id: period.id,
    fiscalYear: period.fiscalYear,
    periodNo: period.periodNo,
    startDate: dateOnly(period.startDate),
    endDate: dateOnly(period.endDate),
    status: period.status
  };
}

/** Build the stable replay-safe Bank Reconciliation response. */
function bankReconciliationResponseBody(reconciliation: BankReconciliationRow): BankReconciliationResponse {
  return {
    id: reconciliation.id,
    cashBankAccountId: reconciliation.cashBankAccountId,
    statementDate: dateOnly(reconciliation.statementDate),
    status: reconciliation.status,
    reconciledBalance: reconciliation.reconciledBalance.toString(),
    createdBy: reconciliation.createdBy,
    createdAt: reconciliation.createdAt.toISOString()
  };
}

/** Recognize Prisma unique conflicts without leaking database details. */
function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

/** Final Module 18 Finance & Accounting business rules. */
export class FinanceService {
  /** Bind Finance business rules to the application database client. */
  constructor(private readonly db: DatabaseClient) {}

  /** Require one Company-scoped Finance permission from trusted request context. */
  private requirePermission(permission: FinancePermissionCode): void {
    if (!hasPermission(permission)) throw createFinanceError('FINANCE_SCOPE_FORBIDDEN');
  }

  /** Revalidate one Project Finance permission through Administration Project-scope policy. */
  private async requireProjectPermission(
    repository: AdministrationRepository,
    projectId: string,
    permission: FinancePermissionCode,
    asOf: Date
  ): Promise<void> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw createFinanceError('FINANCE_SCOPE_FORBIDDEN');
    if (security.projectScope.kind === 'restricted' && !security.projectScope.projectIds.includes(projectId)) {
      throw createFinanceError('FINANCE_SCOPE_FORBIDDEN');
    }

    const permissions = await repository.findEffectivePermissionCodesForProject(projectId, {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ROLE_ASSIGNMENT_ACTIVE],
      roleStatuses: [ROLE_ACTIVE]
    });
    if (permissions === null || !permissions.includes(permission)) throw createFinanceError('FINANCE_SCOPE_FORBIDDEN');
  }

  /** Validate Project and optional Stage ownership for Journal lines. */
  private async resolveLineProjectScope(repository: FinanceRepository, lines: readonly JournalLineScopeInput[]) {
    const projectIds = uniqueIds(lines.map((line) => line.projectId));
    const stageIds = uniqueIds(lines.map((line) => line.stageId));
    const [projects, stages] = await Promise.all([
      repository.findProjectsByIds(projectIds),
      repository.findStagesByIds(stageIds)
    ]);
    if (projects.length !== projectIds.length || stages.length !== stageIds.length) {
      throw createFinanceError('FINANCE_SCOPE_FORBIDDEN');
    }

    const stageById = new Map(stages.map((stage) => [stage.id, stage]));
    for (const line of lines) {
      if (!line.stageId) continue;
      if (!line.projectId || stageById.get(line.stageId)?.projectId !== line.projectId) {
        throw createFinanceError('FINANCE_SCOPE_FORBIDDEN');
      }
    }

    return { projectIds, hasCompanyWideLine: lines.some((line) => !line.projectId) };
  }

  /** Require Company permission for company-wide lines and Project permission for Project-scoped lines. */
  private async requireLinePermissions(
    repository: AdministrationRepository,
    scope: Readonly<{ projectIds: readonly string[]; hasCompanyWideLine: boolean }>,
    permission: FinancePermissionCode,
    asOf: Date
  ): Promise<void> {
    if (scope.hasCompanyWideLine) this.requirePermission(permission);
    for (const projectId of scope.projectIds) await this.requireProjectPermission(repository, projectId, permission, asOf);
  }

  /** Resolve Project-aware line visibility for Finance reads without leaking unauthorized lines. */
  private async resolveReadVisibility(
    repository: AdministrationRepository,
    asOf: Date
  ): Promise<FinanceProjectVisibilityRepositoryInput> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw createFinanceError('FINANCE_SCOPE_FORBIDDEN');

    const includeCompanyWideLines = hasPermission('finance.read');
    if (security.projectScope.kind === 'all' && includeCompanyWideLines) {
      return { includeCompanyWideLines: true, allowedProjectIds: null };
    }
    if (security.projectScope.kind === 'restricted' && includeCompanyWideLines) {
      return { includeCompanyWideLines: true, allowedProjectIds: security.projectScope.projectIds };
    }

    const candidates = security.projectScope.kind === 'all' ? null : security.projectScope.projectIds;
    const allowedProjectIds = await repository.listProjectIdsWithPermission('finance.read', candidates, {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ROLE_ASSIGNMENT_ACTIVE],
      roleStatuses: [ROLE_ACTIVE]
    });
    if (allowedProjectIds.length === 0) throw createFinanceError('FINANCE_SCOPE_FORBIDDEN');
    return { includeCompanyWideLines: false, allowedProjectIds };
  }

  /** Ensure an optional GL parent is a same-Company account and not itself. */
  private async validateAccountParent(repository: FinanceRepository, parentId: string | null | undefined): Promise<void> {
    if (!parentId) return;
    const parent = await repository.findAccountById(parentId);
    if (!parent) throw createFinanceError('GL_ACCOUNT_INVALID');
  }

  /** Ensure every referenced GL account exists and is active. */
  private async validateActiveAccounts(repository: FinanceRepository, accountIds: readonly string[]): Promise<void> {
    const ids = uniqueIds(accountIds);
    const accounts = await repository.findAccountsByIds(ids);
    if (accounts.length !== ids.length || accounts.some((account) => account.status !== ACCOUNT_ACTIVE)) {
      throw createFinanceError('GL_ACCOUNT_INVALID');
    }
  }

  /** Resolve exactly one open fiscal period for a posting date. */
  private async resolveOpenPeriod(repository: FinanceRepository, postingDate: Date) {
    const periods = await repository.findFiscalPeriodsForPostingDate(postingDate);
    const openPeriods = periods.filter((period) => period.status === PERIOD_OPEN);
    const period = openPeriods[0];
    if (!period) throw createFinanceError('FISCAL_PERIOD_CLOSED');
    if (openPeriods.length > 1) throw new ConflictError({ message: 'The posting date resolves to more than one open fiscal period.' });
    return period;
  }

  /** List the authenticated Company's Chart of Accounts. */
  async listAccounts(input: ListFinanceAccountsQuery) {
    this.requirePermission('finance.read');
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const result = await new FinanceRepository(this.db).listAccounts({ skip: (page - 1) * pageSize, take: pageSize });
    return { ...result, page, pageSize };
  }

  /** Create one active GL account exactly once. */
  async createAccount(input: CreateFinanceAccountBody, idempotencyKey: string) {
    try {
      const result = await executeIdempotentCommand(
        this.db,
        { operation: 'finance.accounts.create', idempotencyKey, fingerprintInput: input },
        async (tx) => this.createAccountOnce(tx, input)
      );
      return result.response.body;
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new ConflictError({ message: 'The account code already exists in this Company.' });
      throw error;
    }
  }

  /** Persist one GL account with audit evidence. */
  private async createAccountOnce(tx: TransactionClient, input: CreateFinanceAccountBody) {
    this.requirePermission('finance.accounts.manage');
    const repository = new FinanceRepository(tx);
    await this.validateAccountParent(repository, input.parentId);
    const account = await repository.createAccount({ ...input, parentId: input.parentId ?? null, status: ACCOUNT_ACTIVE });
    const accountType = account.accountType.trim().toUpperCase();
    if (accountType === 'CASH' || accountType === 'BANK') {
      await repository.createCashBankAccountForGl({ code: account.accountCode, name: account.name, accountType, glAccountId: account.id, status: account.status });
    }
    await recordAudit(tx, { action: 'finance.account.created', entityType: 'gl_account', entityId: account.id, after: { accountCode: account.accountCode, name: account.name, accountType: account.accountType, parentId: account.parentId, status: account.status } });
    return { statusCode: 201, body: financeAccountResponseBody(account) };
  }

  /** List bounded Journal history under the current Finance/Project scope. */
  async listJournals(input: ListFinanceJournalsQuery) {
    const visibility = await this.resolveReadVisibility(new AdministrationRepository(this.db), new Date());
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const result = await new FinanceRepository(this.db).listJournals({
      skip: (page - 1) * pageSize,
      take: pageSize,
      periodId: input.periodId,
      status: input.status,
      visibility
    });
    return { ...result, page, pageSize };
  }

  /** Create one draft manual Journal exactly once. */
  async createManualJournal(input: CreateManualJournalBody, idempotencyKey: string) {
    try {
      const result = await executeIdempotentCommand(
        this.db,
        { operation: 'finance.journals.create', idempotencyKey, fingerprintInput: input },
        async (tx) => this.createManualJournalOnce(tx, input)
      );
      return result.response.body;
    } catch (error) {
      if (isUniqueConstraintError(error)) throw createFinanceError('DUPLICATE_POSTING_SOURCE');
      throw error;
    }
  }

  /** Persist one draft manual Journal with server-owned numbering, period and totals. */
  private async createManualJournalOnce(tx: TransactionClient, input: CreateManualJournalBody) {
    validateJournalLines(input.lines);
    const repository = new FinanceRepository(tx);
    const now = new Date();
    const lineScope = await this.resolveLineProjectScope(repository, input.lines);
    await this.requireLinePermissions(new AdministrationRepository(tx), lineScope, 'finance.journals.create', now);
    await this.validateActiveAccounts(repository, input.lines.map((line) => line.accountId));

    const postingDate = new Date(`${input.postingDate}T00:00:00.000Z`);
    const period = await this.resolveOpenPeriod(repository, postingDate);
    const totals = calculateJournalTotals(input.lines);
    const allocation = await allocateCompanyNumber(tx, { sequenceKey: JOURNAL_SEQUENCE_KEY });
    const security = requireRequestSecurityContext();
    const journal = await repository.createJournal({
      journalNo: allocation.formatted,
      postingDate,
      sourceType: JOURNAL_SOURCE_MANUAL,
      sourceId: null,
      sourceKey: null,
      description: input.description,
      status: JOURNAL_DRAFT,
      periodId: period.id,
      createdBy: security.actorUserId,
      totalDebit: totals.totalDebit,
      totalCredit: totals.totalCredit,
      lines: input.lines.map((line): CreateJournalLineRepositoryInput => ({
        accountId: line.accountId,
        projectId: line.projectId ?? null,
        stageId: line.stageId ?? null,
        debit: line.debit,
        credit: line.credit,
        description: line.description
      }))
    });
    if (!journal) throw createFinanceError('FINANCE_SCOPE_FORBIDDEN');
    await recordAudit(tx, { action: 'finance.journal.created', entityType: 'journal', entityId: journal.id, after: { journalNo: journal.journalNo, postingDate: input.postingDate, status: journal.status } });
    return { statusCode: 201, body: financeJournalResponseBody(journal) };
  }

  /** Post one draft Journal exactly once after balance and open-period checks. */
  async postJournal(journalId: string, idempotencyKey: string) {
    const result = await executeIdempotentCommand(
      this.db,
      { operation: 'finance.journals.post', idempotencyKey, fingerprintInput: { journalId } },
      async (tx) => ({ statusCode: 200, body: financeJournalResponseBody(await this.postJournalOnce(tx, journalId)) })
    );
    return result.response.body;
  }

  /** Commit one balanced draft Journal and emit posting audit/outbox evidence. */
  private async postJournalOnce(tx: TransactionClient, journalId: string) {
    const repository = new FinanceRepository(tx);
    const locked = await repository.lockJournalForWrite(journalId);
    if (!locked) throw createFinanceNotFoundError();
    const journal = await repository.findJournalById(journalId);
    if (!journal) throw createFinanceNotFoundError();

    const now = new Date();
    const lineScope = await this.resolveLineProjectScope(repository, journal.lines);
    await this.requireLinePermissions(new AdministrationRepository(tx), lineScope, 'finance.journals.post', now);
    if (locked.status === JOURNAL_POSTED) return journal;
    if (locked.status !== JOURNAL_DRAFT) throw new ConflictError({ message: 'Only draft Journals can be posted.' });

    await this.validateActiveAccounts(repository, journal.lines.map((line) => line.accountId));
    const period = await repository.lockFiscalPeriodForWrite(locked.periodId);
    if (!period || period.status !== PERIOD_OPEN) throw createFinanceError('FISCAL_PERIOD_CLOSED');
    const totals = calculateJournalTotals(journal.lines.map((line) => ({ debit: line.debit.toString(), credit: line.credit.toString() })));
    if (totals.debitMinorUnits !== totals.creditMinorUnits) throw createFinanceError('JOURNAL_UNBALANCED');

    const posted = await repository.updateJournalStatus(journalId, JOURNAL_DRAFT, JOURNAL_POSTED, now);
    if (!posted) throw new ConflictError({ message: 'Journal state changed before posting completed.' });
    await recordAudit(tx, { action: 'journal.posted', entityType: 'journal', entityId: journalId, before: { status: JOURNAL_DRAFT }, after: { status: JOURNAL_POSTED, postedAt: now.toISOString() } });
    await recordOutboxEvent(tx, { eventType: 'journal.posted', resourceType: 'journal', resourceId: journalId, payload: { journalId, journalNo: locked.journalNo, periodId: locked.periodId, postingDate: dateOnly(locked.postingDate), totalDebit: totals.totalDebit, totalCredit: totals.totalCredit } });
    return posted;
  }

  /** Reverse one posted manual Journal exactly once with an opposite posted Journal. */
  async reverseJournal(journalId: string, idempotencyKey: string, input: ReverseJournalBody = {}) {
    try {
      const result = await executeIdempotentCommand(
        this.db,
        { operation: 'finance.journals.reverse', idempotencyKey, fingerprintInput: { journalId, postingDate: input.postingDate ?? null } },
        async (tx) => ({ statusCode: 200, body: financeJournalResponseBody(await this.reverseJournalOnce(tx, journalId, input)) })
      );
      return result.response.body;
    } catch (error) {
      if (isUniqueConstraintError(error)) throw createFinanceError('DUPLICATE_POSTING_SOURCE');
      throw error;
    }
  }

  /** Persist one compensating Journal for a manual Journal without mutating posted accounting history. */
  private async reverseJournalOnce(tx: TransactionClient, journalId: string, input: ReverseJournalBody) {
    const repository = new FinanceRepository(tx);
    const locked = await repository.lockJournalForWrite(journalId);
    if (!locked) throw createFinanceNotFoundError();
    const journal = await repository.findJournalById(journalId);
    if (!journal) throw createFinanceNotFoundError();

    const now = new Date();
    const lineScope = await this.resolveLineProjectScope(repository, journal.lines);
    await this.requireLinePermissions(new AdministrationRepository(tx), lineScope, 'finance.journals.reverse', now);
    if (locked.sourceType !== JOURNAL_SOURCE_MANUAL) throw createFinanceError('SOURCE_JOURNAL_REVERSAL_FORBIDDEN');
    const reversalSourceKey = `finance-reversal:${journalId}`;
    if (locked.status === JOURNAL_REVERSED) {
      const existing = await repository.findJournalBySourceKey(reversalSourceKey);
      if (existing) return existing;
      throw new ConflictError({ message: 'Journal is already reversed.' });
    }
    if (locked.status !== JOURNAL_POSTED) throw new ConflictError({ message: 'Only posted Journals can be reversed.' });

    let reversalPostingDate = locked.postingDate;
    let reversalPeriodId = locked.periodId;
    if (input.postingDate) {
      reversalPostingDate = new Date(`${input.postingDate}T00:00:00.000Z`);
      const targetPeriod = await this.resolveOpenPeriod(repository, reversalPostingDate);
      const lockedTargetPeriod = await repository.lockFiscalPeriodForWrite(targetPeriod.id);
      if (!lockedTargetPeriod || lockedTargetPeriod.status !== PERIOD_OPEN) throw createFinanceError('FISCAL_PERIOD_CLOSED');
      reversalPeriodId = lockedTargetPeriod.id;
    } else {
      const originalPeriod = await repository.lockFiscalPeriodForWrite(locked.periodId);
      if (!originalPeriod || originalPeriod.status !== PERIOD_OPEN) throw createFinanceError('FISCAL_PERIOD_CLOSED');
    }
    const allocation = await allocateCompanyNumber(tx, { sequenceKey: JOURNAL_SEQUENCE_KEY });
    const security = requireRequestSecurityContext();
    const reversal = await repository.createJournal({
      journalNo: allocation.formatted,
      postingDate: reversalPostingDate,
      sourceType: JOURNAL_SOURCE_REVERSAL,
      sourceId: journalId,
      sourceKey: reversalSourceKey,
      description: `Reversal of ${locked.journalNo}`,
      status: JOURNAL_POSTED,
      periodId: reversalPeriodId,
      createdBy: security.actorUserId,
      postedAt: now,
      totalDebit: locked.totalCredit.toString(),
      totalCredit: locked.totalDebit.toString(),
      lines: journal.lines.map((line) => ({
        accountId: line.accountId,
        projectId: line.projectId,
        stageId: line.stageId,
        debit: line.credit.toString(),
        credit: line.debit.toString(),
        description: line.description
      }))
    });
    if (!reversal) throw createFinanceError('FINANCE_SCOPE_FORBIDDEN');
    const reversed = await repository.updateJournalStatus(journalId, JOURNAL_POSTED, JOURNAL_REVERSED);
    if (!reversed) throw new ConflictError({ message: 'Journal state changed before reversal completed.' });
    await recordAudit(tx, { action: 'journal.reversed', entityType: 'journal', entityId: journalId, before: { status: JOURNAL_POSTED }, after: { status: JOURNAL_REVERSED, reversalJournalId: reversal.id } });
    await recordOutboxEvent(tx, { eventType: 'journal.reversed', resourceType: 'journal', resourceId: journalId, payload: { journalId, reversalJournalId: reversal.id, reversalJournalNo: reversal.journalNo } });
    return reversal;
  }

  /** Persist one trusted source-module Journal inside an existing business transaction. */
  private async postSourceJournalOnce(tx: TransactionClient, input: SourceJournalPostingInput) {
    const repository = new FinanceRepository(tx);
    const existing = await repository.findJournalBySourceKey(input.sourceKey);
    if (existing) return existing;

    validateJournalLines(input.lines);
    const totals = calculateJournalTotals(input.lines);
    if (totals.debitMinorUnits !== totals.creditMinorUnits) throw createFinanceError('JOURNAL_UNBALANCED');
    await this.resolveLineProjectScope(repository, input.lines);
    await this.validateActiveAccounts(repository, input.lines.map((line) => line.accountId));
    const period = await this.resolveOpenPeriod(repository, input.postingDate);
    const allocation = await allocateCompanyNumber(tx, { sequenceKey: JOURNAL_SEQUENCE_KEY });
    const security = requireRequestSecurityContext();
    const postedAt = new Date();
    const journal = await repository.createJournal({
      journalNo: allocation.formatted,
      postingDate: input.postingDate,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      sourceKey: input.sourceKey,
      description: input.description,
      status: JOURNAL_POSTED,
      periodId: period.id,
      createdBy: security.actorUserId,
      postedAt,
      totalDebit: totals.totalDebit,
      totalCredit: totals.totalCredit,
      lines: input.lines
    });
    if (!journal) throw createFinanceError('FINANCE_SCOPE_FORBIDDEN');
    await recordAudit(tx, { action: 'journal.posted', entityType: 'journal', entityId: journal.id, after: { sourceType: input.sourceType, sourceKey: input.sourceKey, status: JOURNAL_POSTED } });
    await recordOutboxEvent(tx, { eventType: 'journal.posted', resourceType: 'journal', resourceId: journal.id, payload: { journalId: journal.id, journalNo: journal.journalNo, sourceType: input.sourceType, sourceKey: input.sourceKey } });
    return journal;
  }

  /** Post one trusted source-module Journal inside the caller's transaction for atomic integrations. */
  async postSourceJournalInTransaction(tx: TransactionClient, input: SourceJournalPostingInput) {
    return this.postSourceJournalOnce(tx, input);
  }

  /** Build one compensating source Journal from the immutable original source Journal. */
  private async postSourceReversalOnce(tx: TransactionClient, input: SourceJournalReversalInput) {
    const repository = new FinanceRepository(tx);
    const original = await repository.findJournalBySourceKey(input.originalSourceKey);
    if (!original
      || original.status !== JOURNAL_POSTED
      || original.sourceType !== input.originalSourceType
      || original.sourceId !== (input.originalSourceId ?? null)
      || original.lines.length === 0) {
      throw new ConflictError({ message: 'Posted source Journal is incomplete and cannot be reversed safely.' });
    }

    const reversal = await this.postSourceJournalOnce(tx, {
      sourceType: input.reversalSourceType,
      sourceId: input.reversalSourceId ?? null,
      sourceKey: input.reversalSourceKey,
      postingDate: input.postingDate,
      description: input.description,
      lines: original.lines.map((line) => ({
        accountId: line.accountId,
        projectId: line.projectId,
        stageId: line.stageId,
        debit: line.credit.toString(),
        credit: line.debit.toString(),
        description: input.lineDescription ?? line.description
      }))
    });
    if (reversal.status !== JOURNAL_POSTED
      || reversal.sourceType !== input.reversalSourceType
      || reversal.sourceId !== (input.reversalSourceId ?? null)
      || reversal.sourceKey !== input.reversalSourceKey) {
      throw new ConflictError({ message: 'Source Journal reversal key is already owned by different posting data.' });
    }
    return reversal;
  }

  /** Post one compensating source Journal inside the caller's transaction without changing the original Journal. */
  async postSourceReversalInTransaction(tx: TransactionClient, input: SourceJournalReversalInput) {
    return this.postSourceReversalOnce(tx, input);
  }

  /** List bounded Company fiscal periods for Finance selectors without exposing Company ownership. */
  async listFiscalPeriods(input: ListFinancePeriodsQuery) {
    if (!hasPermission('finance.read') && !hasPermission('finance.periods.close')) throw createFinanceError('FINANCE_SCOPE_FORBIDDEN');
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const result = await new FinanceRepository(this.db).listFiscalPeriods({
      skip: (page - 1) * pageSize,
      take: pageSize,
      ...(input.status ? { status: input.status } : {})
    });
    return { ...result, page, pageSize };
  }

  /** Read one bounded General Ledger slice from posted accounting history. */
  async getLedger(input: FinanceLedgerQuery) {
    const repository = new FinanceRepository(this.db);
    const period = await repository.findFiscalPeriodById(input.periodId);
    if (!period) throw createFinanceNotFoundError();
    if (input.accountId) await this.validateActiveAccounts(repository, [input.accountId]);
    if (input.projectId) await this.requireProjectPermission(new AdministrationRepository(this.db), input.projectId, 'finance.read', new Date());
    if (input.stageId) {
      const stages = await repository.findStagesByIds([input.stageId]);
      if (stages.length !== 1 || stages[0]?.projectId !== input.projectId) throw createFinanceError('FINANCE_SCOPE_FORBIDDEN');
    }

    const visibility = await this.resolveReadVisibility(new AdministrationRepository(this.db), new Date());
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const result = await repository.listLedger({
      skip: (page - 1) * pageSize,
      take: pageSize,
      periodId: input.periodId,
      accountId: input.accountId,
      projectId: input.projectId,
      stageId: input.stageId,
      journalStatuses: [JOURNAL_POSTED, JOURNAL_REVERSED],
      visibility
    });
    return { ...result, page, pageSize };
  }

  /** Return one Project-aware trial balance from posted accounting history. */
  async getTrialBalance(input: TrialBalanceQuery) {
    const repository = new FinanceRepository(this.db);
    if (!(await repository.findFiscalPeriodById(input.periodId))) throw createFinanceNotFoundError();
    const visibility = await this.resolveReadVisibility(new AdministrationRepository(this.db), new Date());
    return repository.getTrialBalance({ periodId: input.periodId, journalStatuses: [JOURNAL_POSTED, JOURNAL_REVERSED], visibility });
  }

  /** List Cash/Bank accounts with balances derived from posted GL lines. */
  async listCashBankAccounts(input: ListCashBankAccountsQuery) {
    this.requirePermission('finance.read');
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const result = await new FinanceRepository(this.db).listCashBankAccounts({
      skip: (page - 1) * pageSize,
      take: pageSize,
      status: input.status,
      journalStatuses: [JOURNAL_POSTED, JOURNAL_REVERSED]
    });
    return { ...result, page, pageSize };
  }

  /** Create one audited reconciliation snapshot exactly once. */
  async createBankReconciliation(input: CreateBankReconciliationBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(
      this.db,
      { operation: 'finance.reconciliations.create', idempotencyKey, fingerprintInput: input },
      async (tx) => this.createBankReconciliationOnce(tx, input)
    );
    return result.response.body;
  }

  /** Persist one reconciliation using a server-derived posted balance. */
  private async createBankReconciliationOnce(tx: TransactionClient, input: CreateBankReconciliationBody) {
    this.requirePermission('finance.reconcile');
    const repository = new FinanceRepository(tx);
    const account = await repository.findCashBankAccountById(input.cashBankAccountId);
    if (!account || account.status !== ACCOUNT_ACTIVE) throw createFinanceError('GL_ACCOUNT_INVALID');
    const statementDate = new Date(`${input.statementDate}T00:00:00.000Z`);
    if (statementDate.getTime() > Date.now()) throw new ValidationError({ message: 'Reconciliation statement date cannot be in the future.' });
    const reconciledBalance = await repository.getCashBankBalanceAsOf(account.glAccountId, statementDate, [JOURNAL_POSTED, JOURNAL_REVERSED]);
    const security = requireRequestSecurityContext();
    const reconciliation = await repository.createBankReconciliation({
      cashBankAccountId: account.id,
      statementDate,
      reconciledBalance,
      createdBy: security.actorUserId,
      status: RECONCILIATION_COMPLETED
    });
    await recordAudit(tx, { action: 'bank_reconciliation.completed', entityType: 'bank_reconciliation', entityId: reconciliation.id, after: { cashBankAccountId: account.id, statementDate: input.statementDate, reconciledBalance } });
    await recordOutboxEvent(tx, { eventType: 'bank_reconciliation.completed', resourceType: 'bank_reconciliation', resourceId: reconciliation.id, payload: { cashBankAccountId: account.id, statementDate: input.statementDate, reconciledBalance } });
    return { statusCode: 201, body: bankReconciliationResponseBody(reconciliation) };
  }

  /** Close one open fiscal period exactly once. */
  async closeFiscalPeriod(periodId: string, idempotencyKey: string) {
    const result = await executeIdempotentCommand(
      this.db,
      { operation: 'finance.periods.close', idempotencyKey, fingerprintInput: { periodId } },
      async (tx) => ({ statusCode: 200, body: financePeriodResponseBody(await this.closeFiscalPeriodOnce(tx, periodId)) })
    );
    return result.response.body;
  }

  /** Persist one fiscal-period close with audit and outbox evidence. */
  private async closeFiscalPeriodOnce(tx: TransactionClient, periodId: string) {
    this.requirePermission('finance.periods.close');
    const repository = new FinanceRepository(tx);
    const locked = await repository.lockFiscalPeriodForWrite(periodId);
    if (!locked) throw createFinanceNotFoundError();
    if (locked.status === PERIOD_CLOSED) {
      const existing = await repository.findFiscalPeriodById(periodId);
      if (!existing) throw createFinanceNotFoundError();
      return existing;
    }
    if (locked.status !== PERIOD_OPEN) throw new ConflictError({ message: 'Only open fiscal periods can be closed.' });
    const closed = await repository.updateFiscalPeriodStatus(periodId, PERIOD_OPEN, PERIOD_CLOSED);
    if (!closed) throw new ConflictError({ message: 'Fiscal period state changed before close completed.' });
    await recordAudit(tx, { action: 'period.closed', entityType: 'fiscal_period', entityId: periodId, before: { status: PERIOD_OPEN }, after: { status: PERIOD_CLOSED } });
    await recordOutboxEvent(tx, { eventType: 'period.closed', resourceType: 'fiscal_period', resourceId: periodId, payload: { periodId, startDate: dateOnly(closed.startDate), endDate: dateOnly(closed.endDate) } });
    return closed;
  }
}
