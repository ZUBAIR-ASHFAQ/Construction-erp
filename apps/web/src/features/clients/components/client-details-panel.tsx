import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { usePermission, useProjectWorkspaceVisibility } from '../../administration/hooks/auth.js';
import type { ClientContact, ClientDetails } from '../api/clients-api.js';
import {
  useClient,
  useCreateClientContact,
  useUpdateClient,
  useUpdateClientContact
} from '../hooks/clients.js';

const clientEditSchema = z.object({
  code: z.string().trim().min(1, 'Client code is required.').max(100),
  legalName: z.string().trim().min(1, 'Legal name is required.').max(240),
  displayName: z.string().trim().min(1, 'Display name is required.').max(240),
  taxNo: z.string().trim().max(100),
  billingAddress: z.string().trim().min(1, 'Billing address is required.').max(1000),
  creditTermsDays: z.number().int().min(0, 'Credit terms cannot be negative.').nullable(),
  status: z.enum(['ACTIVE', 'ARCHIVED'])
});

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Contact name is required.').max(200),
  title: z.string().trim().max(160),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address.')]),
  phone: z.union([z.literal(''), z.string().trim().min(7, 'Phone must contain at least 7 characters.').max(50)]),
  isPrimary: z.boolean()
});

const contactEditSchema = contactSchema.extend({
  status: z.enum(['ACTIVE', 'INACTIVE'])
});

type ClientEditValues = z.infer<typeof clientEditSchema>;
type ContactValues = z.infer<typeof contactSchema>;
type ContactEditValues = z.infer<typeof contactEditSchema>;

type ClientDetailsPanelProps = Readonly<{
  clientId: string | null;
  onOpenProjectsForClient?: (clientId: string) => void;
}>;

/** Show one selected Client, its Contacts, downstream summary, editable fields and lifecycle status. */
export function ClientDetailsPanel({ clientId, onOpenProjectsForClient }: ClientDetailsPanelProps) {
  const canUpdate = usePermission('clients.update');
  const clientQuery = useClient(clientId);

  if (!clientId) {
    return (
      <section className="admin-card">
        <h2>Client details</h2>
        <p className="muted">Select a Client to view its master data and Contacts.</p>
      </section>
    );
  }

  if (clientQuery.isPending) {
    return <section className="admin-card"><p>Loading client…</p></section>;
  }

  if (clientQuery.error instanceof Error) {
    return <section className="admin-card"><div className="form-error" role="alert">{clientQuery.error.message}</div></section>;
  }

  if (!clientQuery.data) return null;

  return (
    <ClientDetailsContent
      key={`${clientQuery.data.client.id}-${clientQuery.data.client.updatedAt}`}
      details={clientQuery.data}
      canUpdate={canUpdate}
      {...(onOpenProjectsForClient ? { onOpenProjectsForClient } : {})}
    />
  );
}

/** Render loaded Client details and keep each form focused on one master-data responsibility. */
function ClientDetailsContent(props: Readonly<{
  details: ClientDetails;
  canUpdate: boolean;
  onOpenProjectsForClient?: (clientId: string) => void;
}>) {
  const client = props.details.client;
  const billingSummary = props.details.billingSummary;
  const receiptSummary = props.details.receiptSummary;
  const canReadProjects = useProjectWorkspaceVisibility();
  const updateMutation = useUpdateClient(client.id);
  const contactMutation = useCreateClientContact(client.id);

  const editForm = useForm<ClientEditValues>({
    resolver: zodResolver(clientEditSchema),
    defaultValues: {
      code: client.code,
      legalName: client.legalName,
      displayName: client.displayName,
      taxNo: client.taxNo ?? '',
      billingAddress: client.billingAddress,
      creditTermsDays: client.creditTermsDays,
      status: client.status
    }
  });

  const contactForm = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: '',
      title: '',
      email: '',
      phone: '',
      isPrimary: false
    }
  });

  const isArchived = client.status === 'ARCHIVED';

  /** Save final editable Client fields, including the non-destructive lifecycle status. */
  async function handleUpdate(values: ClientEditValues): Promise<void> {
    await updateMutation.mutateAsync({
      code: values.code,
      legalName: values.legalName,
      displayName: values.displayName,
      taxNo: values.taxNo ? values.taxNo : null,
      billingAddress: values.billingAddress,
      creditTermsDays: values.creditTermsDays,
      status: values.status
    });
  }

  /** Add one validated Contact to an active Client and clear the Contact form. */
  async function handleContact(values: ContactValues): Promise<void> {
    await contactMutation.mutateAsync({
      name: values.name,
      title: values.title ? values.title : null,
      email: values.email ? values.email : null,
      phone: values.phone ? values.phone : null,
      isPrimary: values.isPrimary
    });
    contactForm.reset();
  }

  /** Archive this Client through the documented Client PATCH route. */
  async function handleArchive(): Promise<void> {
    await updateMutation.mutateAsync({ status: 'ARCHIVED' });
  }

  /** Reactivate this Client through the documented Client PATCH route. */
  async function handleReactivate(): Promise<void> {
    await updateMutation.mutateAsync({ status: 'ACTIVE' });
  }

  return (
    <section className="admin-card" aria-labelledby="client-detail-title">
      <div className="client-heading">
        <div>
          <p className="eyebrow">Client</p>
          <h2 id="client-detail-title">{client.displayName}</h2>
          <p className="muted">{client.code} · {client.status}</p>
        </div>
        {props.canUpdate && (
          isArchived
            ? <button type="button" className="secondary-button" onClick={() => void handleReactivate()} disabled={updateMutation.isPending}>Reactivate client</button>
            : <button type="button" className="secondary-button" onClick={() => void handleArchive()} disabled={updateMutation.isPending}>Archive client</button>
        )}
      </div>

      {updateMutation.error instanceof Error && <div className="form-error" role="alert">{updateMutation.error.message}</div>}

      <dl className="client-detail-grid">
        <div><dt>Legal name</dt><dd>{client.legalName}</dd></div>
        <div><dt>Tax number</dt><dd>{client.taxNo ?? '—'}</dd></div>
        <div><dt>Credit terms</dt><dd>{client.creditTermsDays === null ? '—' : `${client.creditTermsDays} days`}</dd></div>
        <div className="client-detail-wide"><dt>Billing address</dt><dd>{client.billingAddress}</dd></div>
      </dl>

      <div className="document-section">
        <h3>Project and financial summary</h3>
        <div className="client-detail-grid">
          <div><strong>Projects</strong><span>{props.details.projectSummary.totalProjects} total · {props.details.projectSummary.activeProjects} active</span></div>
          <div><strong>Issued invoices</strong><span>{billingSummary ? billingSummary.invoiceCount : 'Restricted'}</span></div>
          <div><strong>Billed amount</strong><span>{billingSummary ? billingSummary.billedAmount : 'Restricted'}</span></div>
          <div><strong>Received</strong><span>{receiptSummary ? receiptSummary.receivedAmount : 'Restricted'}</span></div>
          <div><strong>Allocated</strong><span>{receiptSummary ? receiptSummary.allocatedAmount : 'Restricted'}</span></div>
          <div><strong>Advance / unallocated</strong><span>{receiptSummary ? receiptSummary.advanceAmount : 'Restricted'}</span></div>
          <div><strong>Outstanding</strong><span>{receiptSummary ? (receiptSummary.outstandingAmount ?? 'Restricted - billing access required') : 'Restricted'}</span></div>
        </div>
        {props.onOpenProjectsForClient && canReadProjects && (
          <button type="button" className="link-button" onClick={() => props.onOpenProjectsForClient?.(client.id)}>Open Client Projects</button>
        )}
      </div>

      {props.canUpdate && (
        <div className="document-section">
          <h3>Edit client</h3>
          <form className="admin-form" onSubmit={editForm.handleSubmit(handleUpdate)} noValidate>
            <div className="client-form-grid">
              <label>Code<input {...editForm.register('code')} /></label>
              <label>Display name<input {...editForm.register('displayName')} /></label>
              <label>Legal name<input {...editForm.register('legalName')} /></label>
              <label>Tax number<input {...editForm.register('taxNo')} /></label>
              <label>
                Credit terms (days)
                <input
                  type="number"
                  min="0"
                  {...editForm.register('creditTermsDays', {
                    setValueAs: (value) => value === '' ? null : Number(value)
                  })}
                />
              </label>
              <label>Status<select {...editForm.register('status')}><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></label>
            </div>
            <label>Billing address<textarea rows={3} {...editForm.register('billingAddress')} /></label>
            {Object.values(editForm.formState.errors).map((error, index) => (
              <span className="field-error" key={index}>{error?.message}</span>
            ))}
            <button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? 'Saving…' : 'Save client'}</button>
          </form>
        </div>
      )}

      <div className="document-section">
        <h3>Contacts</h3>
        {props.details.contacts.length === 0 ? (
          <p className="muted">No Contacts have been added yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Contact</th><th>Communication</th><th>Primary</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {props.details.contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td><strong>{contact.name}</strong><span>{contact.title ?? '—'}</span></td>
                    <td>{contact.email ?? '—'}<span>{contact.phone ?? '—'}</span></td>
                    <td>{contact.isPrimary ? 'Yes' : 'No'}</td>
                    <td>{contact.status}</td>
                    <td>{props.canUpdate ? <ContactEditForm clientId={client.id} contact={contact} /> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {props.canUpdate && !isArchived && (
        <div className="document-section">
          <h3>Add contact</h3>
          <form className="admin-form" onSubmit={contactForm.handleSubmit(handleContact)} noValidate>
            <div className="client-form-grid">
              <label>Name<input {...contactForm.register('name')} /></label>
              <label>Title<input {...contactForm.register('title')} /></label>
              <label>Email<input type="email" {...contactForm.register('email')} /></label>
              <label>Phone<input {...contactForm.register('phone')} /></label>
            </div>
            <label className="checkbox-row"><input type="checkbox" {...contactForm.register('isPrimary')} /><span>Primary contact</span></label>
            {Object.values(contactForm.formState.errors).map((error, index) => (
              <span className="field-error" key={index}>{error?.message}</span>
            ))}
            {contactMutation.error instanceof Error && <div className="form-error" role="alert">{contactMutation.error.message}</div>}
            <button type="submit" disabled={contactMutation.isPending}>{contactMutation.isPending ? 'Adding…' : 'Add contact'}</button>
          </form>
        </div>
      )}

      {isArchived && <p className="muted">Archived Clients remain available for history. Reactivate the Client before adding new Contacts.</p>}
    </section>
  );
}

/** Render a small editor for one existing Client Contact. */
function ContactEditForm(props: Readonly<{ clientId: string; contact: ClientContact }>) {
  const updateMutation = useUpdateClientContact(props.clientId, props.contact.id);
  const form = useForm<ContactEditValues>({
    resolver: zodResolver(contactEditSchema),
    defaultValues: {
      name: props.contact.name,
      title: props.contact.title ?? '',
      email: props.contact.email ?? '',
      phone: props.contact.phone ?? '',
      isPrimary: props.contact.isPrimary,
      status: props.contact.status
    }
  });

  /** Save one Contact without allowing Client or Company ownership to change. */
  async function handleUpdate(values: ContactEditValues): Promise<void> {
    await updateMutation.mutateAsync({
      name: values.name,
      title: values.title ? values.title : null,
      email: values.email ? values.email : null,
      phone: values.phone ? values.phone : null,
      isPrimary: values.isPrimary,
      status: values.status
    });
  }

  return (
    <details>
      <summary>Edit</summary>
      <form className="admin-form" onSubmit={form.handleSubmit(handleUpdate)} noValidate>
        <label>Name<input {...form.register('name')} /></label>
        <label>Title<input {...form.register('title')} /></label>
        <label>Email<input type="email" {...form.register('email')} /></label>
        <label>Phone<input {...form.register('phone')} /></label>
        <label>Status<select {...form.register('status')}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
        <label className="checkbox-row"><input type="checkbox" {...form.register('isPrimary')} /><span>Primary contact</span></label>
        {Object.values(form.formState.errors).map((error, index) => <span className="field-error" key={index}>{error?.message}</span>)}
        {updateMutation.error instanceof Error && <div className="form-error" role="alert">{updateMutation.error.message}</div>}
        <button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? 'Saving…' : 'Save contact'}</button>
      </form>
    </details>
  );
}
