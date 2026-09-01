import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';
import {
  SITE_EXPENSE_MAX_PAGE_SIZE,
  type SiteExpensePaymentMode,
  type SiteExpenseStatus
} from './site-expenses.schema.js';

type RepositoryClient = DatabaseClient | TransactionClient;

export type SiteExpenseRepositoryVisibility = Readonly<{
  allowedProjectIds: readonly string[] | null;
}>;

export type SiteExpenseRepositoryPageWindow = Readonly<{
  skip: number;
  take: number;
}>;

export type ListSiteExpensesRepositoryInput = SiteExpenseRepositoryPageWindow & SiteExpenseRepositoryVisibility & Readonly<{
  projectId?: string | undefined;
  stageId?: string | undefined;
  categoryId?: string | undefined;
  paymentMode?: SiteExpensePaymentMode | undefined;
  status?: SiteExpenseStatus | undefined;
  fromDate?: Date | undefined;
  toDate?: Date | undefined;
}>;

export type CreateDraftSiteExpenseRepositoryInput = SiteExpenseRepositoryVisibility & Readonly<{
  expenseNo: string;
  projectId: string;
  stageId?: string | null;
  expenseDate: Date;
  categoryId: string;
  description: string;
  amount: string;
  paymentMode: SiteExpensePaymentMode;
  cashBankAccountId?: string | null;
  documentId?: string | null;
  createdBy: string;
}>;

export type UpdateDraftSiteExpenseRepositoryInput = SiteExpenseRepositoryVisibility & Readonly<{
  projectId?: string | undefined;
  stageId?: string | null | undefined;
  expenseDate?: Date | undefined;
  categoryId?: string | undefined;
  description?: string | undefined;
  amount?: string | undefined;
  paymentMode?: SiteExpensePaymentMode | undefined;
  cashBankAccountId?: string | null | undefined;
  documentId?: string | null | undefined;
}>;

/** Reject invalid bounded pagination before one Site Expense query reaches Prisma. */
function assertPageWindow(input: SiteExpenseRepositoryPageWindow): void {
  if (!Number.isInteger(input.skip) || input.skip < 0) {
    throw new RangeError('Repository skip must be a non-negative integer.');
  }
  if (!Number.isInteger(input.take) || input.take < 1 || input.take > SITE_EXPENSE_MAX_PAGE_SIZE) {
    throw new RangeError(`Repository take must be between 1 and ${SITE_EXPENSE_MAX_PAGE_SIZE}.`);
  }
}

/** Return a stable de-duplicated Project scope or null for Company-wide Project access. */
function normalizeAllowedProjectIds(allowedProjectIds: readonly string[] | null): readonly string[] | null {
  return allowedProjectIds === null ? null : [...new Set(allowedProjectIds)];
}

/** Check whether one Project is inside trusted request Project scope. */
function isProjectAllowed(projectId: string, allowedProjectIds: readonly string[] | null): boolean {
  return allowedProjectIds === null || allowedProjectIds.includes(projectId);
}

/** Build a Prisma Project predicate from trusted request scope. */
function projectScopeWhere(allowedProjectIds: readonly string[] | null) {
  return allowedProjectIds === null ? {} : { projectId: { in: [...allowedProjectIds] } };
}

/** Persistence for Final Module 14 Site Expense Management only. */
export class SiteExpensesRepository {
  /** Bind Site Expense persistence to Prisma or one active service transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /** List Site Expenses inside Company and trusted Project scope with bounded filters. */
  async listSiteExpenses(input: ListSiteExpensesRepositoryInput) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const allowedProjectIds = normalizeAllowedProjectIds(input.allowedProjectIds);
    if (input.projectId && !isProjectAllowed(input.projectId, allowedProjectIds)) return { items: [], total: 0 };

    const projectFilter = input.projectId
      ? input.projectId
      : allowedProjectIds === null
        ? undefined
        : { in: [...allowedProjectIds] };
    const where = scope.where({
      ...(projectFilter === undefined ? {} : { projectId: projectFilter }),
      ...(input.stageId ? { stageId: input.stageId } : {}),
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.paymentMode ? { paymentMode: input.paymentMode } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.fromDate || input.toDate
        ? {
            expenseDate: {
              ...(input.fromDate ? { gte: input.fromDate } : {}),
              ...(input.toDate ? { lte: input.toDate } : {})
            }
          }
        : {})
    });

    const [items, total] = await Promise.all([
      this.db.siteExpense.findMany({
        where,
        orderBy: [{ expenseDate: 'desc' }, { expenseNo: 'desc' }, { id: 'desc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.siteExpense.count({ where })
    ]);
    return { items, total };
  }

  /** Find one Site Expense only inside Company and trusted Project scope. */
  async findSiteExpenseById(expenseId: string, visibility: SiteExpenseRepositoryVisibility) {
    const scope = requireCompanyRepositoryScope();
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    return this.db.siteExpense.findFirst({
      where: scope.where({ id: expenseId, ...projectScopeWhere(allowedProjectIds) })
    });
  }

  /** Find one same-Company Project only when it is inside trusted Project scope. */
  async findProjectById(projectId: string, visibility: SiteExpenseRepositoryVisibility) {
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    if (!isProjectAllowed(projectId, allowedProjectIds)) return null;
    const scope = requireCompanyRepositoryScope();
    return this.db.project.findFirst({
      where: scope.where({ id: projectId }),
      select: { id: true, status: true }
    });
  }

  /** Find one Stage only when its Project belongs to Company and trusted Project scope. */
  async findStage(projectId: string, stageId: string, visibility: SiteExpenseRepositoryVisibility) {
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    if (!isProjectAllowed(projectId, allowedProjectIds)) return null;
    const scope = requireCompanyRepositoryScope();
    return this.db.projectStage.findFirst({
      where: scope.where({ id: stageId, projectId }),
      select: { id: true, projectId: true, status: true }
    });
  }

  /** Find one Company-owned Site Expense category and its Finance posting default. */
  async findExpenseCategoryById(categoryId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.expenseCategory.findFirst({
      where: scope.where({ id: categoryId }),
      include: { defaultGlAccount: true }
    });
  }

  /** Find one Company-owned Cash/Bank account and its mapped General Ledger account. */
  async findCashBankAccountById(cashBankAccountId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.cashBankAccount.findFirst({
      where: scope.where({ id: cashBankAccountId }),
      include: { glAccount: true }
    });
  }

  /** Find one Company-owned General Ledger account by stable account code. */
  async findGlAccountByCode(accountCode: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.glAccount.findFirst({
      where: scope.where({ accountCode })
    });
  }

  /** Find one evidence Document only when it belongs to or is linked to the Site Expense Project. */
  async findProjectEvidenceDocument(projectId: string, documentId: string, visibility: SiteExpenseRepositoryVisibility) {
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    if (!isProjectAllowed(projectId, allowedProjectIds)) return null;
    const scope = requireCompanyRepositoryScope();
    return this.db.document.findFirst({
      where: scope.where({
        id: documentId,
        status: 'active',
        OR: [
          { projectId },
          { links: { some: { companyId: scope.companyId, projectId } } }
        ]
      }),
      select: { id: true, projectId: true, status: true }
    });
  }

  /** Create one server-numbered DRAFT Site Expense inside trusted Project scope. */
  async createDraftSiteExpense(input: CreateDraftSiteExpenseRepositoryInput) {
    const allowedProjectIds = normalizeAllowedProjectIds(input.allowedProjectIds);
    if (!isProjectAllowed(input.projectId, allowedProjectIds)) return null;
    const scope = requireCompanyRepositoryScope();
    const project = await this.db.project.findFirst({
      where: scope.where({ id: input.projectId }),
      select: { id: true }
    });
    if (!project) return null;

    return this.db.siteExpense.create({
      data: scope.createData({
        projectId: input.projectId,
        stageId: input.stageId ?? null,
        expenseNo: input.expenseNo,
        expenseDate: input.expenseDate,
        categoryId: input.categoryId,
        description: input.description,
        amount: input.amount,
        paymentMode: input.paymentMode,
        cashBankAccountId: input.cashBankAccountId ?? null,
        status: 'DRAFT',
        documentId: input.documentId ?? null,
        createdBy: input.createdBy,
        postedAt: null
      })
    });
  }

  /** Update editable fields only while the Site Expense still has DRAFT status. */
  async updateDraftSiteExpense(expenseId: string, input: UpdateDraftSiteExpenseRepositoryInput) {
    const allowedProjectIds = normalizeAllowedProjectIds(input.allowedProjectIds);
    if (input.projectId && !isProjectAllowed(input.projectId, allowedProjectIds)) return null;
    const existing = await this.findSiteExpenseById(expenseId, { allowedProjectIds });
    if (!existing || existing.status !== 'DRAFT') return null;

    if (input.projectId && input.projectId !== existing.projectId) {
      const targetProject = await this.findProjectById(input.projectId, { allowedProjectIds });
      if (!targetProject) return null;
    }

    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.siteExpense.updateMany({
      where: scope.where({ id: expenseId, status: 'DRAFT', ...projectScopeWhere(allowedProjectIds) }),
      data: {
        ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
        ...(input.stageId === undefined ? {} : { stageId: input.stageId }),
        ...(input.expenseDate === undefined ? {} : { expenseDate: input.expenseDate }),
        ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.amount === undefined ? {} : { amount: input.amount }),
        ...(input.paymentMode === undefined ? {} : { paymentMode: input.paymentMode }),
        ...(input.cashBankAccountId === undefined ? {} : { cashBankAccountId: input.cashBankAccountId }),
        ...(input.documentId === undefined ? {} : { documentId: input.documentId })
      }
    });
    if (updated.count !== 1) return null;
    return this.findSiteExpenseById(expenseId, { allowedProjectIds });
  }

  /** Lock one Company-owned visible Site Expense before state-sensitive posting or reversal. */
  async lockSiteExpenseForWrite(expenseId: string, visibility: SiteExpenseRepositoryVisibility) {
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    const visible = await this.findSiteExpenseById(expenseId, { allowedProjectIds });
    if (!visible) return null;

    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{
      id: string;
      projectId: string;
      stageId: string | null;
      expenseNo: string;
      expenseDate: Date;
      categoryId: string;
      description: string;
      amount: { toString(): string };
      paymentMode: string;
      cashBankAccountId: string | null;
      status: string;
      documentId: string | null;
      createdBy: string;
      postedAt: Date | null;
    }>>`
      SELECT id,
             project_id AS "projectId",
             stage_id AS "stageId",
             expense_no AS "expenseNo",
             expense_date AS "expenseDate",
             category_id AS "categoryId",
             description,
             amount,
             payment_mode AS "paymentMode",
             cash_bank_account_id AS "cashBankAccountId",
             status,
             document_id AS "documentId",
             created_by AS "createdBy",
             posted_at AS "postedAt"
      FROM site_expenses
      WHERE id = ${expenseId}::uuid
        AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    const locked = rows[0] ?? null;
    if (!locked || !isProjectAllowed(locked.projectId, allowedProjectIds)) return null;
    return locked;
  }

  /** Find one Project/Stage actual-cost row by stable source key. */
  async findCostActualBySourceKey(sourceKey: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.costActual.findFirst({
      where: scope.where({ sourceKey })
    });
  }

  /** Upsert one idempotent Site Expense actual-cost source for Project/Stage cost tracking. */
  async upsertSiteExpenseCostActual(input: Readonly<{
    projectId: string;
    stageId: string | null;
    sourceType: 'site_expense' | 'site_expense_reversal';
    sourceId: string;
    sourceKey: string;
    postingDate: Date;
    amount: string;
  }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.costActual.upsert({
      where: { companyId_sourceKey: { companyId: scope.companyId, sourceKey: input.sourceKey } },
      update: {},
      create: scope.createData({
        projectId: input.projectId,
        stageId: input.stageId,
        category: 'site_expense',
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceKey: input.sourceKey,
        postingDate: input.postingDate,
        amount: input.amount
      })
    });
  }

  /** Persist DRAFT to POSTED only when state and trusted Project scope still match. */
  async markPosted(expenseId: string, postedAt: Date, visibility: SiteExpenseRepositoryVisibility) {
    const scope = requireCompanyRepositoryScope();
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    const updated = await this.db.siteExpense.updateMany({
      where: scope.where({ id: expenseId, status: 'DRAFT', ...projectScopeWhere(allowedProjectIds) }),
      data: { status: 'POSTED', postedAt }
    });
    if (updated.count !== 1) return null;
    return this.findSiteExpenseById(expenseId, { allowedProjectIds });
  }

  /** Persist POSTED to REVERSED without deleting or rewriting original posting fields. */
  async markReversed(expenseId: string, visibility: SiteExpenseRepositoryVisibility) {
    const scope = requireCompanyRepositoryScope();
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    const updated = await this.db.siteExpense.updateMany({
      where: scope.where({ id: expenseId, status: 'POSTED', ...projectScopeWhere(allowedProjectIds) }),
      data: { status: 'REVERSED' }
    });
    if (updated.count !== 1) return null;
    return this.findSiteExpenseById(expenseId, { allowedProjectIds });
  }
}
