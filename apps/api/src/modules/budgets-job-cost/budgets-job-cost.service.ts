import { recordAudit } from '@construction-erp/audit';
import type { DatabaseClient } from '@construction-erp/database';
import { executeIdempotentCommand } from '@construction-erp/idempotency';
import { AuthorizationError, NotFoundError, ValidationError } from '@construction-erp/errors';
import { recordOutboxEvent } from '@construction-erp/outbox';
import { requireRequestSecurityContext } from '@construction-erp/request-context';
import { AdministrationRepository } from '../administration/administration.repository.js';
import { BudgetsJobCostRepository } from './budgets-job-cost.repository.js';
import {
  createModule9Error,
  type CreateBudgetBody,
  type GetJobCostLedgerQuery,
  type Module9PermissionCode,
  type ReplaceBudgetLinesBody,
  type UpdateForecastBody
} from './budgets-job-cost.schema.js';

const BUDGET_DRAFT = 'DRAFT';
const BUDGET_FROZEN = 'FROZEN';
const PROJECT_SUSPENDED = 'SUSPENDED';
const PROJECT_CLOSED = 'CLOSED';
const ASSIGNMENT_ACTIVE = 'ACTIVE';
const ROLE_ACTIVE = 'ACTIVE';
const MAX_MONEY_MINOR_UNITS = 999_999_999_999_999_999n;

type DecimalLike = Readonly<{ toString(): string }> | string;

/** Compare one persisted status without inventing a new enum. */
function hasStatus(value: string, expected: string): boolean {
  return value.trim().toUpperCase() === expected;
}

/** Return unique identifiers without changing first-seen order. */
function uniqueIds(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** Build one stable Stage/category identity for duplicate forecast validation. */
function forecastKey(stageId: string | null | undefined, category: string): string {
  return `${stageId ?? 'PROJECT'}:${category}`;
}

/** Return whether one string list contains duplicates. */
function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

/** Convert one exact money string to minor units. */
function moneyToMinorUnits(value: string): bigint {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const minorUnits = BigInt(whole) * 100n + BigInt(`${fraction}00`.slice(0, 2));
  return negative ? -minorUnits : minorUnits;
}

/** Convert exact minor units to a stable money string. */
function minorUnitsToMoney(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

/** Reject money totals outside PostgreSQL DECIMAL(18,2). */
function requireMoneyRange(value: bigint): bigint {
  const absolute = value < 0n ? -value : value;
  if (absolute > MAX_MONEY_MINOR_UNITS) {
    throw new ValidationError({ message: 'Calculated budget amount exceeds the supported DECIMAL(18,2) range.' });
  }
  return value;
}

/** Convert one stored decimal-like value to exact minor units. */
function storedMoneyToMinorUnits(value: DecimalLike | null | undefined): bigint {
  return value === null || value === undefined ? 0n : moneyToMinorUnits(value.toString());
}

/** Convert one stored decimal-like value to a stable money string. */
function storedMoney(value: DecimalLike | null | undefined): string {
  return minorUnitsToMoney(storedMoneyToMinorUnits(value));
}

/** Return one database date as YYYY-MM-DD. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Convert one budget row to the Final Module 9 safe response shape. */
function budgetResponse(budget: Readonly<{
  id: string;
  projectId: string;
  versionNo: number;
  status: string;
  currency: string;
  totalAmount: DecimalLike;
  createdBy: string;
  frozenAt: Date | null;
  lines: readonly Readonly<{
    id: string;
    stageId: string | null;
    category: string;
    description: string;
    plannedAmount: DecimalLike;
  }>[];
}>) {
  return {
    id: budget.id,
    projectId: budget.projectId,
    versionNo: budget.versionNo,
    status: budget.status,
    currency: budget.currency,
    totalAmount: storedMoney(budget.totalAmount),
    createdBy: budget.createdBy,
    frozenAt: budget.frozenAt?.toISOString() ?? null,
    lines: budget.lines.map((line) => ({
      id: line.id,
      stageId: line.stageId,
      category: line.category,
      description: line.description,
      plannedAmount: storedMoney(line.plannedAmount)
    }))
  };
}

/** Convert one forecast row to the Final Module 9 response shape. */
function forecastResponse(forecast: Readonly<{
  id: string;
  projectId: string;
  stageId: string | null;
  category: string;
  forecastAmount: DecimalLike;
  updatedBy: string;
  updatedAt: Date;
}>) {
  return {
    id: forecast.id,
    projectId: forecast.projectId,
    stageId: forecast.stageId,
    category: forecast.category,
    forecastAmount: storedMoney(forecast.forecastAmount),
    updatedBy: forecast.updatedBy,
    updatedAt: forecast.updatedAt.toISOString()
  };
}

/** Build a compact non-secret audit snapshot for a budget. */
function budgetAuditSnapshot(budget: ReturnType<typeof budgetResponse>) {
  return {
    projectId: budget.projectId,
    versionNo: budget.versionNo,
    status: budget.status,
    currency: budget.currency,
    frozenAt: budget.frozenAt,
    totalAmount: budget.totalAmount,
    lineCount: budget.lines.length
  };
}

/** Final Module 9 budget and source-derived job-cost business logic. */
export class BudgetsJobCostService {
  /** Bind service logic to the database. */
  constructor(private readonly db: DatabaseClient) {}

  /** Revalidate one Project-scoped permission through Administration policy data. */
  private async requireProjectPermission(
    repository: AdministrationRepository,
    projectId: string,
    permission: Module9PermissionCode,
    asOf: Date
  ): Promise<void> {
    const security = requireRequestSecurityContext();
    const scope = security.projectScope;
    if (scope.kind === 'not-resolved') throw new AuthorizationError();
    if (scope.kind === 'restricted' && !scope.projectIds.includes(projectId)) throw new AuthorizationError();

    const permissions = await repository.findEffectivePermissionCodesForProject(projectId, {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ASSIGNMENT_ACTIVE],
      roleStatuses: [ROLE_ACTIVE]
    });
    if (permissions === null) throw new NotFoundError();
    if (!permissions.includes(permission)) throw new AuthorizationError();
  }

  /** Reject normal writes while the owning Project is suspended or closed. */
  private requireWritableProject(project: Readonly<{ status: string }>): void {
    if (hasStatus(project.status, PROJECT_SUSPENDED) || hasStatus(project.status, PROJECT_CLOSED)) {
      throw new ValidationError({ message: 'Suspended or closed Projects do not accept budget or forecast writes.' });
    }
  }

  /** Validate that every supplied Stage belongs to the current Project. */
  private async requireValidStages(
    repository: BudgetsJobCostRepository,
    projectId: string,
    stageIds: readonly string[]
  ): Promise<void> {
    const uniqueStageIds = uniqueIds(stageIds);
    const stages = await repository.findProjectStagesByIds(projectId, uniqueStageIds);
    if (stages.length !== uniqueStageIds.length) throw createModule9Error('INVALID_COST_STAGE');
  }

  /** Read the newest Project budget as a compact nullable summary for Project detail. */
  async getBudgetSummary(projectId: string) {
    await this.requireProjectPermission(new AdministrationRepository(this.db), projectId, 'budgets.read', new Date());
    const budget = await new BudgetsJobCostRepository(this.db).findLatestProjectBudget(projectId);
    if (!budget) return null;
    return {
      versionNo: budget.versionNo,
      status: budget.status,
      currency: budget.currency,
      totalAmount: storedMoney(budget.totalAmount)
    };
  }

  /** Read the newest Project budget version, whether editable or frozen. */
  async getCurrentBudget(projectId: string) {
    await this.requireProjectPermission(new AdministrationRepository(this.db), projectId, 'budgets.read', new Date());
    const budget = await new BudgetsJobCostRepository(this.db).findLatestProjectBudget(projectId);
    if (!budget) throw createModule9Error('BUDGET_NOT_FOUND');
    return budgetResponse(budget);
  }

  /** Create the next server-numbered draft budget version. */
  async createBudget(projectId: string, input: CreateBudgetBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(
      this.db,
      { operation: 'module9.budget.create', idempotencyKey, fingerprintInput: { projectId, input } },
      async (tx) => {
        const now = new Date();
        const repository = new BudgetsJobCostRepository(tx);
        await this.requireProjectPermission(new AdministrationRepository(tx), projectId, 'budgets.create', now);
        const project = await repository.lockProjectForBudgetWrite(projectId);
        if (!project) throw new NotFoundError();
        this.requireWritableProject(project);

        const latest = await repository.findLatestProjectBudget(projectId);
        if (latest && hasStatus(latest.status, BUDGET_DRAFT)) throw createModule9Error('BUDGET_LOCKED');
        const security = requireRequestSecurityContext();
        const created = await repository.createProjectBudget({
          projectId,
          versionNo: (latest?.versionNo ?? 0) + 1,
          status: BUDGET_DRAFT,
          currency: project.currency,
          totalAmount: '0.00',
          createdBy: security.actorUserId
        });
        if (!created) throw new NotFoundError();
        const response = budgetResponse(created);
        const eventType = latest ? 'budget.revised' : 'budget.created';
        await recordAudit(tx, {
          action: eventType,
          entityType: 'project_budget',
          entityId: created.id,
          before: latest ? budgetAuditSnapshot(budgetResponse(latest)) : null,
          after: budgetAuditSnapshot(response)
        });
        await recordOutboxEvent(tx, {
          eventType,
          resourceType: 'project_budget',
          resourceId: created.id,
          payload: budgetAuditSnapshot(response)
        });
        return { statusCode: 201, body: response };
      }
    );
    return result.response.body;
  }

  /** Replace the complete draft line set and recalculate total planned amount. */
  async replaceBudgetLines(projectId: string, budgetId: string, input: ReplaceBudgetLinesBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(
      this.db,
      { operation: 'module9.budget.lines.replace', idempotencyKey, fingerprintInput: { projectId, budgetId, input } },
      async (tx) => {
        const now = new Date();
        const repository = new BudgetsJobCostRepository(tx);
        await this.requireProjectPermission(new AdministrationRepository(tx), projectId, 'budgets.edit', now);
        const project = await repository.lockProjectForBudgetWrite(projectId);
        if (!project) throw new NotFoundError();
        this.requireWritableProject(project);
        const budget = await repository.lockProjectBudgetForWrite(projectId, budgetId);
        if (!budget) throw createModule9Error('BUDGET_NOT_FOUND');
        if (!hasStatus(budget.status, BUDGET_DRAFT)) throw createModule9Error('BUDGET_LOCKED');

        await this.requireValidStages(
          repository,
          projectId,
          input.lines.flatMap((line) => line.stageId ? [line.stageId] : [])
        );

        const before = await repository.findProjectBudgetById(projectId, budgetId);
        const replaced = await repository.replaceBudgetLines(projectId, budgetId, input.lines);
        if (!replaced) throw createModule9Error('BUDGET_NOT_FOUND');
        const totals = await repository.sumBudgetLines(projectId, budgetId);
        const totalAmount = storedMoney(totals._sum.plannedAmount);
        const updated = await repository.updateProjectBudgetTotal(projectId, budgetId, totalAmount);
        if (!updated) throw createModule9Error('BUDGET_NOT_FOUND');
        const response = budgetResponse(updated);
        await recordAudit(tx, {
          action: 'budget.lines_replaced',
          entityType: 'project_budget',
          entityId: budgetId,
          before: before ? budgetAuditSnapshot(budgetResponse(before)) : null,
          after: budgetAuditSnapshot(response)
        });
        return { statusCode: 200, body: response };
      }
    );
    return result.response.body;
  }

  /** Freeze one validated draft budget through a controlled transition. */
  async freezeBudget(projectId: string, budgetId: string, idempotencyKey: string) {
    const result = await executeIdempotentCommand(
      this.db,
      { operation: 'module9.budget.freeze', idempotencyKey, fingerprintInput: { projectId, budgetId } },
      async (tx) => {
        const now = new Date();
        const repository = new BudgetsJobCostRepository(tx);
        await this.requireProjectPermission(new AdministrationRepository(tx), projectId, 'budgets.freeze', now);
        const project = await repository.lockProjectForBudgetWrite(projectId);
        if (!project) throw new NotFoundError();
        this.requireWritableProject(project);
        const budget = await repository.lockProjectBudgetForWrite(projectId, budgetId);
        if (!budget) throw createModule9Error('BUDGET_NOT_FOUND');
        if (!hasStatus(budget.status, BUDGET_DRAFT)) throw createModule9Error('BUDGET_LOCKED');

        const frozen = await repository.updateProjectBudgetStatus(projectId, budgetId, BUDGET_DRAFT, BUDGET_FROZEN, now);
        if (!frozen) throw createModule9Error('BUDGET_LOCKED');
        const response = budgetResponse(frozen);
        await recordAudit(tx, {
          action: 'budget.frozen',
          entityType: 'project_budget',
          entityId: budgetId,
          before: { status: BUDGET_DRAFT },
          after: budgetAuditSnapshot(response)
        });
        await recordOutboxEvent(tx, {
          eventType: 'budget.frozen',
          resourceType: 'project_budget',
          resourceId: budgetId,
          payload: budgetAuditSnapshot(response)
        });
        return { statusCode: 200, body: response };
      }
    );
    return result.response.body;
  }

  /** Read Project planned, committed, actual and forecast costs without mixing billing or revenue. */
  async getJobCost(projectId: string) {
    await this.requireProjectPermission(new AdministrationRepository(this.db), projectId, 'job_cost.read', new Date());
    const repository = new BudgetsJobCostRepository(this.db);
    const [currentBudget, commitments, actuals, forecastSums, forecasts] = await Promise.all([
      repository.findLatestProjectBudgetByStatus(projectId, BUDGET_FROZEN),
      repository.sumCostCommitments(projectId),
      repository.sumCostActuals(projectId),
      repository.sumForecastLines(projectId),
      repository.listForecastLines(projectId)
    ]);

    const budgetCost = storedMoneyToMinorUnits(currentBudget?.totalAmount);
    const committedCost = storedMoneyToMinorUnits(commitments._sum.amount);
    const actualCost = storedMoneyToMinorUnits(actuals._sum.amount);
    const forecastCost = storedMoneyToMinorUnits(forecastSums._sum.forecastAmount);
    const variance = requireMoneyRange(budgetCost - forecastCost);

    return {
      projectId,
      currentBudget: currentBudget ? budgetResponse(currentBudget) : null,
      totals: {
        budgetCost: minorUnitsToMoney(budgetCost),
        committedCost: minorUnitsToMoney(committedCost),
        actualCost: minorUnitsToMoney(actualCost),
        forecastCost: minorUnitsToMoney(forecastCost),
        variance: minorUnitsToMoney(variance)
      },
      forecasts: forecasts.map(forecastResponse)
    };
  }

  /** Replace the current forecast using only valid Project/Stage/category rows. */
  async updateForecast(projectId: string, input: UpdateForecastBody, idempotencyKey: string) {
    const keys = input.lines.map((line) => forecastKey(line.stageId, line.category));
    if (hasDuplicates(keys)) {
      throw new ValidationError({ message: 'Forecast Stage/category rows must be unique.' });
    }

    const result = await executeIdempotentCommand(
      this.db,
      { operation: 'module9.forecast.replace', idempotencyKey, fingerprintInput: { projectId, input } },
      async (tx) => {
        const now = new Date();
        const repository = new BudgetsJobCostRepository(tx);
        await this.requireProjectPermission(new AdministrationRepository(tx), projectId, 'forecast.update', now);
        const project = await repository.lockProjectForBudgetWrite(projectId);
        if (!project) throw new NotFoundError();
        this.requireWritableProject(project);
        await this.requireValidStages(
          repository,
          projectId,
          input.lines.flatMap((line) => line.stageId ? [line.stageId] : [])
        );

        const security = requireRequestSecurityContext();
        const before = await repository.listForecastLines(projectId);
        const forecasts = await repository.replaceForecastLines(projectId, input.lines.map((line) => ({
          stageId: line.stageId ?? null,
          category: line.category,
          forecastAmount: line.forecastAmount,
          updatedBy: security.actorUserId,
          updatedAt: now
        })));
        if (!forecasts) throw new NotFoundError();
        const response = { projectId, forecasts: forecasts.map(forecastResponse) };
        await recordAudit(tx, {
          action: 'forecast.updated',
          entityType: 'project_forecast',
          entityId: projectId,
          before: { lineCount: before.length },
          after: { lineCount: forecasts.length }
        });
        await recordOutboxEvent(tx, {
          eventType: 'forecast.updated',
          resourceType: 'project',
          resourceId: projectId,
          payload: { projectId, lineCount: forecasts.length }
        });
        return { statusCode: 200, body: response };
      }
    );
    return result.response.body;
  }

  /** Read one bounded source-cost ledger page. */
  async getJobCostLedger(projectId: string, input: GetJobCostLedgerQuery) {
    await this.requireProjectPermission(new AdministrationRepository(this.db), projectId, 'job_cost.read', new Date());
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const result = await new BudgetsJobCostRepository(this.db).listJobCostLedger(projectId, {
      skip: (page - 1) * pageSize,
      take: pageSize
    });
    return {
      projectId,
      items: result.items.map((item) => ({ ...item, postingDate: dateOnly(item.postingDate) })),
      total: result.total,
      page,
      pageSize
    };
  }
}
