import { authenticatedRequest } from '../../administration/api/auth-api.js';

export type ProjectStage = Readonly<{
  id: string;
  projectId: string;
  code: string;
  name: string;
  sequenceNo: number;
  weightPercent: string;
  plannedAmount: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  status: string;
  approvedPhysicalProgressPercent?: string;
  progressUpdates?: StageProgressUpdate[];
  financials?: StageFinancials | null;
}>;

export type StageFinancials = Readonly<{
  plannedAmount: string | null;
  actualCost: string;
  billedAmount: string;
  receivedAmount: string;
  allocatedReceiptAmount: string;
  advanceAmount: string;
  outstandingAmount: string;
}>;

export type StageBaseline = Readonly<{
  id: string;
  projectId: string;
  versionNo: number;
  status: string;
  totalWeightPercent: string;
  frozenAt: string | null;
  frozenBy: string | null;
}>;

export type StageProgressUpdate = Readonly<{
  id: string;
  stageId: string;
  progressPercent: string;
  progressDate: string | null;
  note: string | null;
  evidenceDocumentId: string | null;
  enteredBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  status: string;
  createdAt: string;
}>;

export type ProjectStagesSummary = Readonly<{
  projectId: string;
  baseline: StageBaseline | null;
  overallPhysicalProgressPercent: string;
  items: ProjectStage[];
}>;

export type CreateProjectStageInput = Readonly<{
  code: string;
  name: string;
  sequenceNo: number;
  weightPercent: string;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
}>;

export type UpdateProjectStageInput = Partial<CreateProjectStageInput>;

export type RecordStageProgressInput = Readonly<{
  progressPercent: string;
  progressDate: string;
  note?: string | null;
  evidenceDocumentId?: string | null;
}>;

/** Create a unique browser idempotency key for one Stage write command. */
function idempotencyHeaders(): HeadersInit {
  return { 'Idempotency-Key': crypto.randomUUID() };
}

/** Load the Project Stage baseline, progress and permission-safe financial summary. */
export function getProjectStages(projectId: string): Promise<ProjectStagesSummary> {
  return authenticatedRequest<ProjectStagesSummary>(`projects/${projectId}/stages`);
}

/** Create one draft Stage before baseline freeze. */
export function createProjectStage(projectId: string, input: CreateProjectStageInput): Promise<ProjectStage> {
  return authenticatedRequest<ProjectStage>(`projects/${projectId}/stages`, {
    method: 'POST',
    headers: idempotencyHeaders(),
    body: JSON.stringify(input)
  });
}

/** Update one draft Stage before baseline freeze. */
export function updateProjectStage(projectId: string, stageId: string, input: UpdateProjectStageInput): Promise<ProjectStage> {
  return authenticatedRequest<ProjectStage>(`projects/${projectId}/stages/${stageId}`, {
    method: 'PATCH',
    headers: idempotencyHeaders(),
    body: JSON.stringify(input)
  });
}

/** Freeze the exact 100-percent Stage baseline. */
export function freezeProjectStageBaseline(projectId: string): Promise<StageBaseline> {
  return authenticatedRequest<StageBaseline>(`projects/${projectId}/stages/baseline/freeze`, {
    method: 'POST',
    headers: idempotencyHeaders(),
    body: JSON.stringify({})
  });
}

/** Submit one dated physical-progress update for a Stage. */
export function recordStageProgress(projectId: string, stageId: string, input: RecordStageProgressInput): Promise<StageProgressUpdate> {
  return authenticatedRequest<StageProgressUpdate>(`projects/${projectId}/stages/${stageId}/progress`, {
    method: 'POST',
    headers: idempotencyHeaders(),
    body: JSON.stringify(input)
  });
}

/** Approve one submitted Stage physical-progress update. */
export function approveStageProgress(projectId: string, stageId: string, updateId: string): Promise<StageProgressUpdate> {
  return authenticatedRequest<StageProgressUpdate>(`projects/${projectId}/stages/${stageId}/progress/${updateId}/approve`, {
    method: 'POST',
    headers: idempotencyHeaders(),
    body: JSON.stringify({})
  });
}

