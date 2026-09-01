import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  allocateSupplierPayment,
  createSupplierInvoice,
  createSupplierPayment,
  getSupplierAging,
  getSupplierInvoice,
  listSupplierInvoices,
  listSupplierPayments,
  postSupplierInvoice,
  type AllocateSupplierPaymentInput,
  type CreateSupplierInvoiceInput,
  type CreateSupplierPaymentInput,
  type ListSupplierInvoicesInput,
  type ListSupplierPaymentsInput,
  type SupplierAgingInput
} from '../api/supplier-payables-api.js';

const SUPPLIER_PAYABLES_QUERY_KEY = ['module-17', 'supplier-payables'] as const;
const FINANCE_QUERY_KEY = ['final21', 'finance'] as const;
const JOB_COST_QUERY_KEY = ['module-9', 'project-budget-cost'] as const;

/** Refresh Supplier Payables and dependent Finance/Job Cost reads after a posting command. */
async function refreshPostingReads(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: SUPPLIER_PAYABLES_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: FINANCE_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: JOB_COST_QUERY_KEY })
  ]);
}

/** Load one permission-scoped Supplier Invoice page. */
export function useSupplierInvoices(input: ListSupplierInvoicesInput, enabled = true) {
  return useQuery({
    queryKey: [...SUPPLIER_PAYABLES_QUERY_KEY, 'invoices', input],
    queryFn: () => listSupplierInvoices(input),
    enabled,
    retry: false
  });
}

/** Load one selected Supplier Invoice detail. */
export function useSupplierInvoice(invoiceId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...SUPPLIER_PAYABLES_QUERY_KEY, 'invoice', invoiceId],
    queryFn: () => getSupplierInvoice(invoiceId as string),
    enabled: enabled && invoiceId !== null,
    retry: false
  });
}

/** Create one Supplier Invoice draft and refresh invoice/aging reads. */
export function useCreateSupplierInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierInvoiceInput) => createSupplierInvoice(input),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: SUPPLIER_PAYABLES_QUERY_KEY })
  });
}

/** Post one Supplier Invoice and refresh AP, Finance and Job Cost reads. */
export function usePostSupplierInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) => postSupplierInvoice(invoiceId),
    onSuccess: async () => refreshPostingReads(queryClient)
  });
}

/** Load one permission-scoped Supplier Payment page. */
export function useSupplierPayments(input: ListSupplierPaymentsInput, enabled = true) {
  return useQuery({
    queryKey: [...SUPPLIER_PAYABLES_QUERY_KEY, 'payments', input],
    queryFn: () => listSupplierPayments(input),
    enabled,
    retry: false
  });
}

/** Create/post one Supplier Payment and refresh AP and Finance reads. */
export function useCreateSupplierPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierPaymentInput) => createSupplierPayment(input),
    onSuccess: async () => refreshPostingReads(queryClient)
  });
}

/** Allocate one posted payment and refresh outstanding/aging reads. */
export function useAllocateSupplierPayment(paymentId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AllocateSupplierPaymentInput) => {
      if (!paymentId) throw new Error('Select a posted Supplier Payment before allocating.');
      return allocateSupplierPayment(paymentId, input);
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: SUPPLIER_PAYABLES_QUERY_KEY })
  });
}

/** Load bounded source-derived Supplier aging. */
export function useSupplierAging(input: SupplierAgingInput, enabled = true) {
  return useQuery({
    queryKey: [...SUPPLIER_PAYABLES_QUERY_KEY, 'aging', input],
    queryFn: () => getSupplierAging(input),
    enabled,
    retry: false
  });
}
