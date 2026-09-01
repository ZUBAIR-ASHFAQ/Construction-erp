import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  allocateClientReceipt,
  createClientReceipt,
  getClientReceipt,
  listClientReceipts,
  reverseClientReceipt,
  unallocateClientReceipt,
  type AllocateClientReceiptInput,
  type CreateClientReceiptInput,
  type ListClientReceiptsInput,
  type UnallocateClientReceiptInput
} from '../api/client-receipts-api.js';

const CLIENT_RECEIPTS_QUERY_KEY = ['module-16', 'client-receipts'] as const;
const CLIENT_BILLING_QUERY_KEY = ['client-billing'] as const;
const PROJECT_STAGES_QUERY_KEY = ['module-7', 'project-stages'] as const;
const FINANCE_QUERY_KEY = ['final21', 'finance'] as const;
const CLIENTS_QUERY_KEY = ['clients'] as const;

/** Refresh Client Receipt and downstream financial reads after one receipt command. */
async function refreshReceiptEffects(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: CLIENT_RECEIPTS_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: CLIENT_BILLING_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: PROJECT_STAGES_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: FINANCE_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY })
  ]);
}

/** Load one bounded permission-scoped Client Receipt register page. */
export function useClientReceipts(input: ListClientReceiptsInput, enabled = true) {
  return useQuery({
    queryKey: [...CLIENT_RECEIPTS_QUERY_KEY, 'list', input],
    queryFn: () => listClientReceipts(input),
    enabled,
    retry: false
  });
}

/** Load one selected Client Receipt and its current allocations. */
export function useClientReceipt(receiptId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...CLIENT_RECEIPTS_QUERY_KEY, 'detail', receiptId],
    queryFn: () => getClientReceipt(receiptId as string),
    enabled: enabled && receiptId !== null,
    retry: false
  });
}

/** Create/post one Client Receipt and refresh affected source reads. */
export function useCreateClientReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClientReceiptInput) => createClientReceipt(input),
    onSuccess: async () => refreshReceiptEffects(queryClient)
  });
}

/** Allocate one posted receipt to one Client Invoice and refresh balances. */
export function useAllocateClientReceipt(receiptId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AllocateClientReceiptInput) => {
      if (!receiptId) throw new Error('Select a posted Client Receipt before allocating.');
      return allocateClientReceipt(receiptId, input);
    },
    onSuccess: async () => refreshReceiptEffects(queryClient)
  });
}

/** Reverse one allocation and refresh receipt, invoice and Finance reads. */
export function useUnallocateClientReceipt(receiptId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UnallocateClientReceiptInput) => {
      if (!receiptId) throw new Error('Select a Client Receipt before reversing an allocation.');
      return unallocateClientReceipt(receiptId, input);
    },
    onSuccess: async () => refreshReceiptEffects(queryClient)
  });
}

/** Reverse one posted Client Receipt and refresh all affected financial reads. */
export function useReverseClientReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (receiptId: string) => reverseClientReceipt(receiptId),
    onSuccess: async () => refreshReceiptEffects(queryClient)
  });
}
