import { authenticatedRequest } from '../../administration/api/auth-api.js';

export type ProjectTeamHistoryItem = Readonly<{
  id: string;
  action: string;
  changedBy: string;
  changedAt: string;
  note: string | null;
}>;

export type ProjectTeamAssignment = Readonly<{
  id: string;
  projectId: string;
  employeeId: string;
  employeeNo: string | null;
  employeeName: string | null;
  projectRole: string;
  allocationPercent: string;
  stageId: string | null;
  stage: Readonly<{ id: string; code: string; name: string }> | null;
  fromDate: string;
  toDate: string | null;
  status: string;
  history: ProjectTeamHistoryItem[];
}>;

export type ProjectTeamList = Readonly<{ projectId: string; items: ProjectTeamAssignment[] }>;

export type CreateProjectTeamAssignmentInput = Readonly<{
  employeeId: string;
  projectRole: string;
  allocationPercent: string;
  stageId?: string | null;
  fromDate: string;
  toDate?: string | null;
}>;

export type UpdateProjectTeamAssignmentInput = Readonly<{
  projectRole?: string;
  allocationPercent?: string;
  stageId?: string | null;
  fromDate?: string;
  toDate?: string | null;
}>;

/** Build the Foundation retry header required by Project Team write commands. */
function commandHeaders(idempotencyKey: string): HeadersInit {
  return { 'Idempotency-Key': idempotencyKey };
}

/** Load all current and historical Project Team assignments for one Project. */
export function listProjectTeam(projectId: string): Promise<ProjectTeamList> {
  return authenticatedRequest<ProjectTeamList>(`projects/${projectId}/team`);
}

/** Assign one active Employee to one Project and optional Stage. */
export function createProjectTeamAssignment(
  projectId: string,
  input: CreateProjectTeamAssignmentInput,
  idempotencyKey: string
): Promise<ProjectTeamAssignment> {
  return authenticatedRequest<ProjectTeamAssignment>(`projects/${projectId}/team`, {
    method: 'POST', headers: commandHeaders(idempotencyKey), body: JSON.stringify(input)
  });
}

/** Update role, allocation, Stage or effective dates for one active assignment. */
export function updateProjectTeamAssignment(
  projectId: string,
  assignmentId: string,
  input: UpdateProjectTeamAssignmentInput,
  idempotencyKey: string
): Promise<ProjectTeamAssignment> {
  return authenticatedRequest<ProjectTeamAssignment>(`projects/${projectId}/team/${assignmentId}`, {
    method: 'PATCH', headers: commandHeaders(idempotencyKey), body: JSON.stringify(input)
  });
}

/** End one active assignment without deleting its history. */
export function endProjectTeamAssignment(
  projectId: string,
  assignmentId: string,
  endDate: string,
  idempotencyKey: string,
  note?: string
): Promise<ProjectTeamAssignment> {
  return authenticatedRequest<ProjectTeamAssignment>(`projects/${projectId}/team/${assignmentId}/end`, {
    method: 'POST', headers: commandHeaders(idempotencyKey), body: JSON.stringify({ endDate, ...(note ? { note } : {}) })
  });
}
