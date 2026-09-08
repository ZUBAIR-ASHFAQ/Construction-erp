import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useClients } from '../../clients/hooks/clients.js';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useProjects } from '../../projects/hooks/projects.js';
import {
  useClientInvoice,
  useClientInvoices,
  useCreateDirectClientInvoice
} from '../hooks/client-billing.js';

const positiveMoneySchema = z.string().trim().regex(/^(?:[1-9]\d{0,15})(?:\.\d{1,2})?$|^0\.(?:0[1-9]|[1-9]\d?)$/, 'Enter a positive amount with up to 2 decimals.');
const optionalUuidSchema = z.string().trim().refine((value) => value === '' || z.string().uuid().safeParse(value).success, 'Select a valid Stage or leave it at Project level.');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select a valid date.');

const directInvoiceFormSchema = z.object({
  invoiceDate: dateSchema,
  dueDate: z.string().refine((value) => value === '' || dateSchema.safeParse(value).success, 'Select a valid date or leave it blank.'),
  lines: z.array(z.object({
    stageId: optionalUuidSchema,
    description: z.string().trim().min(1, 'Description is required.').max(1000),
    amount: positiveMoneySchema
  })).min(1, 'Add at least one invoice line.').max(500)
}).superRefine((value, context) => {
  if (value.dueDate && value.dueDate < value.invoiceDate) context.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDate'], message: 'Due date cannot be earlier than invoice date.' });
});

type DirectInvoiceForm = z.infer<typeof directInvoiceFormSchema>;

type ClientBillingWorkspaceProps = Readonly<{
  canRead: boolean;
  canCreateInvoices: boolean;
  canReadInvoices: boolean;
  canReadStages: boolean;
}>;

/** Return today's local browser date for a date input without UTC rollover. */
function todayDateInputValue(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Build a fresh direct-invoice form with today's invoice date preselected. */
function emptyDirectInvoiceForm(): DirectInvoiceForm {
  return { invoiceDate: todayDateInputValue(), dueDate: '', lines: [{ stageId: '', description: '', amount: '' }] };
}

/** Return a safe message for one failed browser mutation. */
function mutationMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

/** Convert one money value to a readable two-decimal display without browser-owned totals. */
function displayMoney(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value;
}

/** Render direct Client Invoice entry, register and immutable invoice detail only. */
export function ClientBillingWorkspace(props: ClientBillingWorkspaceProps) {
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const clientsQuery = useClients({ page: 1, pageSize: 100 }, props.canRead);
  const projectsQuery = useProjects({ ...(clientId ? { clientId } : {}), page: 1, pageSize: 100 }, props.canRead);
  const clients = clientsQuery.data?.items ?? [];
  const projects = projectsQuery.data?.items ?? [];
  const clientNames = useMemo(() => new Map(clients.map((client) => [client.id, client.displayName])), [clients]);
  const clientProjects = useMemo(() => projects.filter((project) => project.clientId === clientId), [clientId, projects]);
  const selectedProject = useMemo(() => projects.find((project) => project.id === projectId) ?? null, [projectId, projects]);

  const stagesQuery = useProjectStages(projectId || null, props.canReadStages && projectId !== '');
  const stages = stagesQuery.data?.items ?? [];
  const stageNames = useMemo(() => new Map(stages.map((stage) => [stage.id, `${stage.code} · ${stage.name}`])), [stages]);
  const invoicesQuery = useClientInvoices({ ...(projectId ? { projectId } : {}), page: 1, pageSize: 100 }, props.canReadInvoices && projectId !== '');
  const selectedInvoiceQuery = useClientInvoice(selectedInvoiceId, props.canReadInvoices && selectedInvoiceId !== null);
  const createDirectInvoice = useCreateDirectClientInvoice();

  const invoiceForm = useForm<DirectInvoiceForm>({ resolver: zodResolver(directInvoiceFormSchema), defaultValues: emptyDirectInvoiceForm() });
  const invoiceLines = useFieldArray({ control: invoiceForm.control, name: 'lines' });

  useEffect(() => {
    setSelectedInvoiceId(null);
    invoiceForm.reset(emptyDirectInvoiceForm());
  }, [projectId, invoiceForm]);

  useEffect(() => {
    if (!selectedInvoiceId) return undefined;
    /** Close the active invoice dialog while preserving register filters. */
    function closeInvoiceOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') setSelectedInvoiceId(null);
    }
    window.addEventListener('keydown', closeInvoiceOnEscape);
    return () => window.removeEventListener('keydown', closeInvoiceOnEscape);
  }, [selectedInvoiceId]);

  /** Return a Stage label while avoiding raw identifiers. */
  function stageLabel(stageId: string | null): string {
    if (!stageId) return 'Project level';
    return stageNames.get(stageId) ?? 'Linked Stage';
  }

  /** Create one direct Client Invoice with server-owned numbering and totals. */
  async function submitInvoice(values: DirectInvoiceForm): Promise<void> {
    if (!projectId) return;
    const invoice = await createDirectInvoice.mutateAsync({
      projectId,
      invoiceDate: values.invoiceDate,
      dueDate: values.dueDate || null,
      lines: values.lines.map((line) => ({ stageId: line.stageId || null, description: line.description.trim(), amount: line.amount }))
    });
    invoiceForm.reset(emptyDirectInvoiceForm());
    setSelectedInvoiceId(invoice.id);
  }

  if (!props.canRead) return <section className="admin-card"><p>You do not have Client Invoice read access.</p></section>;

  return (
    <div className="admin-stack">
      <section className="admin-card">
        <h2>Client and project</h2>
        <div className="two-column-form">
          <label>Client
            <select value={clientId} onChange={(event) => { setClientId(event.target.value); setProjectId(''); }}>
              <option value="">Select client</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.code} · {client.displayName}</option>)}
            </select>
          </label>
          <label>Project
            <select value={projectId} disabled={!clientId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">Select project</option>
              {clientProjects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}
            </select>
          </label>
        </div>
      </section>

      {projectId && props.canCreateInvoices ? (
        <section className="admin-card">
          <h2>Create client invoice</h2>
          <p className="muted">Client {selectedProject ? clientNames.get(selectedProject.clientId) ?? 'Selected client' : 'Selected client'} · Project {selectedProject?.name ?? 'Selected project'}. Invoice number and totals are controlled by the server.</p>
          <form className="admin-form" onSubmit={invoiceForm.handleSubmit(submitInvoice)}>
            <div className="two-column-form">
              <label>Invoice date<input type="date" {...invoiceForm.register('invoiceDate')} /><span className="field-error">{invoiceForm.formState.errors.invoiceDate?.message}</span></label>
              <label>Due date (optional)<input type="date" {...invoiceForm.register('dueDate')} /><span className="field-error">{invoiceForm.formState.errors.dueDate?.message}</span></label>
            </div>
            {invoiceLines.fields.map((field, index) => (
              <div className="admin-card" key={field.id}>
                <div className="two-column-form">
                  <label>Description<input {...invoiceForm.register(`lines.${index}.description`)} /><span className="field-error">{invoiceForm.formState.errors.lines?.[index]?.description?.message}</span></label>
                  <label>Stage (optional)
                    <select {...invoiceForm.register(`lines.${index}.stageId`)} disabled={!props.canReadStages}>
                      <option value="">Project level</option>
                      {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.code} · {stage.name}</option>)}
                    </select>
                  </label>
                  <label>Amount<input inputMode="decimal" {...invoiceForm.register(`lines.${index}.amount`)} /><span className="field-error">{invoiceForm.formState.errors.lines?.[index]?.amount?.message}</span></label>
                </div>
                {invoiceLines.fields.length > 1 ? <button type="button" className="secondary-button" onClick={() => invoiceLines.remove(index)}>Remove line</button> : null}
              </div>
            ))}
            <div className="admin-actions">
              <button type="button" className="secondary-button" onClick={() => invoiceLines.append({ stageId: '', description: '', amount: '' })}>Add invoice line</button>
              <button type="submit" disabled={createDirectInvoice.isPending}>{createDirectInvoice.isPending ? 'Creating…' : 'Create invoice'}</button>
            </div>
            {mutationMessage(createDirectInvoice.error) ? <div className="form-error" role="alert">{mutationMessage(createDirectInvoice.error)}</div> : null}
          </form>
        </section>
      ) : null}

      {projectId && props.canReadInvoices ? (
        <section className="admin-card">
          <h2>Client invoices</h2>
          <p className="muted">Paid and outstanding values are calculated by the server from posted Client Payment allocations.</p>
          {invoicesQuery.data ? <p className="muted">Total {invoicesQuery.data.total} · Page {invoicesQuery.data.page} · Page size {invoicesQuery.data.pageSize}</p> : null}
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Invoice</th><th>Date</th><th>Status</th><th>Total</th><th>Allocated</th><th>Outstanding</th><th>Project</th><th>Action</th></tr></thead>
              <tbody>
                {(invoicesQuery.data?.items ?? []).map((invoice) => (
                  <tr key={invoice.id}>
                    <td><strong>{invoice.invoiceNo}</strong><br /><small>{clientNames.get(invoice.clientId) ?? 'Project client'}</small></td>
                    <td>{invoice.invoiceDate}</td><td>{invoice.status}</td><td>{displayMoney(invoice.totalAmount)}</td><td>{displayMoney(invoice.allocatedAmount)}</td><td>{displayMoney(invoice.outstandingAmount)}</td><td>{selectedProject?.name ?? 'Selected project'}</td>
                    <td><button type="button" className="secondary-button" onClick={() => setSelectedInvoiceId(invoice.id)}>View</button></td>
                  </tr>
                ))}
                {(invoicesQuery.data?.items.length ?? 0) === 0 ? <tr><td colSpan={8} className="muted">No Client Invoices for this Project.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {selectedInvoiceId ? (
        <div className="finance-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedInvoiceId(null); }}>
          <section className="finance-modal finance-modal-wide" role="dialog" aria-modal="true" aria-labelledby="client-invoice-detail-title">
            <header className="finance-modal-header">
              <div><p className="eyebrow">Client invoice</p><h2 id="client-invoice-detail-title">{selectedInvoiceQuery.data ? `Invoice ${selectedInvoiceQuery.data.invoiceNo}` : 'Invoice details'}</h2>{selectedInvoiceQuery.data ? <p>{clientNames.get(selectedInvoiceQuery.data.clientId) ?? 'Project client'} · {selectedProject?.name ?? 'Selected project'}</p> : null}</div>
              <button type="button" className="finance-modal-close" autoFocus aria-label="Close invoice details" onClick={() => setSelectedInvoiceId(null)}>×</button>
            </header>
            <div className="finance-modal-body">
              {selectedInvoiceQuery.isPending ? <p className="finance-modal-state">Loading invoice details…</p> : null}
              {selectedInvoiceQuery.error instanceof Error ? <div className="form-error" role="alert">{selectedInvoiceQuery.error.message}</div> : null}
              {selectedInvoiceQuery.data ? (
                <div className="admin-stack">
                  <dl className="summary-grid client-invoice-summary-grid">
                    <div><dt>Invoice date</dt><dd>{selectedInvoiceQuery.data.invoiceDate}</dd></div><div><dt>Due date</dt><dd>{selectedInvoiceQuery.data.dueDate ?? 'No due date'}</dd></div><div><dt>Status</dt><dd>{selectedInvoiceQuery.data.status}</dd></div>
                    <div><dt>Source</dt><dd>{selectedInvoiceQuery.data.claimId ? 'Historical claim invoice' : 'Direct invoice'}</dd></div><div><dt>Subtotal</dt><dd>{selectedProject?.currency ?? ''} {displayMoney(selectedInvoiceQuery.data.subtotal)}</dd></div><div><dt>Tax</dt><dd>{selectedProject?.currency ?? ''} {displayMoney(selectedInvoiceQuery.data.taxAmount)}</dd></div>
                    <div><dt>Invoice total</dt><dd>{selectedProject?.currency ?? ''} {displayMoney(selectedInvoiceQuery.data.totalAmount)}</dd></div><div><dt>Paid / allocated</dt><dd>{selectedProject?.currency ?? ''} {displayMoney(selectedInvoiceQuery.data.allocatedAmount)}</dd></div><div><dt>Outstanding</dt><dd>{selectedProject?.currency ?? ''} {displayMoney(selectedInvoiceQuery.data.outstandingAmount)}</dd></div>
                  </dl>
                  <div><h3>Invoice lines</h3><div className="table-wrap"><table className="admin-table"><thead><tr><th>#</th><th>Description</th><th>Stage</th><th>Amount</th></tr></thead><tbody>{selectedInvoiceQuery.data.lines.map((line, index) => <tr key={line.id}><td>{index + 1}</td><td>{line.description}</td><td>{stageLabel(line.stageId)}</td><td>{selectedProject?.currency ?? ''} {displayMoney(line.amount)}</td></tr>)}</tbody><tfoot><tr><th colSpan={3}>Invoice total</th><th>{selectedProject?.currency ?? ''} {displayMoney(selectedInvoiceQuery.data.totalAmount)}</th></tr></tfoot></table></div></div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
