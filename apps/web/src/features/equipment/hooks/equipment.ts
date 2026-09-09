import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignEquipment,
  createEquipment,
  endEquipmentAssignment,
  getEquipmentHistory,
  listEquipment,
  reverseEquipmentAssignment,
  updateEquipment,
  type AssignEquipmentInput,
  type CreateEquipmentInput,
  type ListEquipmentInput,
  type UpdateEquipmentInput
} from '../api/equipment-api.js';

const EQUIPMENT_QUERY_KEY = ['module-12', 'equipment'] as const;

/** Load one bounded Equipment register page. */
export function useEquipment(input: ListEquipmentInput, enabled = true) {
  return useQuery({ queryKey: [...EQUIPMENT_QUERY_KEY, 'list', input], queryFn: () => listEquipment(input), enabled });
}

/** Load one selected Equipment history surface. */
export function useEquipmentHistory(equipmentId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...EQUIPMENT_QUERY_KEY, 'history', equipmentId],
    queryFn: () => getEquipmentHistory(equipmentId as string),
    enabled: enabled && equipmentId !== null
  });
}

/** Create Equipment and refresh the register. */
export function useCreateEquipment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEquipmentInput) => createEquipment(input),
    onSuccess: async () => client.invalidateQueries({ queryKey: EQUIPMENT_QUERY_KEY })
  });
}

/** Update Equipment and refresh its register and history. */
export function useUpdateEquipment(equipmentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateEquipmentInput) => updateEquipment(equipmentId, input),
    onSuccess: async () => client.invalidateQueries({ queryKey: EQUIPMENT_QUERY_KEY })
  });
}

/** Assign Equipment and refresh every read that can include Project cost. */
export function useAssignEquipment(equipmentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignEquipmentInput) => assignEquipment(equipmentId, input),
    onSuccess: async () => client.invalidateQueries()
  });
}

/** End one Equipment assignment and refresh every adjusted Project-cost read. */
export function useEndEquipmentAssignment(equipmentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Readonly<{ assignmentId: string; endDate: string; endTime?: string }>) => endEquipmentAssignment(equipmentId, input.assignmentId, input.endDate, input.endTime),
    onSuccess: async () => client.invalidateQueries()
  });
}

/** Reverse one Equipment assignment and refresh register, expense and ledger reads. */
export function useReverseEquipmentAssignment(equipmentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Readonly<{ assignmentId: string; reversalDate: string; reason: string }>) => reverseEquipmentAssignment(equipmentId, input.assignmentId, input.reversalDate, input.reason),
    onSuccess: async () => client.invalidateQueries()
  });
}
