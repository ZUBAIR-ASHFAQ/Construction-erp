import { authenticatedRequest } from '../../administration/api/auth-api.js';

export type ClientStatus = 'ACTIVE' | 'ARCHIVED';
export type ClientContactStatus = 'ACTIVE' | 'INACTIVE';

export type Client = Readonly<{
  id: string;
  code: string;
  legalName: string;
  displayName: string;
  taxNo: string | null;
  billingAddress: string;
  status: ClientStatus;
  creditTermsDays: number | null;
  createdAt: string;
  updatedAt: string;
}>;

export type ClientContact = Readonly<{
  id: string;
  clientId: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  status: ClientContactStatus;
  createdAt: string;
  updatedAt: string;
}>;

export type ClientPage = Readonly<{
  items: Client[];
  page: number;
  pageSize: number;
  total: number;
}>;

export type ClientDetails = Readonly<{
  client: Client;
  contacts: ClientContact[];
  projectSummary: Readonly<{
    totalProjects: number;
    activeProjects: number;
  }>;
  billingSummary: Readonly<{
    invoiceCount: number;
    billedAmount: string;
  }> | null;
  receiptSummary: Readonly<{
    receivedAmount: string;
    allocatedAmount: string;
    advanceAmount: string;
    outstandingAmount: string | null;
  }> | null;
}>;

export type ListClientsInput = Readonly<{
  search?: string;
  status?: ClientStatus;
  page?: number;
  pageSize?: number;
}>;

export type CreateClientInput = Readonly<{
  code: string;
  legalName: string;
  displayName: string;
  taxNo?: string | null;
  billingAddress: string;
  creditTermsDays?: number | null;
}>;

export type UpdateClientInput = Readonly<{
  code?: string;
  legalName?: string;
  displayName?: string;
  taxNo?: string | null;
  billingAddress?: string;
  creditTermsDays?: number | null;
  status?: ClientStatus;
}>;

export type CreateClientContactInput = Readonly<{
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary: boolean;
}>;

export type UpdateClientContactInput = Readonly<{
  name?: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary?: boolean;
  status?: ClientContactStatus;
}>;

/** Load one server-paginated Client page using Client Management filters. */
export function listClients(input: ListClientsInput = {}): Promise<ClientPage> {
  const query = new URLSearchParams();

  if (input.search) query.set('search', input.search);
  if (input.status) query.set('status', input.status);
  if (input.page !== undefined) query.set('page', String(input.page));
  if (input.pageSize !== undefined) query.set('pageSize', String(input.pageSize));

  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return authenticatedRequest<ClientPage>(`clients${suffix}`);
}

/** Load one Client together with Contacts and downstream summary values. */
export function getClient(clientId: string): Promise<ClientDetails> {
  return authenticatedRequest<ClientDetails>(`clients/${clientId}`);
}

/** Create one Client without sending Company, status or authority fields from the browser. */
export function createClient(input: CreateClientInput): Promise<Client> {
  return authenticatedRequest<Client>('clients', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

/** Update only final Client master fields through the documented PATCH route. */
export function updateClient(clientId: string, input: UpdateClientInput): Promise<Client> {
  return authenticatedRequest<Client>(`clients/${clientId}`, {
    method: 'PATCH',
    body: JSON.stringify(input)
  });
}

/** Add one Contact to the selected Company-owned Client. */
export function createClientContact(clientId: string, input: CreateClientContactInput): Promise<ClientContact> {
  return authenticatedRequest<ClientContact>(`clients/${clientId}/contacts`, {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

/** Update one Contact while keeping its Client and Company ownership unchanged. */
export function updateClientContact(
  clientId: string,
  contactId: string,
  input: UpdateClientContactInput
): Promise<ClientContact> {
  return authenticatedRequest<ClientContact>(`clients/${clientId}/contacts/${contactId}`, {
    method: 'PATCH',
    body: JSON.stringify(input)
  });
}
