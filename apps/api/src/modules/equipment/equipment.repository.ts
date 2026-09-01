import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';
import { MODULE_12_MAX_PAGE_SIZE } from './equipment.schema.js';

type RepositoryClient = DatabaseClient | TransactionClient;

export type EquipmentPageWindow = Readonly<{ skip: number; take: number }>;
export type EquipmentProjectVisibility = Readonly<{ allowedProjectIds: readonly string[] | null }>;

/** Reject invalid pagination before a repository query reaches Prisma. */
function assertPageWindow(input: EquipmentPageWindow): void {
  if (!Number.isInteger(input.skip) || input.skip < 0) throw new RangeError('Repository skip must be a non-negative integer.');
  if (!Number.isInteger(input.take) || input.take < 1 || input.take > MODULE_12_MAX_PAGE_SIZE) {
    throw new RangeError(`Repository take must be between 1 and ${MODULE_12_MAX_PAGE_SIZE}.`);
  }
}

/** Build a Project visibility filter without widening the trusted request scope. */
function projectVisibilityWhere(visibility: EquipmentProjectVisibility) {
  return visibility.allowedProjectIds === null
    ? {}
    : { projectId: { in: [...new Set(visibility.allowedProjectIds)] } };
}

/** Final Module 12 database access kept intentionally small and Company scoped. */
export class EquipmentRepository {
  /** Bind Equipment persistence to Prisma or an active transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /** List Company-owned Equipment with deterministic bounded pagination. */
  async listEquipment(input: EquipmentPageWindow) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({});
    const [items, total] = await Promise.all([
      this.db.equipment.findMany({ where, orderBy: [{ code: 'asc' }, { id: 'asc' }], skip: input.skip, take: input.take }),
      this.db.equipment.count({ where })
    ]);
    return { items, total };
  }

  /** Find one Equipment row inside the authenticated Company. */
  async findEquipmentById(equipmentId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.equipment.findFirst({ where: scope.where({ id: equipmentId }) });
  }

  /** Find one Equipment row by its Company-scoped code. */
  async findEquipmentByCode(code: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.equipment.findFirst({ where: scope.where({ code }) });
  }

  /** Lock one Equipment master before state-sensitive assignment or usage work. */
  async lockEquipmentForWrite(equipmentId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{
      id: string;
      status: string;
      defaultRate: { toString(): string } | null;
      rateUnit: string | null;
    }>>`
      SELECT id, status, default_rate AS "defaultRate", rate_unit AS "rateUnit"
      FROM equipment
      WHERE id = ${equipmentId}::uuid AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Create one Company-owned Equipment master with server-owned status. */
  async createEquipment(input: Readonly<{
    code: string;
    name: string;
    equipmentType: string;
    ownershipType: string;
    defaultRate: string | null;
    rateUnit: string | null;
    status: string;
  }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.equipment.create({ data: scope.createData(input) });
  }

  /** Find one Project inside the current Company. */
  async findProject(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.project.findFirst({ where: scope.where({ id: projectId }) });
  }

  /** Find one Stage only when it belongs to the selected Project and Company. */
  async findStage(projectId: string, stageId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.projectStage.findFirst({ where: { id: stageId, projectId, companyId: scope.companyId } });
  }

  /** Check exclusive Equipment assignment overlap across all Projects in the Company. */
  async hasAssignmentOverlap(equipmentId: string, fromDate: Date, toDate: Date | null): Promise<boolean> {
    const scope = requireCompanyRepositoryScope();
    const count = await this.db.equipmentAssignment.count({
      where: {
        equipmentId,
        equipment: { companyId: scope.companyId },
        ...(toDate ? { fromDate: { lte: toDate } } : {}),
        OR: [{ toDate: null }, { toDate: { gte: fromDate } }]
      }
    });
    return count > 0;
  }

  /** Create one Project/Stage Equipment assignment. */
  async createAssignment(input: Readonly<{
    equipmentId: string;
    projectId: string;
    stageId: string | null;
    fromDate: Date;
    toDate: Date | null;
    status: string;
  }>) {
    return this.db.equipmentAssignment.create({ data: input });
  }

  /** Lock one Equipment assignment before end or usage decisions. */
  async lockAssignmentForWrite(equipmentId: string, assignmentId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{
      id: string;
      equipmentId: string;
      projectId: string;
      stageId: string | null;
      fromDate: Date;
      toDate: Date | null;
      status: string;
    }>>`
      SELECT
        assignment.id,
        assignment.equipment_id AS "equipmentId",
        assignment.project_id AS "projectId",
        assignment.stage_id AS "stageId",
        assignment.from_date AS "fromDate",
        assignment.to_date AS "toDate",
        assignment.status
      FROM equipment_assignments assignment
      JOIN equipment item ON item.id = assignment.equipment_id
      JOIN projects project ON project.id = assignment.project_id
      WHERE assignment.id = ${assignmentId}::uuid
        AND assignment.equipment_id = ${equipmentId}::uuid
        AND item.company_id = ${scope.companyId}::uuid
        AND project.company_id = ${scope.companyId}::uuid
      FOR UPDATE OF assignment
    `;
    return rows[0] ?? null;
  }

  /** Find the latest posted usage date before shortening an Equipment assignment. */
  async findLatestUsageDate(equipmentId: string, assignmentId: string): Promise<Date | null> {
    const scope = requireCompanyRepositoryScope();
    const usage = await this.db.equipmentUsage.findFirst({
      where: {
        assignmentId,
        status: 'POSTED',
        assignment: { equipmentId, equipment: { companyId: scope.companyId }, project: { companyId: scope.companyId } }
      },
      select: { usageDate: true },
      orderBy: [{ usageDate: 'desc' }, { id: 'desc' }]
    });
    return usage?.usageDate ?? null;
  }

  /** End one active Equipment assignment without deleting its history. */
  async endAssignment(equipmentId: string, assignmentId: string, endDate: Date) {
    const scope = requireCompanyRepositoryScope();
    const result = await this.db.equipmentAssignment.updateMany({
      where: {
        id: assignmentId,
        equipmentId,
        status: 'ACTIVE',
        equipment: { companyId: scope.companyId },
        project: { companyId: scope.companyId }
      },
      data: { toDate: endDate, status: 'ENDED' }
    });
    if (result.count !== 1) return null;
    return this.findAssignment(equipmentId, assignmentId);
  }

  /** Find one Equipment assignment and its cost destination. */
  async findAssignment(equipmentId: string, assignmentId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.equipmentAssignment.findFirst({
      where: {
        id: assignmentId,
        equipmentId,
        equipment: { companyId: scope.companyId },
        project: { companyId: scope.companyId }
      }
    });
  }

  /** Create one immutable usage/rental record tied to an assignment. */
  async createUsage(input: Readonly<{
    assignmentId: string;
    usageDate: Date;
    quantity: string;
    rate: string;
    amount: string;
    enteredBy: string;
    status: string;
  }>) {
    return this.db.equipmentUsage.create({ data: input });
  }

  /** Create one source-keyed Equipment actual cost in Final Module 9. */
  async createUsageCostActual(input: Readonly<{
    projectId: string;
    stageId: string | null;
    usageId: string;
    postingDate: Date;
    amount: string;
  }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.costActual.create({
      data: scope.createData({
        projectId: input.projectId,
        stageId: input.stageId,
        category: 'equipment',
        sourceType: 'equipment_usage',
        sourceId: input.usageId,
        sourceKey: `equipment_usage:${input.usageId}`,
        postingDate: input.postingDate,
        amount: input.amount
      })
    });
  }

  /** Create one Company-owned Equipment maintenance history row. */
  async createMaintenance(input: Readonly<{
    equipmentId: string;
    maintenanceDate: Date;
    type: string;
    cost: string;
    note: string | null;
    status: string;
  }>) {
    return this.db.equipmentMaintenance.create({ data: input });
  }

  /** Read bounded Project-scoped assignment/usage history and Company maintenance history. */
  async getHistory(equipmentId: string, visibility: EquipmentProjectVisibility, take: number) {
    if (!Number.isInteger(take) || take < 1 || take > MODULE_12_MAX_PAGE_SIZE) {
      throw new RangeError(`History page size must be between 1 and ${MODULE_12_MAX_PAGE_SIZE}.`);
    }
    const scope = requireCompanyRepositoryScope();
    const equipment = await this.findEquipmentById(equipmentId);
    if (!equipment) return null;
    const visibleProjects = projectVisibilityWhere(visibility);
    const [assignments, usage, maintenance] = await Promise.all([
      this.db.equipmentAssignment.findMany({
        where: {
          equipmentId,
          equipment: { companyId: scope.companyId },
          project: { companyId: scope.companyId },
          ...visibleProjects
        },
        orderBy: [{ fromDate: 'desc' }, { id: 'asc' }],
        take
      }),
      this.db.equipmentUsage.findMany({
        where: {
          assignment: {
            equipmentId,
            equipment: { companyId: scope.companyId },
            project: { companyId: scope.companyId },
            ...visibleProjects
          }
        },
        include: { assignment: true },
        orderBy: [{ usageDate: 'desc' }, { id: 'asc' }],
        take
      }),
      this.db.equipmentMaintenance.findMany({
        where: { equipmentId, equipment: { companyId: scope.companyId } },
        orderBy: [{ maintenanceDate: 'desc' }, { id: 'asc' }],
        take
      })
    ]);
    return { equipment, assignments, usage, maintenance };
  }
}
