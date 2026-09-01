import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getDashboardSummary,
  getProjectDashboard,
  listDashboardAlerts,
  listDashboardProjects,
  updateDashboardPreferences,
  type DashboardAlertsQuery,
  type DashboardProjectQuery,
  type DashboardProjectsQuery,
  type DashboardSummaryQuery,
  type UpdateDashboardPreferencesInput
} from '../api/dashboard-api.js';

export const DASHBOARD_QUERY_KEY = ['module-1', 'dashboard'] as const;

/** Load the Company Dashboard summary and server-owned user preferences. */
export function useDashboardSummary(input: DashboardSummaryQuery, enabled = true) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, 'summary', input],
    queryFn: () => getDashboardSummary(input),
    enabled,
    retry: false
  });
}

/** Load one bounded Project health page for Dashboard navigation and overview. */
export function useDashboardProjects(input: DashboardProjectsQuery, enabled = true) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, 'projects', input],
    queryFn: () => listDashboardProjects(input),
    enabled,
    retry: false
  });
}

/** Load one selected Project's physical and financial Dashboard read model. */
export function useProjectDashboard(projectId: string | null, input: DashboardProjectQuery, enabled = true) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, 'project', projectId, input],
    queryFn: () => getProjectDashboard(projectId as string, input),
    enabled: enabled && projectId !== null,
    retry: false
  });
}

/** Load bounded source-module alerts without creating browser-owned alert state. */
export function useDashboardAlerts(input: DashboardAlertsQuery, enabled = true) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, 'alerts', input],
    queryFn: () => listDashboardAlerts(input),
    enabled,
    retry: false
  });
}

/** Save Dashboard preferences and refresh the server summary after the write completes. */
export function useUpdateDashboardPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateDashboardPreferencesInput) => updateDashboardPreferences(input),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: [...DASHBOARD_QUERY_KEY, 'summary'] })
  });
}
