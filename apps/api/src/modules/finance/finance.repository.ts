import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';
import { FINANCE_MAX_PAGE_SIZE } from './finance.schema.js';

type RepositoryClient = DatabaseClient | TransactionClient;

export type FinanceRepositoryPageWindow = Readonly<{ skip: number; take: number }>;

export type FinanceProjectVisibilityRepositoryInput = Readonly<{
  includeCompanyWideLines: boolean;
  allowedProjectIds: readonly string[] | null;
}>;

export type CreateJournalLineRepositoryInput = Readonly<{
  accountId: string;
  projectId?: string | null;
  stageId?: string | null;
  debit: string;
  credit: string;
  description: string;
}>;

export type CreateJournalRepositoryInput = Readonly<{
  journalNo: string;
  postingDate: Date;
  sourceType: string;
  sourceId?: string | null;
  sourceKey?: string | null;
  description: string;
  status: string;
  periodId: string;
  createdBy: string;
  postedAt?: Date | null;
  totalDebit: string;
  totalCredit: string;
  lines: readonly CreateJournalLineRepositoryInput[];
}>;

export type ListFinancePeriodsRepositoryInput = FinanceRepositoryPageWindow & Readonly<{
  status?: string;
}>;

export type ListFinanceJournalsRepositoryInput = FinanceRepositoryPageWindow & Readonly<{
  periodId?: string | undefined;
  status?: string | undefined;
  visibility?: FinanceProjectVisibilityRepositoryInput | undefined;
}>;

export type FinanceLedgerRepositoryInput = FinanceRepositoryPageWindow & Readonly<{
  periodId: string;
  accountId?: string | undefined;
  projectId?: string | undefined;
  stageId?: string | undefined;
  journalStatuses: readonly string[];
  visibility?: FinanceProjectVisibilityRepositoryInput | undefined;
}>;

export type TrialBalanceRepositoryInput = Readonly<{
  periodId: string;
  journalStatuses: readonly string[];
  visibility?: FinanceProjectVisibilityRepositoryInput;
}>;

export type ListCashBankAccountsRepositoryInput = FinanceRepositoryPageWindow & Readonly<{
  status?: string | undefined;
  journalStatuses: readonly string[];
}>;

/** Reject invalid repository pagination before it reaches Prisma. */
function assertPageWindow(input: FinanceRepositoryPageWindow): void {
  if (!Number.isInteger(input.skip) || input.skip < 0) throw new RangeError('Repository skip must be a non-negative integer.');
  if (!Number.isInteger(input.take) || input.take < 1 || input.take > FINANCE_MAX_PAGE_SIZE) {
    throw new RangeError(`Repository take must be between 1 and ${FINANCE_MAX_PAGE_SIZE}.`);
  }
}

/** Return unique non-null identifiers without changing first-seen order. */
function uniqueIds(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

/** Convert one Prisma decimal-like value to a precision-safe string. */
function decimalString(value: { toString(): string } | null | undefined): string {
  return value?.toString() ?? '0';
}

/** Convert a two-decimal database value into exact minor units. */
function moneyToMinorUnits(value: string): bigint {
  const negative = value.startsWith('-');
  const normalized = negative ? value.slice(1) : value;
  const [whole = '0', fraction = ''] = normalized.split('.');
  const amount = (BigInt(whole) * 100n) + BigInt(`${fraction}00`.slice(0, 2));
  return negative ? -amount : amount;
}

/** Convert exact signed minor units back into a stable two-decimal string. */
function minorUnitsToMoney(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** Build Journal-line Project visibility from authenticated scope. */
function buildProjectLineVisibilityWhere(input: FinanceProjectVisibilityRepositoryInput | undefined) {
  if (!input) return {};
  if (input.allowedProjectIds === null) {
    return input.includeCompanyWideLines ? {} : { projectId: { not: null } };
  }

  const projectIds = uniqueIds(input.allowedProjectIds);
  if (!input.includeCompanyWideLines) return { projectId: { in: projectIds } };
  return { OR: [{ projectId: null }, { projectId: { in: projectIds } }] };
}

/** Final Module 18 persistence with mandatory Company scope. */
export class FinanceRepository {
  /** Bind Finance persistence to Prisma or an active service transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /** List General Ledger accounts inside the authenticated Company. */
  async listAccounts(input: FinanceRepositoryPageWindow) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({});
    const [items, total] = await Promise.all([
      this.db.glAccount.findMany({ where, orderBy: [{ accountCode: 'asc' }, { id: 'asc' }], skip: input.skip, take: input.take }),
      this.db.glAccount.count({ where })
    ]);
    return { items, total };
  }

  /** Ensure the server-owned Finance account number sequence exists for the authenticated Company. */
  async ensureAccountNumberSequence(): Promise<void> {
    const scope = requireCompanyRepositoryScope();
    await this.db.numberSequence.upsert({
      where: { companyId_sequenceKey: { companyId: scope.companyId, sequenceKey: 'finance.account' } },
      create: { companyId: scope.companyId, sequenceKey: 'finance.account', prefix: 'ACC-', suffix: '', padWidth: 6, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      update: {}
    });
  }

  /** Ensure the server-owned Finance Journal number sequence exists for the authenticated Company. */
  async ensureJournalNumberSequence(): Promise<void> {
    const scope = requireCompanyRepositoryScope();
    await this.db.numberSequence.upsert({
      where: { companyId_sequenceKey: { companyId: scope.companyId, sequenceKey: 'finance.journal' } },
      create: { companyId: scope.companyId, sequenceKey: 'finance.journal', prefix: 'JE-', suffix: '', padWidth: 6, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      update: {}
    });
  }

  /** Create one Company-owned General Ledger account after service validation. */
  async createAccount(input: Readonly<{ accountCode: string; name: string; accountType: string; parentId?: string | null; status: string }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.glAccount.create({
      data: scope.createData({ accountCode: input.accountCode, name: input.name, accountType: input.accountType, parentId: input.parentId ?? null, status: input.status })
    });
  }

  /** Find one General Ledger account by code only inside the authenticated Company. */
  async findAccountByCode(accountCode: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.glAccount.findFirst({ where: scope.where({ accountCode }) });
  }

  /** Ensure the balancing equity account used only for opening-balance Journals exists. */
  async ensureOpeningBalanceEquityAccount() {
    const scope = requireCompanyRepositoryScope();
    return this.db.glAccount.upsert({
      where: { companyId_accountCode: { companyId: scope.companyId, accountCode: 'OPENING-BALANCE-EQUITY' } },
      create: scope.createData({ accountCode: 'OPENING-BALANCE-EQUITY', name: 'Opening Balance Equity', accountType: 'EQUITY', parentId: null, status: 'ACTIVE' }),
      update: {}
    });
  }

  /** Find the earliest open fiscal period for a server-posted account opening balance. */
  async findFirstOpenFiscalPeriod() {
    const scope = requireCompanyRepositoryScope();
    return this.db.fiscalPeriod.findFirst({
      where: scope.where({ status: 'OPEN' }),
      orderBy: [{ startDate: 'asc' }, { periodNo: 'asc' }, { id: 'asc' }]
    });
  }

  /** Find one General Ledger account only inside the authenticated Company. */
  async findAccountById(accountId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.glAccount.findFirst({ where: scope.where({ id: accountId }) });
  }

  /** Resolve candidate General Ledger accounts only inside the authenticated Company. */
  async findAccountsByIds(accountIds: readonly string[]) {
    const ids = uniqueIds(accountIds);
    if (ids.length === 0) return [];
    const scope = requireCompanyRepositoryScope();
    return this.db.glAccount.findMany({ where: scope.where({ id: { in: ids } }), orderBy: [{ id: 'asc' }] });
  }

  /** List bounded fiscal periods inside the authenticated Company for safe selectors. */
  async listFiscalPeriods(input: ListFinancePeriodsRepositoryInput) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({ ...(input.status ? { status: input.status } : {}) });
    const [items, total] = await Promise.all([
      this.db.fiscalPeriod.findMany({ where, orderBy: [{ startDate: 'desc' }, { periodNo: 'desc' }, { id: 'asc' }], skip: input.skip, take: input.take }),
      this.db.fiscalPeriod.count({ where })
    ]);
    return { items, total };
  }

  /** Find one fiscal period only inside the authenticated Company. */
  async findFiscalPeriodById(periodId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.fiscalPeriod.findFirst({ where: scope.where({ id: periodId }) });
  }

  /** Find all Company fiscal periods that contain one posting date. */
  async findFiscalPeriodsForPostingDate(postingDate: Date) {
    const scope = requireCompanyRepositoryScope();
    return this.db.fiscalPeriod.findMany({
      where: scope.where({ startDate: { lte: postingDate }, endDate: { gte: postingDate } }),
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }]
    });
  }

  /** Lock one Company fiscal period before a close or posting command. */
  async lockFiscalPeriodForWrite(periodId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{ id: string; fiscalYear: number; periodNo: number; startDate: Date; endDate: Date; status: string }>>`
      SELECT id, fiscal_year AS "fiscalYear", period_no AS "periodNo", start_date AS "startDate", end_date AS "endDate", status
      FROM fiscal_periods
      WHERE id = ${periodId}::uuid AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Change one Company fiscal-period status only when the expected state still matches. */
  async updateFiscalPeriodStatus(periodId: string, expectedStatus: string, targetStatus: string) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.fiscalPeriod.updateMany({ where: scope.where({ id: periodId, status: expectedStatus }), data: { status: targetStatus } });
    if (updated.count !== 1) return null;
    return this.findFiscalPeriodById(periodId);
  }

  /** Resolve candidate Projects inside the authenticated Company. */
  async findProjectsByIds(projectIds: readonly string[]) {
    const ids = uniqueIds(projectIds);
    if (ids.length === 0) return [];
    const scope = requireCompanyRepositoryScope();
    return this.db.project.findMany({ where: scope.where({ id: { in: ids } }), select: { id: true, companyId: true, status: true } });
  }

  /** Resolve candidate Project Stages inside the authenticated Company. */
  async findStagesByIds(stageIds: readonly string[]) {
    const ids = uniqueIds(stageIds);
    if (ids.length === 0) return [];
    const scope = requireCompanyRepositoryScope();
    return this.db.projectStage.findMany({ where: scope.where({ id: { in: ids } }), select: { id: true, projectId: true, companyId: true, status: true } });
  }

  /** Create one Company-owned Journal and its validated line set atomically. */
  async createJournal(input: CreateJournalRepositoryInput) {
    const accountIds = uniqueIds(input.lines.map((line) => line.accountId));
    const projectIds = uniqueIds(input.lines.map((line) => line.projectId));
    const stageIds = uniqueIds(input.lines.map((line) => line.stageId));
    const [period, accounts, projects, stages] = await Promise.all([
      this.findFiscalPeriodById(input.periodId),
      this.findAccountsByIds(accountIds),
      this.findProjectsByIds(projectIds),
      this.findStagesByIds(stageIds)
    ]);
    if (!period || accounts.length !== accountIds.length || projects.length !== projectIds.length || stages.length !== stageIds.length) return null;

    const stageById = new Map(stages.map((stage) => [stage.id, stage]));
    for (const line of input.lines) {
      if (!line.stageId) continue;
      if (!line.projectId || stageById.get(line.stageId)?.projectId !== line.projectId) return null;
    }

    const scope = requireCompanyRepositoryScope();
    return this.db.journal.create({
      data: scope.createData({
        journalNo: input.journalNo,
        postingDate: input.postingDate,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        sourceKey: input.sourceKey ?? null,
        description: input.description,
        status: input.status,
        periodId: input.periodId,
        createdBy: input.createdBy,
        postedAt: input.postedAt ?? null,
        totalDebit: input.totalDebit,
        totalCredit: input.totalCredit,
        lines: {
          create: input.lines.map((line) => ({
            accountId: line.accountId,
            projectId: line.projectId ?? null,
            stageId: line.stageId ?? null,
            debit: line.debit,
            credit: line.credit,
            description: line.description
          }))
        }
      }),
      include: { lines: { orderBy: [{ id: 'asc' }] } }
    });
  }

  /** Find one Journal and its lines inside the authenticated Company. */
  async findJournalById(journalId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.journal.findFirst({ where: scope.where({ id: journalId }), include: { lines: { orderBy: [{ id: 'asc' }] } } });
  }

  /** Find one Journal by stable source key inside the authenticated Company. */
  async findJournalBySourceKey(sourceKey: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.journal.findFirst({ where: scope.where({ sourceKey }), include: { lines: { orderBy: [{ id: 'asc' }] } } });
  }

  /** List durable Journal history with Project-safe line visibility. */
  async listJournals(input: ListFinanceJournalsRepositoryInput) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const lineVisibility = buildProjectLineVisibilityWhere(input.visibility);
    const hasLineFilter = Object.keys(lineVisibility).length > 0;
    const where = scope.where({
      ...(input.periodId ? { periodId: input.periodId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(hasLineFilter ? { lines: { some: lineVisibility } } : {})
    });
    const [items, total] = await Promise.all([
      this.db.journal.findMany({
        where,
        include: {
          period: { select: { fiscalYear: true, periodNo: true, startDate: true, endDate: true, status: true } },
          creator: { select: { name: true } },
          lines: {
            ...(hasLineFilter ? { where: lineVisibility } : {}),
            include: {
              account: { select: { accountCode: true, name: true } },
              project: { select: { projectCode: true, name: true } },
              stage: { select: { code: true, name: true } }
            },
            orderBy: [{ id: 'asc' }]
          }
        },
        orderBy: [{ postingDate: 'desc' }, { journalNo: 'desc' }, { id: 'asc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.journal.count({ where })
    ]);
    return { items, total };
  }

  /** Read one journal with all visible double-entry lines for the detail dialog. */
  async findJournalForRead(journalId: string, visibility: FinanceProjectVisibilityRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const lineVisibility = buildProjectLineVisibilityWhere(visibility);
    const hasLineFilter = Object.keys(lineVisibility).length > 0;
    return this.db.journal.findFirst({
      where: scope.where({ id: journalId, ...(hasLineFilter ? { lines: { some: lineVisibility } } : {}) }),
      include: {
        period: { select: { fiscalYear: true, periodNo: true, startDate: true, endDate: true, status: true } },
        creator: { select: { name: true } },
        lines: {
          ...(hasLineFilter ? { where: lineVisibility } : {}),
          include: {
            account: { select: { accountCode: true, name: true } },
            project: { select: { projectCode: true, name: true } },
            stage: { select: { code: true, name: true } }
          },
          orderBy: [{ id: 'asc' }]
        }
      }
    });
  }

  /** Lock one Company Journal before posting or reversal-sensitive work. */
  async lockJournalForWrite(journalId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{
      id: string; journalNo: string; postingDate: Date; sourceType: string; sourceId: string | null; sourceKey: string | null;
      periodId: string; status: string; totalDebit: { toString(): string }; totalCredit: { toString(): string };
    }>>`
      SELECT id, journal_no AS "journalNo", posting_date AS "postingDate", source_type AS "sourceType",
             source_id AS "sourceId", source_key AS "sourceKey", period_id AS "periodId", status,
             total_debit AS "totalDebit", total_credit AS "totalCredit"
      FROM journals
      WHERE id = ${journalId}::uuid AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Change one Journal lifecycle state and optional posted timestamp. */
  async updateJournalStatus(journalId: string, expectedStatus: string, targetStatus: string, postedAt?: Date | null) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.journal.updateMany({
      where: scope.where({ id: journalId, status: expectedStatus }),
      data: { status: targetStatus, ...(postedAt === undefined ? {} : { postedAt }) }
    });
    if (updated.count !== 1) return null;
    return this.findJournalById(journalId);
  }

  /** List one bounded General Ledger slice with Project and Stage dimensions. */
  async listLedger(input: FinanceLedgerRepositoryInput) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const where = {
      journal: {
        companyId: scope.companyId,
        periodId: input.periodId,
        ...(input.journalStatuses.length > 0 ? { status: { in: [...input.journalStatuses] } } : {})
      },
      ...(input.accountId ? { accountId: input.accountId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.stageId ? { stageId: input.stageId } : {}),
      ...buildProjectLineVisibilityWhere(input.visibility)
    };
    const [rows, total] = await Promise.all([
      this.db.journalLine.findMany({
        where,
        include: {
          journal: { select: { journalNo: true, postingDate: true } },
          account: { select: { accountCode: true, name: true } },
          project: { select: { projectCode: true, name: true } },
          stage: { select: { code: true, name: true } }
        },
        orderBy: [{ journal: { postingDate: 'asc' } }, { journalId: 'asc' }, { id: 'asc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.journalLine.count({ where })
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        journalId: row.journalId,
        journalNo: row.journal.journalNo,
        postingDate: row.journal.postingDate,
        accountId: row.accountId,
        accountCode: row.account.accountCode,
        accountName: row.account.name,
        projectId: row.projectId,
        projectCode: row.project?.projectCode ?? null,
        projectName: row.project?.name ?? null,
        stageId: row.stageId,
        stageCode: row.stage?.code ?? null,
        stageName: row.stage?.name ?? null,
        debit: decimalString(row.debit),
        credit: decimalString(row.credit),
        description: row.description
      })),
      total
    };
  }

  /** Aggregate one fiscal-period trial balance with exact persisted decimals. */
  async getTrialBalance(input: TrialBalanceRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const where = {
      journal: {
        companyId: scope.companyId,
        periodId: input.periodId,
        ...(input.journalStatuses.length > 0 ? { status: { in: [...input.journalStatuses] } } : {})
      },
      ...buildProjectLineVisibilityWhere(input.visibility)
    };
    const [groups, totals] = await Promise.all([
      this.db.journalLine.groupBy({ by: ['accountId'], where, _sum: { debit: true, credit: true } }),
      this.db.journalLine.aggregate({ where, _sum: { debit: true, credit: true } })
    ]);
    const accounts = await this.findAccountsByIds(groups.map((group) => group.accountId));
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const rows = groups.map((group) => {
      const account = accountById.get(group.accountId);
      if (!account) return null;
      return {
        accountId: account.id,
        accountCode: account.accountCode,
        accountName: account.name,
        debit: decimalString(group._sum.debit),
        credit: decimalString(group._sum.credit)
      };
    }).filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((left, right) => left.accountCode.localeCompare(right.accountCode) || left.accountId.localeCompare(right.accountId));
    return { periodId: input.periodId, rows, totalDebit: decimalString(totals._sum.debit), totalCredit: decimalString(totals._sum.credit) };
  }

  /** List Cash/Bank accounts and derive posted balances from their mapped GL accounts. */
  async listCashBankAccounts(input: ListCashBankAccountsRepositoryInput) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const where = scope.where(input.status ? { status: input.status } : {});
    const [items, total] = await Promise.all([
      this.db.cashBankAccount.findMany({ where, orderBy: [{ code: 'asc' }, { id: 'asc' }], skip: input.skip, take: input.take }),
      this.db.cashBankAccount.count({ where })
    ]);
    const accountIds = items.map((item) => item.glAccountId);
    const groups = accountIds.length === 0 ? [] : await this.db.journalLine.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: accountIds },
        journal: { companyId: scope.companyId, status: { in: [...input.journalStatuses] } }
      },
      _sum: { debit: true, credit: true }
    });
    const openingGroups = accountIds.length === 0 ? [] : await this.db.journalLine.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: accountIds },
        journal: { companyId: scope.companyId, status: { in: [...input.journalStatuses] }, sourceType: 'ACCOUNT_OPENING_BALANCE' }
      },
      _sum: { debit: true, credit: true }
    });
    const balanceByAccount = new Map(groups.map((group) => {
      const debit = moneyToMinorUnits(decimalString(group._sum.debit));
      const credit = moneyToMinorUnits(decimalString(group._sum.credit));
      return [group.accountId, minorUnitsToMoney(debit - credit)];
    }));
    const openingByAccount = new Map(openingGroups.map((group) => {
      const debit = moneyToMinorUnits(decimalString(group._sum.debit));
      const credit = moneyToMinorUnits(decimalString(group._sum.credit));
      return [group.accountId, minorUnitsToMoney(debit - credit)];
    }));
    return {
      items: items.map((item) => ({ ...item, openingBalance: openingByAccount.get(item.glAccountId) ?? '0.00', balance: balanceByAccount.get(item.glAccountId) ?? '0.00' })),
      total
    };
  }

  /** Create the minimal Cash/Bank master for a GL account whose type is CASH or BANK. */
  async createCashBankAccountForGl(input: Readonly<{ code: string; name: string; accountType: string; glAccountId: string; bankName?: string | null; accountReference?: string | null; status: string }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.cashBankAccount.create({
      data: scope.createData({
        code: input.code,
        name: input.name,
        accountType: input.accountType,
        glAccountId: input.glAccountId,
        bankName: input.bankName ?? null,
        accountReference: input.accountReference ?? null,
        status: input.status
      })
    });
  }

  /** Find one Cash/Bank account only inside the authenticated Company. */
  async findCashBankAccountById(cashBankAccountId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.cashBankAccount.findFirst({ where: scope.where({ id: cashBankAccountId }) });
  }

  /** Update one Cash/Bank master and its mapped GL display/lifecycle fields atomically. */
  async updateCashBankAccount(cashBankAccountId: string, input: Readonly<{ name?: string; bankName?: string | null; accountReference?: string | null; status?: string }>) {
    const scope = requireCompanyRepositoryScope();
    const account = await this.findCashBankAccountById(cashBankAccountId);
    if (!account) return null;
    await this.db.cashBankAccount.updateMany({ where: scope.where({ id: cashBankAccountId }), data: input });
    if (input.name !== undefined || input.status !== undefined) {
      await this.db.glAccount.updateMany({ where: scope.where({ id: account.glAccountId }), data: { ...(input.name === undefined ? {} : { name: input.name }), ...(input.status === undefined ? {} : { status: input.status }) } });
    }
    return this.findCashBankAccountById(cashBankAccountId);
  }

  /** Derive one Cash/Bank GL balance through the requested statement date. */
  async getCashBankBalanceAsOf(glAccountId: string, statementDate: Date, journalStatuses: readonly string[]) {
    const scope = requireCompanyRepositoryScope();
    const totals = await this.db.journalLine.aggregate({
      where: {
        accountId: glAccountId,
        journal: { companyId: scope.companyId, postingDate: { lte: statementDate }, status: { in: [...journalStatuses] } }
      },
      _sum: { debit: true, credit: true }
    });
    const debit = moneyToMinorUnits(decimalString(totals._sum.debit));
    const credit = moneyToMinorUnits(decimalString(totals._sum.credit));
    return minorUnitsToMoney(debit - credit);
  }

  /** Create one completed reconciliation snapshot for a Company-owned Cash/Bank account. */
  async createBankReconciliation(input: Readonly<{ cashBankAccountId: string; statementDate: Date; reconciledBalance: string; createdBy: string; status: string }>) {
    return this.db.bankReconciliation.create({ data: input });
  }
}
