import { useQuery } from '@tanstack/react-query';
import {
  getProjectProfitabilityStages,
  getProjectProfitabilitySummary,
  getProjectProfitabilityTrend,
  listProjectProfitabilityPortfolio,
  type ProjectProfitabilityAsOfInput,
  type ProjectProfitabilityPortfolioInput,
  type ProjectProfitabilityTrendInput
} from '../api/project-profitability-api.js';

export const PROJECT_PROFITABILITY_QUERY_KEY = ['module-19', 'project-profitability'] as const;

/** Load one Project profitability summary only when the browser has a selected Project to attempt. */
export function useProjectProfitabilitySummary(
  projectId: string | null,
  input: ProjectProfitabilityAsOfInput,
  enabled = true
) {
  return useQuery({
    queryKey: [...PROJECT_PROFITABILITY_QUERY_KEY, 'summary', projectId, input],
    queryFn: () => getProjectProfitabilitySummary(projectId as string, input),
    enabled: enabled && projectId !== null,
    retry: false
  });
}

/** Load Stage profitability and Project-only reconciliation from the authoritative server read. */
export function useProjectProfitabilityStages(
  projectId: string | null,
  input: ProjectProfitabilityAsOfInput,
  enabled = true
) {
  return useQuery({
    queryKey: [...PROJECT_PROFITABILITY_QUERY_KEY, 'stages', projectId, input],
    queryFn: () => getProjectProfitabilityStages(projectId as string, input),
    enabled: enabled && projectId !== null,
    retry: false
  });
}

/** Load one bounded Project revenue, cost and profit trend. */
export function useProjectProfitabilityTrend(
  projectId: string | null,
  input: ProjectProfitabilityTrendInput,
  enabled = true
) {
  return useQuery({
    queryKey: [...PROJECT_PROFITABILITY_QUERY_KEY, 'trend', projectId, input],
    queryFn: () => getProjectProfitabilityTrend(projectId as string, input),
    enabled: enabled && projectId !== null,
    retry: false
  });
}

/** Load one bounded permission-scoped profitability portfolio page. */
export function useProjectProfitabilityPortfolio(
  input: ProjectProfitabilityPortfolioInput,
  enabled = true
) {
  return useQuery({
    queryKey: [...PROJECT_PROFITABILITY_QUERY_KEY, 'portfolio', input],
    queryFn: () => listProjectProfitabilityPortfolio(input),
    enabled,
    retry: false
  });
}
