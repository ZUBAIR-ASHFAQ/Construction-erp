import { recordAudit } from '@construction-erp/audit';
import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { ValidationError } from '@construction-erp/errors';
import { executeIdempotentCommand } from '@construction-erp/idempotency';
import { recordOutboxEvent } from '@construction-erp/outbox';
import { requireRequestSecurityContext } from '@construction-erp/request-context';
import { AdministrationRepository } from '../administration/administration.repository.js';
import { ProjectTeamRepository } from './project-team.repository.js';
import {
  createProjectTeamAuthorizationError,
  createProjectTeamError,
  type CreateProjectTeamAssignmentBody,
  type EndProjectTeamAssignmentBody,
  type ProjectTeamPermissionCode,
  type UpdateProjectTeamAssignmentBody
} from './project-team.schema.js';

const ASSIGNMENT_ACTIVE = 'ACTIVE';
const ASSIGNMENT_ENDED = 'ENDED';
const ROLE_ASSIGNMENT_ACTIVE = 'ACTIVE';
const ROLE_ACTIVE = 'ACTIVE';

type DecimalLike = string | Readonly<{ toString(): string }>;

/** Parse one validated business date as UTC midnight for persistence. */
function inputDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Serialize one database date as YYYY-MM-DD. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Convert one Project Team assignment to the safe API response shape. */
function assignmentResponse(assignment: Readonly<{
  id: string;
  projectId: string;
  employeeId: string;
  projectRole: string;
  allocationPercent: DecimalLike;
  stageId: string | null;
  fromDate: Date;
  toDate: Date | null;
  status: string;
  employee?: Readonly<{ employeeNo: string; name: string; status: string }>;
  stage?: Readonly<{ id: string; code: string; name: string }> | null;
  history?: readonly Readonly<{ id: string; action: string; changedBy: string; changedAt: Date; note: string | null }>[];
}>) {
  return {
    id: assignment.id,
    projectId: assignment.projectId,
    employeeId: assignment.employeeId,
    employeeNo: assignment.employee?.employeeNo ?? null,
    employeeName: assignment.employee?.name ?? null,
    projectRole: assignment.projectRole,
    allocationPercent: assignment.allocationPercent.toString(),
    stageId: assignment.stageId,
    stage: assignment.stage ? { id: assignment.stage.id, code: assignment.stage.code, name: assignment.stage.name } : null,
    fromDate: dateOnly(assignment.fromDate),
    toDate: assignment.toDate ? dateOnly(assignment.toDate) : null,
    status: assignment.status,
    history: (assignment.history ?? []).map((item) => ({
      id: item.id,
      action: item.action,
      changedBy: item.changedBy,
      changedAt: item.changedAt.toISOString(),
      note: item.note
    }))
  };
}

/** Final Module 8 business rules for Employee Project/Stage assignment and allocation. */
export class ProjectTeamService {
  /** Bind Project Team business logic to the database. */
  constructor(private readonly db: DatabaseClient) {}

  /** Require resolved Project scope and the requested Project Team permission. */
  private async requireProjectPermission(
    repository: AdministrationRepository,
    projectId: string,
    permission: ProjectTeamPermissionCode,
    asOf: Date
  ): Promise<void> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw createProjectTeamAuthorizationError();
    if (security.projectScope.kind === 'restricted' && !security.projectScope.projectIds.includes(projectId)) {
      throw createProjectTeamAuthorizationError();
    }

    const permissions = await repository.findEffectivePermissionCodesForProject(projectId, {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ROLE_ASSIGNMENT_ACTIVE],
      roleStatuses: [ROLE_ACTIVE]
    });
    if (permissions === null || !permissions.includes(permission)) throw createProjectTeamAuthorizationError();
  }

  /** Validate that an optional Stage belongs to the same Project. */
  private async requireStage(repository: ProjectTeamRepository, projectId: string, stageId?: string | null): Promise<void> {
    if (!stageId) return;
    if (await repository.findProjectStage(projectId, stageId)) return;
    throw createProjectTeamError('STAGE_ASSIGNMENT_INVALID');
  }

  /** Validate that the Employee is active and belongs to the current Company. */
  private async requireAssignableEmployee(repository: ProjectTeamRepository, employeeId: string): Promise<void> {
    const employee = await repository.lockEmployeeForAllocation(employeeId);
    if (!employee || employee.status !== 'ACTIVE') throw createProjectTeamError('EMPLOYEE_NOT_ASSIGNABLE');
  }

  /** Enforce at most 100% total Employee allocation across overlapping active assignments. */
  private async requireAllocationAvailable(
    repository: ProjectTeamRepository,
    employeeId: string,
    allocationPercent: string,
    fromDate: Date,
    toDate: Date | null,
    excludeAssignmentId?: string
  ): Promise<void> {
    const overlapping = await repository.listOverlappingAssignments(
      employeeId,
      fromDate,
      toDate,
      excludeAssignmentId
    );
    const total = overlapping.reduce((sum, item) => sum + Number(item.allocationPercent.toString()), Number(allocationPercent));
    if (total > 100.0000001) throw createProjectTeamError('ALLOCATION_EXCEEDED');
  }

  /** Read active Project Team counts for the owning Project detail summary. */
  async getProjectSummary(projectId: string) {
    await this.requireProjectPermission(
      new AdministrationRepository(this.db),
      projectId,
      'project_team.read',
      new Date()
    );
    const repository = new ProjectTeamRepository(this.db);
    if (!await repository.findProject(projectId)) throw createProjectTeamError('ASSIGNMENT_NOT_FOUND');
    return repository.readProjectTeamSummary(projectId);
  }

  /** List the current and historical assignments for one allowed Project. */
  async listAssignments(projectId: string) {
    await this.requireProjectPermission(new AdministrationRepository(this.db), projectId, 'project_team.read', new Date());
    const repository = new ProjectTeamRepository(this.db);
    if (!await repository.findProject(projectId)) throw createProjectTeamError('ASSIGNMENT_NOT_FOUND');
    return { projectId, items: (await repository.listAssignments(projectId)).map(assignmentResponse) };
  }

  /** Create one Employee Project/Stage assignment exactly once. */
  async createAssignment(projectId: string, input: CreateProjectTeamAssignmentBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(
      this.db,
      { operation: 'project-team.assign', idempotencyKey, fingerprintInput: { projectId, input } },
      async (tx) => this.createAssignmentOnce(tx, projectId, input)
    );
    return result.response.body;
  }

  /** Validate and persist one assignment with history, audit and outbox evidence. */
  private async createAssignmentOnce(tx: TransactionClient, projectId: string, input: CreateProjectTeamAssignmentBody) {
    await this.requireProjectPermission(new AdministrationRepository(tx), projectId, 'project_team.manage', new Date());
    const repository = new ProjectTeamRepository(tx);
    if (!await repository.findProject(projectId)) throw createProjectTeamError('ASSIGNMENT_NOT_FOUND');
    await this.requireAssignableEmployee(repository, input.employeeId);
    await this.requireStage(repository, projectId, input.stageId);
    const fromDate = inputDate(input.fromDate);
    const toDate = input.toDate ? inputDate(input.toDate) : null;
    await this.requireAllocationAvailable(repository, input.employeeId, input.allocationPercent, fromDate, toDate);

    const assignment = await repository.createAssignment({
      projectId,
      employeeId: input.employeeId,
      projectRole: input.projectRole,
      allocationPercent: input.allocationPercent,
      stageId: input.stageId ?? null,
      fromDate,
      toDate,
      status: ASSIGNMENT_ACTIVE
    });
    const actorUserId = requireRequestSecurityContext().actorUserId;
    await repository.createHistory(assignment.id, 'ASSIGNED', actorUserId, null);
    const response = assignmentResponse(assignment);
    await recordAudit(tx, { action: 'project_team.assigned', entityType: 'project_team_assignment', entityId: assignment.id, projectId, stageId: assignment.stageId, after: response });
    await recordOutboxEvent(tx, { eventType: 'project_team.assigned', resourceType: 'project_team_assignment', resourceId: assignment.id, payload: response });
    return { statusCode: 201, body: response };
  }

  /** Update one active assignment exactly once without changing Employee or Project ownership. */
  async updateAssignment(projectId: string, assignmentId: string, input: UpdateProjectTeamAssignmentBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(
      this.db,
      { operation: 'project-team.update', idempotencyKey, fingerprintInput: { projectId, assignmentId, input } },
      async (tx) => this.updateAssignmentOnce(tx, projectId, assignmentId, input)
    );
    return result.response.body;
  }

  /** Validate merged dates/allocation and persist one assignment edit with traceability. */
  private async updateAssignmentOnce(
    tx: TransactionClient,
    projectId: string,
    assignmentId: string,
    input: UpdateProjectTeamAssignmentBody
  ) {
    await this.requireProjectPermission(new AdministrationRepository(tx), projectId, 'project_team.manage', new Date());
    const repository = new ProjectTeamRepository(tx);
    const locked = await repository.lockAssignment(projectId, assignmentId);
    if (!locked || locked.status !== ASSIGNMENT_ACTIVE) throw createProjectTeamError('ASSIGNMENT_NOT_FOUND');
    await this.requireStage(repository, projectId, input.stageId);

    const fromDate = input.fromDate ? inputDate(input.fromDate) : locked.from_date;
    const toDate = input.toDate === undefined ? locked.to_date : input.toDate ? inputDate(input.toDate) : null;
    if (toDate && toDate < fromDate) {
      throw new ValidationError({ fieldErrors: [{ field: 'toDate', message: 'toDate cannot precede fromDate.' }] });
    }
    const allocationPercent = input.allocationPercent ?? String(locked.allocation_percent);
    if (!await repository.lockEmployeeForAllocation(locked.employee_id)) throw createProjectTeamError('EMPLOYEE_NOT_ASSIGNABLE');
    await this.requireAllocationAvailable(repository, locked.employee_id, allocationPercent, fromDate, toDate, assignmentId);

    const before = await repository.findAssignment(projectId, assignmentId);
    if (!before) throw createProjectTeamError('ASSIGNMENT_NOT_FOUND');
    const updated = await repository.updateAssignment(projectId, assignmentId, {
      ...(input.projectRole === undefined ? {} : { projectRole: input.projectRole }),
      ...(input.allocationPercent === undefined ? {} : { allocationPercent: input.allocationPercent }),
      ...(input.stageId === undefined ? {} : { stageId: input.stageId }),
      ...(input.fromDate === undefined ? {} : { fromDate }),
      ...(input.toDate === undefined ? {} : { toDate })
    });
    if (!updated) throw createProjectTeamError('ASSIGNMENT_NOT_FOUND');

    const actorUserId = requireRequestSecurityContext().actorUserId;
    await repository.createHistory(assignmentId, 'UPDATED', actorUserId, null);
    const response = assignmentResponse(updated);
    await recordAudit(tx, { action: 'project_team.updated', entityType: 'project_team_assignment', entityId: assignmentId, projectId, stageId: updated.stageId, before: assignmentResponse(before), after: response });
    await recordOutboxEvent(tx, { eventType: 'project_team.updated', resourceType: 'project_team_assignment', resourceId: assignmentId, payload: response });
    return { statusCode: 200, body: response };
  }

  /** End one active assignment exactly once while preserving all historical attendance/payroll references. */
  async endAssignment(projectId: string, assignmentId: string, input: EndProjectTeamAssignmentBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(
      this.db,
      { operation: 'project-team.end', idempotencyKey, fingerprintInput: { projectId, assignmentId, input } },
      async (tx) => this.endAssignmentOnce(tx, projectId, assignmentId, input)
    );
    return result.response.body;
  }

  /** Persist assignment end state and append history instead of deleting the assignment. */
  private async endAssignmentOnce(
    tx: TransactionClient,
    projectId: string,
    assignmentId: string,
    input: EndProjectTeamAssignmentBody
  ) {
    await this.requireProjectPermission(new AdministrationRepository(tx), projectId, 'project_team.manage', new Date());
    const repository = new ProjectTeamRepository(tx);
    const locked = await repository.lockAssignment(projectId, assignmentId);
    if (!locked || locked.status !== ASSIGNMENT_ACTIVE) throw createProjectTeamError('ASSIGNMENT_NOT_FOUND');
    const endDate = inputDate(input.endDate);
    if (endDate < locked.from_date) {
      throw new ValidationError({ fieldErrors: [{ field: 'endDate', message: 'endDate cannot precede the assignment start date.' }] });
    }
    const before = await repository.findAssignment(projectId, assignmentId);
    if (!before) throw createProjectTeamError('ASSIGNMENT_NOT_FOUND');
    const updated = await repository.updateAssignment(projectId, assignmentId, { toDate: endDate, status: ASSIGNMENT_ENDED });
    if (!updated) throw createProjectTeamError('ASSIGNMENT_NOT_FOUND');

    const actorUserId = requireRequestSecurityContext().actorUserId;
    await repository.createHistory(assignmentId, 'ENDED', actorUserId, input.note ?? null);
    const response = assignmentResponse(updated);
    await recordAudit(tx, { action: 'project_team.assignment_ended', entityType: 'project_team_assignment', entityId: assignmentId, projectId, stageId: updated.stageId, before: assignmentResponse(before), after: response });
    await recordOutboxEvent(tx, { eventType: 'project_team.assignment_ended', resourceType: 'project_team_assignment', resourceId: assignmentId, payload: response });
    return { statusCode: 200, body: response };
  }
}
