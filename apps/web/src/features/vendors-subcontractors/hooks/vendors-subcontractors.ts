import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSubcontractContract,
  createSubcontractPayment,
  createSubcontractor,
  createVendor,
  createVendorContact,
  finishSubcontractContract,
  getVendor,
  listSubcontractContracts,
  listSubcontractLedger,
  listSubcontractPayments,
  listSubcontractors,
  listVendors,
  updateSubcontractor,
  updateVendor,
  type CreateSubcontractContractInput,
  type CreateSubcontractPaymentInput,
  type CreateSubcontractorInput,
  type CreateVendorContactInput,
  type CreateVendorInput,
  type ListSubcontractContractsInput,
  type ListSubcontractLedgerInput,
  type ListSubcontractPaymentsInput,
  type ListSubcontractorsInput,
  type ListVendorsInput,
  type UpdateSubcontractorInput,
  type UpdateVendorInput
} from '../api/vendors-subcontractors-api.js';

const MASTER_QUERY_KEY = ['vendors-subcontractors'] as const;

/** Load a filtered supplier/vendor page. */
export function useVendors(input: ListVendorsInput, enabled = true) {
  return useQuery({ queryKey: [...MASTER_QUERY_KEY, 'vendors', input], queryFn: () => listVendors(input), enabled });
}

/** Load the selected supplier/vendor detail. */
export function useVendor(vendorId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...MASTER_QUERY_KEY, 'vendor', vendorId],
    queryFn: () => getVendor(vendorId as string),
    enabled: enabled && vendorId !== null
  });
}

/** Create one supplier/vendor and refresh master queries. */
export function useCreateVendor() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: CreateVendorInput) => createVendor(input), async onSuccess() { await queryClient.invalidateQueries({ queryKey: MASTER_QUERY_KEY }); } });
}

/** Update one supplier/vendor and refresh master queries. */
export function useUpdateVendor(vendorId: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: UpdateVendorInput) => updateVendor(vendorId, input), async onSuccess() { await queryClient.invalidateQueries({ queryKey: MASTER_QUERY_KEY }); } });
}

/** Add one supplier/vendor contact and refresh the selected detail. */
export function useCreateVendorContact(vendorId: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: CreateVendorContactInput) => createVendorContact(vendorId, input), async onSuccess() { await queryClient.invalidateQueries({ queryKey: MASTER_QUERY_KEY }); } });
}

/** Load one filtered subcontractor-master page. */
export function useSubcontractors(input: ListSubcontractorsInput, enabled = true) {
  return useQuery({ queryKey: [...MASTER_QUERY_KEY, 'subcontractors', input], queryFn: () => listSubcontractors(input), enabled });
}

/** Create one subcontractor profile and refresh master queries. */
export function useCreateSubcontractor() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: CreateSubcontractorInput) => createSubcontractor(input), async onSuccess() { await queryClient.invalidateQueries({ queryKey: MASTER_QUERY_KEY }); } });
}

/** Update one subcontractor profile and refresh master queries. */
export function useUpdateSubcontractor(subcontractorId: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: UpdateSubcontractorInput) => updateSubcontractor(subcontractorId, input), async onSuccess() { await queryClient.invalidateQueries({ queryKey: MASTER_QUERY_KEY }); } });
}

/** Load one filtered subcontract-contract page. */
export function useSubcontractContracts(input: ListSubcontractContractsInput, enabled = true) {
  return useQuery({ queryKey: [...MASTER_QUERY_KEY, 'subcontract-contracts', input], queryFn: () => listSubcontractContracts(input), enabled });
}

/** Create one subcontract Project contract and refresh subcontract data. */
export function useCreateSubcontractContract() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: CreateSubcontractContractInput) => createSubcontractContract(input), async onSuccess() { await queryClient.invalidateQueries({ queryKey: MASTER_QUERY_KEY }); } });
}

/** Finish one active subcontract contract and refresh subcontract data. */
export function useFinishSubcontractContract() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (contractId: string) => finishSubcontractContract(contractId), async onSuccess() { await queryClient.invalidateQueries({ queryKey: MASTER_QUERY_KEY }); } });
}

/** Load direct payments belonging to subcontract contracts, never supplier invoices. */
export function useSubcontractPayments(input: ListSubcontractPaymentsInput, enabled = true) {
  return useQuery({ queryKey: [...MASTER_QUERY_KEY, 'subcontract-payments', input], queryFn: () => listSubcontractPayments(input), enabled });
}

/** Load source-derived subcontract contract balances for the subcontractor ledger. */
export function useSubcontractLedger(input: ListSubcontractLedgerInput, enabled = true) {
  return useQuery({ queryKey: [...MASTER_QUERY_KEY, 'subcontract-ledger', input], queryFn: () => listSubcontractLedger(input), enabled });
}

/** Create one subcontract payment and refresh subcontract, Finance and Job Cost read models. */
export function useCreateSubcontractPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSubcontractPaymentInput) => createSubcontractPayment(input),
    async onSuccess() {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: MASTER_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['final21', 'finance'] }),
        queryClient.invalidateQueries({ queryKey: ['module-9', 'project-budget-cost'] })
      ]);
    }
  });
}
