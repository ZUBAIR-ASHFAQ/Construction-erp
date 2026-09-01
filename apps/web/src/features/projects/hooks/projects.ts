import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  activateProject,
  closeProject,
  completeProject,
  resumeProject,
  suspendProject,
  createProject,
  getProject,
  listProjects,
  updateProject,
  type CloseProjectInput,
  type CreateProjectInput,
  type ListProjectsInput,
  type ProjectLifecycleReasonInput,
  type UpdateProjectInput
} from '../api/projects-api.js';

const PROJECTS_QUERY_KEY = ['module-6', 'projects'] as const;

/** Load one reviewed Project-register page only when Project read access is available. */
export function useProjects(input: ListProjectsInput, enabled = true) {
  return useQuery({
    queryKey: [...PROJECTS_QUERY_KEY, 'list', input],
    queryFn: () => listProjects(input),
    enabled
  });
}

/** Load the selected Project and lifecycle history only when Project read access is available. */
export function useProject(projectId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...PROJECTS_QUERY_KEY, 'detail', projectId],
    queryFn: () => getProject(projectId as string),
    enabled: enabled && projectId !== null
  });
}

/** Create one DRAFT Project and refresh the maintained Project query family. */
export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProjectInput) => createProject(input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    }
  });
}

/** Update one Project master record and refresh Project list/detail server state. */
export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateProjectInput) => updateProject(projectId, input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    }
  });
}

/** Activate one DRAFT Project and refresh Project lifecycle state. */
export function useActivateProject(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => activateProject(projectId),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    }
  });
}

/** Suspend one ACTIVE Project and refresh Project lifecycle state. */
export function useSuspendProject(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ProjectLifecycleReasonInput) => suspendProject(projectId, input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    }
  });
}

/** Resume one SUSPENDED Project and refresh Project lifecycle state. */
export function useResumeProject(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ProjectLifecycleReasonInput) => resumeProject(projectId, input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    }
  });
}

/** Complete one ACTIVE Project and refresh Project lifecycle state. */
export function useCompleteProject(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => completeProject(projectId),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    }
  });
}

/** Close one COMPLETED Project and refresh Project lifecycle state. */
export function useCloseProject(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CloseProjectInput) => closeProject(projectId, input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    }
  });
}
