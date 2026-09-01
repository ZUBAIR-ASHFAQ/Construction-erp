import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBudget,
  freezeBudget,
  getCurrentBudget,
  getJobCost,
  getJobCostLedger,
  replaceBudgetLines,
  updateForecast,
  type GetJobCostLedgerInput,
  type ReplaceBudgetLinesInput,
  type UpdateForecastInput
} from '../api/budgets-job-cost-api.js';

const MODULE_9_QUERY_KEY = ['module-9', 'project-budget-cost'] as const;

/** Load the newest Project budget only when the selected Project can be attempted. */
export function useCurrentBudget(projectId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...MODULE_9_QUERY_KEY, 'current-budget', projectId],
    queryFn: () => getCurrentBudget(projectId as string),
    enabled: enabled && projectId !== null,
    retry: false
  });
}

/** Load the authoritative server-calculated Project job-cost summary. */
export function useJobCost(projectId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...MODULE_9_QUERY_KEY, 'job-cost', projectId],
    queryFn: () => getJobCost(projectId as string),
    enabled: enabled && projectId !== null,
    retry: false
  });
}

/** Load one bounded job-cost ledger page without inventing business filters. */
export function useJobCostLedger(projectId: string | null, input: GetJobCostLedgerInput, enabled = true) {
  return useQuery({
    queryKey: [...MODULE_9_QUERY_KEY, 'ledger', projectId, input],
    queryFn: () => getJobCostLedger(projectId as string, input),
    enabled: enabled && projectId !== null,
    retry: false
  });
}

/** Create one DRAFT budget and refresh all Module 9 reads. */
export function useCreateBudget(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => createBudget(projectId),
    /** Refresh Module 9 reads after the mutation succeeds. */
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: MODULE_9_QUERY_KEY });
    }
  });
}

/** Replace one DRAFT budget line set and refresh Module 9 reads. */
export function useReplaceBudgetLines(projectId: string, budgetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReplaceBudgetLinesInput) => replaceBudgetLines(projectId, budgetId, input),
    /** Refresh Module 9 reads after the mutation succeeds. */
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: MODULE_9_QUERY_KEY });
    }
  });
}

/** Freeze one DRAFT budget and refresh Module 9 reads. */
export function useFreezeBudget(projectId: string, budgetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => freezeBudget(projectId, budgetId),
    /** Refresh Module 9 reads after the mutation succeeds. */
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: MODULE_9_QUERY_KEY });
    }
  });
}

/** Replace the current Project forecast and refresh Module 9 reads. */
export function useUpdateForecast(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateForecastInput) => updateForecast(projectId, input),
    /** Refresh Module 9 reads after the mutation succeeds. */
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: MODULE_9_QUERY_KEY });
    }
  });
}
