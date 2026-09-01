import { recordAudit } from '@construction-erp/audit';
import { withTransaction, type DatabaseClient, type TransactionClient } from '@construction-erp/database';
import { recordOutboxEvent } from '@construction-erp/outbox';
import { requireRequestSecurityContext } from '@construction-erp/request-context';
import { AdministrationRepository } from '../administration/administration.repository.js';
import { BudgetsJobCostService } from '../budgets-job-cost/budgets-job-cost.service.js';
import { FinanceService } from '../finance/finance.service.js';
import { ProjectProfitabilityService } from '../project-profitability/project-profitability.service.js';
import type { ProjectProfitabilityFinancialValues } from '../project-profitability/project-profitability.schema.js';
import { ProjectStagesService } from '../project-stages/project-stages.service.js';
import { DashboardRepository } from './dashboard.repository.js';
import {
  DASHBOARD_WIDGET_CODES,
  createDashboardError,
  updateDashboardPreferencesBodySchema,
  type DashboardAlertsQuery,
  type DashboardProjectQuery,
  type DashboardProjectsQuery,
  type DashboardSummaryQuery,
  type DashboardWidgetCode,
  type UpdateDashboardPreferencesBody
} from './dashboard.schema.js';

const ROLE_ASSIGNMENT_ACTIVE = 'ACTIVE';
const ROLE_ACTIVE = 'ACTIVE';
const DEFAULT_PROJECT_PAGE_SIZE = 25;
const DASHBOARD_FINANCIAL_PORTFOLIO_PAGE_SIZE = 100;
const PROJECT_COMPLETED = 'COMPLETED';
const PROJECT_CLOSED = 'CLOSED';
const STAGE_COMPLETED = 'COMPLETED';

const FINANCIAL_WIDGET_CODES: readonly DashboardWidgetCode[] = Object.freeze([
  'budget-vs-actual',
  'billed-received-outstanding',
  'supplier-payable',
  'cash-bank',
  'profit-loss'
]);

const WIDGET_SOURCE_PERMISSIONS: Readonly<Partial<Record<DashboardWidgetCode, readonly string[]>>> = Object.freeze({
  'stage-progress': ['stages.read'],
  'budget-vs-actual': ['job_cost.read'],
  'billed-received-outstanding': ['project_profitability.read', 'project_profitability.finance.read'],
  'supplier-payable': ['project_profitability.read', 'project_profitability.finance.read'],
  'cash-bank': ['finance.read'],
  'profit-loss': ['project_profitability.read', 'project_profitability.finance.read']
});

/** Server-owned Company, actor, permission and Project visibility for one Dashboard operation. */
export type DashboardServiceScope = Readonly<{
  companyId: string;
  actorUserId: string;
  permissions: readonly string[];
  allowedProjectIds: readonly string[] | null;
}>;

type CurrencyFinancialAccumulator = {
  projectCount: number;
  recognizedRevenue: bigint;
  actualCost: bigint;
  profitAmount: bigint;
  billedAmount: bigint;
  receivedAmount: bigint;
  allocatedAmount: bigint;
  advanceAmount: bigint;
  outstandingAmount: bigint;
  supplierPayableAmount: bigint;
};

/** Return true when every required permission is present. */
function hasAllPermissions(permissions: readonly string[], required: readonly string[]): boolean {
  return required.every((permission) => permissions.includes(permission));
}

/** Return one stable unique string list while preserving first-seen order. */
function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** Return whether the caller explicitly requested at least one financial Dashboard widget. */
function requestsFinancialWidget(widgetCodes: readonly DashboardWidgetCode[] | undefined): boolean {
  return Boolean(widgetCodes?.some((widgetCode) => FINANCIAL_WIDGET_CODES.includes(widgetCode)));
}

/** Return true when an omitted widget filter or one requested widget needs the source read. */
function wantsAnyWidget(
  requested: readonly DashboardWidgetCode[] | undefined,
  candidates: readonly DashboardWidgetCode[]
): boolean {
  return requested === undefined || requested.some((widgetCode) => candidates.includes(widgetCode));
}

/** Convert exact money text into integer minor units for safe Dashboard aggregation. */
function moneyToMinorUnits(value: string): bigint {
  const text = value.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw createDashboardError('DASHBOARD_WIDGET_NOT_AVAILABLE');
  const sign = match[1] === '-' ? -1n : 1n;
  const whole = BigInt(match[2] ?? '0');
  const fraction = BigInt(`${match[3] ?? ''}00`.slice(0, 2));
  return sign * ((whole * 100n) + fraction);
}

/** Convert integer minor units into stable two-decimal Dashboard money. */
function minorUnitsToMoney(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const formatted = `${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
  return negative ? `-${formatted}` : formatted;
}

/** Copy Project Profitability values without recomputing any source-owned business formula. */
function financialPosition(values: ProjectProfitabilityFinancialValues) {
  return {
    recognizedRevenue: values.recognizedRevenue,
    actualCost: values.actualCost,
    profitAmount: values.profitAmount,
    billedAmount: values.billedAmount,
    receivedAmount: values.receivedAmount,
    allocatedAmount: values.allocatedAmount,
    advanceAmount: values.advanceAmount,
    outstandingAmount: values.outstandingAmount,
    supplierPayableAmount: values.supplierPayableAmount
  };
}

/** Group source-derived Project Profitability values by currency without mixing currencies. */
function aggregateFinancialsByCurrency(
  items: readonly (ProjectProfitabilityFinancialValues & Readonly<{ currency: string }>)[]
) {
  const totals = new Map<string, CurrencyFinancialAccumulator>();

  for (const item of items) {
    const current = totals.get(item.currency) ?? {
      projectCount: 0,
      recognizedRevenue: 0n,
      actualCost: 0n,
      profitAmount: 0n,
      billedAmount: 0n,
      receivedAmount: 0n,
      allocatedAmount: 0n,
      advanceAmount: 0n,
      outstandingAmount: 0n,
      supplierPayableAmount: 0n
    };
    current.projectCount += 1;
    current.recognizedRevenue += moneyToMinorUnits(item.recognizedRevenue);
    current.actualCost += moneyToMinorUnits(item.actualCost);
    current.profitAmount += moneyToMinorUnits(item.profitAmount);
    current.billedAmount += moneyToMinorUnits(item.billedAmount);
    current.receivedAmount += moneyToMinorUnits(item.receivedAmount);
    current.allocatedAmount += moneyToMinorUnits(item.allocatedAmount);
    current.advanceAmount += moneyToMinorUnits(item.advanceAmount);
    current.outstandingAmount += moneyToMinorUnits(item.outstandingAmount);
    current.supplierPayableAmount += moneyToMinorUnits(item.supplierPayableAmount);
    totals.set(item.currency, current);
  }

  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, total]) => ({
      currency,
      projectCount: total.projectCount,
      recognizedRevenue: minorUnitsToMoney(total.recognizedRevenue),
      actualCost: minorUnitsToMoney(total.actualCost),
      profitAmount: minorUnitsToMoney(total.profitAmount),
      billedAmount: minorUnitsToMoney(total.billedAmount),
      receivedAmount: minorUnitsToMoney(total.receivedAmount),
      allocatedAmount: minorUnitsToMoney(total.allocatedAmount),
      advanceAmount: minorUnitsToMoney(total.advanceAmount),
      outstandingAmount: minorUnitsToMoney(total.outstandingAmount),
      supplierPayableAmount: minorUnitsToMoney(total.supplierPayableAmount)
    }));
}

/** Convert one stored preference row into the small public preference shape. */
function preferenceResponse(row: Awaited<ReturnType<DashboardRepository['findPreference']>>) {
  if (!row) return null;
  const parsed = updateDashboardPreferencesBodySchema.safeParse({
    ...(typeof row.layoutJson === 'object' && row.layoutJson !== null && !Array.isArray(row.layoutJson)
      ? row.layoutJson
      : {}),
    defaultProjectId: row.defaultProjectId
  });
  if (!parsed.success) throw createDashboardError('INVALID_DASHBOARD_FILTER');

  return {
    ...parsed.data,
    updatedAt: row.updatedAt.toISOString()
  };
}

/** Choose the latest validated Dashboard date as the source as-of boundary. */
function dashboardAsOfDate(query: { asOfDate?: string | undefined; toDate?: string | undefined }): string | undefined {
  return query.asOfDate ?? query.toDate;
}

/** Return today's UTC calendar date for Dashboard as-of reads that omit a date. */
function currentDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Return whether one planned date falls inside the requested alert due-date window. */
function isAlertDueDate(plannedDate: string, fromDate: string | undefined, asOfDate: string): boolean {
  return plannedDate < asOfDate && (!fromDate || plannedDate >= fromDate);
}

/** Return whether a source-owned Project lifecycle can still produce a deadline alert. */
function isOpenProjectStatus(status: string): boolean {
  return status !== PROJECT_COMPLETED && status !== PROJECT_CLOSED;
}

/** Orchestrate permission-safe Dashboard source reads without owning operational totals. */
export class DashboardService {
  /** Bind Dashboard orchestration to the application database. */
  constructor(private readonly db: DatabaseClient) {}

  /** Revalidate authenticated Company permissions and optional Project visibility. */
  private async requireScope(requiredPermissions: readonly string[], projectId?: string): Promise<DashboardServiceScope> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw createDashboardError('DASHBOARD_SCOPE_FORBIDDEN');
    if (projectId && security.projectScope.kind === 'restricted' && !security.projectScope.projectIds.includes(projectId)) {
      throw createDashboardError('DASHBOARD_SCOPE_FORBIDDEN');
    }
    if (!hasAllPermissions(security.permissions, requiredPermissions)) {
      throw createDashboardError('DASHBOARD_SCOPE_FORBIDDEN');
    }

    const lookup = {
      userId: security.actorUserId,
      asOf: new Date(),
      assignmentStatuses: [ROLE_ASSIGNMENT_ACTIVE],
      roleStatuses: [ROLE_ACTIVE]
    } as const;
    const repository = new AdministrationRepository(this.db);
    const effectivePermissions = projectId
      ? await repository.findEffectivePermissionCodesForProject(projectId, lookup)
      : await repository.findEffectivePermissionCodes(lookup);
    if (!effectivePermissions || !hasAllPermissions(effectivePermissions, requiredPermissions)) {
      throw createDashboardError('DASHBOARD_SCOPE_FORBIDDEN');
    }

    return {
      companyId: security.companyId,
      actorUserId: security.actorUserId,
      permissions: effectivePermissions.filter((permission: string) => security.permissions.includes(permission)),
      allowedProjectIds: projectId
        ? [projectId]
        : security.projectScope.kind === 'all'
          ? null
          : uniqueStrings(security.projectScope.projectIds).sort()
    };
  }

  /** Reject explicitly requested widgets when Dashboard or source-module permissions are unavailable. */
  private requireRequestedWidgetAccess(scope: DashboardServiceScope, widgetCodes: readonly DashboardWidgetCode[] | undefined): void {
    if (!widgetCodes) return;
    if (requestsFinancialWidget(widgetCodes) && !scope.permissions.includes('dashboard.finance.read')) {
      throw createDashboardError('DASHBOARD_WIDGET_NOT_AVAILABLE');
    }
    for (const widgetCode of widgetCodes) {
      const sourcePermissions = WIDGET_SOURCE_PERMISSIONS[widgetCode] ?? [];
      if (!hasAllPermissions(scope.permissions, sourcePermissions)) {
        throw createDashboardError('DASHBOARD_WIDGET_NOT_AVAILABLE');
      }
    }
  }

  /** Return whether source-owned Project Profitability data may be included in this Dashboard response. */
  private canReadProfitability(scope: DashboardServiceScope, portfolio = false): boolean {
    const required = [
      'dashboard.finance.read',
      'project_profitability.read',
      'project_profitability.finance.read',
      ...(portfolio ? ['project_profitability.portfolio.read'] : [])
    ];
    return hasAllPermissions(scope.permissions, required);
  }

  /** Return whether source-owned Project Budget and actual-cost data may be included. */
  private canReadJobCost(scope: DashboardServiceScope): boolean {
    return hasAllPermissions(scope.permissions, ['dashboard.finance.read', 'job_cost.read']);
  }

  /** Return whether source-owned Cash/Bank balances may be included. */
  private canReadCashBank(scope: DashboardServiceScope): boolean {
    return hasAllPermissions(scope.permissions, ['dashboard.finance.read', 'finance.read']);
  }

  /** Read the Company or optional Project Dashboard core models without persisting KPI values. */
  async getSummary(query: DashboardSummaryQuery) {
    const required = query.projectId
      ? ['dashboard.read', 'dashboard.project.read']
      : ['dashboard.read'];
    const scope = await this.requireScope(required, query.projectId);
    this.requireRequestedWidgetAccess(scope, query.widgetCodes);

    const repository = new DashboardRepository(this.db);
    const [preference, savedFilters] = await Promise.all([
      repository.findPreference(scope.actorUserId),
      repository.listSavedFilters(scope.actorUserId)
    ]);
    const asOfDate = dashboardAsOfDate(query);

    if (query.projectId) {
      const project = await repository.findProjectById(query.projectId, { allowedProjectIds: scope.allowedProjectIds });
      if (!project) throw createDashboardError('DASHBOARD_SCOPE_FORBIDDEN');

      const readProgress = scope.permissions.includes('stages.read')
        && wantsAnyWidget(query.widgetCodes, ['executive-summary', 'project-health', 'stage-progress']);
      const readJobCost = this.canReadJobCost(scope)
        && wantsAnyWidget(query.widgetCodes, ['executive-summary', 'budget-vs-actual']);
      const readProfitability = this.canReadProfitability(scope)
        && wantsAnyWidget(query.widgetCodes, [
          'executive-summary',
          'billed-received-outstanding',
          'supplier-payable',
          'profit-loss'
        ]);
      const readCashBank = this.canReadCashBank(scope) && wantsAnyWidget(query.widgetCodes, ['cash-bank']);
      const [stageSummary, jobCost, profitability, cashBank] = await Promise.all([
        readProgress ? new ProjectStagesService(this.db).getProjectSummary(query.projectId) : null,
        readJobCost ? new BudgetsJobCostService(this.db).getJobCost(query.projectId) : null,
        readProfitability
          ? new ProjectProfitabilityService(this.db).getProjectSummary(query.projectId, {
              ...(asOfDate ? { asOfDate } : {})
            })
          : null,
        readCashBank
          ? new FinanceService(this.db).listCashBankAccounts({ page: 1, pageSize: 100 })
          : null
      ]);

      return {
        project,
        executiveSummary: {
          overallPhysicalProgressPercent: stageSummary?.overallPhysicalProgressPercent ?? null,
          budgetVsActual: jobCost?.totals ?? null,
          financialPosition: profitability ? financialPosition(profitability) : null
        },
        stageSummary,
        cashBank,
        preference: preferenceResponse(preference),
        savedFilters
      };
    }

    const projects = await repository.listProjects({
      allowedProjectIds: scope.allowedProjectIds,
      skip: 0,
      take: 1
    });
    const readProfitability = this.canReadProfitability(scope, true)
      && wantsAnyWidget(query.widgetCodes, [
        'executive-summary',
        'project-health',
        'billed-received-outstanding',
        'supplier-payable',
        'profit-loss'
      ]);
    const readCashBank = this.canReadCashBank(scope) && wantsAnyWidget(query.widgetCodes, ['cash-bank']);
    const [profitability, cashBank] = await Promise.all([
      readProfitability
        ? new ProjectProfitabilityService(this.db).getPortfolio({
            ...(asOfDate ? { asOfDate } : {}),
            page: 1,
            pageSize: DASHBOARD_FINANCIAL_PORTFOLIO_PAGE_SIZE
          })
        : null,
      readCashBank
        ? new FinanceService(this.db).listCashBankAccounts({ page: 1, pageSize: 100 })
        : null
    ]);

    return {
      projectCount: projects.total,
      executiveSummary: {
        financialsByCurrency: profitability ? aggregateFinancialsByCurrency(profitability.items) : null,
        financialCoverage: profitability
          ? {
              includedProjects: profitability.items.length,
              totalProjects: profitability.total,
              complete: profitability.items.length === profitability.total,
              asOfDate: profitability.asOfDate
            }
          : null
      },
      cashBank,
      preference: preferenceResponse(preference),
      savedFilters
    };
  }

  /** Return a bounded Project portfolio with deterministic weighted physical progress. */
  async getProjects(query: DashboardProjectsQuery) {
    const scope = await this.requireScope(['dashboard.read', 'dashboard.project.read']);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PROJECT_PAGE_SIZE;
    const result = await new DashboardRepository(this.db).listProjects({
      allowedProjectIds: scope.allowedProjectIds,
      skip: (page - 1) * pageSize,
      take: pageSize,
      search: query.search,
      status: query.status
    });
    const includeProgress = scope.permissions.includes('stages.read');
    const progress = includeProgress
      ? await Promise.all(result.items.map((project) => new ProjectStagesService(this.db).getProjectSummary(project.id)))
      : result.items.map(() => null);

    return {
      items: result.items.map((project, index) => ({
        ...project,
        overallPhysicalProgressPercent: progress[index]?.overallPhysicalProgressPercent ?? null,
        stageCount: progress[index]?.stageCount ?? null,
        stageBaselineStatus: progress[index]?.baselineStatus ?? null
      })),
      total: result.total,
      page,
      pageSize
    };
  }

  /** Read one Project's Stage, budget/cost and profitability models after Project-scope checks. */
  async getProjectDashboard(projectId: string, query: DashboardProjectQuery) {
    const scope = await this.requireScope(['dashboard.read', 'dashboard.project.read'], projectId);
    this.requireRequestedWidgetAccess(scope, query.widgetCodes);
    const repository = new DashboardRepository(this.db);
    const project = await repository.findProjectById(projectId, { allowedProjectIds: scope.allowedProjectIds });
    if (!project) throw createDashboardError('DASHBOARD_SCOPE_FORBIDDEN');

    const readStages = scope.permissions.includes('stages.read')
      && wantsAnyWidget(query.widgetCodes, ['executive-summary', 'project-health', 'stage-progress']);
    const readJobCost = this.canReadJobCost(scope)
      && wantsAnyWidget(query.widgetCodes, ['executive-summary', 'budget-vs-actual']);
    const readProfitability = this.canReadProfitability(scope)
      && wantsAnyWidget(query.widgetCodes, [
        'executive-summary',
        'billed-received-outstanding',
        'supplier-payable',
        'profit-loss'
      ]);
    const readCashBank = this.canReadCashBank(scope) && wantsAnyWidget(query.widgetCodes, ['cash-bank']);
    const asOfDate = dashboardAsOfDate(query);
    const [stageProgress, jobCost, profitability, cashBank] = await Promise.all([
      readStages ? new ProjectStagesService(this.db).listStages(projectId) : null,
      readJobCost ? new BudgetsJobCostService(this.db).getJobCost(projectId) : null,
      readProfitability
        ? new ProjectProfitabilityService(this.db).getProjectSummary(projectId, {
            ...(asOfDate ? { asOfDate } : {})
          })
        : null,
      readCashBank
        ? new FinanceService(this.db).listCashBankAccounts({ page: 1, pageSize: 100 })
        : null
    ]);

    return {
      project,
      overallPhysicalProgressPercent: stageProgress?.overallPhysicalProgressPercent ?? null,
      stageProgress,
      budgetVsActual: jobCost?.totals ?? null,
      financialPosition: profitability ? financialPosition(profitability) : null,
      cashBank
    };
  }

  /** Read bounded operational exceptions from source modules without creating Dashboard-owned alert records. */
  async getAlerts(query: DashboardAlertsQuery) {
    const required = query.projectId
      ? ['dashboard.read', 'dashboard.project.read']
      : ['dashboard.read'];
    const scope = await this.requireScope(required, query.projectId);
    const repository = new DashboardRepository(this.db);
    const page = query.projectId ? 1 : query.page ?? 1;
    const pageSize = query.projectId ? 1 : query.pageSize ?? DEFAULT_PROJECT_PAGE_SIZE;
    let projectResult: Awaited<ReturnType<DashboardRepository['listProjects']>>;
    if (query.projectId) {
      const project = await repository.findProjectById(query.projectId, { allowedProjectIds: scope.allowedProjectIds });
      if (!project) throw createDashboardError('DASHBOARD_SCOPE_FORBIDDEN');
      projectResult = { items: [project], total: 1 };
    } else {
      projectResult = await repository.listProjects({
        allowedProjectIds: scope.allowedProjectIds,
        skip: (page - 1) * pageSize,
        take: pageSize
      });
    }

    const asOfDate = dashboardAsOfDate(query) ?? currentDateOnly();
    const alerts: Array<{
      code: 'PROJECT_OVERDUE' | 'STAGE_OVERDUE' | 'BUDGET_OVERRUN' | 'PROJECT_LOSS';
      severity: 'WARNING' | 'CRITICAL';
      sourceModule: 'projects' | 'project-stages' | 'budgets-job-cost' | 'project-profitability';
      projectId: string;
      projectCode: string;
      projectName: string;
      stageId: string | null;
      title: string;
      dueDate: string | null;
      value: string | null;
      currency: string | null;
    }> = [];

    for (const project of projectResult.items) {
      const projectScope = await this.requireScope(['dashboard.read', 'dashboard.project.read'], project.id);
      const plannedEndDate = project.plannedEndDate.toISOString().slice(0, 10);
      if (isOpenProjectStatus(project.status) && isAlertDueDate(plannedEndDate, query.fromDate, asOfDate)) {
        alerts.push({
          code: 'PROJECT_OVERDUE',
          severity: 'WARNING',
          sourceModule: 'projects',
          projectId: project.id,
          projectCode: project.projectCode,
          projectName: project.name,
          stageId: null,
          title: 'Project planned end date has passed.',
          dueDate: plannedEndDate,
          value: null,
          currency: null
        });
      }

      if (projectScope.permissions.includes('stages.read')) {
        const stageProgress = await new ProjectStagesService(this.db).listStages(project.id);
        for (const stage of stageProgress.items) {
          if (
            stage.status !== STAGE_COMPLETED
            && stage.plannedEndDate
            && Number(stage.approvedPhysicalProgressPercent) < 100
            && isAlertDueDate(stage.plannedEndDate, query.fromDate, asOfDate)
          ) {
            alerts.push({
              code: 'STAGE_OVERDUE',
              severity: 'WARNING',
              sourceModule: 'project-stages',
              projectId: project.id,
              projectCode: project.projectCode,
              projectName: project.name,
              stageId: stage.id,
              title: `${stage.name} is past its planned end date.`,
              dueDate: stage.plannedEndDate,
              value: stage.approvedPhysicalProgressPercent,
              currency: null
            });
          }
        }
      }

      if (this.canReadJobCost(projectScope)) {
        const jobCost = await new BudgetsJobCostService(this.db).getJobCost(project.id);
        const budgetCost = moneyToMinorUnits(jobCost.totals.budgetCost);
        const actualCost = moneyToMinorUnits(jobCost.totals.actualCost);
        if (budgetCost > 0n && actualCost > budgetCost) {
          alerts.push({
            code: 'BUDGET_OVERRUN',
            severity: 'CRITICAL',
            sourceModule: 'budgets-job-cost',
            projectId: project.id,
            projectCode: project.projectCode,
            projectName: project.name,
            stageId: null,
            title: 'Actual Project cost is above the frozen budget.',
            dueDate: null,
            value: minorUnitsToMoney(actualCost - budgetCost),
            currency: project.currency
          });
        }
      }

      if (this.canReadProfitability(projectScope)) {
        const profitability = await new ProjectProfitabilityService(this.db).getProjectSummary(project.id, { asOfDate });
        if (moneyToMinorUnits(profitability.profitAmount) < 0n) {
          alerts.push({
            code: 'PROJECT_LOSS',
            severity: 'CRITICAL',
            sourceModule: 'project-profitability',
            projectId: project.id,
            projectCode: project.projectCode,
            projectName: project.name,
            stageId: null,
            title: 'Project profitability is negative.',
            dueDate: null,
            value: profitability.profitAmount,
            currency: project.currency
          });
        }
      }
    }

    return {
      items: alerts,
      alertCount: alerts.length,
      asOfDate,
      page,
      pageSize,
      scannedProjectCount: projectResult.items.length,
      projectTotal: projectResult.total
    };
  }

  /** Save user-owned Dashboard presentation preferences with audit and outbox evidence. */
  async updatePreferences(input: UpdateDashboardPreferencesBody) {
    const parsed = updateDashboardPreferencesBodySchema.parse(input);
    const scope = await this.requireScope(['dashboard.manage_preferences']);
    this.requireRequestedWidgetAccess(scope, parsed.widgetCodes);

    const visibility = { allowedProjectIds: scope.allowedProjectIds } as const;
    if (parsed.defaultProjectId) {
      const project = await new DashboardRepository(this.db).findProjectById(parsed.defaultProjectId, visibility);
      if (!project) throw createDashboardError('DASHBOARD_SCOPE_FORBIDDEN');
    }

    return withTransaction(this.db, async (tx: TransactionClient) => {
      const repository = new DashboardRepository(tx);
      const current = await repository.findPreference(scope.actorUserId);
      const currentPreference = preferenceResponse(current);
      const defaultFilters = parsed.defaultFilters ?? currentPreference?.defaultFilters;
      const layoutJson = {
        widgetCodes: [...(parsed.widgetCodes ?? currentPreference?.widgetCodes ?? DASHBOARD_WIDGET_CODES)],
        ...(defaultFilters ? { defaultFilters } : {})
      };
      const defaultProjectId = parsed.defaultProjectId !== undefined
        ? parsed.defaultProjectId
        : current?.defaultProjectId ?? null;
      const saved = await repository.upsertPreference({
        userId: scope.actorUserId,
        layoutJson,
        defaultProjectId
      });
      const response = preferenceResponse(saved);
      if (!response) throw createDashboardError('INVALID_DASHBOARD_FILTER');

      await recordAudit(tx, {
        action: 'dashboard.preferences_updated',
        entityType: 'dashboard_preference',
        entityId: saved.id,
        before: currentPreference,
        after: response
      });
      await recordOutboxEvent(tx, {
        eventType: 'dashboard.preferences_updated',
        resourceType: 'dashboard_preference',
        resourceId: saved.id,
        payload: response
      });
      return response;
    });
  }
}
