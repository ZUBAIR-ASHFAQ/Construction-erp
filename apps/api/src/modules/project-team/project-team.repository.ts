import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';

type RepositoryClient = DatabaseClient | TransactionClient;

export type CreateProjectTeamAssignmentRepositoryInput = Readonly<{
  projectId: string;
  employeeId: string;
  projectRole: string;
  allocationPercent: string;
  stageId?: string | null;
  fromDate: Date;
  toDate?: Date | null;
  status: string;
}>;

export type UpdateProjectTeamAssignmentRepositoryInput = Readonly<{
  projectRole?: string;
  allocationPercent?: string;
  stageId?: string | null;
  fromDate?: Date;
  toDate?: Date | null;
  status?: string;
}>;

/** Final Module 8 persistence with mandatory Company and Project scoping. */
export class ProjectTeamRepository {
  /** Bind Project Team persistence to Prisma or one active transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /** Find one Project only inside the authenticated Company. */
  async findProject(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.project.findFirst({ where: scope.where({ id: projectId }) });
  }

  /** Lock one same-company Employee so overlapping allocation checks cannot race. */
  async lockEmployeeForAllocation(employeeId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id, status
      FROM employees
      WHERE id = ${employeeId}::uuid
        AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Find one optional Stage only when it belongs to the requested Project and Company. */
  async findProjectStage(projectId: string, stageId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.projectStage.findFirst({ where: scope.where({ id: stageId, projectId }) });
  }

  /** Count active Project Team assignments and distinct active Employees without loading assignment history. */
  async readProjectTeamSummary(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({ projectId, status: 'ACTIVE' });
    const [activeAssignmentCount, activeEmployees] = await Promise.all([
      this.db.projectTeamAssignment.count({ where }),
      this.db.projectTeamAssignment.findMany({
        where,
        distinct: ['employeeId'],
        select: { employeeId: true }
      })
    ]);

    return {
      activeAssignmentCount,
      activeEmployeeCount: activeEmployees.length
    };
  }

  /** List Project Team assignments with Employee and Stage labels in deterministic order. */
  async listAssignments(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.projectTeamAssignment.findMany({
      where: scope.where({ projectId }),
      include: {
        employee: { select: { employeeNo: true, name: true, status: true } },
        stage: { select: { id: true, code: true, name: true } },
        history: { orderBy: [{ changedAt: 'asc' }, { id: 'asc' }] }
      },
      orderBy: [{ status: 'asc' }, { fromDate: 'desc' }, { employeeId: 'asc' }, { id: 'asc' }]
    });
  }

  /** Find one assignment only when Project and Company match. */
  async findAssignment(projectId: string, assignmentId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.projectTeamAssignment.findFirst({
      where: scope.where({ id: assignmentId, projectId }),
      include: {
        employee: { select: { employeeNo: true, name: true, status: true } },
        stage: { select: { id: true, code: true, name: true } },
        history: { orderBy: [{ changedAt: 'asc' }, { id: 'asc' }] }
      }
    });
  }

  /** Lock one assignment before update/end commands. */
  async lockAssignment(projectId: string, assignmentId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{
      id: string;
      employee_id: string;
      project_id: string;
      stage_id: string | null;
      project_role: string;
      allocation_percent: unknown;
      from_date: Date;
      to_date: Date | null;
      status: string;
    }>>`
      SELECT id, employee_id, project_id, stage_id, project_role, allocation_percent, from_date, to_date, status
      FROM project_team_assignments
      WHERE id = ${assignmentId}::uuid
        AND project_id = ${projectId}::uuid
        AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Find active overlapping assignments used by the service allocation invariant. */
  async listOverlappingAssignments(
    employeeId: string,
    fromDate: Date,
    toDate: Date | null,
    excludeAssignmentId?: string
  ) {
    const scope = requireCompanyRepositoryScope();
    return this.db.projectTeamAssignment.findMany({
      where: scope.where({
        employeeId,
        status: 'ACTIVE',
        ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
        fromDate: { lte: toDate ?? new Date('9999-12-31T00:00:00.000Z') },
        OR: [{ toDate: null }, { toDate: { gte: fromDate } }]
      }),
      select: { id: true, allocationPercent: true, fromDate: true, toDate: true }
    });
  }

  /** Create one active Project Team assignment inside the authenticated Company. */
  async createAssignment(input: CreateProjectTeamAssignmentRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    return this.db.projectTeamAssignment.create({
      data: scope.createData({
        projectId: input.projectId,
        employeeId: input.employeeId,
        projectRole: input.projectRole,
        allocationPercent: input.allocationPercent,
        stageId: input.stageId ?? null,
        fromDate: input.fromDate,
        toDate: input.toDate ?? null,
        status: input.status
      })
    });
  }

  /** Update only the editable assignment fields after service validation. */
  async updateAssignment(projectId: string, assignmentId: string, input: UpdateProjectTeamAssignmentRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const result = await this.db.projectTeamAssignment.updateMany({
      where: scope.where({ id: assignmentId, projectId }),
      data: input
    });
    if (result.count !== 1) return null;
    return this.findAssignment(projectId, assignmentId);
  }

  /** Append one assignment lifecycle history row with the authenticated actor. */
  async createHistory(assignmentId: string, action: string, changedBy: string, note?: string | null) {
    return this.db.projectTeamHistory.create({
      data: {
        assignmentId,
        action,
        changedBy,
        note: note ?? null
      }
    });
  }

}
