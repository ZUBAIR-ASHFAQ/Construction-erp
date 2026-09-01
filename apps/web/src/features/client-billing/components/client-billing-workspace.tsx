import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useProjects } from '../../projects/hooks/projects.js';
import type { Project } from '../../projects/api/projects-api.js';
import type { BillingClaim, BillingMethod } from '../api/client-billing-api.js';
import {
  useBillingClaims,
  useBillingSettings,
  useClientInvoices,
  useCreateBillingClaim,
  useCreateClientInvoice,
  useFinalizeBillingClaim,
  useUpdateBillingClaim,
  useUpdateBillingSettings
} from '../hooks/client-billing.js';

const positiveMoneySchema = z.string().trim().regex(/^(?:[1-9]\d{0,15})(?:\.\d{1,2})?$|^0\.(?:0[1-9]|[1-9]\d?)$/, 'Enter a positive amount with up to 2 decimals.');
const percentSchema = z.string().trim().refine((value) => value === '' || (/^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/.test(value) && Number(value) <= 100), 'Enter a percentage between 0 and 100.');
const optionalUuidSchema = z.string().trim().refine((value) => value === '' || z.string().uuid().safeParse(value).success, 'Select a valid Stage or leave it at Project level.');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select a valid date.');

const settingsFormSchema = z.object({
  billingMethod: z.enum(['FIXED_PRICE', 'COST_PLUS_PERCENTAGE']),
  retentionPercent: percentSchema,
  billingCycle: z.string().trim().max(64),
  advanceRecoveryEnabled: z.boolean(),
  status: z.enum(['ACTIVE', 'INACTIVE'])
});

const claimFormSchema = z.object({
  periodEnd: dateSchema,
  lines: z.array(z.object({
    stageId: optionalUuidSchema,
    description: z.string().trim().min(1, 'Description is required.').max(1000),
    billingProgressPercent: percentSchema,
    amount: positiveMoneySchema
  })).min(1, 'Add at least one claim line.').max(500, 'A claim can contain at most 500 lines.')
});

const invoiceFormSchema = z.object({
  invoiceDate: dateSchema,
  dueDate: dateSchema
}).refine((value) => value.dueDate >= value.invoiceDate, { path: ['dueDate'], message: 'Due date cannot be earlier than invoice date.' });

type SettingsForm = z.infer<typeof settingsFormSchema>;
type ClaimForm = z.infer<typeof claimFormSchema>;
type InvoiceForm = z.infer<typeof invoiceFormSchema>;

type ClientBillingWorkspaceProps = Readonly<{
  canRead: boolean;
  canManageSettings: boolean;
  canCreateClaims: boolean;
  canEditClaims: boolean;
  canFinalizeClaims: boolean;
  canCreateInvoices: boolean;
  canReadInvoices: boolean;
  canReadStages: boolean;
}>;

const EMPTY_CLAIM_FORM: ClaimForm = {
  periodEnd: '',
  lines: [{ stageId: '', description: '', billingProgressPercent: '', amount: '' }]
};

/** Convert one browser claim form into the exact API claim-line shape. */
function claimLines(values: ClaimForm['lines']) {
  return values.map((line) => ({
    stageId: line.stageId || null,
    description: line.description.trim(),
    billingProgressPercent: line.billingProgressPercent || null,
    amount: line.amount
  }));
}

/** Convert one money value to a readable two-decimal display without making it authoritative. */
function displayMoney(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value;
}

/** Return a readable Project billing-model label. */
function billingMethodLabel(method: BillingMethod): string {
  return method === 'COST_PLUS_PERCENTAGE' ? 'Cost + Percentage' : 'Fixed Price';
}

/** Explain the source-owned billing basis without calculating server totals in the browser. */
function billingBasisText(project: Project): string {
  if (project.projectModel === 'COST_PLUS_PERCENTAGE') {
    const percent = project.costPlusPercent ?? 'configured';
    return `Cost + Percentage: claim amounts are validated by the server against posted actual Project/Stage cost through the claim period end plus the effective Profit / Markup rate. Each Stage uses its own override when set; otherwise it uses the Project ${percent}% fallback.`;
  }
  return `Fixed Price: Project value ${displayMoney(project.projectValue)} is the commercial reference. Claim amounts remain explicit billing values; physical Stage progress does not auto-create billing.`;
}

/** Render the focused Final-21 Client Billing settings, claims and invoices workspace. */
export function ClientBillingWorkspace(props: ClientBillingWorkspaceProps) {
  const projectsQuery = useProjects({ page: 1, pageSize: 100 }, props.canRead);
  const projects = projectsQuery.data?.items ?? [];
  const [projectId, setProjectId] = useState('');
  const [editingClaim, setEditingClaim] = useState<BillingClaim | null>(null);
  const [invoiceClaim, setInvoiceClaim] = useState<BillingClaim | null>(null);
  const selectedProject = useMemo(() => projects.find((project) => project.id === projectId) ?? null, [projectId, projects]);

  const settingsQuery = useBillingSettings(projectId || null, props.canRead && projectId !== '');
  const stagesQuery = useProjectStages(projectId || null, props.canReadStages && projectId !== '');
  const claimsQuery = useBillingClaims({ ...(projectId ? { projectId } : {}), page: 1, pageSize: 50 }, props.canRead && projectId !== '');
  const invoicesQuery = useClientInvoices({ ...(projectId ? { projectId } : {}), page: 1, pageSize: 50 }, props.canReadInvoices && projectId !== '');
  const stages = stagesQuery.data?.items ?? [];
  const stageNames = useMemo(() => new Map(stages.map((stage) => [stage.id, `${stage.code} · ${stage.name}`])), [stages]);

  const updateSettings = useUpdateBillingSettings(projectId || null);
  const createClaim = useCreateBillingClaim();
  const updateClaim = useUpdateBillingClaim();
  const finalizeClaim = useFinalizeBillingClaim();
  const createInvoice = useCreateClientInvoice();

  const settingsForm = useForm<SettingsForm>({ resolver: zodResolver(settingsFormSchema), defaultValues: { billingMethod: 'FIXED_PRICE', retentionPercent: '', billingCycle: '', advanceRecoveryEnabled: false, status: 'ACTIVE' } });
  const claimForm = useForm<ClaimForm>({ resolver: zodResolver(claimFormSchema), defaultValues: EMPTY_CLAIM_FORM });
  const fields = useFieldArray({ control: claimForm.control, name: 'lines' });
  const invoiceForm = useForm<InvoiceForm>({ resolver: zodResolver(invoiceFormSchema), defaultValues: { invoiceDate: '', dueDate: '' } });

  useEffect(() => {
    if (!settingsQuery.data || !selectedProject) return;
    settingsForm.reset({
      billingMethod: selectedProject.projectModel,
      retentionPercent: settingsQuery.data.retentionPercent ?? '',
      billingCycle: settingsQuery.data.billingCycle ?? '',
      advanceRecoveryEnabled: settingsQuery.data.advanceRecoveryEnabled,
      status: settingsQuery.data.status
    });
  }, [selectedProject, settingsQuery.data, settingsForm]);

  useEffect(() => {
    setEditingClaim(null);
    setInvoiceClaim(null);
    claimForm.reset(EMPTY_CLAIM_FORM);
    invoiceForm.reset({ invoiceDate: '', dueDate: '' });
  }, [projectId, claimForm, invoiceForm]);

  /** Return a Stage label while avoiding raw UUID display when Stage read permission is unavailable. */
  function stageLabel(stageId: string | null): string {
    if (!stageId) return 'Project level';
    return stageNames.get(stageId) ?? 'Linked Stage (restricted)';
  }

  /** Save editable billing settings while keeping Project Management authoritative for the billing model. */
  async function submitSettings(values: SettingsForm): Promise<void> {
    if (!projectId || !selectedProject) return;
    await updateSettings.mutateAsync({
      ...values,
      billingMethod: selectedProject.projectModel,
      retentionPercent: values.retentionPercent || null,
      billingCycle: values.billingCycle || null
    });
  }

  /** Create or update one draft claim from the shared Stage-aware claim editor. */
  async function submitClaim(values: ClaimForm): Promise<void> {
    if (!projectId) return;
    const input = { periodEnd: values.periodEnd, lines: claimLines(values.lines) };
    if (editingClaim) await updateClaim.mutateAsync({ claimId: editingClaim.id, input });
    else await createClaim.mutateAsync({ projectId, ...input });
    setEditingClaim(null);
    claimForm.reset(EMPTY_CLAIM_FORM);
  }

  /** Load one draft claim into the shared editor without losing existing Stage attribution. */
  function startEditingClaim(claim: BillingClaim): void {
    setEditingClaim(claim);
    claimForm.reset({
      periodEnd: claim.periodEnd,
      lines: claim.lines.map((line) => ({ stageId: line.stageId ?? '', description: line.description, billingProgressPercent: line.billingProgressPercent ?? '', amount: line.amount }))
    });
  }

  /** Create an issued Client Invoice for the selected finalized claim. */
  async function submitInvoice(values: InvoiceForm): Promise<void> {
    if (!invoiceClaim) return;
    await createInvoice.mutateAsync({ claimId: invoiceClaim.id, input: values });
    setInvoiceClaim(null);
    invoiceForm.reset({ invoiceDate: '', dueDate: '' });
  }

  if (!props.canRead) return <section className="admin-card"><p>You do not have Client Billing read access.</p></section>;

  return (
    <div className="admin-stack">
      <section className="admin-card">
        <h2>Project</h2>
        <label>Allowed Project
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Select a project</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}
          </select>
        </label>
        {selectedProject ? (
          <div className="admin-stack">
            <p><strong>{billingMethodLabel(selectedProject.projectModel)}</strong> · {selectedProject.currency}</p>
            <p className="muted">{billingBasisText(selectedProject)}</p>
          </div>
        ) : null}
      </section>

      {projectId && settingsQuery.data ? (
        <section className="admin-card">
          <h2>Billing settings</h2>
          <p className="muted">The commercial model is owned by Project Management. Client Billing controls retention, cycle, advance-recovery flag and billing status only.</p>
          <p className="muted">Project ID {settingsQuery.data.projectId}</p>
          {props.canManageSettings ? (
            <form className="admin-form" onSubmit={settingsForm.handleSubmit(submitSettings)}>
              <label>Billing method
                <input {...settingsForm.register('billingMethod')} readOnly aria-readonly="true" />
                <small className="muted">Read-only because Project Management owns this value.</small>
              </label>
              <label>Retention %<input inputMode="decimal" {...settingsForm.register('retentionPercent')} /><span className="field-error">{settingsForm.formState.errors.retentionPercent?.message}</span></label>
              <label>Billing cycle<input {...settingsForm.register('billingCycle')} /></label>
              <label><input type="checkbox" {...settingsForm.register('advanceRecoveryEnabled')} /> Advance recovery enabled</label>
              <label>Status<select {...settingsForm.register('status')}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
              <button type="submit" disabled={updateSettings.isPending}>Save settings</button>
            </form>
          ) : (
            <p>{billingMethodLabel(settingsQuery.data.billingMethod)} · Retention {settingsQuery.data.retentionPercent ?? '0'}% · Cycle {settingsQuery.data.billingCycle ?? '—'} · Advance recovery {settingsQuery.data.advanceRecoveryEnabled ? 'Enabled' : 'Disabled'} · {settingsQuery.data.status}</p>
          )}
        </section>
      ) : null}

      {projectId && (props.canCreateClaims || (props.canEditClaims && editingClaim)) ? (
        <section className="admin-card">
          <h2>{editingClaim ? `Edit ${editingClaim.claimNo}` : 'New progress claim'}</h2>
          <p className="muted">Stage is selected from the current Project when permitted. Billing progress is separate from physical Stage progress, and the server remains authoritative for final certification.</p>
          <form className="admin-form" onSubmit={claimForm.handleSubmit(submitClaim)}>
            <label>Period end<input type="date" {...claimForm.register('periodEnd')} /><span className="field-error">{claimForm.formState.errors.periodEnd?.message}</span></label>
            {fields.fields.map((field, index) => {
              const currentStageId = claimForm.watch(`lines.${index}.stageId`);
              const hasRestrictedCurrentStage = Boolean(currentStageId && !stageNames.has(currentStageId));
              return (
                <div className="admin-card" key={field.id}>
                  <div className="two-column-form">
                    <label>Description<input {...claimForm.register(`lines.${index}.description`)} /><span className="field-error">{claimForm.formState.errors.lines?.[index]?.description?.message}</span></label>
                    <label>Stage (optional)
                      <select {...claimForm.register(`lines.${index}.stageId`)}>
                        <option value="">Project level</option>
                        {hasRestrictedCurrentStage ? <option value={currentStageId}>Linked Stage (restricted)</option> : null}
                        {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.code} · {stage.name} · {stage.status}{selectedProject?.projectModel === 'COST_PLUS_PERCENTAGE' ? ` · Profit / Markup ${stage.costPlusPercent ?? selectedProject.costPlusPercent ?? 'configured'}%` : ''}</option>)}
                      </select>
                      {!props.canReadStages ? <small className="muted">Stage choices require Project Stage read access; Project-level billing remains available.</small> : null}
                    </label>
                    <label>Billing progress % (optional)<input inputMode="decimal" {...claimForm.register(`lines.${index}.billingProgressPercent`)} /></label>
                    <label>Amount<input inputMode="decimal" {...claimForm.register(`lines.${index}.amount`)} /><span className="field-error">{claimForm.formState.errors.lines?.[index]?.amount?.message}</span></label>
                  </div>
                  {fields.fields.length > 1 ? <button type="button" onClick={() => fields.remove(index)}>Remove line</button> : null}
                </div>
              );
            })}
            <div className="admin-actions">
              <button type="button" onClick={() => fields.append({ stageId: '', description: '', billingProgressPercent: '', amount: '' })}>Add line</button>
              <button type="submit" disabled={createClaim.isPending || updateClaim.isPending}>{editingClaim ? 'Save claim' : 'Create claim'}</button>
              {editingClaim ? <button type="button" onClick={() => { setEditingClaim(null); claimForm.reset(EMPTY_CLAIM_FORM); }}>Cancel edit</button> : null}
            </div>
          </form>
        </section>
      ) : null}

      {projectId ? (
        <section className="admin-card">
          <h2>Claims</h2>
          {claimsQuery.data ? <p className="muted">Total {claimsQuery.data.total} · Page {claimsQuery.data.page} · Page size {claimsQuery.data.pageSize}</p> : null}
          {(claimsQuery.data?.items ?? []).length === 0 ? <p className="muted">No claims for this Project.</p> : null}
          {(claimsQuery.data?.items ?? []).map((claim) => (
            <div className="admin-card" key={claim.id}>
              <div className="module-row">
                <div>
                  <strong>{claim.claimNo}</strong>
                  <div className="muted">Claim ID {claim.id} · Project ID {claim.projectId} · Client ID {claim.clientId}</div>
                  <div className="muted">{claim.periodEnd} · {claim.status} · Gross {displayMoney(claim.grossValue)} · Deductions {displayMoney(claim.deductions)} · Retention {displayMoney(claim.retention)} · Net {displayMoney(claim.netCertified)}</div>
                </div>
                <div className="admin-actions">
                  {claim.status === 'DRAFT' && props.canEditClaims ? <button type="button" onClick={() => startEditingClaim(claim)}>Edit</button> : null}
                  {claim.status === 'DRAFT' && props.canFinalizeClaims ? <button type="button" disabled={finalizeClaim.isPending} onClick={() => finalizeClaim.mutate(claim.id)}>Finalize</button> : null}
                  {claim.status === 'FINALIZED' && !claim.invoice && props.canCreateInvoices ? <button type="button" onClick={() => setInvoiceClaim(claim)}>Create invoice</button> : null}
                </div>
              </div>
              <table>
                <thead><tr><th>Line ID</th><th>Description</th><th>Stage</th><th>Stage ID</th><th>Billing progress</th><th>Amount</th></tr></thead>
                <tbody>{claim.lines.map((line) => <tr key={line.id}><td>{line.id}</td><td>{line.description}</td><td>{stageLabel(line.stageId)}</td><td>{line.stageId ?? '—'}</td><td>{line.billingProgressPercent ?? '—'}</td><td>{displayMoney(line.amount)}</td></tr>)}</tbody>
              </table>
              {claim.invoice ? (
                <div className="admin-card">
                  <strong>Linked invoice {claim.invoice.invoiceNo}</strong>
                  <div className="muted">Invoice ID {claim.invoice.id} · Project ID {claim.invoice.projectId} · Client ID {claim.invoice.clientId} · Claim ID {claim.invoice.claimId ?? '—'}</div>
                  <div className="muted">{claim.invoice.invoiceDate} · Due {claim.invoice.dueDate ?? '—'} · {claim.invoice.status} · Subtotal {displayMoney(claim.invoice.subtotal)} · Tax {displayMoney(claim.invoice.taxAmount)} · Billed {displayMoney(claim.invoice.totalAmount)}</div>
                  <table>
                    <thead><tr><th>Line ID</th><th>Description</th><th>Stage</th><th>Stage ID</th><th>Amount</th></tr></thead>
                    <tbody>{claim.invoice.lines.map((line) => <tr key={line.id}><td>{line.id}</td><td>{line.description}</td><td>{stageLabel(line.stageId)}</td><td>{line.stageId ?? '—'}</td><td>{displayMoney(line.amount)}</td></tr>)}</tbody>
                  </table>
                </div>
              ) : <p className="muted">Linked invoice —</p>}
            </div>
          ))}
        </section>
      ) : null}

      {invoiceClaim ? (
        <section className="admin-card">
          <h2>Create invoice for {invoiceClaim.claimNo}</h2>
          <p className="muted">The issued invoice preserves the finalized Claim lines and their optional Stage attribution. Invoice totals and Finance / AR posting are server-owned.</p>
          <form className="admin-form" onSubmit={invoiceForm.handleSubmit(submitInvoice)}>
            <label>Invoice date<input type="date" {...invoiceForm.register('invoiceDate')} /></label>
            <label>Due date<input type="date" {...invoiceForm.register('dueDate')} /><span className="field-error">{invoiceForm.formState.errors.dueDate?.message}</span></label>
            <div className="admin-actions">
              <button type="submit" disabled={createInvoice.isPending}>Create invoice</button>
              <button type="button" onClick={() => setInvoiceClaim(null)}>Cancel</button>
            </div>
          </form>
        </section>
      ) : null}

      {projectId && props.canReadInvoices ? (
        <section className="admin-card">
          <h2>Client invoices</h2>
          <p className="muted">Invoice total is the billed source. Received, advance and outstanding values are intentionally not calculated here; Module 16 Client Receipts / Payments owns cash receipt and allocation history.</p>
          {invoicesQuery.data ? <p className="muted">Total {invoicesQuery.data.total} · Page {invoicesQuery.data.page} · Page size {invoicesQuery.data.pageSize}</p> : null}
          {(invoicesQuery.data?.items ?? []).length === 0 ? <p className="muted">No Client Invoices for this Project.</p> : null}
          {(invoicesQuery.data?.items ?? []).map((invoice) => (
            <div className="admin-card" key={invoice.id}>
              <div className="module-row">
                <div>
                  <strong>{invoice.invoiceNo}</strong>
                  <div className="muted">Invoice ID {invoice.id} · Project ID {invoice.projectId} · Client ID {invoice.clientId} · Claim ID {invoice.claimId ?? '—'}</div>
                  <div>{invoice.invoiceDate} · Due {invoice.dueDate ?? '—'} · {invoice.status} · Subtotal {displayMoney(invoice.subtotal)} · Tax {displayMoney(invoice.taxAmount)} · Billed {displayMoney(invoice.totalAmount)}</div>
                </div>
              </div>
              <table>
                <thead><tr><th>Line ID</th><th>Description</th><th>Stage</th><th>Stage ID</th><th>Amount</th></tr></thead>
                <tbody>{invoice.lines.map((line) => <tr key={line.id}><td>{line.id}</td><td>{line.description}</td><td>{stageLabel(line.stageId)}</td><td>{line.stageId ?? '—'}</td><td>{displayMoney(line.amount)}</td></tr>)}</tbody>
              </table>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
