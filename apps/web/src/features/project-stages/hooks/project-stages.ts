import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveStageProgress,
  createProjectStage,
  freezeProjectStageBaseline,
  getProjectStages,
  recordStageProgress,
  updateProjectStage,
  type CreateProjectStageInput,
  type RecordStageProgressInput,
  type UpdateProjectStageInput
} from '../api/project-stages-api.js';

const STAGES_QUERY_KEY = ['module-7', 'project-stages'] as const;

/** Load one Project's Stage baseline and progress summary. */
export function useProjectStages(projectId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...STAGES_QUERY_KEY, 'project', projectId],
    queryFn: () => getProjectStages(projectId as string),
    enabled: enabled && projectId !== null
  });
}

/** Create one draft Stage and refresh its Project Stage summary. */
export function useCreateProjectStage(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectStageInput) => createProjectStage(projectId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: STAGES_QUERY_KEY });
    }
  });
}

/** Update one draft Stage and refresh the Project Stage summary. */
export function useUpdateProjectStage(projectId: string, stageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectStageInput) => updateProjectStage(projectId, stageId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: STAGES_QUERY_KEY });
    }
  });
}

/** Freeze one exact 100-percent Stage baseline. */
export function useFreezeProjectStageBaseline(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => freezeProjectStageBaseline(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: STAGES_QUERY_KEY });
    }
  });
}

/** Record one Stage physical-progress update. */
export function useRecordStageProgress(projectId: string, stageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordStageProgressInput) => recordStageProgress(projectId, stageId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: STAGES_QUERY_KEY });
    }
  });
}

/** Approve one submitted Stage progress update. */
export function useApproveStageProgress(projectId: string, stageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updateId: string) => approveStageProgress(projectId, stageId, updateId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: STAGES_QUERY_KEY });
    }
  });
}
