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
  mode?: 'details' | 'edit';
  onSaved?: () => void;
  onOpenProjectsForClient?: (clientId: string) => void;
}>;

/** Load one Client and render either its complete details or its master-data editor. */
export function ClientDetailsPanel({
  clientId,
  mode = 'details',
  onSaved,
  onOpenProjectsForClient
}: ClientDetailsPanelProps) {
  const canUpdate = usePermission('clients.update');
  const clientQuery = useClient(clientId);

  if (!clientId) {
    return <div className="client-modal-state"><p className="muted">Select a Client to continue.</p></div>;
  }

  if (clientQuery.isPending) {
    return <div className="client-modal-state"><p>Loading client…</p></div>;
  }

  if (clientQuery.error instanceof Error) {
    return <div className="client-modal-state"><div className="form-error" role="alert">{clientQuery.error.message}</div></div>;
  }

  if (!clientQuery.data) return null;

  if (mode === 'edit') {
    return (
      <ClientEditContent
        key={`${clientQuery.data.client.id}-${clientQuery.data.client.updatedAt}`}
        details={clientQuery.data}
        canUpdate={canUpdate}
        {...(onSaved ? { onSaved } : {})}
      />
    );
  }

  return (
    <ClientDetailsContent
      key={`${clientQuery.data.client.id}-${clientQuery.data.client.updatedAt}`}
      details={clientQuery.data}
      canUpdate={canUpdate}
      {...(onOpenProjectsForClient ? { onOpenProjectsForClient } : {})}
    />
  );
}

/** Render every editable Client master field inside the dedicated Edit dialog. */
function ClientEditContent(props: Readonly<{
  details: ClientDetails;
  canUpdate: boolean;
  onSaved?: () => void;
}>) {
  const client = props.details.client;
  const updateMutation = useUpdateClient(client.id);
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

  /** Save every editable Client master field through the existing PATCH contract. */
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
    props.onSaved?.();
  }

  if (!props.canUpdate) {
    return <div className="client-modal-state"><p className="muted">Your current role does not include client update access.</p></div>;
  }

  return (
    <form className="admin-form client-modal-form" onSubmit={editForm.handleSubmit(handleUpdate)} noValidate>
      <div className="client-form-grid">
        <label>Code<input autoFocus {...editForm.register('code')} /></label>
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
        <label className="client-form-wide">Billing address<textarea rows={3} {...editForm.register('billingAddress')} /></label>
      </div>
      {Object.values(editForm.formState.errors).map((error, index) => (
        <span className="field-error" key={index}>{error?.message}</span>
      ))}
      {updateMutation.error instanceof Error && <div className="form-error" role="alert">{updateMutation.error.message}</div>}
      <div className="client-modal-actions">
        <button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? 'Saving…' : 'Save client'}</button>
      </div>
    </form>
  );
}

/** Render loaded Client details, summaries, Contacts and existing lifecycle/contact actions. */
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
    <section className="client-detail-content" aria-labelledby="client-detail-title">
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
        <div><dt>Client ID</dt><dd>{client.id}</dd></div>
        <div><dt>Company ID</dt><dd>{client.companyId}</dd></div>
        <div><dt>Legal name</dt><dd>{client.legalName}</dd></div>
        <div><dt>Tax number</dt><dd>{client.taxNo ?? '—'}</dd></div>
        <div><dt>Credit terms</dt><dd>{client.creditTermsDays === null ? '—' : `${client.creditTermsDays} days`}</dd></div>
        <div><dt>Status</dt><dd>{client.status}</dd></div>
        <div className="client-detail-wide"><dt>Billing address</dt><dd>{client.billingAddress}</dd></div>
        <div><dt>Created</dt><dd>{new Date(client.createdAt).toLocaleString()}</dd></div>
        <div><dt>Updated</dt><dd>{new Date(client.updatedAt).toLocaleString()}</dd></div>
      </dl>

      <div className="document-section client-detail-section">
        <div className="client-section-heading">
          <div>
            <p className="eyebrow">Account activity</p>
            <h3>Project and financial summary</h3>
          </div>
          {props.onOpenProjectsForClient && canReadProjects && (
            <button type="button" className="link-button" onClick={() => props.onOpenProjectsForClient?.(client.id)}>Open Client Projects</button>
          )}
        </div>
        <div className="client-detail-grid">
          <div><strong>Projects</strong><span>{props.details.projectSummary.totalProjects} total · {props.details.projectSummary.activeProjects} active</span></div>
          <div><strong>Issued invoices</strong><span>{billingSummary ? billingSummary.invoiceCount : 'Restricted'}</span></div>
          <div><strong>Billed amount</strong><span>{billingSummary ? billingSummary.billedAmount : 'Restricted'}</span></div>
          <div><strong>Received</strong><span>{receiptSummary ? receiptSummary.receivedAmount : 'Restricted'}</span></div>
          <div><strong>Allocated</strong><span>{receiptSummary ? receiptSummary.allocatedAmount : 'Restricted'}</span></div>
          <div><strong>Advance / unallocated</strong><span>{receiptSummary ? receiptSummary.advanceAmount : 'Restricted'}</span></div>
          <div><strong>Outstanding</strong><span>{receiptSummary ? (receiptSummary.outstandingAmount ?? 'Restricted - billing access required') : 'Restricted'}</span></div>
        </div>
      </div>

      <div className="document-section client-detail-section">
        <div className="client-section-heading">
          <div>
            <p className="eyebrow">People</p>
            <h3>Contacts</h3>
          </div>
          <span className="client-record-count">{props.details.contacts.length} contact{props.details.contacts.length === 1 ? '' : 's'}</span>
        </div>
        {props.details.contacts.length === 0 ? (
          <p className="muted">No Contacts have been added yet.</p>
        ) : (
          <div className="client-contact-list">
            {props.details.contacts.map((contact) => (
              <article className="client-contact-card" key={contact.id}>
                <div className="client-contact-heading">
                  <div>
                    <strong>{contact.name}</strong>
                    <span>{contact.title ?? 'No title'}</span>
                  </div>
                  <span className={`client-status client-status-${contact.status.toLowerCase()}`}>{contact.status}</span>
                </div>
                <dl className="client-contact-grid">
                  <div><dt>Contact ID</dt><dd>{contact.id}</dd></div>
                  <div><dt>Client ID</dt><dd>{contact.clientId}</dd></div>
                  <div><dt>Company ID</dt><dd>{contact.companyId}</dd></div>
                  <div><dt>Email</dt><dd>{contact.email ?? '—'}</dd></div>
                  <div><dt>Phone</dt><dd>{contact.phone ?? '—'}</dd></div>
                  <div><dt>Primary contact</dt><dd>{contact.isPrimary ? 'Yes' : 'No'}</dd></div>
                  <div><dt>Status</dt><dd>{contact.status}</dd></div>
                  <div><dt>Created</dt><dd>{new Date(contact.createdAt).toLocaleString()}</dd></div>
                  <div><dt>Updated</dt><dd>{new Date(contact.updatedAt).toLocaleString()}</dd></div>
                </dl>
                {props.canUpdate && <ContactEditForm clientId={client.id} contact={contact} />}
              </article>
            ))}
          </div>
        )}
      </div>

      {props.canUpdate && !isArchived && (
        <div className="document-section client-detail-section">
          <div className="client-section-heading">
            <div>
              <p className="eyebrow">Contact management</p>
              <h3>Add contact</h3>
            </div>
          </div>
          <form className="admin-form client-inline-form" onSubmit={contactForm.handleSubmit(handleContact)} noValidate>
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
            <div className="client-modal-actions">
              <button type="submit" disabled={contactMutation.isPending}>{contactMutation.isPending ? 'Adding…' : 'Add contact'}</button>
            </div>
          </form>
        </div>
      )}

      {isArchived && <p className="muted client-archive-note">Archived Clients remain available for history. Reactivate the Client before adding new Contacts.</p>}
    </section>
  );
}

/** Render a compact two-column editor for one existing Client Contact. */
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
    <details className="client-contact-editor">
      <summary>Edit contact</summary>
      <form className="admin-form client-inline-form" onSubmit={form.handleSubmit(handleUpdate)} noValidate>
        <div className="client-form-grid">
          <label>Name<input {...form.register('name')} /></label>
          <label>Title<input {...form.register('title')} /></label>
          <label>Email<input type="email" {...form.register('email')} /></label>
          <label>Phone<input {...form.register('phone')} /></label>
          <label>Status<select {...form.register('status')}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
          <label className="checkbox-row"><input type="checkbox" {...form.register('isPrimary')} /><span>Primary contact</span></label>
        </div>
        {Object.values(form.formState.errors).map((error, index) => <span className="field-error" key={index}>{error?.message}</span>)}
        {updateMutation.error instanceof Error && <div className="form-error" role="alert">{updateMutation.error.message}</div>}
        <div className="client-modal-actions">
          <button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? 'Saving…' : 'Save contact'}</button>
        </div>
      </form>
    </details>
  );
}
