import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBillingClaim,
  createClientInvoice,
  finalizeBillingClaim,
  getBillingSettings,
  listBillingClaims,
  listClientInvoices,
  updateBillingClaim,
  updateBillingSettings,
  type CreateClaimInput,
  type CreateInvoiceInput,
  type ListBillingInput,
  type UpdateBillingSettingsInput,
  type UpdateClaimInput
} from '../api/client-billing-api.js';

const CLIENT_BILLING_QUERY_KEY = ['client-billing'] as const;
const PROJECT_STAGES_QUERY_KEY = ['module-7', 'project-stages'] as const;
const FINANCE_QUERY_KEY = ['final21', 'finance'] as const;

/** Create one browser retry key for a Client Billing command. */
function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** Refresh Client Billing server state after a successful write. */
async function invalidateClientBilling(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: CLIENT_BILLING_QUERY_KEY });
}

/** Refresh source-module reads affected by an issued and Finance-posted Client Invoice. */
async function invalidateInvoiceEffects(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  await Promise.all([
    invalidateClientBilling(queryClient),
    queryClient.invalidateQueries({ queryKey: PROJECT_STAGES_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: FINANCE_QUERY_KEY })
  ]);
}

/** Load one project's billing settings. */
export function useBillingSettings(projectId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...CLIENT_BILLING_QUERY_KEY, 'settings', projectId],
    queryFn: () => getBillingSettings(projectId as string),
    enabled: enabled && projectId !== null,
    retry: false
  });
}

/** Save one project's billing settings. */
export function useUpdateBillingSettings(projectId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateBillingSettingsInput) => updateBillingSettings(projectId as string, input, newIdempotencyKey()),
    async onSuccess() { await invalidateClientBilling(queryClient); }
  });
}

/** Load billing claims. */
export function useBillingClaims(input: ListBillingInput, enabled = true) {
  return useQuery({ queryKey: [...CLIENT_BILLING_QUERY_KEY, 'claims', input], queryFn: () => listBillingClaims(input), enabled, retry: false });
}

/** Create one draft billing claim. */
export function useCreateBillingClaim() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: CreateClaimInput) => createBillingClaim(input, newIdempotencyKey()), async onSuccess() { await invalidateClientBilling(queryClient); } });
}

/** Edit one draft billing claim. */
export function useUpdateBillingClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: Readonly<{ claimId: string; input: UpdateClaimInput }>) => updateBillingClaim(value.claimId, value.input, newIdempotencyKey()),
    async onSuccess() { await invalidateClientBilling(queryClient); }
  });
}

/** Finalize one draft billing claim. */
export function useFinalizeBillingClaim() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (claimId: string) => finalizeBillingClaim(claimId, newIdempotencyKey()), async onSuccess() { await invalidateClientBilling(queryClient); } });
}

/** Create one Client Invoice from a finalized claim and refresh its source-module effects. */
export function useCreateClientInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: Readonly<{ claimId: string; input: CreateInvoiceInput }>) => createClientInvoice(value.claimId, value.input, newIdempotencyKey()),
    async onSuccess() { await invalidateInvoiceEffects(queryClient); }
  });
}

/** Load Client Invoices. */
export function useClientInvoices(input: ListBillingInput, enabled = true) {
  return useQuery({ queryKey: [...CLIENT_BILLING_QUERY_KEY, 'invoices', input], queryFn: () => listClientInvoices(input), enabled, retry: false });
}
