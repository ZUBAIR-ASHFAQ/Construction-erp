import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adjustStock,
  createMaterial,
  createMaterialIssue,
  listLedger,
  listMaterials,
  listStock,
  transferMaterial,
  type AdjustStockInput,
  type CreateMaterialInput,
  type CreateMaterialIssueInput,
  type TransferMaterialInput
} from '../api/inventory-api.js';

const KEY = ['inventory'] as const;

/** Load Material master data. */
export function useMaterials(enabled = true) {
  return useQuery({ queryKey: [...KEY, 'materials'], queryFn: () => listMaterials({ page: 1, pageSize: 100 }), enabled });
}

/** Load current derived stock and Warehouse options. */
export function useInventoryStock(enabled = true) {
  return useQuery({ queryKey: [...KEY, 'stock'], queryFn: () => listStock({ page: 1, pageSize: 100 }), enabled });
}

/** Load the newest stock-ledger movements. */
export function useInventoryLedger(enabled = true) {
  return useQuery({ queryKey: [...KEY, 'ledger'], queryFn: () => listLedger({ page: 1, pageSize: 100 }), enabled });
}

/** Create a Material then refresh Material and stock reads. */
export function useCreateMaterial() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: CreateMaterialInput) => createMaterial(input), onSuccess: async () => client.invalidateQueries({ queryKey: KEY }) });
}

/** Issue Material then refresh stock and ledger reads. */
export function useCreateMaterialIssue() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: CreateMaterialIssueInput) => createMaterialIssue(input), onSuccess: async () => client.invalidateQueries({ queryKey: KEY }) });
}

/** Transfer Material then refresh stock and ledger reads. */
export function useTransferMaterial() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: TransferMaterialInput) => transferMaterial(input), onSuccess: async () => client.invalidateQueries({ queryKey: KEY }) });
}

/** Adjust stock then refresh stock and ledger reads. */
export function useAdjustStock() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: AdjustStockInput) => adjustStock(input), onSuccess: async () => client.invalidateQueries({ queryKey: KEY }) });
}
