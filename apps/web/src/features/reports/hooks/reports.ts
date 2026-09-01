import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createReportExport,
  getReportDownload,
  getReportRun,
  listReportCatalog,
  listSavedReportFilters,
  runReport,
  saveReportFilter,
  type CreateReportExportInput,
  type ReportCode,
  type RunReportInput
} from '../api/reports-api.js';

export const REPORTS_QUERY_KEY = ['module-20', 'reports'] as const;

/** Load the permission-filtered Module 20 report catalog. */
export function useReportCatalog(enabled = true) {
  return useQuery({
    queryKey: [...REPORTS_QUERY_KEY, 'catalog'],
    queryFn: () => listReportCatalog(),
    enabled,
    retry: false
  });
}

/** Run one bounded report on demand while TanStack Query owns the returned server state. */
export function useRunReport() {
  return useMutation({ mutationFn: (input: RunReportInput) => runReport(input) });
}

/** Queue one report export and return its server-owned run record. */
export function useCreateReportExport() {
  return useMutation({ mutationFn: (input: CreateReportExportInput) => createReportExport(input) });
}

/** Poll one active export run until it reaches a final state. */
export function useReportRun(runId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...REPORTS_QUERY_KEY, 'run', runId],
    queryFn: () => getReportRun(runId as string),
    enabled: enabled && runId !== null,
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'QUEUED' || status === 'RUNNING' ? 2_000 : false;
    }
  });
}

/** Request one authorized signed download only when the user explicitly asks for it. */
export function useReportDownload() {
  return useMutation({ mutationFn: (runId: string) => getReportDownload(runId) });
}

/** Load saved filters owned by the current user for the selected report. */
export function useSavedReportFilters(reportCode: ReportCode | null, enabled = true) {
  return useQuery({
    queryKey: [...REPORTS_QUERY_KEY, 'saved-filters', reportCode],
    queryFn: () => listSavedReportFilters(reportCode as ReportCode),
    enabled: enabled && reportCode !== null,
    retry: false
  });
}

/** Save one user-owned report filter and refresh the saved-filter list. */
export function useSaveReportFilter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveReportFilter,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: [...REPORTS_QUERY_KEY, 'saved-filters'] })
  });
}
