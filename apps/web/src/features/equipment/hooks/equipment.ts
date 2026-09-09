import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignEquipment,
  createEquipment,
  endEquipmentAssignment,
  getEquipmentHistory,
  listEquipment,
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

/** Assign Equipment and refresh its history. */
export function useAssignEquipment(equipmentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignEquipmentInput) => assignEquipment(equipmentId, input),
    onSuccess: async () => client.invalidateQueries({ queryKey: EQUIPMENT_QUERY_KEY })
  });
}

/** End one Equipment assignment and refresh its history. */
export function useEndEquipmentAssignment(equipmentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Readonly<{ assignmentId: string; endDate: string; endTime?: string }>) => endEquipmentAssignment(equipmentId, input.assignmentId, input.endDate, input.endTime),
    onSuccess: async () => client.invalidateQueries({ queryKey: EQUIPMENT_QUERY_KEY })
  });
}
