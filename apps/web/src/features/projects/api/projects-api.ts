import { authenticatedRequest } from '../../administration/api/auth-api.js';

export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'COMPLETED' | 'CLOSED';
export type ProjectModel = 'FIXED_PRICE' | 'COST_PLUS_PERCENTAGE';

export type Project = Readonly<{
  id: string;
  projectCode: string;
  name: string;
  clientId: string;
  projectModel: ProjectModel;
  projectValue: string;
  costPlusPercent: string | null;
  status: ProjectStatus;
  currency: string;
  startDate: string;
  plannedEndDate: string;
  projectManagerUserId: string | null;
  location: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type ProjectStatusHistory = Readonly<{
  id: string;
  projectId: string;
  fromStatus: ProjectStatus | null;
  toStatus: ProjectStatus;
  changedBy: string;
  reason: string | null;
  changedAt: string;
}>;

export type ProjectDetails = Readonly<{
  project: Project;
  statusHistory: ProjectStatusHistory[];
  stageSummary: Readonly<{
    stageCount: number;
    baselineStatus: string | null;
    totalWeightPercent: string | null;
    overallPhysicalProgressPercent: string;
  }> | null;
  teamSummary: Readonly<{
    activeAssignmentCount: number;
    activeEmployeeCount: number;
  }> | null;
  budgetSummary: Readonly<{
    versionNo: number;
    status: string;
    currency: string;
    totalAmount: string;
  }> | null;
  costSummary: Readonly<{
    budgetCost: string;
    committedCost: string;
    actualCost: string;
    forecastCost: string;
    variance: string;
  }> | null;
  billingSummary: Readonly<{
    invoiceCount: number;
    billedAmount: string;
  }> | null;
  receiptSummary: Readonly<{
    receivedAmount: string;
    allocatedAmount: string;
    advanceAmount: string;
    outstandingAmount: string | null;
  }> | null;
}>;

export type ProjectPage = Readonly<{
  items: Project[];
  total: number;
  page: number;
  pageSize: number;
}>;

export type ListProjectsInput = Readonly<{
  search?: string;
  clientId?: string;
  projectModel?: ProjectModel;
  status?: ProjectStatus;
  page?: number;
  pageSize?: number;
}>;

export type CreateProjectInput = Readonly<{
  projectCode: string;
  name: string;
  clientId: string;
  projectModel: ProjectModel;
  projectValue: string;
  costPlusPercent?: string | null;
  currency: string;
  startDate: string;
  plannedEndDate: string;
  projectManagerUserId?: string | null;
  location?: string | null;
}>;

export type UpdateProjectInput = Readonly<{
  name?: string;
  clientId?: string;
  projectModel?: ProjectModel;
  projectValue?: string;
  costPlusPercent?: string | null;
  currency?: string;
  startDate?: string;
  plannedEndDate?: string;
  projectManagerUserId?: string | null;
  location?: string | null;
}>;

export type ProjectLifecycleReasonInput = Readonly<{
  reason?: string;
}>;

export type CloseProjectInput = ProjectLifecycleReasonInput;

/** Load one server-paginated Project register page using only Final Module 6 filters. */
export function listProjects(input: ListProjectsInput = {}): Promise<ProjectPage> {
  const query = new URLSearchParams();

  if (input.search) query.set('search', input.search);
  if (input.clientId) query.set('clientId', input.clientId);
  if (input.projectModel) query.set('projectModel', input.projectModel);
  if (input.status) query.set('status', input.status);
  if (input.page !== undefined) query.set('page', String(input.page));
  if (input.pageSize !== undefined) query.set('pageSize', String(input.pageSize));

  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return authenticatedRequest<ProjectPage>(`projects${suffix}`);
}

/** Load one company-owned Project with its append-only lifecycle history. */
export function getProject(projectId: string): Promise<ProjectDetails> {
  return authenticatedRequest<ProjectDetails>(`projects/${projectId}`);
}

/** Create one DRAFT Project without sending company, lifecycle or authorization authority from the browser. */
export function createProject(input: CreateProjectInput): Promise<Project> {
  return authenticatedRequest<Project>('projects', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

/** Update only the editable Project master fields approved by the Project PATCH contract. */
export function updateProject(projectId: string, input: UpdateProjectInput): Promise<Project> {
  return authenticatedRequest<Project>(`projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(input)
  });
}

/** Activate one DRAFT Project through the explicit bodyless lifecycle command. */
export function activateProject(projectId: string): Promise<Project> {
  return authenticatedRequest<Project>(`projects/${projectId}/activate`, {
    method: 'POST'
  });
}

/** Suspend one ACTIVE Project with only an optional audit/history reason. */
export function suspendProject(projectId: string, input: ProjectLifecycleReasonInput = {}): Promise<Project> {
  return authenticatedRequest<Project>(`projects/${projectId}/suspend`, {
    method: 'POST',
    ...(input.reason ? { body: JSON.stringify(input) } : {})
  });
}

/** Resume one SUSPENDED Project with only an optional audit/history reason. */
export function resumeProject(projectId: string, input: ProjectLifecycleReasonInput = {}): Promise<Project> {
  return authenticatedRequest<Project>(`projects/${projectId}/resume`, {
    method: 'POST',
    ...(input.reason ? { body: JSON.stringify(input) } : {})
  });
}

/** Mark one ACTIVE Project operationally complete through the explicit bodyless command. */
export function completeProject(projectId: string): Promise<Project> {
  return authenticatedRequest<Project>(`projects/${projectId}/complete`, {
    method: 'POST'
  });
}

/** Close one COMPLETED Project and optionally preserve the user's close reason. */
export function closeProject(projectId: string, input: CloseProjectInput = {}): Promise<Project> {
  return authenticatedRequest<Project>(`projects/${projectId}/close`, {
    method: 'POST',
    ...(input.reason ? { body: JSON.stringify(input) } : {})
  });
}
