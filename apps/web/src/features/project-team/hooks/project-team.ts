import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createProjectTeamAssignment,
  endProjectTeamAssignment,
  listProjectTeam,
  updateProjectTeamAssignment,
  type CreateProjectTeamAssignmentInput,
  type UpdateProjectTeamAssignmentInput
} from '../api/project-team-api.js';

const PROJECT_TEAM_QUERY_KEY = ['module-8', 'project-team'] as const;

/** Create one retry key for a single browser Project Team command attempt. */
function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** Load one Project Team when a valid Project ID is selected. */
export function useProjectTeam(projectId: string, enabled = true) {
  return useQuery({
    queryKey: [...PROJECT_TEAM_QUERY_KEY, projectId],
    queryFn: () => listProjectTeam(projectId),
    enabled: enabled && projectId.length > 0,
    retry: false
  });
}

/** Refresh one Project Team readback after a successful write. */
async function invalidateProjectTeam(queryClient: ReturnType<typeof useQueryClient>, projectId: string): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: [...PROJECT_TEAM_QUERY_KEY, projectId] });
}

/** Create one assignment and refresh its Project Team. */
export function useCreateProjectTeamAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: Readonly<{ projectId: string; input: CreateProjectTeamAssignmentInput }>) =>
      createProjectTeamAssignment(variables.projectId, variables.input, newIdempotencyKey()),
    /** Refresh the Project Team list after a successful assignment create. */
    async onSuccess(_data, variables) { await invalidateProjectTeam(queryClient, variables.projectId); }
  });
}

/** Update one assignment and refresh its Project Team. */
export function useUpdateProjectTeamAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: Readonly<{ projectId: string; assignmentId: string; input: UpdateProjectTeamAssignmentInput }>) =>
      updateProjectTeamAssignment(variables.projectId, variables.assignmentId, variables.input, newIdempotencyKey()),
    /** Refresh the Project Team list after a successful assignment update. */
    async onSuccess(_data, variables) { await invalidateProjectTeam(queryClient, variables.projectId); }
  });
}

/** End one assignment and refresh its Project Team. */
export function useEndProjectTeamAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: Readonly<{ projectId: string; assignmentId: string; endDate: string; note?: string }>) =>
      endProjectTeamAssignment(variables.projectId, variables.assignmentId, variables.endDate, newIdempotencyKey(), variables.note),
    /** Refresh the Project Team list after a successful assignment end. */
    async onSuccess(_data, variables) { await invalidateProjectTeam(queryClient, variables.projectId); }
  });
}
