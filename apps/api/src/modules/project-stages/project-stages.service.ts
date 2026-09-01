import { recordAudit } from '@construction-erp/audit';
import { executeIdempotentCommand } from '@construction-erp/idempotency';
import { recordOutboxEvent } from '@construction-erp/outbox';
import {
  type DatabaseClient,
  type TransactionClient
} from '@construction-erp/database';
import { ValidationError } from '@construction-erp/errors';
import {
  requireActorUserId,
  requireRequestSecurityContext
} from '@construction-erp/request-context';
import { AdministrationRepository } from '../administration/administration.repository.js';
import { ClientReceiptsRepository, subtractMoneyAmounts } from '../client-receipts/client-receipts.repository.js';
import { ProjectStagesRepository } from './project-stages.repository.js';
import {
  createStageError,
  type CreateProjectStageBody,
  type CreateStageProgressBody,
  type StagePermissionCode,
  type UpdateProjectStageBody
} from './project-stages.schema.js';

const PROJECT_ACTIVE = 'ACTIVE';
const PROJECT_DRAFT = 'DRAFT';
const PROJECT_MODEL_FIXED_PRICE = 'FIXED_PRICE';
const BASELINE_FROZEN = 'FROZEN';
const STAGE_DRAFT = 'DRAFT';
const STAGE_ACTIVE = 'ACTIVE';
const STAGE_COMPLETED = 'COMPLETED';
const PROGRESS_APPROVED = 'APPROVED';
const ASSIGNMENT_ACTIVE = 'ACTIVE';
const ROLE_ACTIVE = 'ACTIVE';
const PERCENT_SCALE = 10_000n;
const HUNDRED_PERCENT_UNITS = 1_000_000n;

type DecimalLike = string | Readonly<{ toString(): string }>;
type ProjectStageAccessPermission = StagePermissionCode | 'documents.read';

/** Convert one persisted date to the stable date-only API form. */
function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** Convert one exact percentage string or Decimal into 4-decimal integer units. */
function percentToUnits(value: DecimalLike): bigint {
  const text = value.toString();
  const match = /^(\d{1,3})(?:\.(\d{1,4}))?$/.exec(text);
  if (!match) throw new ValidationError({ message: 'Invalid percentage value.' });
  const whole = BigInt(match[1] ?? '0');
  const fraction = BigInt((match[2] ?? '').padEnd(4, '0'));
  return (whole * PERCENT_SCALE) + fraction;
}

/** Format 4-decimal percentage units without binary floating-point conversion. */
function percentFromUnits(value: bigint): string {
  const whole = value / PERCENT_SCALE;
  const fraction = (value % PERCENT_SCALE).toString().padStart(4, '0');
  return `${whole}.${fraction}`;
}

/** Convert one exact money Decimal into integer cents. */
function moneyToMinorUnits(value: DecimalLike): bigint {
  const text = value.toString();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new ValidationError({ message: 'Invalid money value.' });
  return (BigInt(match[1] ?? '0') * 100n) + BigInt((match[2] ?? '').padEnd(2, '0'));
}

/** Format integer cents as an exact two-decimal money string. */
function moneyFromMinorUnits(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

/** Derive the Fixed Price planned Stage amount from Project value and Stage weight. */
function derivePlannedAmount(projectModel: string, projectValue: DecimalLike, weightPercent: DecimalLike): string | null {
  if (projectModel !== PROJECT_MODEL_FIXED_PRICE) return null;
  const product = moneyToMinorUnits(projectValue) * percentToUnits(weightPercent);
  const rounded = (product + (HUNDRED_PERCENT_UNITS / 2n)) / HUNDRED_PERCENT_UNITS;
  return moneyFromMinorUnits(rounded);
}

/** Build one safe Stage API object without exposing Company ownership. */
function stageResponse(stage: Readonly<{
  id: string;
  projectId: string;
  code: string;
  name: string;
  sequenceNo: number;
  weightPercent: DecimalLike;
  plannedAmount: DecimalLike | null;
  plannedStartDate: Date | null;
  plannedEndDate: Date | null;
  actualStartDate: Date | null;
  actualEndDate: Date | null;
  status: string;
}>) {
  return {
    id: stage.id,
    projectId: stage.projectId,
    code: stage.code,
    name: stage.name,
    sequenceNo: stage.sequenceNo,
    weightPercent: stage.weightPercent.toString(),
    plannedAmount: stage.plannedAmount?.toString() ?? null,
    plannedStartDate: dateOnly(stage.plannedStartDate),
    plannedEndDate: dateOnly(stage.plannedEndDate),
    actualStartDate: dateOnly(stage.actualStartDate),
    actualEndDate: dateOnly(stage.actualEndDate),
    status: stage.status
  };
}

/** Build one safe physical-progress history object. */
function progressResponse(update: Readonly<{
  id: string;
  stageId: string;
  progressPercent: DecimalLike;
  progressDate: Date;
  note: string | null;
  evidenceDocumentId: string | null;
  enteredBy: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  status: string;
  createdAt: Date;
}>) {
  return {
    id: update.id,
    stageId: update.stageId,
    progressPercent: update.progressPercent.toString(),
    progressDate: dateOnly(update.progressDate),
    note: update.note,
    evidenceDocumentId: update.evidenceDocumentId,
    enteredBy: update.enteredBy,
    approvedBy: update.approvedBy,
    approvedAt: update.approvedAt?.toISOString() ?? null,
    status: update.status,
    createdAt: update.createdAt.toISOString()
  };
}

/** Build one compact frozen baseline response. */
function baselineResponse(baseline: Readonly<{
  id: string;
  projectId: string;
  versionNo: number;
  status: string;
  totalWeightPercent: DecimalLike;
  frozenAt: Date | null;
  frozenBy: string | null;
}> | null) {
  if (!baseline) return null;
  return {
    id: baseline.id,
    projectId: baseline.projectId,
    versionNo: baseline.versionNo,
    status: baseline.status,
    totalWeightPercent: baseline.totalWeightPercent.toString(),
    frozenAt: baseline.frozenAt?.toISOString() ?? null,
    frozenBy: baseline.frozenBy
  };
}

/** Recognize a Prisma unique conflict without leaking Prisma details. */
function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

/** Convert one request date-only string into a stable UTC Date. */
function inputDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Final Module 7 business logic for Stage baseline, progress and Stage financial visibility. */
export class ProjectStagesService {
  /** Bind Project Stage rules to the database. */
  constructor(private readonly db: DatabaseClient) {}

  /** Require resolved Project scope and the effective Stage permission for one Project. */
  private async requireProjectPermission(
    repository: AdministrationRepository,
    projectId: string,
    permission: ProjectStageAccessPermission,
    asOf: Date
  ): Promise<readonly string[]> {
    const security = requireRequestSecurityContext();
    const scope = security.projectScope;
    if (scope.kind === 'not-resolved') throw createStageError('STAGE_SCOPE_FORBIDDEN');
    if (scope.kind === 'restricted' && !scope.projectIds.includes(projectId)) {
      throw createStageError('STAGE_SCOPE_FORBIDDEN');
    }

    const permissions = await repository.findEffectivePermissionCodesForProject(projectId, {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ASSIGNMENT_ACTIVE],
      roleStatuses: [ROLE_ACTIVE]
    });
    if (permissions === null) throw createStageError('STAGE_NOT_FOUND');
    if (!permissions.includes(permission)) throw createStageError('STAGE_SCOPE_FORBIDDEN');
    return permissions;
  }

  /** Require a Project lifecycle that still accepts Stage planning changes. */
  private requireStagePlanningProject(project: Readonly<{ status: string }>): void {
    if (project.status !== PROJECT_DRAFT && project.status !== PROJECT_ACTIVE) {
      throw createStageError('STAGE_BASELINE_LOCKED');
    }
  }

  /** Read source-derived Stage cost, billing and receipt values without persisting summary totals. */
  private async readStageFinancials(repository: ProjectStagesRepository, projectId: string, stageId: string, plannedAmount: DecimalLike | null) {
    const [actual, billed, receipts] = await Promise.all([
      repository.sumStageActualCost(projectId, stageId),
      repository.sumStageBilled(projectId, stageId),
      new ClientReceiptsRepository(this.db).readReceiptFinancialTotals({ projectId, stageId })
    ]);
    const actualCost = actual._sum.amount?.toString() ?? '0.00';
    const billedAmount = billed._sum.amount?.toString() ?? '0.00';
    const receivedAmount = receipts.receivedAmount?.toString() ?? '0.00';
    const allocatedReceiptAmount = receipts.allocatedAmount?.toString() ?? '0.00';
    return {
      plannedAmount: plannedAmount?.toString() ?? null,
      actualCost,
      billedAmount,
      receivedAmount,
      allocatedReceiptAmount,
      advanceAmount: subtractMoneyAmounts(receivedAmount, allocatedReceiptAmount),
      outstandingAmount: subtractMoneyAmounts(billedAmount, allocatedReceiptAmount)
    };
  }

  /** Calculate deterministic weighted overall Project progress from the latest approved row of each Stage. */
  private calculateOverallProgress(stages: readonly Readonly<{ id: string; weightPercent: DecimalLike }>[], approvedUpdates: readonly Readonly<{ stageId: string; progressPercent: DecimalLike }>[]): string {
    const latestByStage = new Map<string, DecimalLike>();
    for (const update of approvedUpdates) {
      if (!latestByStage.has(update.stageId)) latestByStage.set(update.stageId, update.progressPercent);
    }

    let weightedUnits = 0n;
    for (const stage of stages) {
      const progress = latestByStage.get(stage.id) ?? '0.0000';
      weightedUnits += (percentToUnits(stage.weightPercent) * percentToUnits(progress)) / HUNDRED_PERCENT_UNITS;
    }
    return percentFromUnits(weightedUnits);
  }

  /** Read the compact Stage baseline and weighted physical-progress summary used by Project detail. */
  async getProjectSummary(projectId: string) {
    await this.requireProjectPermission(
      new AdministrationRepository(this.db),
      projectId,
      'stages.read',
      new Date()
    );
    const repository = new ProjectStagesRepository(this.db);
    const project = await repository.findProject(projectId);
    if (!project) throw createStageError('STAGE_NOT_FOUND');

    const [stages, baseline, approvedUpdates] = await Promise.all([
      repository.listStages(projectId),
      repository.findLatestBaseline(projectId),
      repository.listApprovedProgress(projectId)
    ]);

    return {
      stageCount: stages.length,
      baselineStatus: baseline?.status ?? null,
      totalWeightPercent: baseline?.totalWeightPercent?.toString() ?? null,
      overallPhysicalProgressPercent: this.calculateOverallProgress(stages, approvedUpdates)
    };
  }

  /** List Stage setup, approved physical progress and permission-safe Stage financial summaries. */
  async listStages(projectId: string) {
    const effectivePermissions = await this.requireProjectPermission(
      new AdministrationRepository(this.db),
      projectId,
      'stages.read',
      new Date()
    );
    const repository = new ProjectStagesRepository(this.db);
    const project = await repository.findProject(projectId);
    if (!project) throw createStageError('STAGE_NOT_FOUND');

    const [stages, baseline, progressUpdates, approvedUpdates] = await Promise.all([
      repository.listStages(projectId),
      repository.findLatestBaseline(projectId),
      repository.listProgressUpdates(projectId),
      repository.listApprovedProgress(projectId)
    ]);
    const latestByStage = new Map<string, typeof approvedUpdates[number]>();
    for (const update of approvedUpdates) {
      if (!latestByStage.has(update.stageId)) latestByStage.set(update.stageId, update);
    }

    const includeFinancials = effectivePermissions.includes('stages.financial.read');
    const includeEvidenceIds = effectivePermissions.includes('documents.read');
    const items = await Promise.all(stages.map(async (stage) => ({
      ...stageResponse(stage),
      approvedPhysicalProgressPercent: latestByStage.get(stage.id)?.progressPercent.toString() ?? '0.0000',
      progressUpdates: progressUpdates
        .filter((update) => update.stageId === stage.id)
        .map((update) => ({
          ...progressResponse(update),
          evidenceDocumentId: includeEvidenceIds ? update.evidenceDocumentId : null
        })),
      financials: includeFinancials
        ? await this.readStageFinancials(repository, projectId, stage.id, stage.plannedAmount)
        : null
    })));

    return {
      projectId,
      baseline: baselineResponse(baseline),
      overallPhysicalProgressPercent: this.calculateOverallProgress(stages, approvedUpdates),
      items
    };
  }

  /** Create one draft Stage exactly once before the Project baseline is frozen. */
  async createStage(projectId: string, input: CreateProjectStageBody, idempotencyKey: string) {
    try {
      const result = await executeIdempotentCommand(
        this.db,
        { operation: 'project-stages.create', idempotencyKey, fingerprintInput: { projectId, input } },
        async (tx) => this.createStageOnce(tx, projectId, input)
      );
      return result.response.body;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ValidationError({ message: 'Stage code and sequence number must be unique inside the Project.' });
      }
      throw error;
    }
  }

  /** Persist one draft Stage with derived Fixed Price planned value, audit and outbox evidence. */
  private async createStageOnce(tx: TransactionClient, projectId: string, input: CreateProjectStageBody) {
    await this.requireProjectPermission(new AdministrationRepository(tx), projectId, 'stages.manage', new Date());
    const repository = new ProjectStagesRepository(tx);
    await repository.lockProjectForStageWrite(projectId);
    const project = await repository.findProject(projectId);
    if (!project) throw createStageError('STAGE_NOT_FOUND');
    this.requireStagePlanningProject(project);
    if (await repository.findLatestBaseline(projectId)) throw createStageError('STAGE_BASELINE_LOCKED');

    const plannedAmount = derivePlannedAmount(project.projectModel, project.projectValue, input.weightPercent);
    const stage = await repository.createStage({
      projectId,
      code: input.code,
      name: input.name,
      sequenceNo: input.sequenceNo,
      weightPercent: input.weightPercent,
      plannedAmount,
      plannedStartDate: input.plannedStartDate ? inputDate(input.plannedStartDate) : null,
      plannedEndDate: input.plannedEndDate ? inputDate(input.plannedEndDate) : null
    });
    const response = stageResponse(stage);
    await recordAudit(tx, { action: 'project_stage.created', entityType: 'project_stage', entityId: stage.id, projectId, stageId: stage.id, after: response });
    await recordOutboxEvent(tx, { eventType: 'project_stage.created', resourceType: 'project_stage', resourceId: stage.id, payload: { projectId, stageId: stage.id, code: stage.code, weightPercent: stage.weightPercent.toString() } });
    return { statusCode: 201, body: response };
  }

  /** Update one draft Stage exactly once before baseline freeze. */
  async updateStage(projectId: string, stageId: string, input: UpdateProjectStageBody, idempotencyKey: string) {
    try {
      const result = await executeIdempotentCommand(
        this.db,
        { operation: 'project-stages.update', idempotencyKey, fingerprintInput: { projectId, stageId, input } },
        async (tx) => this.updateStageOnce(tx, projectId, stageId, input)
      );
      return result.response.body;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ValidationError({ message: 'Stage code and sequence number must be unique inside the Project.' });
      }
      throw error;
    }
  }

  /** Persist one draft Stage planning edit while recalculating its server-owned planned amount. */
  private async updateStageOnce(tx: TransactionClient, projectId: string, stageId: string, input: UpdateProjectStageBody) {
    await this.requireProjectPermission(new AdministrationRepository(tx), projectId, 'stages.manage', new Date());
    const repository = new ProjectStagesRepository(tx);
    await repository.lockProjectForStageWrite(projectId);
    const project = await repository.findProject(projectId);
    if (!project) throw createStageError('STAGE_NOT_FOUND');
    this.requireStagePlanningProject(project);
    if (await repository.findLatestBaseline(projectId)) throw createStageError('STAGE_BASELINE_LOCKED');
    const before = await repository.findStage(projectId, stageId);
    if (!before) throw createStageError('STAGE_NOT_FOUND');
    if (before.status !== STAGE_DRAFT) throw createStageError('STAGE_BASELINE_LOCKED');

    const weight = input.weightPercent ?? before.weightPercent.toString();
    const updated = await repository.updateDraftStage(projectId, stageId, {
      ...(input.code === undefined ? {} : { code: input.code }),
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.sequenceNo === undefined ? {} : { sequenceNo: input.sequenceNo }),
      ...(input.weightPercent === undefined ? {} : { weightPercent: input.weightPercent }),
      plannedAmount: derivePlannedAmount(project.projectModel, project.projectValue, weight),
      ...(input.plannedStartDate === undefined ? {} : { plannedStartDate: input.plannedStartDate ? inputDate(input.plannedStartDate) : null }),
      ...(input.plannedEndDate === undefined ? {} : { plannedEndDate: input.plannedEndDate ? inputDate(input.plannedEndDate) : null })
    });
    if (!updated) throw createStageError('STAGE_NOT_FOUND');
    const response = stageResponse(updated);
    await recordAudit(tx, { action: 'project_stage.updated', entityType: 'project_stage', entityId: stageId, projectId, stageId, before: stageResponse(before), after: response });
    return { statusCode: 200, body: response };
  }

  /** Freeze the exact 100.0000-percent Stage baseline exactly once. */
  async freezeBaseline(projectId: string, idempotencyKey: string) {
    const result = await executeIdempotentCommand(
      this.db,
      { operation: 'project-stages.baseline.freeze', idempotencyKey, fingerprintInput: { projectId } },
      async (tx) => this.freezeBaselineOnce(tx, projectId)
    );
    return result.response.body;
  }

  /** Validate and persist the first frozen baseline without modifying Stage weights afterwards. */
  private async freezeBaselineOnce(tx: TransactionClient, projectId: string) {
    await this.requireProjectPermission(new AdministrationRepository(tx), projectId, 'stages.baseline.freeze', new Date());
    const repository = new ProjectStagesRepository(tx);
    await repository.lockProjectForStageWrite(projectId);
    const project = await repository.findProject(projectId);
    if (!project) throw createStageError('STAGE_NOT_FOUND');
    this.requireStagePlanningProject(project);
    const existing = await repository.findLatestBaseline(projectId);
    if (existing) {
      if (existing.status === BASELINE_FROZEN) return { statusCode: 200, body: baselineResponse(existing) };
      throw createStageError('STAGE_BASELINE_LOCKED');
    }

    const totals = await repository.sumStageWeights(projectId);
    if (totals._count.id < 1 || percentToUnits(totals._sum.weightPercent?.toString() ?? '0') !== HUNDRED_PERCENT_UNITS) {
      throw createStageError('STAGE_WEIGHT_TOTAL_INVALID');
    }

    const stages = await repository.listStages(projectId);
    for (const stage of stages) {
      await repository.updateDraftStage(projectId, stage.id, {
        plannedAmount: derivePlannedAmount(project.projectModel, project.projectValue, stage.weightPercent)
      });
    }

    const now = new Date();
    await repository.activateDraftStages(projectId);
    const baseline = await repository.createFrozenBaseline(projectId, 1, requireActorUserId(), now);
    if (!baseline) throw createStageError('STAGE_NOT_FOUND');
    const response = baselineResponse(baseline);
    await recordAudit(tx, { action: 'project_stage.baseline_frozen', entityType: 'stage_progress_baseline', entityId: baseline.id, projectId, after: response ?? {} });
    await recordOutboxEvent(tx, { eventType: 'project_stage.baseline_frozen', resourceType: 'stage_progress_baseline', resourceId: baseline.id, payload: { projectId, versionNo: baseline.versionNo, totalWeightPercent: baseline.totalWeightPercent.toString() } });
    return { statusCode: 201, body: response };
  }

  /** Record one submitted physical-progress update exactly once. */
  async recordProgress(projectId: string, stageId: string, input: CreateStageProgressBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(
      this.db,
      { operation: 'project-stages.progress.record', idempotencyKey, fingerprintInput: { projectId, stageId, input } },
      async (tx) => this.recordProgressOnce(tx, projectId, stageId, input)
    );
    return result.response.body;
  }

  /** Append physical progress only after baseline, Stage and evidence authorization checks. */
  private async recordProgressOnce(tx: TransactionClient, projectId: string, stageId: string, input: CreateStageProgressBody) {
    await this.requireProjectPermission(new AdministrationRepository(tx), projectId, 'stages.progress.update', new Date());
    const repository = new ProjectStagesRepository(tx);
    const project = await repository.findProject(projectId);
    if (!project) throw createStageError('STAGE_NOT_FOUND');
    if (project.status !== PROJECT_ACTIVE) throw createStageError('INVALID_STAGE_PROGRESS');
    const baseline = await repository.findLatestBaseline(projectId);
    if (!baseline || baseline.status !== BASELINE_FROZEN) throw createStageError('INVALID_STAGE_PROGRESS');
    const stage = await repository.findStage(projectId, stageId);
    if (!stage) throw createStageError('STAGE_NOT_FOUND');
    if (stage.status !== STAGE_ACTIVE && stage.status !== STAGE_COMPLETED) throw createStageError('INVALID_STAGE_PROGRESS');

    if (input.evidenceDocumentId) {
      await this.requireProjectPermission(new AdministrationRepository(tx), projectId, 'documents.read', new Date());
      const evidence = await repository.findProjectEvidenceDocument(projectId, input.evidenceDocumentId);
      if (!evidence) {
        throw new ValidationError({ fieldErrors: [{ field: 'evidenceDocumentId', message: 'Evidence Document must belong to this Company and Project.' }] });
      }
    }

    const update = await repository.createProgressUpdate({
      stageId,
      progressPercent: input.progressPercent,
      progressDate: inputDate(input.progressDate),
      note: input.note ?? null,
      evidenceDocumentId: input.evidenceDocumentId ?? null,
      enteredBy: requireActorUserId()
    });
    const response = progressResponse(update);
    await recordAudit(tx, { action: 'project_stage.progress_recorded', entityType: 'stage_progress_update', entityId: update.id, projectId, stageId, after: response });
    await recordOutboxEvent(tx, { eventType: 'project_stage.progress_recorded', resourceType: 'stage_progress_update', resourceId: update.id, payload: { projectId, stageId, progressPercent: update.progressPercent.toString(), progressDate: dateOnly(update.progressDate) } });
    return { statusCode: 201, body: response };
  }

  /** Approve one submitted physical-progress update exactly once. */
  async approveProgress(projectId: string, stageId: string, updateId: string, idempotencyKey: string) {
    const result = await executeIdempotentCommand(
      this.db,
      { operation: 'project-stages.progress.approve', idempotencyKey, fingerprintInput: { projectId, stageId, updateId } },
      async (tx) => this.approveProgressOnce(tx, projectId, stageId, updateId)
    );
    return result.response.body;
  }

  /** Enforce chronological/non-decreasing approval, with an audited note required for authorized corrections. */
  private async approveProgressOnce(tx: TransactionClient, projectId: string, stageId: string, updateId: string) {
    await this.requireProjectPermission(new AdministrationRepository(tx), projectId, 'stages.progress.approve', new Date());
    const repository = new ProjectStagesRepository(tx);
    await repository.lockStage(projectId, stageId);
    const update = await repository.findProgressUpdate(projectId, stageId, updateId);
    if (!update) throw createStageError('STAGE_NOT_FOUND');
    if (update.status === PROGRESS_APPROVED) return { statusCode: 200, body: progressResponse(update) };
    if (update.status !== 'SUBMITTED') throw createStageError('INVALID_STAGE_PROGRESS');

    const latest = await repository.findLatestApprovedProgress(projectId, stageId);
    if (latest) {
      if (update.progressDate < latest.progressDate) throw createStageError('INVALID_STAGE_PROGRESS');
      const isDecrease = percentToUnits(update.progressPercent) < percentToUnits(latest.progressPercent);
      if (isDecrease && !update.note?.trim()) throw createStageError('INVALID_STAGE_PROGRESS');
    }

    const now = new Date();
    const approved = await repository.approveProgressUpdate(projectId, stageId, updateId, requireActorUserId(), now);
    if (!approved) throw createStageError('INVALID_STAGE_PROGRESS');
    const response = progressResponse(approved);
    await recordAudit(tx, { action: 'project_stage.progress_approved', entityType: 'stage_progress_update', entityId: updateId, projectId, stageId, before: progressResponse(update), after: response });
    await recordOutboxEvent(tx, { eventType: 'project_stage.progress_approved', resourceType: 'stage_progress_update', resourceId: updateId, payload: { projectId, stageId, progressPercent: approved.progressPercent.toString() } });

    const approvedUnits = percentToUnits(approved.progressPercent);
    if (approvedUnits > 0n) {
      await repository.startStageIfNeeded(projectId, stageId, approved.progressDate);
    }

    if (approvedUnits === HUNDRED_PERCENT_UNITS) {
      const completed = await repository.completeStage(projectId, stageId, approved.progressDate);
      if (completed) {
        await recordAudit(tx, { action: 'project_stage.completed', entityType: 'project_stage', entityId: stageId, projectId, stageId, after: { projectId, stageId, status: STAGE_COMPLETED, actualEndDate: dateOnly(approved.progressDate) } });
        await recordOutboxEvent(tx, { eventType: 'project_stage.completed', resourceType: 'project_stage', resourceId: stageId, payload: { projectId, stageId } });
      }
    } else {
      await repository.reopenCompletedStage(projectId, stageId);
    }
    return { statusCode: 200, body: response };
  }

  /** Read one Stage's value/cost/billed/received/outstanding view without writing source totals. */
  async getStageFinancials(projectId: string, stageId: string) {
    await this.requireProjectPermission(new AdministrationRepository(this.db), projectId, 'stages.financial.read', new Date());
    const repository = new ProjectStagesRepository(this.db);
    const stage = await repository.findStage(projectId, stageId);
    if (!stage) throw createStageError('STAGE_NOT_FOUND');
    return {
      projectId,
      stageId,
      ...await this.readStageFinancials(repository, projectId, stageId, stage.plannedAmount)
    };
  }
}
