import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createClient,
  createClientContact,
  getClient,
  listClients,
  updateClient,
  updateClientContact,
  type CreateClientContactInput,
  type CreateClientInput,
  type ListClientsInput,
  type UpdateClientContactInput,
  type UpdateClientInput
} from '../api/clients-api.js';

const CLIENTS_QUERY_KEY = ['clients'] as const;

/** Load one filtered and server-paginated Client page when Client-read access is available. */
export function useClients(input: ListClientsInput, enabled = true) {
  return useQuery({
    queryKey: [...CLIENTS_QUERY_KEY, 'list', input],
    queryFn: () => listClients(input),
    enabled
  });
}

/** Load the selected Client together with Contacts and downstream summary values. */
export function useClient(clientId: string | null) {
  return useQuery({
    queryKey: [...CLIENTS_QUERY_KEY, 'detail', clientId],
    queryFn: () => getClient(clientId as string),
    enabled: clientId !== null
  });
}

/** Create a Client and refresh maintained Client queries. */
export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateClientInput) => createClient(input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
    }
  });
}

/** Update one Client and refresh its list/detail data. */
export function useUpdateClient(clientId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateClientInput) => updateClient(clientId, input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
    }
  });
}

/** Add one Client Contact and refresh the selected Client details. */
export function useCreateClientContact(clientId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateClientContactInput) => createClientContact(clientId, input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
    }
  });
}

/** Update one Client Contact and refresh the selected Client details. */
export function useUpdateClientContact(clientId: string, contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateClientContactInput) => updateClientContact(clientId, contactId, input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
    }
  });
}
