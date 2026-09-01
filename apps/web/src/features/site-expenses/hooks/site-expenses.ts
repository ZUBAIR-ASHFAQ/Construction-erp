import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSiteExpense,
  getSiteExpense,
  listSiteExpenses,
  postSiteExpense,
  reverseSiteExpense,
  updateSiteExpense,
  type CreateSiteExpenseInput,
  type ListSiteExpensesInput,
  type UpdateSiteExpenseInput
} from '../api/site-expenses-api.js';

const SITE_EXPENSE_QUERY_KEY = ['module-14', 'site-expenses'] as const;
const FINANCE_QUERY_KEY = ['final21', 'finance'] as const;
const JOB_COST_QUERY_KEY = ['module-9', 'project-budget-cost'] as const;

/** Refresh Site Expense, Finance and Job Cost reads after a posting-state mutation. */
async function invalidatePostingReads(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: SITE_EXPENSE_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: FINANCE_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: JOB_COST_QUERY_KEY })
  ]);
}

/** Load one bounded Site Expense register page. */
export function useSiteExpenses(input: ListSiteExpensesInput, enabled = true) {
  return useQuery({
    queryKey: [...SITE_EXPENSE_QUERY_KEY, 'list', input],
    queryFn: () => listSiteExpenses(input),
    enabled,
    retry: false
  });
}

/** Load one selected Site Expense detail. */
export function useSiteExpense(expenseId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...SITE_EXPENSE_QUERY_KEY, 'detail', expenseId],
    queryFn: () => getSiteExpense(expenseId as string),
    enabled: enabled && expenseId !== null,
    retry: false
  });
}

/** Create one DRAFT Site Expense and refresh the register. */
export function useCreateSiteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSiteExpenseInput) => createSiteExpense(input),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: SITE_EXPENSE_QUERY_KEY })
  });
}

/** Update one DRAFT Site Expense and refresh register/detail reads. */
export function useUpdateSiteExpense(expenseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSiteExpenseInput) => updateSiteExpense(expenseId, input),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: SITE_EXPENSE_QUERY_KEY })
  });
}

/** Post one Site Expense and refresh every affected server-state family. */
export function usePostSiteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: string) => postSiteExpense(expenseId),
    onSuccess: async () => invalidatePostingReads(queryClient)
  });
}

/** Reverse one posted Site Expense and refresh every affected server-state family. */
export function useReverseSiteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: string) => reverseSiteExpense(expenseId),
    onSuccess: async () => invalidatePostingReads(queryClient)
  });
}
