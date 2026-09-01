import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';
import { MODULE_9_MAX_PAGE_SIZE, type Module9CostCategory } from './budgets-job-cost.schema.js';

type RepositoryClient = DatabaseClient | TransactionClient;

export type Module9RepositoryPageWindow = Readonly<{ skip: number; take: number }>;

export type CreateProjectBudgetRepositoryInput = Readonly<{
  projectId: string;
  versionNo: number;
  status: string;
  currency: string;
  totalAmount: string;
  createdBy: string;
  frozenAt?: Date | null;
}>;

export type BudgetLineRepositoryInput = Readonly<{
  stageId?: string | null | undefined;
  category: Module9CostCategory;
  description: string;
  plannedAmount: string;
}>;

export type ForecastLineRepositoryInput = Readonly<{
  stageId?: string | null;
  category: Module9CostCategory;
  forecastAmount: string;
  updatedBy: string;
  updatedAt: Date;
}>;

type LedgerRow = Readonly<{
  id: string;
  recordType: 'COMMITMENT' | 'ACTUAL';
  stageId: string | null;
  category: Module9CostCategory;
  sourceType: string;
  sourceId: string;
  sourceKey: string;
  postingDate: Date;
  amount: { toString(): string };
  status: string | null;
}>;

/** Reject invalid repository pagination before it reaches PostgreSQL. */
function assertPageWindow(input: Module9RepositoryPageWindow): void {
  if (!Number.isInteger(input.skip) || input.skip < 0) throw new RangeError('Repository skip must be non-negative.');
  if (!Number.isInteger(input.take) || input.take < 1 || input.take > MODULE_9_MAX_PAGE_SIZE) {
    throw new RangeError(`Repository take must be between 1 and ${MODULE_9_MAX_PAGE_SIZE}.`);
  }
}

/** Convert one Prisma decimal-like value to a precision-safe string. */
function decimalString(value: { toString(): string }): string {
  return value.toString();
}

/** Database access for Final Module 9 Project Budget & Cost Tracking. */
export class BudgetsJobCostRepository {
  /** Bind persistence to Prisma or an active transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /** Lock one Project before a state-sensitive budget or forecast write. */
  async lockProjectForBudgetWrite(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{ id: string; status: string; currency: string }>>`
      SELECT id, status, currency
      FROM projects
      WHERE id = ${projectId}::uuid
        AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Find the newest Project budget version regardless of lifecycle state. */
  async findLatestProjectBudget(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.projectBudget.findFirst({
      where: scope.where({ projectId }),
      include: { lines: { orderBy: [{ id: 'asc' }] } },
      orderBy: [{ versionNo: 'desc' }, { id: 'desc' }]
    });
  }

  /** Find the newest budget with one service-supplied status. */
  async findLatestProjectBudgetByStatus(projectId: string, status: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.projectBudget.findFirst({
      where: scope.where({ projectId, status }),
      include: { lines: { orderBy: [{ id: 'asc' }] } },
      orderBy: [{ versionNo: 'desc' }, { id: 'desc' }]
    });
  }

  /** Find one Project budget and its category lines. */
  async findProjectBudgetById(projectId: string, budgetId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.projectBudget.findFirst({
      where: scope.where({ id: budgetId, projectId }),
      include: { lines: { orderBy: [{ id: 'asc' }] } }
    });
  }

  /** Lock one budget before line replacement or freeze. */
  async lockProjectBudgetForWrite(projectId: string, budgetId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{
      id: string;
      versionNo: number;
      status: string;
      currency: string;
      totalAmount: { toString(): string };
      createdBy: string;
      frozenAt: Date | null;
    }>>`
      SELECT id, version_no AS "versionNo", status, currency,
             total_amount AS "totalAmount", created_by AS "createdBy", frozen_at AS "frozenAt"
      FROM project_budgets
      WHERE id = ${budgetId}::uuid
        AND project_id = ${projectId}::uuid
        AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Create one server-numbered draft budget for a valid Company Project. */
  async createProjectBudget(input: CreateProjectBudgetRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const project = await this.db.project.findFirst({ where: scope.where({ id: input.projectId }), select: { id: true } });
    if (!project) return null;
    return this.db.projectBudget.create({
      data: scope.createData({
        projectId: input.projectId,
        versionNo: input.versionNo,
        status: input.status,
        currency: input.currency,
        totalAmount: input.totalAmount,
        createdBy: input.createdBy,
        frozenAt: input.frozenAt ?? null
      }),
      include: { lines: true }
    });
  }

  /** Replace the complete draft line set with simple category-based rows. */
  async replaceBudgetLines(projectId: string, budgetId: string, lines: readonly BudgetLineRepositoryInput[]) {
    const scope = requireCompanyRepositoryScope();
    const budget = await this.db.projectBudget.findFirst({ where: scope.where({ id: budgetId, projectId }), select: { id: true } });
    if (!budget) return null;

    await this.db.budgetLine.deleteMany({
      where: { budgetId, budget: { projectId, companyId: scope.companyId } }
    });
    if (lines.length > 0) {
      await this.db.budgetLine.createMany({
        data: lines.map((line) => ({
          budgetId,
          stageId: line.stageId ?? null,
          category: line.category,
          description: line.description,
          plannedAmount: line.plannedAmount
        }))
      });
    }
    return this.findProjectBudgetById(projectId, budgetId);
  }

  /** Sum planned amounts for one Project budget. */
  async sumBudgetLines(projectId: string, budgetId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.budgetLine.aggregate({
      where: { budgetId, budget: { projectId, companyId: scope.companyId } },
      _sum: { plannedAmount: true }
    });
  }

  /** Persist the server-calculated total planned amount. */
  async updateProjectBudgetTotal(projectId: string, budgetId: string, totalAmount: string) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.projectBudget.updateMany({
      where: scope.where({ id: budgetId, projectId }),
      data: { totalAmount }
    });
    if (updated.count !== 1) return null;
    return this.findProjectBudgetById(projectId, budgetId);
  }

  /** Move one budget from its expected state to a controlled target state. */
  async updateProjectBudgetStatus(
    projectId: string,
    budgetId: string,
    expectedStatus: string,
    targetStatus: string,
    frozenAt: Date | null
  ) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.projectBudget.updateMany({
      where: scope.where({ id: budgetId, projectId, status: expectedStatus }),
      data: { status: targetStatus, frozenAt }
    });
    if (updated.count !== 1) return null;
    return this.findProjectBudgetById(projectId, budgetId);
  }

  /** Find requested Stages only when they belong to the current Company Project. */
  async findProjectStagesByIds(projectId: string, stageIds: readonly string[]) {
    const ids = [...new Set(stageIds)];
    if (ids.length === 0) return [];
    const scope = requireCompanyRepositoryScope();
    return this.db.projectStage.findMany({
      where: scope.where({ projectId, id: { in: ids } }),
      select: { id: true },
      orderBy: [{ id: 'asc' }]
    });
  }

  /** List the complete current Project forecast. */
  async listForecastLines(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.forecastLine.findMany({
      where: { projectId, project: { companyId: scope.companyId } },
      orderBy: [{ category: 'asc' }, { stageId: 'asc' }, { id: 'asc' }]
    });
  }

  /** Replace the complete current Project forecast atomically. */
  async replaceForecastLines(projectId: string, lines: readonly ForecastLineRepositoryInput[]) {
    const scope = requireCompanyRepositoryScope();
    const project = await this.db.project.findFirst({ where: scope.where({ id: projectId }), select: { id: true } });
    if (!project) return null;
    await this.db.forecastLine.deleteMany({ where: { projectId } });
    if (lines.length > 0) {
      await this.db.forecastLine.createMany({
        data: lines.map((line) => ({
          projectId,
          stageId: line.stageId ?? null,
          category: line.category,
          forecastAmount: line.forecastAmount,
          updatedBy: line.updatedBy,
          updatedAt: line.updatedAt
        }))
      });
    }
    return this.listForecastLines(projectId);
  }

  /** Sum all current Project forecast amounts. */
  async sumForecastLines(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.forecastLine.aggregate({
      where: { projectId, project: { companyId: scope.companyId } },
      _sum: { forecastAmount: true }
    });
  }

  /** Sum source-derived Project commitments. */
  async sumCostCommitments(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.costCommitment.aggregate({
      where: scope.where({ projectId, status: { not: 'CANCELLED' } }),
      _sum: { amount: true }
    });
  }

  /** Sum append-only Project actual costs. */
  async sumCostActuals(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.costActual.aggregate({ where: scope.where({ projectId }), _sum: { amount: true } });
  }

  /** List bounded source-derived actual costs for one Project and selected cost categories. */
  async listActualCostSources(input: Readonly<{
    projectId: string;
    stageId?: string;
    categories?: readonly Module9CostCategory[];
    fromDate?: Date;
    toDate?: Date;
    skip: number;
    take: number;
  }>) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({
      projectId: input.projectId,
      ...(input.stageId ? { stageId: input.stageId } : {}),
      ...(input.categories ? { category: { in: [...input.categories] } } : {}),
      ...(input.fromDate || input.toDate
        ? { postingDate: { ...(input.fromDate ? { gte: input.fromDate } : {}), ...(input.toDate ? { lte: input.toDate } : {}) } }
        : {})
    });
    const [items, total] = await Promise.all([
      this.db.costActual.findMany({
        where,
        orderBy: [{ postingDate: 'desc' }, { id: 'desc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.costActual.count({ where })
    ]);
    return { items: items.map((item) => ({ ...item, amount: decimalString(item.amount) })), total };
  }

  /** Read one bounded combined commitment/actual ledger without exposing write authority. */
  async listJobCostLedger(projectId: string, page: Module9RepositoryPageWindow) {
    assertPageWindow(page);
    const scope = requireCompanyRepositoryScope();
    const [commitmentCount, actualCount, rows] = await Promise.all([
      this.db.costCommitment.count({ where: scope.where({ projectId }) }),
      this.db.costActual.count({ where: scope.where({ projectId }) }),
      this.db.$queryRaw<LedgerRow[]>`
        SELECT * FROM (
          SELECT c.id, 'COMMITMENT'::text AS "recordType", c.stage_id AS "stageId", c.category,
                 c.source_type AS "sourceType", c.source_id AS "sourceId", c.source_key AS "sourceKey",
                 c.posted_at::date AS "postingDate", c.amount, c.status
          FROM cost_commitments c
          WHERE c.company_id = ${scope.companyId}::uuid AND c.project_id = ${projectId}::uuid
          UNION ALL
          SELECT a.id, 'ACTUAL'::text AS "recordType", a.stage_id AS "stageId", a.category,
                 a.source_type AS "sourceType", a.source_id AS "sourceId", a.source_key AS "sourceKey",
                 a.posting_date AS "postingDate", a.amount, NULL::text AS status
          FROM cost_actuals a
          WHERE a.company_id = ${scope.companyId}::uuid AND a.project_id = ${projectId}::uuid
        ) ledger
        ORDER BY "postingDate" DESC, id DESC
        OFFSET ${page.skip} LIMIT ${page.take}
      `
    ]);

    return {
      items: rows.map((row) => ({ ...row, amount: decimalString(row.amount) })),
      total: commitmentCount + actualCount
    };
  }
}
