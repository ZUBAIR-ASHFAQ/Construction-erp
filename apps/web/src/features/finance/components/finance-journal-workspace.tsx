import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { usePermission } from '../../administration/hooks/auth.js';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useProjects } from '../../projects/hooks/projects.js';
import type { FinanceAccount, FinanceJournal } from '../api/finance-api.js';
import { useCreateManualJournal, usePostFinanceJournal, useReverseFinanceJournal } from '../hooks/finance.js';

const journalLineSchema = z.object({
  accountId: z.string().uuid('Select a valid GL account.'),
  projectId: z.string().trim(),
  stageId: z.string().trim(),
  debit: z.string().trim().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/, 'Enter a valid amount.'),
  credit: z.string().trim().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/, 'Enter a valid amount.'),
  description: z.string().trim().min(1, 'Line description is required.').max(2000)
}).superRefine((value, context) => {
  const validUuid = z.string().uuid();
  if (value.projectId && !validUuid.safeParse(value.projectId).success) context.addIssue({ code: z.ZodIssueCode.custom, path: ['projectId'], message: 'Select a valid Project.' });
  if (value.stageId && !validUuid.safeParse(value.stageId).success) context.addIssue({ code: z.ZodIssueCode.custom, path: ['stageId'], message: 'Select a valid Stage.' });
  if (value.stageId && !value.projectId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['projectId'], message: 'Select a Project before selecting a Stage.' });
  if (Number(value.debit) > 0 && Number(value.credit) > 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ['credit'], message: 'Use either debit or credit on one line.' });
  if (Number(value.debit) === 0 && Number(value.credit) === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ['debit'], message: 'Debit or credit must be greater than zero.' });
});

const journalSchema = z.object({
  postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Posting date is required.'),
  description: z.string().trim().min(1, 'Journal description is required.').max(2000),
  lines: z.array(journalLineSchema).min(1, 'Add at least one Journal line.').max(500)
});

type JournalValues = z.infer<typeof journalSchema>;

type FinanceJournalWorkspaceProps = Readonly<{
  accounts: readonly FinanceAccount[];
  journals: readonly FinanceJournal[];
}>;

type JournalLineFieldsProps = Readonly<{
  form: UseFormReturn<JournalValues>;
  index: number;
  accounts: readonly FinanceAccount[];
  projects: ReadonlyArray<Readonly<{ id: string; projectCode: string; name: string }>>;
  canReadProjects: boolean;
  canReadStages: boolean;
  canRemove: boolean;
  onRemove: () => void;
}>;

const EMPTY_LINE: JournalValues['lines'][number] = { accountId: '', projectId: '', stageId: '', debit: '0.00', credit: '0.00', description: '' };

/** Convert optional Project/Stage form fields into the API's absent-or-UUID shape. */
function normalizeJournal(values: JournalValues) {
  return {
    postingDate: values.postingDate,
    description: values.description,
    lines: values.lines.map((line) => ({
      accountId: line.accountId,
      ...(line.projectId ? { projectId: line.projectId } : {}),
      ...(line.stageId ? { stageId: line.stageId } : {}),
      debit: line.debit,
      credit: line.credit,
      description: line.description
    }))
  };
}

/** Render one Journal line with readable Account, Project and Stage selectors. */
function JournalLineFields(props: JournalLineFieldsProps) {
  const projectId = useWatch({ control: props.form.control, name: `lines.${props.index}.projectId` }) ?? '';
  const stagesQuery = useProjectStages(projectId || null, props.canReadStages && projectId !== '');
  const stages = stagesQuery.data?.items ?? [];

  return (
    <div className="admin-grid">
      <label>Account<select {...props.form.register(`lines.${props.index}.accountId`)}><option value="">Select account</option>{props.accounts.map((account) => <option key={account.id} value={account.id}>{account.accountCode} · {account.name}</option>)}</select></label>
      <label>Project
        <select
          {...props.form.register(`lines.${props.index}.projectId`)}
          disabled={!props.canReadProjects}
          onChange={(event) => {
            props.form.setValue(`lines.${props.index}.projectId`, event.target.value);
            props.form.setValue(`lines.${props.index}.stageId`, '');
          }}
        >
          <option value="">{props.canReadProjects ? 'Company level' : 'Company level · Project read permission required'}</option>
          {props.projects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}
        </select>
      </label>
      <label>Stage
        <select {...props.form.register(`lines.${props.index}.stageId`)} disabled={!props.canReadStages || !projectId}>
          <option value="">{projectId ? 'Project level' : 'Select a Project first'}</option>
          {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.code} · {stage.name}</option>)}
        </select>
      </label>
      <label>Debit<input {...props.form.register(`lines.${props.index}.debit`)} /></label>
      <label>Credit<input {...props.form.register(`lines.${props.index}.credit`)} /></label>
      <label>Description<input {...props.form.register(`lines.${props.index}.description`)} /></label>
      {props.canRemove && <button className="secondary-button" type="button" onClick={props.onRemove}>Remove line</button>}
      {stagesQuery.error instanceof Error && <p className="form-error" role="alert">{stagesQuery.error.message}</p>}
    </div>
  );
}

/** Render draft Journal entry plus explicit post/reverse controls. */
export function FinanceJournalWorkspace({ accounts, journals }: FinanceJournalWorkspaceProps) {
  const canCreate = usePermission('finance.journals.create');
  const canReadFinance = usePermission('finance.read');
  const canPost = usePermission('finance.journals.post');
  const canReverse = usePermission('finance.journals.reverse');
  const canReadProjects = usePermission('projects.read');
  const canReadStages = usePermission('stages.read');
  const projectsQuery = useProjects({ page: 1, pageSize: 100 }, canCreate && canReadFinance && canReadProjects);
  const createMutation = useCreateManualJournal();
  const postMutation = usePostFinanceJournal();
  const reverseMutation = useReverseFinanceJournal();
  const form = useForm<JournalValues>({ resolver: zodResolver(journalSchema), defaultValues: { postingDate: new Date().toISOString().slice(0, 10), description: '', lines: [{ ...EMPTY_LINE }, { ...EMPTY_LINE }] } });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const projects = projectsQuery.data?.items ?? [];

  /** Submit one draft Journal after boundary validation. */
  async function handleCreate(values: JournalValues): Promise<void> {
    await createMutation.mutateAsync(normalizeJournal(values));
    form.reset({ postingDate: values.postingDate, description: '', lines: [{ ...EMPTY_LINE }, { ...EMPTY_LINE }] });
  }

  return (
    <section className="admin-card">
      <h2>Journals</h2>
      <p className="muted">Draft manually, then post only when balanced. Posted Journals are corrected with an explicit reversal.</p>

      {canCreate && !canReadFinance && (
        <p className="muted">Finance read permission is required to choose ledger accounts. Raw account IDs are not accepted.</p>
      )}

      {canCreate && canReadFinance && (
        <form onSubmit={form.handleSubmit(handleCreate)}>
          <div className="admin-grid two-columns">
            <label>Posting date<input type="date" {...form.register('postingDate')} /></label>
            <label>Description<input {...form.register('description')} /></label>
          </div>
          {lines.fields.map((field, index) => (
            <JournalLineFields
              key={field.id}
              form={form}
              index={index}
              accounts={accounts}
              projects={projects}
              canReadProjects={canReadProjects}
              canReadStages={canReadStages}
              canRemove={lines.fields.length > 1}
              onRemove={() => lines.remove(index)}
            />
          ))}
          <div className="action-row">
            <button className="secondary-button" type="button" onClick={() => lines.append({ ...EMPTY_LINE })}>Add line</button>
            <button type="submit" disabled={createMutation.isPending}>Create draft Journal</button>
          </div>
        </form>
      )}

      {projectsQuery.error instanceof Error && <p className="form-error" role="alert">{projectsQuery.error.message}</p>}
      {Object.values(form.formState.errors).length > 0 && <p className="form-error" role="alert">Check the highlighted Journal fields.</p>}
      {createMutation.error instanceof Error && <p className="form-error" role="alert">{createMutation.error.message}</p>}

      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>Journal</th><th>Date</th><th>Status</th><th>Period</th><th>Debit</th><th>Credit</th><th>Scope / Lines</th><th>Actions</th></tr></thead>
          <tbody>
            {journals.map((journal) => (
              <tr key={journal.id}>
                <td>
                  <strong>{journal.journalNo}</strong><span>{journal.description}</span>
                  <small className="muted">{journal.sourceType} · {journal.sourceKey ?? 'No source key'} · {journal.sourceId ?? 'No source ID'} · {journal.id}</small>
                </td>
                <td>{journal.postingDate}<br /><small>{journal.postedAt ? `Posted ${new Date(journal.postedAt).toLocaleString()}` : 'Not posted'}</small></td>
                <td>{journal.status}<br /><small>Created by {journal.createdBy ?? 'System'}</small></td>
                <td>{journal.periodId}</td><td>{journal.totalDebit}</td><td>{journal.totalCredit}</td>
                <td>
                  <span>{journal.lines.some((line) => line.stageId) ? 'Project / Stage' : journal.lines.some((line) => line.projectId) ? 'Project' : 'Company'}</span>
                  <details><summary>{journal.lines.length} line(s)</summary>
                    {journal.lines.map((line) => <div key={line.id}><code>{line.id}</code> · Account {line.accountId} · Project {line.projectId ?? '—'} · Stage {line.stageId ?? '—'} · Debit {line.debit} · Credit {line.credit} · {line.description} · Journal {line.journalId}</div>)}
                  </details>
                </td>
                <td className="action-row">
                  {canPost && journal.status === 'DRAFT' && <button type="button" disabled={postMutation.isPending} onClick={() => postMutation.mutate(journal.id)}>Post</button>}
                  {canReverse && journal.status === 'POSTED' && <button type="button" className="secondary-button" disabled={reverseMutation.isPending} onClick={() => reverseMutation.mutate(journal.id)}>Reverse</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(postMutation.error ?? reverseMutation.error) instanceof Error && <p className="form-error" role="alert">{String((postMutation.error ?? reverseMutation.error)?.message)}</p>}
    </section>
  );
}
