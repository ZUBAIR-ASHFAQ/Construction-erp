import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  calculatePayrollRun,
  createAttendance,
  createPayrollPayment,
  createPayrollRun,
  finalizePayrollRun,
  getPayrollRun,
  getEmployeeSalaryLedger,
  listAttendance,
  listAttendanceAssignments,
  listPayrollRuns,
  listPayrollCashBankAccounts,
  listPayrollPayments,
  reversePayrollPayment,
  updateAttendance,
  type CalculatePayrollRunInput,
  type CreateAttendanceInput,
  type CreatePayrollPaymentInput,
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
    mutationFn: (input: CalculatePayrollRunInput) => calculatePayrollRun(payrollRunId, input),
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

/** Load the effective destinations that the attendance form is allowed to post to. */
export function useAttendanceAssignments(employeeId: string, workDate: string, enabled = true) {
  return useQuery({
    queryKey: [...LABOUR_PAYROLL_QUERY_KEY, 'attendance-assignments', employeeId, workDate],
    queryFn: () => listAttendanceAssignments(employeeId, workDate),
    enabled: enabled && employeeId.length > 0 && workDate.length > 0,
    retry: false
  });
}

/** Load active Cash/Bank salary-payment choices. */
export function usePayrollCashBankAccounts(enabled = true) {
  return useQuery({ queryKey: [...LABOUR_PAYROLL_QUERY_KEY, 'cash-bank'], queryFn: listPayrollCashBankAccounts, enabled, retry: false });
}

/** Load salary-payment history for the optional Employee or Payroll Run scope. */
export function usePayrollPayments(input: Readonly<{ employeeId?: string; payrollRunId?: string }> = {}, enabled = true) {
  return useQuery({ queryKey: [...LABOUR_PAYROLL_QUERY_KEY, 'payments', input], queryFn: () => listPayrollPayments(input), enabled, retry: false });
}

/** Post one Employee salary payment and refresh Payroll, Finance and reporting reads. */
export function useCreatePayrollPayment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePayrollPaymentInput) => createPayrollPayment(input),
    onSuccess: async () => client.invalidateQueries()
  });
}

/** Reverse one posted Employee salary payment and refresh every affected balance. */
export function useReversePayrollPayment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Readonly<{ paymentId: string; reversalDate: string }>) => reversePayrollPayment(input.paymentId, input.reversalDate),
    onSuccess: async () => client.invalidateQueries()
  });
}

/** Load one Employee salary ledger while its detail popup is open. */
export function useEmployeeSalaryLedger(employeeId: string | null) {
  return useQuery({ queryKey: [...LABOUR_PAYROLL_QUERY_KEY, 'employee-ledger', employeeId], queryFn: () => getEmployeeSalaryLedger(employeeId as string), enabled: employeeId !== null, retry: false });
}
