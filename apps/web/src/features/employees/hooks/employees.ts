import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createEmployee,
  createEmployeeCompensation,
  getEmployee,
  listEmployees,
  updateEmployee,
  updateEmployeeStatus,
  type CreateEmployeeCompensationInput,
  type CreateEmployeeInput,
  type ListEmployeesInput,
  type UpdateEmployeeInput,
  type UpdateEmployeeStatusInput
} from '../api/employees-api.js';

const EMPLOYEES_QUERY_KEY = ['employees'] as const;

/** Load one filtered and bounded Employee register page. */
export function useEmployees(input: ListEmployeesInput, enabled = true) {
  return useQuery({
    queryKey: [...EMPLOYEES_QUERY_KEY, 'list', input],
    queryFn: () => listEmployees(input),
    enabled,
    retry: false
  });
}

/** Load one Employee detail and authorized compensation history. */
export function useEmployee(employeeId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...EMPLOYEES_QUERY_KEY, 'detail', employeeId],
    queryFn: () => getEmployee(employeeId as string),
    enabled: enabled && employeeId !== null,
    retry: false
  });
}

/** Create one Employee and refresh Employee read models. */
export function useCreateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEmployeeInput) => createEmployee(input),
    /** Refresh Employee reads after a successful create. */
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: EMPLOYEES_QUERY_KEY });
    }
  });
}

/** Update one Employee master record and refresh Employee read models. */
export function useUpdateEmployee(employeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateEmployeeInput) => updateEmployee(employeeId, input),
    /** Refresh Employee reads after a successful update. */
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: EMPLOYEES_QUERY_KEY });
    }
  });
}

/** Append one effective-dated compensation record and refresh the Employee detail. */
export function useCreateEmployeeCompensation(employeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEmployeeCompensationInput) => createEmployeeCompensation(employeeId, input),
    /** Refresh Employee reads after a compensation change. */
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: EMPLOYEES_QUERY_KEY });
    }
  });
}

/** Change one Employee lifecycle status and refresh Employee read models. */
export function useUpdateEmployeeStatus(employeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateEmployeeStatusInput) => updateEmployeeStatus(employeeId, input),
    /** Refresh Employee reads after a lifecycle change. */
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: EMPLOYEES_QUERY_KEY });
    }
  });
}
