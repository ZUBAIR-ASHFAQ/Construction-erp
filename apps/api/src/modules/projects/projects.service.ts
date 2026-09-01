import { recordAudit } from '@construction-erp/audit';
import {
  withTransaction,
  type DatabaseClient,
  type TransactionClient
} from '@construction-erp/database';
import { AuthorizationError, ValidationError } from '@construction-erp/errors';
import { recordOutboxEvent } from '@construction-erp/outbox';
import {
  hasPermission,
  requireActorUserId,
  requireRequestSecurityContext
} from '@construction-erp/request-context';
import { AdministrationRepository } from '../administration/administration.repository.js';
import { BudgetsJobCostService } from '../budgets-job-cost/budgets-job-cost.service.js';
import { ClientBillingService } from '../client-billing/client-billing.service.js';
import { ClientReceiptsRepository, subtractMoneyAmounts } from '../client-receipts/client-receipts.repository.js';
import { ProjectStagesService } from '../project-stages/project-stages.service.js';
import { ProjectTeamService } from '../project-team/project-team.service.js';
import { ProjectsRepository } from './projects.repository.js';
import {
  createProjectError,
  type CloseProjectBody,
  type CreateProjectBody,
  type ListProjectsQuery,
  type ProjectPermissionCode,
  type ResumeProjectBody,
  type SuspendProjectBody,
  type UpdateProjectBody
} from './projects.schema.js';

const PROJECT_DRAFT = 'DRAFT';
const PROJECT_ACTIVE = 'ACTIVE';
const PROJECT_SUSPENDED = 'SUSPENDED';
const PROJECT_COMPLETED = 'COMPLETED';
const PROJECT_CLOSED = 'CLOSED';
const CLIENT_ACTIVE = 'ACTIVE';
const PROJECT_MODEL_FIXED_PRICE = 'FIXED_PRICE';
const PROJECT_MODEL_COST_PLUS_PERCENTAGE = 'COST_PLUS_PERCENTAGE';
const ASSIGNMENT_ACTIVE = 'ACTIVE';
const ROLE_ACTIVE = 'ACTIVE';

export type ProjectsServiceOptions = Readonly<Record<never, never>>;

type DecimalLike = string | Readonly<{ toString(): string }>;

type ProjectAuditSource = Readonly<{
  projectCode: string;
  name: string;
  clientId: string;
  projectModel: string;
  projectValue: DecimalLike;
  costPlusPercent: DecimalLike | null;
  status: string;
  currency: string;
  startDate: Date;
  plannedEndDate: Date;
  projectManagerUserId: string | null;
  location: string | null;
}>;

/** Return one database date in the stable YYYY-MM-DD form used by Project audit snapshots. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Serialize one persisted decimal without converting it through binary floating point. */
function storedDecimal(value: DecimalLike): string {
  return value.toString();
}

/** Build a compact non-secret Project master snapshot for audit history. */
function projectAuditSnapshot(project: ProjectAuditSource) {
  return {
    projectCode: project.projectCode,
    name: project.name,
    clientId: project.clientId,
    projectModel: project.projectModel,
    projectValue: storedDecimal(project.projectValue),
    costPlusPercent: project.costPlusPercent === null ? null : storedDecimal(project.costPlusPercent),
    status: project.status,
    currency: project.currency,
    startDate: dateOnly(project.startDate),
    plannedEndDate: dateOnly(project.plannedEndDate),
    projectManagerUserId: project.projectManagerUserId,
    location: project.location
  };
}

/** Reject a Project date range whose planned end date is before its start date. */
function assertValidDateRange(startDate: Date, plannedEndDate: Date): void {
  if (plannedEndDate.getTime() < startDate.getTime()) {
    throw new ValidationError({
      fieldErrors: [{
        field: 'plannedEndDate',
        message: 'plannedEndDate cannot precede startDate.'
      }]
    });
  }
}

/** Enforce the final Project commercial model using the merged values that will be persisted. */
function assertValidCommercialModel(
  projectModel: string,
  projectValue: DecimalLike,
  costPlusPercent: DecimalLike | null
): void {
  const value = Number(storedDecimal(projectValue));
  if (!Number.isFinite(value) || value < 0) {
    throw new ValidationError({
      fieldErrors: [{ field: 'projectValue', message: 'projectValue must be a non-negative amount.' }]
    });
  }

  if (projectModel === PROJECT_MODEL_FIXED_PRICE) {
    if (costPlusPercent !== null) {
      throw new ValidationError({
        fieldErrors: [{ field: 'costPlusPercent', message: 'costPlusPercent must be empty for a Fixed Price Project.' }]
      });
    }
    return;
  }

  if (projectModel === PROJECT_MODEL_COST_PLUS_PERCENTAGE) {
    const percent = costPlusPercent === null ? Number.NaN : Number(storedDecimal(costPlusPercent));
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      throw new ValidationError({
        fieldErrors: [{ field: 'costPlusPercent', message: 'costPlusPercent must be greater than 0 and at most 100.' }]
      });
    }
    return;
  }

  throw createProjectError('INVALID_PROJECT_MODEL');
}

/** Recognize Prisma unique-constraint conflicts without exposing Prisma details to API callers. */
function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

/** Final Project Management rules with Project-scope authorization and lifecycle transactions. */
export class ProjectsService {
  /** Bind Project business logic to the application database; close readiness is always repository-owned. */
  constructor(
    private readonly db: DatabaseClient,
    _options: ProjectsServiceOptions = {}
  ) {}

  /** Require one reviewed Project permission from trusted request context. */
  private requirePermission(permission: ProjectPermissionCode): void {
    if (!hasPermission(permission)) throw new AuthorizationError();
  }

  /** Require resolved Project scope and the exact effective permission for one Project. */
  private async requireProjectPermission(
    repository: AdministrationRepository,
    projectId: string,
    permission: ProjectPermissionCode,
    asOf: Date
  ): Promise<readonly string[]> {
    const security = requireRequestSecurityContext();
    const scope = security.projectScope;

    if (scope.kind === 'not-resolved') throw createProjectError('PROJECT_SCOPE_FORBIDDEN');
    if (scope.kind === 'restricted' && !scope.projectIds.includes(projectId)) {
      throw createProjectError('PROJECT_SCOPE_FORBIDDEN');
    }

    const permissions = await repository.findEffectivePermissionCodesForProject(projectId, {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ASSIGNMENT_ACTIVE],
      roleStatuses: [ROLE_ACTIVE]
    });
    if (permissions === null) throw createProjectError('PROJECT_NOT_FOUND');
    if (!permissions.includes(permission)) throw createProjectError('PROJECT_SCOPE_FORBIDDEN');
    return permissions;
  }

  /** Resolve the Project IDs visible in the Project register after exact permission filtering. */
  private async resolveReadableProjectIds(
    repository: AdministrationRepository,
    asOf: Date
  ): Promise<readonly string[] | null> {
    const security = requireRequestSecurityContext();
    const scope = security.projectScope;
    if (scope.kind === 'not-resolved') throw createProjectError('PROJECT_SCOPE_FORBIDDEN');

    if (scope.kind === 'all') {
      return hasPermission('projects.read') ? null : [];
    }

    if (hasPermission('projects.read')) return scope.projectIds;

    return repository.listProjectIdsWithPermission(
      'projects.read',
      scope.projectIds,
      {
        userId: security.actorUserId,
        asOf,
        assignmentStatuses: [ASSIGNMENT_ACTIVE],
        roleStatuses: [ROLE_ACTIVE]
      }
    );
  }

  /** Validate the Project records that must remain active before creation or activation. */
  private async requireActiveProjectReferences(
    repository: ProjectsRepository,
    input: Readonly<{
      clientId: string;
      projectManagerUserId: string | null;
    }>
  ): Promise<void> {
    const client = await repository.findClientById(input.clientId);
    if (!client || client.status !== CLIENT_ACTIVE) {
      throw new ValidationError({
        fieldErrors: [{
          field: 'clientId',
          message: 'Project client must be an active Client in this company.'
        }]
      });
    }

    if (input.projectManagerUserId) {
      const manager = await repository.findProjectManagerById(input.projectManagerUserId);
      if (!manager) {
        throw new ValidationError({
          fieldErrors: [{
            field: 'projectManagerUserId',
            message: 'Project manager must be an active user in this company.'
          }]
        });
      }
    }
  }

  /** List only Projects the authenticated user may read inside resolved Project scope. */
  async listProjects(input: ListProjectsQuery) {
    const now = new Date();
    const allowedProjectIds = await this.resolveReadableProjectIds(new AdministrationRepository(this.db), now);
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const result = await new ProjectsRepository(this.db).listProjects({
      ...(input.search === undefined ? {} : { search: input.search }),
      ...(input.clientId === undefined ? {} : { clientId: input.clientId }),
      ...(input.projectModel === undefined ? {} : { projectModel: input.projectModel }),
      ...(input.status === undefined ? {} : { status: input.status }),
      allowedProjectIds,
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    return {
      items: result.items,
      total: result.total,
      page,
      pageSize
    };
  }

  /** Get one Project with permission-safe summaries owned by the already-built source modules. */
  async getProject(projectId: string) {
    const now = new Date();
    const effectivePermissions = await this.requireProjectPermission(
      new AdministrationRepository(this.db),
      projectId,
      'projects.read',
      now
    );

    const repository = new ProjectsRepository(this.db);
    const project = await repository.findProjectById(projectId);
    if (!project) throw createProjectError('PROJECT_NOT_FOUND');

    const canReadStages = hasPermission('stages.read') || effectivePermissions.includes('stages.read');
    const canReadTeam = hasPermission('project_team.read') || effectivePermissions.includes('project_team.read');
    const canReadBudget = hasPermission('budgets.read') || effectivePermissions.includes('budgets.read');
    const canReadCost = hasPermission('job_cost.read') || effectivePermissions.includes('job_cost.read');
    const canReadBilling = hasPermission('client_billing.read') || effectivePermissions.includes('client_billing.read');
    const canReadReceipts = hasPermission('client_receipts.read') || effectivePermissions.includes('client_receipts.read');

    const [statusHistory, stageSummary, teamSummary, budgetSummary, jobCost, billingSummary, receipts] = await Promise.all([
      repository.listProjectStatusHistory(projectId),
      canReadStages ? new ProjectStagesService(this.db).getProjectSummary(projectId) : Promise.resolve(null),
      canReadTeam ? new ProjectTeamService(this.db).getProjectSummary(projectId) : Promise.resolve(null),
      canReadBudget ? new BudgetsJobCostService(this.db).getBudgetSummary(projectId) : Promise.resolve(null),
      canReadCost ? new BudgetsJobCostService(this.db).getJobCost(projectId) : Promise.resolve(null),
      canReadBilling ? new ClientBillingService(this.db).getProjectSummary(projectId) : Promise.resolve(null),
      canReadReceipts
        ? new ClientReceiptsRepository(this.db).readReceiptFinancialTotals({ projectId })
        : Promise.resolve(null)
    ]);

    const receivedAmount = receipts?.receivedAmount?.toString() ?? null;
    const allocatedAmount = receipts?.allocatedAmount?.toString() ?? null;
    const billedAmount = billingSummary?.billedAmount ?? null;

    return {
      project,
      statusHistory,
      stageSummary,
      teamSummary,
      budgetSummary,
      costSummary: jobCost?.totals ?? null,
      billingSummary,
      receiptSummary: receivedAmount === null || allocatedAmount === null
        ? null
        : {
            receivedAmount,
            allocatedAmount,
            advanceAmount: subtractMoneyAmounts(receivedAmount, allocatedAmount),
            outstandingAmount: billedAmount === null ? null : subtractMoneyAmounts(billedAmount, allocatedAmount)
          }
    };
  }

  /** Create one DRAFT Project after validating its same-company master references. */
  async createProject(input: CreateProjectBody) {
    this.requirePermission('projects.create');
    const actorUserId = requireActorUserId();

    try {
      return await withTransaction(this.db, async (tx) => {
        const repository = new ProjectsRepository(tx);
        const duplicate = await repository.findProjectByCode(input.projectCode);
        if (duplicate) throw createProjectError('DUPLICATE_PROJECT_CODE');

        const costPlusPercent = input.costPlusPercent ?? null;
        assertValidCommercialModel(input.projectModel, input.projectValue, costPlusPercent);
        await this.requireActiveProjectReferences(repository, {
          clientId: input.clientId,
          projectManagerUserId: input.projectManagerUserId ?? null
        });

        const project = await repository.createProject({
          projectCode: input.projectCode,
          name: input.name,
          clientId: input.clientId,
          projectModel: input.projectModel,
          projectValue: input.projectValue,
          costPlusPercent,
          status: PROJECT_DRAFT,
          currency: input.currency,
          startDate: new Date(`${input.startDate}T00:00:00.000Z`),
          plannedEndDate: new Date(`${input.plannedEndDate}T00:00:00.000Z`),
          projectManagerUserId: input.projectManagerUserId ?? null,
          location: input.location ?? null
        });

        await repository.createProjectStatusHistory({
          projectId: project.id,
          fromStatus: null,
          toStatus: PROJECT_DRAFT,
          changedBy: actorUserId,
          reason: null
        });

        await recordAudit(tx, {
          action: 'project.created',
          entityType: 'project',
          entityId: project.id,
          after: projectAuditSnapshot(project)
        });

        await recordOutboxEvent(tx, {
          eventType: 'project.created',
          resourceType: 'project',
          resourceId: project.id,
          payload: {
            projectId: project.id,
            projectCode: project.projectCode,
            clientId: project.clientId,
            projectModel: project.projectModel,
            projectValue: storedDecimal(project.projectValue),
            status: project.status
          }
        });

        return project;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw createProjectError('DUPLICATE_PROJECT_CODE');
      throw error;
    }
  }

  /** Update editable Project master data only after exact Project resource authorization passes. */
  async updateProject(projectId: string, input: UpdateProjectBody) {
    const now = new Date();

    return withTransaction(this.db, async (tx) => {
      const repository = new ProjectsRepository(tx);
      await this.requireProjectPermission(
        new AdministrationRepository(tx),
        projectId,
        'projects.update',
        now
      );
      const locked = await repository.lockProjectForWrite(projectId);
      if (!locked) throw createProjectError('PROJECT_NOT_FOUND');
      if (locked.status === PROJECT_CLOSED) {
        throw createProjectError('INVALID_PROJECT_TRANSITION');
      }

      const before = await repository.findProjectById(projectId);
      if (!before) throw createProjectError('PROJECT_NOT_FOUND');

      const nextStartDate = input.startDate
        ? new Date(`${input.startDate}T00:00:00.000Z`)
        : before.startDate;
      const nextPlannedEndDate = input.plannedEndDate
        ? new Date(`${input.plannedEndDate}T00:00:00.000Z`)
        : before.plannedEndDate;
      assertValidDateRange(nextStartDate, nextPlannedEndDate);

      if (input.clientId !== undefined) {
        const client = await repository.findClientById(input.clientId);
        if (!client || client.status !== CLIENT_ACTIVE) {
          throw new ValidationError({
            fieldErrors: [{
              field: 'clientId',
              message: 'Project client must be an active Client in this company.'
            }]
          });
        }
      }

      if (input.projectManagerUserId !== undefined && input.projectManagerUserId !== null) {
        const manager = await repository.findProjectManagerById(input.projectManagerUserId);
        if (!manager) {
          throw new ValidationError({
            fieldErrors: [{
              field: 'projectManagerUserId',
              message: 'Project manager must be an active user in this company.'
            }]
          });
        }
      }

      const changesStageCommercialBaseline = input.projectModel !== undefined
        || input.projectValue !== undefined
        || input.costPlusPercent !== undefined
        || input.currency !== undefined;
      if (changesStageCommercialBaseline && await repository.hasFrozenStageBaseline(projectId)) {
        throw new ValidationError({
          message: 'Project commercial model, value and currency cannot change after the Project Stage baseline is frozen.'
        });
      }

      const nextProjectModel = input.projectModel ?? before.projectModel;
      const nextProjectValue = input.projectValue ?? before.projectValue;
      const nextCostPlusPercent = input.costPlusPercent !== undefined
        ? input.costPlusPercent
        : input.projectModel === PROJECT_MODEL_FIXED_PRICE
          ? null
          : before.costPlusPercent?.toString() ?? null;
      assertValidCommercialModel(nextProjectModel, nextProjectValue, nextCostPlusPercent);

      const updated = await repository.updateProject(projectId, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.clientId === undefined ? {} : { clientId: input.clientId }),
        ...(input.projectModel === undefined ? {} : { projectModel: input.projectModel }),
        ...(input.projectValue === undefined ? {} : { projectValue: input.projectValue }),
        ...(input.costPlusPercent === undefined && input.projectModel !== PROJECT_MODEL_FIXED_PRICE
          ? {}
          : { costPlusPercent: nextCostPlusPercent }),
        ...(input.currency === undefined ? {} : { currency: input.currency }),
        ...(input.startDate === undefined ? {} : { startDate: nextStartDate }),
        ...(input.plannedEndDate === undefined ? {} : { plannedEndDate: nextPlannedEndDate }),
        ...(input.projectManagerUserId === undefined ? {} : { projectManagerUserId: input.projectManagerUserId }),
        ...(input.location === undefined ? {} : { location: input.location })
      });
      if (!updated) throw createProjectError('PROJECT_NOT_FOUND');

      await recordAudit(tx, {
        action: 'project.updated',
        entityType: 'project',
        entityId: updated.id,
        before: projectAuditSnapshot(before),
        after: projectAuditSnapshot(updated)
      });

      return updated;
    });
  }

  /** Activate one ready DRAFT Project after exact Project resource authorization passes. */
  async activateProject(projectId: string) {
    const actorUserId = requireActorUserId();
    const now = new Date();

    return withTransaction(this.db, async (tx) => {
      const repository = new ProjectsRepository(tx);
      await this.requireProjectPermission(
        new AdministrationRepository(tx),
        projectId,
        'projects.activate',
        now
      );
      const locked = await repository.lockProjectForWrite(projectId);
      if (!locked) throw createProjectError('PROJECT_NOT_FOUND');

      const before = await repository.findProjectById(projectId);
      if (!before) throw createProjectError('PROJECT_NOT_FOUND');
      if (before.status === PROJECT_ACTIVE) return before;
      if (before.status !== PROJECT_DRAFT) {
        throw createProjectError('INVALID_PROJECT_TRANSITION');
      }

      assertValidDateRange(before.startDate, before.plannedEndDate);
      assertValidCommercialModel(before.projectModel, before.projectValue, before.costPlusPercent);
      await this.requireActiveProjectReferences(repository, {
        clientId: before.clientId,
        projectManagerUserId: before.projectManagerUserId
      });

      const updated = await repository.transitionProjectStatus(projectId, PROJECT_DRAFT, PROJECT_ACTIVE);
      if (!updated) throw createProjectError('INVALID_PROJECT_TRANSITION');

      await repository.createProjectStatusHistory({
        projectId,
        fromStatus: PROJECT_DRAFT,
        toStatus: PROJECT_ACTIVE,
        changedBy: actorUserId,
        reason: null
      });

      await recordAudit(tx, {
        action: 'project.activated',
        entityType: 'project',
        entityId: projectId,
        before: { status: PROJECT_DRAFT },
        after: { status: PROJECT_ACTIVE }
      });

      await recordOutboxEvent(tx, {
        eventType: 'project.activated',
        resourceType: 'project',
        resourceId: projectId,
        payload: {
          projectId,
          projectCode: updated.projectCode,
          status: updated.status
        }
      });
      await recordOutboxEvent(tx, {
        eventType: 'project.status_changed',
        resourceType: 'project',
        resourceId: projectId,
        payload: { projectId, fromStatus: PROJECT_DRAFT, toStatus: PROJECT_ACTIVE }
      });

      return updated;
    });
  }

  /** Suspend one ACTIVE Project while preserving lifecycle history and audit evidence. */
  async suspendProject(projectId: string, input: SuspendProjectBody) {
    const actorUserId = requireActorUserId();
    const now = new Date();

    return withTransaction(this.db, async (tx) => {
      const repository = new ProjectsRepository(tx);
      await this.requireProjectPermission(
        new AdministrationRepository(tx),
        projectId,
        'projects.update',
        now
      );
      const locked = await repository.lockProjectForWrite(projectId);
      if (!locked) throw createProjectError('PROJECT_NOT_FOUND');

      const before = await repository.findProjectById(projectId);
      if (!before) throw createProjectError('PROJECT_NOT_FOUND');
      if (before.status === PROJECT_SUSPENDED) return before;
      if (before.status !== PROJECT_ACTIVE) {
        throw createProjectError('INVALID_PROJECT_TRANSITION');
      }

      const updated = await repository.transitionProjectStatus(projectId, PROJECT_ACTIVE, PROJECT_SUSPENDED);
      if (!updated) throw createProjectError('INVALID_PROJECT_TRANSITION');

      await repository.createProjectStatusHistory({
        projectId,
        fromStatus: PROJECT_ACTIVE,
        toStatus: PROJECT_SUSPENDED,
        changedBy: actorUserId,
        reason: input.reason ?? null
      });

      await recordAudit(tx, {
        action: 'project.suspended',
        entityType: 'project',
        entityId: projectId,
        before: { status: PROJECT_ACTIVE },
        after: {
          status: PROJECT_SUSPENDED,
          reason: input.reason ?? null
        }
      });
      await recordOutboxEvent(tx, {
        eventType: 'project.status_changed',
        resourceType: 'project',
        resourceId: projectId,
        payload: {
          projectId,
          fromStatus: PROJECT_ACTIVE,
          toStatus: PROJECT_SUSPENDED,
          reason: input.reason ?? null
        }
      });

      return updated;
    });
  }

  /** Resume one SUSPENDED Project after revalidating the same references required for activation. */
  async resumeProject(projectId: string, input: ResumeProjectBody) {
    const actorUserId = requireActorUserId();
    const now = new Date();

    return withTransaction(this.db, async (tx) => {
      const repository = new ProjectsRepository(tx);
      await this.requireProjectPermission(
        new AdministrationRepository(tx),
        projectId,
        'projects.activate',
        now
      );
      const locked = await repository.lockProjectForWrite(projectId);
      if (!locked) throw createProjectError('PROJECT_NOT_FOUND');

      const before = await repository.findProjectById(projectId);
      if (!before) throw createProjectError('PROJECT_NOT_FOUND');
      if (before.status === PROJECT_ACTIVE) return before;
      if (before.status !== PROJECT_SUSPENDED) {
        throw createProjectError('INVALID_PROJECT_TRANSITION');
      }

      assertValidDateRange(before.startDate, before.plannedEndDate);
      assertValidCommercialModel(before.projectModel, before.projectValue, before.costPlusPercent);
      await this.requireActiveProjectReferences(repository, {
        clientId: before.clientId,
        projectManagerUserId: before.projectManagerUserId
      });

      const updated = await repository.transitionProjectStatus(projectId, PROJECT_SUSPENDED, PROJECT_ACTIVE);
      if (!updated) throw createProjectError('INVALID_PROJECT_TRANSITION');

      await repository.createProjectStatusHistory({
        projectId,
        fromStatus: PROJECT_SUSPENDED,
        toStatus: PROJECT_ACTIVE,
        changedBy: actorUserId,
        reason: input.reason ?? null
      });

      await recordAudit(tx, {
        action: 'project.resumed',
        entityType: 'project',
        entityId: projectId,
        before: { status: PROJECT_SUSPENDED },
        after: {
          status: PROJECT_ACTIVE,
          reason: input.reason ?? null
        }
      });
      await recordOutboxEvent(tx, {
        eventType: 'project.status_changed',
        resourceType: 'project',
        resourceId: projectId,
        payload: {
          projectId,
          fromStatus: PROJECT_SUSPENDED,
          toStatus: PROJECT_ACTIVE,
          reason: input.reason ?? null
        }
      });

      return updated;
    });
  }

  /** Mark one ACTIVE Project complete after exact Project resource authorization passes. */
  async completeProject(projectId: string) {
    const actorUserId = requireActorUserId();
    const now = new Date();

    return withTransaction(this.db, async (tx) => {
      const repository = new ProjectsRepository(tx);
      await this.requireProjectPermission(
        new AdministrationRepository(tx),
        projectId,
        'projects.complete',
        now
      );
      const locked = await repository.lockProjectForWrite(projectId);
      if (!locked) throw createProjectError('PROJECT_NOT_FOUND');

      const before = await repository.findProjectById(projectId);
      if (!before) throw createProjectError('PROJECT_NOT_FOUND');
      if (before.status === PROJECT_COMPLETED) return before;
      if (before.status !== PROJECT_ACTIVE) {
        throw createProjectError('INVALID_PROJECT_TRANSITION');
      }

      const updated = await repository.transitionProjectStatus(projectId, PROJECT_ACTIVE, PROJECT_COMPLETED);
      if (!updated) throw createProjectError('INVALID_PROJECT_TRANSITION');

      await repository.createProjectStatusHistory({
        projectId,
        fromStatus: PROJECT_ACTIVE,
        toStatus: PROJECT_COMPLETED,
        changedBy: actorUserId,
        reason: null
      });

      await recordAudit(tx, {
        action: 'project.completed',
        entityType: 'project',
        entityId: projectId,
        before: { status: PROJECT_ACTIVE },
        after: { status: PROJECT_COMPLETED }
      });

      await recordOutboxEvent(tx, {
        eventType: 'project.completed',
        resourceType: 'project',
        resourceId: projectId,
        payload: {
          projectId,
          projectCode: updated.projectCode,
          status: updated.status
        }
      });
      await recordOutboxEvent(tx, {
        eventType: 'project.status_changed',
        resourceType: 'project',
        resourceId: projectId,
        payload: { projectId, fromStatus: PROJECT_ACTIVE, toStatus: PROJECT_COMPLETED }
      });

      return updated;
    });
  }

  /** Close one COMPLETED Project after exact Project authorization and readiness checks pass. */
  async closeProject(projectId: string, input: CloseProjectBody) {
    const actorUserId = requireActorUserId();
    const now = new Date();

    return withTransaction(this.db, async (tx) => {
      const repository = new ProjectsRepository(tx);
      await this.requireProjectPermission(
        new AdministrationRepository(tx),
        projectId,
        'projects.close',
        now
      );
      const locked = await repository.lockProjectForWrite(projectId);
      if (!locked) throw createProjectError('PROJECT_NOT_FOUND');

      const before = await repository.findProjectById(projectId);
      if (!before) throw createProjectError('PROJECT_NOT_FOUND');
      if (before.status === PROJECT_CLOSED) return before;
      if (before.status !== PROJECT_COMPLETED) {
        throw createProjectError('INVALID_PROJECT_TRANSITION');
      }

      if (!(await repository.isProjectReadyToClose(projectId))) {
        throw createProjectError('PROJECT_NOT_READY');
      }

      const updated = await repository.transitionProjectStatus(projectId, PROJECT_COMPLETED, PROJECT_CLOSED);
      if (!updated) throw createProjectError('INVALID_PROJECT_TRANSITION');

      await repository.createProjectStatusHistory({
        projectId,
        fromStatus: PROJECT_COMPLETED,
        toStatus: PROJECT_CLOSED,
        changedBy: actorUserId,
        reason: input.reason ?? null
      });

      await recordAudit(tx, {
        action: 'project.closed',
        entityType: 'project',
        entityId: projectId,
        before: { status: PROJECT_COMPLETED },
        after: {
          status: PROJECT_CLOSED,
          reason: input.reason ?? null
        }
      });

      await recordOutboxEvent(tx, {
        eventType: 'project.closed',
        resourceType: 'project',
        resourceId: projectId,
        payload: {
          projectId,
          projectCode: updated.projectCode,
          status: updated.status
        }
      });
      await recordOutboxEvent(tx, {
        eventType: 'project.status_changed',
        resourceType: 'project',
        resourceId: projectId,
        payload: {
          projectId,
          fromStatus: PROJECT_COMPLETED,
          toStatus: PROJECT_CLOSED,
          reason: input.reason ?? null
        }
      });

      return updated;
    });
  }
}
