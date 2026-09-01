import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSubcontractor,
  createVendor,
  createVendorContact,
  getVendor,
  listSubcontractors,
  listVendors,
  updateSubcontractor,
  updateVendor,
  type CreateSubcontractorInput,
  type CreateVendorContactInput,
  type CreateVendorInput,
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
