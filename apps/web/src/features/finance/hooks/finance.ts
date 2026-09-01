import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeFinancePeriod,
  createBankReconciliation,
  createFinanceAccount,
  createManualJournal,
  getFinanceLedger,
  getFinanceTrialBalance,
  listCashBankAccounts,
  listFinanceAccounts,
  listFinanceJournals,
  listFinancePeriods,
  postFinanceJournal,
  reverseFinanceJournal,
  type CreateBankReconciliationInput,
  type CreateFinanceAccountInput,
  type CreateManualJournalInput,
  type GetFinanceLedgerInput,
  type ListCashBankAccountsInput,
  type ListFinanceAccountsInput,
  type ListFinanceJournalsInput,
  type ListFinancePeriodsInput
} from '../api/finance-api.js';

const FINANCE_KEY = ['final21', 'finance'] as const;

/** Load Chart-of-Accounts data only when the current screen is authorized. */
export function useFinanceAccounts(input: ListFinanceAccountsInput = {}, enabled = true) {
  return useQuery({ queryKey: [...FINANCE_KEY, 'accounts', input], queryFn: () => listFinanceAccounts(input), enabled });
}

/** Create a GL account and refresh account/cash-bank reads. */
export function useCreateFinanceAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFinanceAccountInput) => createFinanceAccount(input),
    onSuccess: async () => Promise.all([
      queryClient.invalidateQueries({ queryKey: [...FINANCE_KEY, 'accounts'] }),
      queryClient.invalidateQueries({ queryKey: [...FINANCE_KEY, 'cash-bank'] })
    ])
  });
}


/** Load bounded fiscal periods for Finance selectors and period-control commands. */
export function useFinancePeriods(input: ListFinancePeriodsInput = {}, enabled = true) {
  return useQuery({ queryKey: [...FINANCE_KEY, 'periods', input], queryFn: () => listFinancePeriods(input), enabled });
}

/** Load bounded Journal history. */
export function useFinanceJournals(input: ListFinanceJournalsInput = {}, enabled = true) {
  return useQuery({ queryKey: [...FINANCE_KEY, 'journals', input], queryFn: () => listFinanceJournals(input), enabled });
}

/** Create a draft Journal and refresh Journal history. */
export function useCreateManualJournal() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: CreateManualJournalInput) => createManualJournal(input), onSuccess: () => queryClient.invalidateQueries({ queryKey: [...FINANCE_KEY, 'journals'] }) });
}

/** Post a draft Journal and refresh all Finance read models affected by posting. */
export function usePostFinanceJournal() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (journalId: string) => postFinanceJournal(journalId), onSuccess: () => queryClient.invalidateQueries({ queryKey: FINANCE_KEY }) });
}

/** Reverse a posted Journal and refresh all Finance read models. */
export function useReverseFinanceJournal() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (journalId: string) => reverseFinanceJournal(journalId), onSuccess: () => queryClient.invalidateQueries({ queryKey: FINANCE_KEY }) });
}

/** Load one General Ledger query only after the user supplies a fiscal period. */
export function useFinanceLedger(input: GetFinanceLedgerInput | null) {
  return useQuery({ queryKey: [...FINANCE_KEY, 'ledger', input], queryFn: () => getFinanceLedger(input!), enabled: Boolean(input?.periodId) });
}

/** Load one trial balance only after the user supplies a fiscal period. */
export function useFinanceTrialBalance(periodId: string | null) {
  return useQuery({ queryKey: [...FINANCE_KEY, 'trial-balance', periodId], queryFn: () => getFinanceTrialBalance(periodId!), enabled: Boolean(periodId) });
}

/** Load Cash/Bank accounts and their posted balances. */
export function useCashBankAccounts(input: ListCashBankAccountsInput = {}, enabled = true) {
  return useQuery({ queryKey: [...FINANCE_KEY, 'cash-bank', input], queryFn: () => listCashBankAccounts(input), enabled });
}

/** Create a Bank Reconciliation and refresh Cash/Bank data. */
export function useCreateBankReconciliation() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: CreateBankReconciliationInput) => createBankReconciliation(input), onSuccess: () => queryClient.invalidateQueries({ queryKey: [...FINANCE_KEY, 'cash-bank'] }) });
}

/** Close one fiscal period and refresh all Finance results that depend on period state. */
export function useCloseFinancePeriod() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (periodId: string) => closeFinancePeriod(periodId), onSuccess: () => queryClient.invalidateQueries({ queryKey: FINANCE_KEY }) });
}
