import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';

type RepositoryClient = DatabaseClient | TransactionClient;

export type CreateProjectStageRepositoryInput = Readonly<{
  projectId: string;
  code: string;
  name: string;
  sequenceNo: number;
  weightPercent: string;
  plannedAmount?: string | null;
  plannedStartDate?: Date | null;
  plannedEndDate?: Date | null;
}>;

export type UpdateProjectStageRepositoryInput = Readonly<{
  code?: string;
  name?: string;
  sequenceNo?: number;
  weightPercent?: string;
  plannedAmount?: string | null;
  plannedStartDate?: Date | null;
  plannedEndDate?: Date | null;
}>;

/** Final Module 7 persistence with mandatory company and Project scoping. */
export class ProjectStagesRepository {
  /** Bind Stage persistence to Prisma or one active transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /** Find one Project only inside the authenticated Company. */
  async findProject(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.project.findFirst({ where: scope.where({ id: projectId }) });
  }

  /** Lock one Project before baseline-sensitive Stage writes. */
  async lockProjectForStageWrite(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{
      id: string;
      status: string;
      project_model: string;
      project_value: unknown;
    }>>`
      SELECT id, status, project_model, project_value
      FROM projects
      WHERE id = ${projectId}::uuid
        AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** List ordered Project Stages only inside the authenticated Company. */
  async listStages(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.projectStage.findMany({
      where: scope.where({ projectId }),
      orderBy: [{ sequenceNo: 'asc' }, { id: 'asc' }]
    });
  }

  /** Find one Stage only when both Project and Company match. */
  async findStage(projectId: string, stageId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.projectStage.findFirst({ where: scope.where({ id: stageId, projectId }) });
  }

  /** Lock one Stage before approval or draft-plan mutation. */
  async lockStage(projectId: string, stageId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id, status
      FROM project_stages
      WHERE id = ${stageId}::uuid
        AND project_id = ${projectId}::uuid
        AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Create one draft Project Stage after service validation. */
  async createStage(input: CreateProjectStageRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    return this.db.projectStage.create({
      data: scope.createData({
        projectId: input.projectId,
        code: input.code,
        name: input.name,
        sequenceNo: input.sequenceNo,
        weightPercent: input.weightPercent,
        plannedAmount: input.plannedAmount ?? null,
        plannedStartDate: input.plannedStartDate ?? null,
        plannedEndDate: input.plannedEndDate ?? null,
        actualStartDate: null,
        actualEndDate: null,
        status: 'DRAFT'
      })
    });
  }

  /** Update one draft Stage without changing ownership or lifecycle directly. */
  async updateDraftStage(projectId: string, stageId: string, input: UpdateProjectStageRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const result = await this.db.projectStage.updateMany({
      where: scope.where({ id: stageId, projectId, status: 'DRAFT' }),
      data: {
        ...(input.code === undefined ? {} : { code: input.code }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.sequenceNo === undefined ? {} : { sequenceNo: input.sequenceNo }),
        ...(input.weightPercent === undefined ? {} : { weightPercent: input.weightPercent }),
        ...(input.plannedAmount === undefined ? {} : { plannedAmount: input.plannedAmount }),
        ...(input.plannedStartDate === undefined ? {} : { plannedStartDate: input.plannedStartDate }),
        ...(input.plannedEndDate === undefined ? {} : { plannedEndDate: input.plannedEndDate })
      }
    });
    if (result.count !== 1) return null;
    return this.findStage(projectId, stageId);
  }

  /** Return the latest frozen baseline metadata for one Company Project. */
  async findLatestBaseline(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.stageProgressBaseline.findFirst({
      where: { projectId, project: { companyId: scope.companyId } },
      orderBy: [{ versionNo: 'desc' }, { id: 'desc' }]
    });
  }

  /** Sum current Stage weights with exact database decimal arithmetic. */
  async sumStageWeights(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.projectStage.aggregate({
      where: scope.where({ projectId }),
      _sum: { weightPercent: true },
      _count: { id: true }
    });
  }

  /** Freeze all current draft Stage rows as active baseline rows. */
  async activateDraftStages(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.projectStage.updateMany({
      where: scope.where({ projectId, status: 'DRAFT' }),
      data: { status: 'ACTIVE' }
    });
  }

  /** Append one immutable 100-percent baseline freeze record. */
  async createFrozenBaseline(projectId: string, versionNo: number, frozenBy: string, frozenAt: Date) {
    const project = await this.findProject(projectId);
    if (!project) return null;
    return this.db.stageProgressBaseline.create({
      data: {
        projectId,
        versionNo,
        status: 'FROZEN',
        totalWeightPercent: '100.0000',
        frozenAt,
        frozenBy
      }
    });
  }

  /** Verify that a progress evidence Document belongs to or is linked to this Project. */
  async findProjectEvidenceDocument(projectId: string, documentId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.document.findFirst({
      where: scope.where({
        id: documentId,
        status: { not: 'DELETED' },
        OR: [
          { projectId },
          { links: { some: { companyId: scope.companyId, projectId } } }
        ]
      }),
      select: { id: true }
    });
  }

  /** Append one submitted physical-progress update. */
  async createProgressUpdate(input: Readonly<{
    stageId: string;
    progressPercent: string;
    progressDate: Date;
    note?: string | null;
    evidenceDocumentId?: string | null;
    enteredBy: string;
  }>) {
    return this.db.stageProgressUpdate.create({
      data: {
        stageId: input.stageId,
        progressPercent: input.progressPercent,
        progressDate: input.progressDate,
        note: input.note ?? null,
        evidenceDocumentId: input.evidenceDocumentId ?? null,
        enteredBy: input.enteredBy,
        approvedBy: null,
        approvedAt: null,
        status: 'SUBMITTED'
      }
    });
  }

  /** Find one progress update only through its Company-owned Project Stage. */
  async findProgressUpdate(projectId: string, stageId: string, updateId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.stageProgressUpdate.findFirst({
      where: {
        id: updateId,
        stageId,
        stage: { projectId, companyId: scope.companyId }
      }
    });
  }

  /** Find the latest approved progress row for one Stage. */
  async findLatestApprovedProgress(projectId: string, stageId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.stageProgressUpdate.findFirst({
      where: {
        stageId,
        status: 'APPROVED',
        stage: { projectId, companyId: scope.companyId }
      },
      orderBy: [{ progressDate: 'desc' }, { approvedAt: 'desc' }, { id: 'desc' }]
    });
  }

  /** List all physical-progress history for the Project Stage timeline. */
  async listProgressUpdates(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.stageProgressUpdate.findMany({
      where: { stage: { projectId, companyId: scope.companyId } },
      orderBy: [{ stageId: 'asc' }, { progressDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]
    });
  }

  /** List approved progress history for weighted overall Project progress. */
  async listApprovedProgress(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.stageProgressUpdate.findMany({
      where: { status: 'APPROVED', stage: { projectId, companyId: scope.companyId } },
      orderBy: [{ stageId: 'asc' }, { progressDate: 'desc' }, { approvedAt: 'desc' }, { id: 'desc' }]
    });
  }

  /** Approve one submitted progress row exactly once. */
  async approveProgressUpdate(projectId: string, stageId: string, updateId: string, approvedBy: string, approvedAt: Date) {
    const scope = requireCompanyRepositoryScope();
    const result = await this.db.stageProgressUpdate.updateMany({
      where: {
        id: updateId,
        stageId,
        status: 'SUBMITTED',
        stage: { projectId, companyId: scope.companyId }
      },
      data: { status: 'APPROVED', approvedBy, approvedAt }
    });
    if (result.count !== 1) return null;
    return this.findProgressUpdate(projectId, stageId, updateId);
  }

  /** Set the actual Stage start date from the first approved non-zero physical progress. */
  async startStageIfNeeded(projectId: string, stageId: string, actualStartDate: Date) {
    const scope = requireCompanyRepositoryScope();
    const result = await this.db.projectStage.updateMany({
      where: scope.where({ id: stageId, projectId, status: 'ACTIVE', actualStartDate: null }),
      data: { actualStartDate }
    });
    return result.count === 1;
  }

  /** Mark a Stage completed using the approved physical-progress date. */
  async completeStage(projectId: string, stageId: string, actualEndDate: Date) {
    const scope = requireCompanyRepositoryScope();
    const result = await this.db.projectStage.updateMany({
      where: scope.where({ id: stageId, projectId, status: 'ACTIVE' }),
      data: { status: 'COMPLETED', actualEndDate }
    });
    return result.count === 1;
  }

  /** Re-open a completed Stage when an authorized approved correction moves physical progress below 100 percent. */
  async reopenCompletedStage(projectId: string, stageId: string) {
    const scope = requireCompanyRepositoryScope();
    const result = await this.db.projectStage.updateMany({
      where: scope.where({ id: stageId, projectId, status: 'COMPLETED' }),
      data: { status: 'ACTIVE', actualEndDate: null }
    });
    return result.count === 1;
  }

  /** Sum source-derived actual cost currently tagged to one Stage. */
  async sumStageActualCost(projectId: string, stageId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.costActual.aggregate({
      where: scope.where({ projectId, stageId }),
      _sum: { amount: true }
    });
  }

  /** Sum issued/posted Client Invoice lines currently tagged to one Stage. */
  async sumStageBilled(projectId: string, stageId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.clientInvoiceLine.aggregate({
      where: {
        stageId,
        invoice: {
          companyId: scope.companyId,
          projectId,
          status: { in: ['ISSUED', 'POSTED'] }
        }
      },
      _sum: { amount: true }
    });
  }
}
