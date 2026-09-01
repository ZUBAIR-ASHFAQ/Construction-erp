import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveRequisition,
  cancelPurchaseOrder,
  createGoodsReceipt,
  createPurchaseOrder,
  createRequisition,
  issuePurchaseOrder,
  listPurchaseOrders,
  listRequisitions,
  listVendors,
  type CreateGoodsReceiptInput,
  type CreatePurchaseOrderInput,
  type CreateRequisitionInput
} from '../api/procurement-api.js';

const PROCUREMENT_QUERY_KEY = ['final-21', 'procurement'] as const;

/** Load final Module 5 Vendor choices used by Procurement. */
export function useProcurementVendors(enabled = true) {
  return useQuery({ queryKey: [...PROCUREMENT_QUERY_KEY, 'vendors'], queryFn: listVendors, enabled });
}

/** Load material requirements for one Project. */
export function useRequisitions(projectId: string | null, enabled = true) {
  return useQuery({ queryKey: [...PROCUREMENT_QUERY_KEY, 'requisitions', projectId], queryFn: () => listRequisitions(projectId as string), enabled: enabled && projectId !== null });
}

/** Load Purchase Orders for one Project. */
export function useProcurementPurchaseOrders(projectId: string | null, enabled = true) {
  return useQuery({ queryKey: [...PROCUREMENT_QUERY_KEY, 'purchase-orders', projectId], queryFn: () => listPurchaseOrders(projectId as string), enabled: enabled && projectId !== null });
}

/** Refresh Procurement server state after one successful command. */
async function refreshProcurement(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: PROCUREMENT_QUERY_KEY });
}

/** Create one material requirement and refresh Procurement registers. */
export function useCreateRequisition() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: CreateRequisitionInput) => createRequisition(input), onSuccess: () => refreshProcurement(queryClient) });
}

/** Approve one draft requirement and refresh Procurement registers. */
export function useApproveRequisition() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (id: string) => approveRequisition(id), onSuccess: () => refreshProcurement(queryClient) });
}

/** Create one Purchase Order and refresh Procurement registers. */
export function useCreateProcurementPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: CreatePurchaseOrderInput) => createPurchaseOrder(input), onSuccess: () => refreshProcurement(queryClient) });
}

/** Issue one Purchase Order and refresh Procurement registers. */
export function useIssueProcurementPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (id: string) => issuePurchaseOrder(id), onSuccess: () => refreshProcurement(queryClient) });
}

/** Cancel one Purchase Order and refresh Procurement registers. */
export function useCancelProcurementPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: Readonly<{ id: string; reason: string }>) => cancelPurchaseOrder(input.id, input.reason), onSuccess: () => refreshProcurement(queryClient) });
}

/** Post one Goods Receipt and refresh Procurement registers. */
export function useCreateGoodsReceipt() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: CreateGoodsReceiptInput) => createGoodsReceipt(input), onSuccess: () => refreshProcurement(queryClient) });
}
