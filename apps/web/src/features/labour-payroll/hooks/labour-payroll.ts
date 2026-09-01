import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  calculatePayrollRun,
  createAttendance,
  createPayrollRun,
  finalizePayrollRun,
  getPayrollRun,
  listAttendance,
  listPayrollRuns,
  updateAttendance,
  type CreateAttendanceInput,
  type CreatePayrollRunInput,
  type ListAttendanceInput,
  type UpdateAttendanceInput
} from '../api/labour-payroll-api.js';

const LABOUR_PAYROLL_QUERY_KEY = ['module-13', 'labour-payroll'] as const;

/** Load bounded attendance history with server-side scope enforcement. */
export function useAttendance(input: ListAttendanceInput, enabled = true) {
  return useQuery({ queryKey: [...LABOUR_PAYROLL_QUERY_KEY, 'attendance', input], queryFn: () => listAttendance(input), enabled, retry: false });
}

/** Create attendance and refresh Labour/Payroll reads. */
export function useCreateAttendance() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAttendanceInput) => createAttendance(input),
    onSuccess: async () => client.invalidateQueries({ queryKey: LABOUR_PAYROLL_QUERY_KEY })
  });
}

/** Correct one unlocked attendance row and refresh Labour/Payroll reads. */
export function useUpdateAttendance(attendanceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAttendanceInput) => updateAttendance(attendanceId, input),
    onSuccess: async () => client.invalidateQueries({ queryKey: LABOUR_PAYROLL_QUERY_KEY })
  });
}

/** Load bounded Payroll Run history. */
export function usePayrollRuns(enabled = true) {
  return useQuery({ queryKey: [...LABOUR_PAYROLL_QUERY_KEY, 'runs'], queryFn: () => listPayrollRuns(), enabled, retry: false });
}

/** Load one Payroll calculation/finalization detail. */
export function usePayrollRun(payrollRunId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...LABOUR_PAYROLL_QUERY_KEY, 'run', payrollRunId],
    queryFn: () => getPayrollRun(payrollRunId as string),
    enabled: enabled && payrollRunId !== null,
    retry: false
  });
}

/** Create one Payroll period and refresh run history. */
export function useCreatePayrollRun() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePayrollRunInput) => createPayrollRun(input),
    onSuccess: async () => client.invalidateQueries({ queryKey: LABOUR_PAYROLL_QUERY_KEY })
  });
}

/** Recalculate one Payroll Run and refresh its preview. */
export function useCalculatePayrollRun(payrollRunId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => calculatePayrollRun(payrollRunId),
    onSuccess: async () => client.invalidateQueries({ queryKey: LABOUR_PAYROLL_QUERY_KEY })
  });
}

/** Finalize one Payroll Run and refresh immutable Payroll history. */
export function useFinalizePayrollRun(payrollRunId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => finalizePayrollRun(payrollRunId),
    onSuccess: async () => client.invalidateQueries({ queryKey: LABOUR_PAYROLL_QUERY_KEY })
  });
}
