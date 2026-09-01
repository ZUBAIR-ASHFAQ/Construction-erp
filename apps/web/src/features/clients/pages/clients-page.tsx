import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { usePermission } from '../../administration/hooks/auth.js';
import { ClientDetailsPanel } from '../components/client-details-panel.js';
import { useClients, useCreateClient } from '../hooks/clients.js';
import type { ClientStatus } from '../api/clients-api.js';

const createClientSchema = z.object({
  code: z.string().trim().min(1, 'Client code is required.').max(100),
  legalName: z.string().trim().min(1, 'Legal name is required.').max(240),
  displayName: z.string().trim().min(1, 'Display name is required.').max(240),
  taxNo: z.string().trim().max(100),
  billingAddress: z.string().trim().min(1, 'Billing address is required.').max(1000),
  creditTermsDays: z.number().int().min(0, 'Credit terms cannot be negative.').nullable()
});

type CreateClientValues = z.infer<typeof createClientSchema>;

type ClientsPageProps = Readonly<{
  onOpenProjectsForClient?: (clientId: string) => void;
}>;

/** Render the permission-aware final Client Management workspace. */
export function ClientsPage({ onOpenProjectsForClient }: ClientsPageProps = {}) {
  const canReadClients = usePermission('clients.read');
  const canCreate = usePermission('clients.create');
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ClientStatus | ''>('');
  const [page, setPage] = useState(1);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const clientsQuery = useClients({
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
    page,
    pageSize: 25
  }, canReadClients);
  const createMutation = useCreateClient();
  const createForm = useForm<CreateClientValues>({
    resolver: zodResolver(createClientSchema),
    defaultValues: {
      code: '',
      legalName: '',
      displayName: '',
      taxNo: '',
      billingAddress: '',
      creditTermsDays: null
    }
  });

  if (!canReadClients) {
    return (
      <section className="admin-card">
        <h1>Client Management</h1>
        <p className="muted">Your current role does not include client read access.</p>
      </section>
    );
  }

  const clients = clientsQuery.data?.items ?? [];
  const pageCount = clientsQuery.data ? Math.max(1, Math.ceil(clientsQuery.data.total / clientsQuery.data.pageSize)) : 1;

  /** Apply Client search/status filters and restart pagination from page one. */
  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSearch(searchText.trim());
    setPage(1);
  }

  /** Create one active Client and select the newly created record. */
  async function handleCreate(values: CreateClientValues): Promise<void> {
    const client = await createMutation.mutateAsync({
      code: values.code,
      legalName: values.legalName,
      displayName: values.displayName,
      taxNo: values.taxNo ? values.taxNo : null,
      billingAddress: values.billingAddress,
      creditTermsDays: values.creditTermsDays
    });

    createForm.reset();
    setSelectedClientId(client.id);
  }

  return (
    <section className="admin-stack" aria-labelledby="clients-title">
      <div className="section-heading">
        <p className="eyebrow">Commercial</p>
        <h1 id="clients-title">Client Management</h1>
        <p className="muted">Maintain Client organizations and Contacts used by Projects, Billing, Receipts and reporting.</p>
      </div>

      <section className="admin-card">
        <form className="client-filter-row" onSubmit={handleSearch}>
          <label>
            Search clients
            <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Code or name" />
          </label>
          <label>
            Status
            <select value={status} onChange={(event) => { setStatus(event.target.value as ClientStatus | ''); setPage(1); }}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
          <button type="submit">Search</button>
        </form>

        {clientsQuery.isPending && <p>Loading clients…</p>}
        {clientsQuery.error instanceof Error && <div className="form-error" role="alert">{clientsQuery.error.message}</div>}

        {clientsQuery.data && (
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Client</th><th>Status</th><th>Credit terms</th><th>Action</th></tr></thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id} className={client.id === selectedClientId ? 'selected-row' : undefined}>
                    <td><strong>{client.displayName}</strong><span>{client.code} · {client.legalName}</span></td>
                    <td>{client.status}</td>
                    <td>{client.creditTermsDays === null ? '—' : `${client.creditTermsDays} days`}</td>
                    <td><button type="button" className="link-button" onClick={() => setSelectedClientId(client.id)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {clientsQuery.data && clients.length === 0 && <p className="muted">No clients found.</p>}

        <div className="pagination-row">
          <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
          <span>Page {page} of {pageCount}</span>
          <button type="button" className="secondary-button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
        </div>
      </section>

      {canCreate && (
        <section className="admin-card">
          <h2>Create client</h2>
          <form className="admin-form" onSubmit={createForm.handleSubmit(handleCreate)} noValidate>
            <div className="client-form-grid">
              <label>Code<input {...createForm.register('code')} /></label>
              <label>Display name<input {...createForm.register('displayName')} /></label>
              <label>Legal name<input {...createForm.register('legalName')} /></label>
              <label>Tax number<input {...createForm.register('taxNo')} /></label>
              <label>
                Credit terms (days)
                <input
                  type="number"
                  min="0"
                  {...createForm.register('creditTermsDays', {
                    setValueAs: (value) => value === '' ? null : Number(value)
                  })}
                />
              </label>
            </div>
            <label>Billing address<textarea rows={3} {...createForm.register('billingAddress')} /></label>
            {Object.values(createForm.formState.errors).map((error, index) => (
              <span className="field-error" key={index}>{error?.message}</span>
            ))}
            {createMutation.error instanceof Error && <div className="form-error" role="alert">{createMutation.error.message}</div>}
            <button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Creating…' : 'Create client'}</button>
          </form>
        </section>
      )}

      <ClientDetailsPanel
        clientId={selectedClientId}
        {...(onOpenProjectsForClient ? { onOpenProjectsForClient } : {})}
      />
    </section>
  );
}
