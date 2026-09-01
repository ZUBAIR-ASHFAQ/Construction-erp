import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignEquipment,
  createEquipment,
  createEquipmentMaintenance,
  getEquipmentHistory,
  listEquipment,
  recordEquipmentUsage,
  type AssignEquipmentInput,
  type CreateEquipmentInput,
  type CreateEquipmentMaintenanceInput,
  type ListEquipmentInput,
  type RecordEquipmentUsageInput
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

/** Assign Equipment and refresh its history. */
export function useAssignEquipment(equipmentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignEquipmentInput) => assignEquipment(equipmentId, input),
    onSuccess: async () => client.invalidateQueries({ queryKey: EQUIPMENT_QUERY_KEY })
  });
}

/** Record usage and refresh the Project/Stage cost history. */
export function useRecordEquipmentUsage(equipmentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordEquipmentUsageInput) => recordEquipmentUsage(equipmentId, input),
    onSuccess: async () => client.invalidateQueries({ queryKey: EQUIPMENT_QUERY_KEY })
  });
}

/** Record maintenance and refresh Equipment history. */
export function useCreateEquipmentMaintenance(equipmentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEquipmentMaintenanceInput) => createEquipmentMaintenance(equipmentId, input),
    onSuccess: async () => client.invalidateQueries({ queryKey: EQUIPMENT_QUERY_KEY })
  });
}
