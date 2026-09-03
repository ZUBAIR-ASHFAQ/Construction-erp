import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
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
type ClientDialog =
  | Readonly<{ kind: 'create' }>
  | Readonly<{ kind: 'open'; clientId: string }>
  | Readonly<{ kind: 'edit'; clientId: string }>
  | null;

type ClientsPageProps = Readonly<{
  onOpenProjectsForClient?: (clientId: string) => void;
  initialCreate?: boolean;
}>;

/** Render the permission-aware final Client Management workspace. */
export function ClientsPage({ onOpenProjectsForClient, initialCreate = false }: ClientsPageProps = {}) {
  const canReadClients = usePermission('clients.read');
  const canCreate = usePermission('clients.create');
  const canUpdate = usePermission('clients.update');
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ClientStatus | ''>('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<ClientDialog>(initialCreate ? { kind: 'create' } : null);

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

  /** Create one active Client and open the newly created record. */
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
    setDialog({ kind: 'open', clientId: client.id });
  }

  /** Close the active Client dialog without changing list filters or pagination. */
  function closeDialog(): void {
    setDialog(null);
  }

  return (
    <section className="admin-stack client-management-page" aria-labelledby="clients-title">
      <div className="section-heading client-page-heading">
        <div>
          <p className="eyebrow">Commercial</p>
          <h1 id="clients-title">Client Management</h1>
          <p className="muted">Search, review and maintain the Client organizations used by Projects, Billing, Receipts and reporting.</p>
        </div>
        {canCreate && (
          <button type="button" className="client-primary-action" onClick={() => setDialog({ kind: 'create' })}>
            <span aria-hidden="true">+</span>
            Create client
          </button>
        )}
      </div>

      <section className="admin-card client-list-card" aria-label="Client list">
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
          <div className="table-wrap client-list-table-wrap">
            <table className="admin-table client-list-table">
              <thead><tr><th>Client</th><th>Status</th><th>Credit terms</th><th>Actions</th></tr></thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td><strong>{client.displayName}</strong><span>{client.code} · {client.legalName}</span></td>
                    <td><span className={`client-status client-status-${client.status.toLowerCase()}`}>{client.status}</span></td>
                    <td>{client.creditTermsDays === null ? '—' : `${client.creditTermsDays} days`}</td>
                    <td>
                      <div className="client-row-actions">
                        <button type="button" className="link-button" onClick={() => setDialog({ kind: 'open', clientId: client.id })}>Open</button>
                        {canUpdate && (
                          <button type="button" className="secondary-button client-edit-button" onClick={() => setDialog({ kind: 'edit', clientId: client.id })}>Edit</button>
                        )}
                      </div>
                    </td>
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

      {dialog?.kind === 'create' && (
        <ClientModal title="Create client" eyebrow="New client account" onClose={closeDialog}>
          <form className="admin-form client-modal-form" onSubmit={createForm.handleSubmit(handleCreate)} noValidate>
            <div className="client-form-grid">
              <label>Code<input autoFocus {...createForm.register('code')} /></label>
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
              <label className="client-form-wide">Billing address<textarea rows={3} {...createForm.register('billingAddress')} /></label>
            </div>
            {Object.values(createForm.formState.errors).map((error, index) => (
              <span className="field-error" key={index}>{error?.message}</span>
            ))}
            {createMutation.error instanceof Error && <div className="form-error" role="alert">{createMutation.error.message}</div>}
            <div className="client-modal-actions">
              <button type="button" className="secondary-button" onClick={closeDialog}>Cancel</button>
              <button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Creating…' : 'Create client'}</button>
            </div>
          </form>
        </ClientModal>
      )}

      {dialog?.kind === 'open' && (
        <ClientModal title="Client details" eyebrow="Client account" onClose={closeDialog} wide>
          <ClientDetailsPanel
            clientId={dialog.clientId}
            mode="details"
            {...(onOpenProjectsForClient ? { onOpenProjectsForClient } : {})}
          />
        </ClientModal>
      )}

      {dialog?.kind === 'edit' && (
        <ClientModal title="Edit client" eyebrow="Client master data" onClose={closeDialog}>
          <ClientDetailsPanel clientId={dialog.clientId} mode="edit" onSaved={closeDialog} />
        </ClientModal>
      )}
    </section>
  );
}

/** Render one accessible Client modal without introducing another UI dependency. */
function ClientModal(props: Readonly<{
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}>) {
  useEffect(() => {
    /** Close only the active Client modal when Escape is pressed. */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') props.onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [props.onClose]);

  return (
    <div className="client-modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section
        className={`client-modal${props.wide ? ' client-modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="client-modal-header">
          <div>
            <p className="eyebrow">{props.eyebrow}</p>
            <h2 id="client-modal-title">{props.title}</h2>
          </div>
          <button type="button" className="client-modal-close" onClick={props.onClose} aria-label={`Close ${props.title}`}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="client-modal-body">{props.children}</div>
      </section>
    </div>
  );
}
