import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { usePermission } from '../../administration/hooks/auth.js';
import { useDocuments } from '../../documents-audit/hooks/documents.js';
import {
  useApproveStageProgress,
  useCreateProjectStage,
  useFreezeProjectStageBaseline,
  useProjectStages,
  useRecordStageProgress,
  useUpdateProjectStage,
  useUpdateStageProgress
} from '../hooks/project-stages.js';
import type { ProjectStage, StageProgressUpdate } from '../api/project-stages-api.js';

const stageFormSchema = z.object({
  code: z.string().trim().min(1, 'Stage code is required.').max(100),
  name: z.string().trim().min(1, 'Stage name is required.').max(300),
  sequenceNo: z.coerce.number().int().min(1),
  weightPercent: z.string()
    .regex(/^(?:0|[1-9]\d{0,2}|100)(?:\.\d{1,4})?$/, 'Use a percentage with up to 4 decimals.')
    .refine((value) => Number(value) > 0 && Number(value) <= 100, 'Weight must be greater than 0 and at most 100.'),
  costPlusPercent: z.string().refine(
    (value) => value === '' || (/^(?:0|[1-9]\d{0,2}|100)(?:\.\d{1,4})?$/.test(value) && Number(value) > 0 && Number(value) <= 100),
    'Profit / Markup must be greater than 0 and at most 100.'
  ),
  plannedStartDate: z.string(),
  plannedEndDate: z.string()
}).refine((value) => value.plannedStartDate === '' || value.plannedEndDate === '' || value.plannedEndDate >= value.plannedStartDate, {
  path: ['plannedEndDate'],
  message: 'Planned end date cannot precede planned start date.'
});

const progressFormSchema = z.object({
  stageId: z.string().uuid('Select a Stage.'),
  progressPercent: z.string()
    .regex(/^(?:0|[1-9]\d{0,2}|100)(?:\.\d{1,4})?$/, 'Use a percentage with up to 4 decimals.')
    .refine((value) => Number(value) >= 0 && Number(value) <= 100, 'Progress must be between 0 and 100.'),
  progressDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
  note: z.string().trim().max(5000),
  evidenceDocumentId: z.union([z.literal(''), z.string().uuid('Use a valid Document UUID.')])
});

type StageFormValues = z.infer<typeof stageFormSchema>;
type ProgressFormValues = z.infer<typeof progressFormSchema>;

export type ProjectStagesWorkspaceProps = Readonly<{
  projectId: string;
  projectCode: string;
  projectName: string;
  projectCurrency: string;
  projectModel: 'FIXED_PRICE' | 'COST_PLUS_PERCENTAGE';
  projectCostPlusPercent: string | null;
  canManage: boolean;
  canFreeze: boolean;
  canRecordProgress: boolean;
  canApproveProgress: boolean;
}>;

/** Return one readable request error for compact Stage forms. */
function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

/** Collect readable form-field messages without depending on nested form-error shapes. */
function formErrorMessages(errors: Record<string, unknown>): string[] {
  return Object.values(errors).flatMap((error) => {
    if (!error || typeof error !== 'object' || !('message' in error)) return [];
    return typeof error.message === 'string' ? [error.message] : [];
  });
}

/** Return the next unused Stage sequence from persisted Project Stages. */
function nextStageSequenceNo(stages: readonly Pick<ProjectStage, 'sequenceNo'>[]): number {
  return stages.reduce((highest, stage) => Math.max(highest, stage.sequenceNo), 0) + 1;
}

/** Recognize only the safe automatic-sequence conflict that may be retried once. */
function isAutomaticSequenceConflict(error: unknown): boolean {
  return error instanceof Error && error.message === 'Stage sequence number is already in use inside the Project.';
}

/** Format an exact API percentage for compact Stage display without changing its stored value. */
function formatPercent(value: string | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return `${numeric.toFixed(decimals).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}%`;
}

/** Format an exact money string with grouping while keeping the API value read-only. */
function formatMoney(value: string | null | undefined, currency: string): string {
  if (value === null || value === undefined || value === '') return '—';
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return `${currency} ${value}`;
  const sign = match[1] ?? '';
  const whole = (match[2] ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = (match[3] ?? '').padEnd(2, '0').slice(0, 2);
  return `${currency} ${sign}${whole}.${fraction}`;
}

/** Convert one persisted date-only value into the short date style used across list pages. */
function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

/** Return the neutral status class used by Stage and progress status chips. */
function statusClass(status: string): string {
  return `project-stage-status project-stage-status-${status.toLowerCase().replace(/_/g, '-')}`;
}

/** Render one Stage row as a compact operational summary instead of exposing internal identifiers. */
function StageRow({ stage, fallbackPercent, currency, canEdit, onEdit }: Readonly<{
  stage: ProjectStage;
  fallbackPercent: string | null;
  currency: string;
  canEdit: boolean;
  onEdit: (stage: ProjectStage) => void;
}>) {
  const progress = Math.max(0, Math.min(100, Number(stage.approvedPhysicalProgressPercent ?? '0')));
  const markup = stage.costPlusPercent ? `${formatPercent(stage.costPlusPercent)} Stage rate` : fallbackPercent ? `Project ${fallbackPercent}%` : 'Not applicable';

  return (
    <tr>
      <td>
        <div className="project-stage-identity">
          <span className="project-stage-sequence">{stage.sequenceNo}</span>
          <div>
            <strong>{stage.code}</strong>
            <span>{stage.name}</span>
          </div>
        </div>
      </td>
      <td>
        <strong>{formatPercent(stage.weightPercent)}</strong>
        <small>{markup}</small>
      </td>
      <td>
        <div className="project-stage-progress-cell">
          <div className="project-stage-progress-track" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
          <strong>{formatPercent(stage.approvedPhysicalProgressPercent ?? '0.0000')}</strong>
        </div>
      </td>
      <td>
        {stage.financials ? (
          <div className="project-stage-financial-grid">
            <div><span>Planned</span><strong>{formatMoney(stage.financials.plannedAmount ?? stage.plannedAmount, currency)}</strong></div>
            <div><span>Actual cost</span><strong>{formatMoney(stage.financials.actualCost, currency)}</strong></div>
            <div><span>Billed</span><strong>{formatMoney(stage.financials.billedAmount, currency)}</strong></div>
            <div><span>Received</span><strong>{formatMoney(stage.financials.receivedAmount, currency)}</strong></div>
            <div><span>Allocated</span><strong>{formatMoney(stage.financials.allocatedReceiptAmount, currency)}</strong></div>
            <div><span>Outstanding</span><strong>{formatMoney(stage.financials.outstandingAmount, currency)}</strong></div>
            {Number(stage.financials.advanceAmount) !== 0 && <div><span>Advance</span><strong>{formatMoney(stage.financials.advanceAmount, currency)}</strong></div>}
          </div>
        ) : (
          <span className="project-stage-restricted">Financial details restricted</span>
        )}
      </td>
      <td>
        <div className="project-stage-dates">
          <span><strong>Planned</strong>{formatDate(stage.plannedStartDate)} → {formatDate(stage.plannedEndDate)}</span>
          <span><strong>Actual</strong>{formatDate(stage.actualStartDate)} → {formatDate(stage.actualEndDate)}</span>
        </div>
      </td>
      <td><span className={statusClass(stage.status)}>{stage.status}</span></td>
      <td>{canEdit ? <button type="button" className="secondary-button client-edit-button" onClick={() => onEdit(stage)}>Edit</button> : '—'}</td>
    </tr>
  );
}

/** Render the Stage setup, frozen baseline, progress history and progress-entry workflow. */
export function ProjectStagesWorkspace(props: ProjectStagesWorkspaceProps) {
  const stagesQuery = useProjectStages(props.projectId);
  const canReadDocuments = usePermission('documents.read');
  const documentsQuery = useDocuments({ projectId: props.projectId, status: 'active', page: 1, pageSize: 100 }, canReadDocuments && props.canRecordProgress);
  const createMutation = useCreateProjectStage(props.projectId);
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const updateMutation = useUpdateProjectStage(props.projectId, editingStageId ?? '');
  const freezeMutation = useFreezeProjectStageBaseline(props.projectId);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [editingProgress, setEditingProgress] = useState<Readonly<{ stageId: string; update: StageProgressUpdate }> | null>(null);

  const stageForm = useForm<StageFormValues>({
    resolver: zodResolver(stageFormSchema),
    defaultValues: { code: '', name: '', sequenceNo: 1, weightPercent: '', costPlusPercent: '', plannedStartDate: '', plannedEndDate: '' }
  });
  const progressForm = useForm<ProgressFormValues>({
    resolver: zodResolver(progressFormSchema),
    defaultValues: { stageId: '', progressPercent: '', progressDate: '', note: '', evidenceDocumentId: '' }
  });

  const progressStageId = progressForm.watch('stageId');
  const progressMutation = useRecordStageProgress(props.projectId, progressStageId);
  const updateProgressMutation = useUpdateStageProgress(props.projectId);
  const approvalMutation = useApproveStageProgress(props.projectId);
  const stages = stagesQuery.data?.items ?? [];
  const automaticSequenceNo = nextStageSequenceNo(stages);

  useEffect(() => {
    if (stagesQuery.data?.projectId !== props.projectId || editingStageId || stageForm.formState.dirtyFields.sequenceNo) return;
    stageForm.setValue('sequenceNo', automaticSequenceNo);
  }, [automaticSequenceNo, editingStageId, props.projectId, stageForm, stagesQuery.data?.projectId]);

  /** Create or update one draft Stage using only editable planning fields. */
  async function handleSaveStage(values: StageFormValues): Promise<void> {
    const editableInput = {
      code: values.code,
      name: values.name,
      weightPercent: values.weightPercent,
      ...(props.projectModel === 'COST_PLUS_PERCENTAGE' ? { costPlusPercent: values.costPlusPercent === '' ? null : values.costPlusPercent } : {}),
      plannedStartDate: values.plannedStartDate === '' ? null : values.plannedStartDate,
      plannedEndDate: values.plannedEndDate === '' ? null : values.plannedEndDate
    };

    if (editingStageId) {
      await updateMutation.mutateAsync({ ...editableInput, sequenceNo: values.sequenceNo });
    } else {
      const sequenceWasEdited = Boolean(stageForm.formState.dirtyFields.sequenceNo);
      const latest = await stagesQuery.refetch();
      const firstSequenceNo = sequenceWasEdited
        ? values.sequenceNo
        : nextStageSequenceNo(latest.data?.items ?? stages);
      let created: ProjectStage;
      try {
        created = await createMutation.mutateAsync({ ...editableInput, sequenceNo: firstSequenceNo });
      } catch (error) {
        if (sequenceWasEdited || !isAutomaticSequenceConflict(error)) throw error;
        const refreshed = await stagesQuery.refetch();
        created = await createMutation.mutateAsync({
          ...editableInput,
          sequenceNo: nextStageSequenceNo(refreshed.data?.items ?? stages)
        });
      }
      setEditingStageId(null);
      setStageDialogOpen(false);
      stageForm.reset({ code: '', name: '', sequenceNo: created.sequenceNo + 1, weightPercent: '', costPlusPercent: '', plannedStartDate: '', plannedEndDate: '' });
      return;
    }

    setEditingStageId(null);
    setStageDialogOpen(false);
    stageForm.reset({ code: '', name: '', sequenceNo: automaticSequenceNo, weightPercent: '', costPlusPercent: '', plannedStartDate: '', plannedEndDate: '' });
  }

  /** Open the Stage create dialog with a fresh automatically suggested sequence number. */
  function handleAddStage(): void {
    setEditingStageId(null);
    createMutation.reset();
    updateMutation.reset();
    stageForm.reset({ code: '', name: '', sequenceNo: automaticSequenceNo, weightPercent: '', costPlusPercent: '', plannedStartDate: '', plannedEndDate: '' });
    setStageDialogOpen(true);
  }

  /** Load one draft Stage into the shared planning form for a simple edit flow. */
  function handleEditStage(stage: ProjectStage): void {
    createMutation.reset();
    updateMutation.reset();
    setEditingStageId(stage.id);
    stageForm.reset({
      code: stage.code,
      name: stage.name,
      sequenceNo: stage.sequenceNo,
      weightPercent: stage.weightPercent,
      costPlusPercent: stage.costPlusPercent ?? '',
      plannedStartDate: stage.plannedStartDate ?? '',
      plannedEndDate: stage.plannedEndDate ?? ''
    });
    setStageDialogOpen(true);
  }

  /** Cancel a draft Stage edit without changing persisted Stage data. */
  function handleCancelStageEdit(): void {
    setEditingStageId(null);
    setStageDialogOpen(false);
    createMutation.reset();
    updateMutation.reset();
    stageForm.reset({ code: '', name: '', sequenceNo: automaticSequenceNo, weightPercent: '', costPlusPercent: '', plannedStartDate: '', plannedEndDate: '' });
  }

  /** Open the progress editor with a clean form for one new submitted update. */
  function handleAddProgress(): void {
    setEditingProgress(null);
    progressMutation.reset();
    updateProgressMutation.reset();
    progressForm.reset({ stageId: '', progressPercent: '', progressDate: '', note: '', evidenceDocumentId: '' });
    setProgressDialogOpen(true);
  }

  /** Open one progress row for an in-place submitted edit or an approved correction. */
  function handleEditProgress(stageId: string, update: StageProgressUpdate): void {
    progressMutation.reset();
    updateProgressMutation.reset();
    setEditingProgress({ stageId, update });
    progressForm.reset({
      stageId,
      progressPercent: update.progressPercent,
      progressDate: update.progressDate ?? '',
      note: update.note ?? '',
      evidenceDocumentId: update.evidenceDocumentId ?? ''
    });
    setProgressDialogOpen(true);
  }

  /** Close the progress editor without changing persisted progress. */
  function handleCloseProgressDialog(): void {
    setEditingProgress(null);
    setProgressDialogOpen(false);
    progressMutation.reset();
    updateProgressMutation.reset();
    progressForm.reset({ stageId: '', progressPercent: '', progressDate: '', note: '', evidenceDocumentId: '' });
  }

  /** Create or edit one submitted physical-progress row from the shared modal form. */
  async function handleSaveProgress(values: ProgressFormValues): Promise<void> {
    const input = {
      progressPercent: values.progressPercent,
      progressDate: values.progressDate,
      note: values.note === '' ? null : values.note,
      ...(canReadDocuments ? { evidenceDocumentId: values.evidenceDocumentId === '' ? null : values.evidenceDocumentId } : {})
    };
    if (editingProgress?.update.status === 'SUBMITTED') {
      await updateProgressMutation.mutateAsync({
        stageId: editingProgress.stageId,
        updateId: editingProgress.update.id,
        input
      });
    } else {
      await progressMutation.mutateAsync(input);
    }
    handleCloseProgressDialog();
  }

  /** Approve one submitted progress row directly from the history list. */
  async function handleApproveProgress(stageId: string, updateId: string): Promise<void> {
    await approvalMutation.mutateAsync({ stageId, updateId });
  }

  const documents = documentsQuery.data?.items ?? [];
  const documentLabels = new Map(documents.map((document) => [document.id, document.documentNo ? `${document.documentNo} · ${document.title}` : document.title]));
  const weightTotal = stages.reduce((sum, stage) => sum + Number(stage.weightPercent), 0);
  const baseline = stagesQuery.data?.baseline ?? null;
  const canFreezeNow = stages.length > 0 && Math.abs(weightTotal - 100) < 0.00001;
  const progressUpdates = stages.flatMap((stage) => (stage.progressUpdates ?? []).map((update) => ({ stage, update })));
  const editingProgressStage = editingProgress ? stages.find((stage) => stage.id === editingProgress.stageId) ?? null : null;

  return (
    <div className="admin-stack project-stages-workspace">
      <section className="admin-card project-stages-baseline-card">
        <div className="client-page-heading project-stages-heading">
          <div>
            <p className="eyebrow">Stage baseline</p>
            <h2>{props.projectCode} · {props.projectName}</h2>
            <p className="muted">Plan the Project into weighted Stages, freeze the 100% baseline, then track approved physical progress independently from cost, billing and receipts.</p>
          </div>
          {props.canManage && !baseline ? (
            <button type="button" className="client-primary-action" aria-haspopup="dialog" onClick={handleAddStage}>
              <span aria-hidden="true">+</span> Add stage
            </button>
          ) : props.canRecordProgress && baseline ? (
            <button type="button" className="client-primary-action" aria-haspopup="dialog" onClick={handleAddProgress}>
              <span aria-hidden="true">+</span> Add progress
            </button>
          ) : null}
        </div>

        {stagesQuery.isPending && <div className="project-stage-loading">Loading Project Stages…</div>}
        {errorMessage(stagesQuery.error) && <div className="form-error" role="alert">{errorMessage(stagesQuery.error)}</div>}

        {stagesQuery.data && (
          <>
            {!baseline && props.canFreeze ? (
              <div className="project-stage-freeze-row">
                <div>
                  <strong>{canFreezeNow ? 'Baseline is ready to freeze' : 'Complete the Stage weights before freezing'}</strong>
                  <span>{canFreezeNow ? 'Freezing locks Stage planning and activates physical-progress tracking.' : `Current total is ${formatPercent(weightTotal.toFixed(4), 4)}. The server requires exactly 100.0000%.`}</span>
                </div>
                <button type="button" onClick={() => void freezeMutation.mutateAsync()} disabled={freezeMutation.isPending || !canFreezeNow}>
                  {freezeMutation.isPending ? 'Freezing…' : 'Freeze baseline'}
                </button>
              </div>
            ) : null}

            <div className="project-stage-table-wrap">
              <table className="project-stage-table">
                <thead>
                  <tr><th>Stage</th><th>Weight / Markup</th><th>Physical progress</th><th>Financial position</th><th>Schedule</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {stages.map((stage) => (
                    <StageRow
                      key={stage.id}
                      stage={stage}
                      fallbackPercent={props.projectModel === 'COST_PLUS_PERCENTAGE' ? props.projectCostPlusPercent : null}
                      currency={props.projectCurrency}
                      canEdit={props.canManage && !baseline && stage.status === 'DRAFT'}
                      onEdit={handleEditStage}
                    />
                  ))}
                  {stages.length === 0 && <tr><td colSpan={7} className="muted project-stage-empty">No Stage has been created yet. Add the first Stage to start the Project baseline.</td></tr>}
                </tbody>
              </table>
            </div>

            {progressUpdates.length > 0 && (
              <section className="project-stage-history-section" aria-labelledby="project-stage-history-title">
                <div className="project-section-heading">
                  <div>
                    <p className="eyebrow">History</p>
                    <h3 id="project-stage-history-title">Progress timeline</h3>
                  </div>
                  <span className="project-record-count">{progressUpdates.length} update{progressUpdates.length === 1 ? '' : 's'}</span>
                </div>
                <div className="table-scroll project-stage-history-table">
                  <table>
                    <thead><tr><th>Stage</th><th>Date</th><th>Physical</th><th>Status</th><th>Note / evidence</th><th>Recorded / approved</th><th>Action</th></tr></thead>
                    <tbody>
                      {progressUpdates.map(({ stage, update }) => (
                        <tr key={update.id}>
                          <td><strong>{stage.code}</strong><br /><small>{stage.name}</small></td>
                          <td>{formatDate(update.progressDate)}</td>
                          <td><strong>{formatPercent(update.progressPercent)}</strong></td>
                          <td><span className={statusClass(update.status)}>{update.status}</span></td>
                          <td>{update.note ?? 'No note recorded.'}{update.evidenceDocumentId && <><br /><small>Evidence: {documentLabels.get(update.evidenceDocumentId) ?? 'Attached document'}</small></>}</td>
                          <td>Recorded {new Date(update.createdAt).toLocaleString()}{update.approvedAt && <><br /><small>Approved {new Date(update.approvedAt).toLocaleString()}</small></>}</td>
                          <td>
                            {(props.canRecordProgress || (props.canApproveProgress && update.status === 'SUBMITTED')) ? (
                              <div className="client-row-actions">
                                {props.canRecordProgress && <button type="button" className="secondary-button client-edit-button" onClick={() => handleEditProgress(stage.id, update)}>Edit</button>}
                                {props.canApproveProgress && update.status === 'SUBMITTED' && <button type="button" className="secondary-button client-edit-button" onClick={() => void handleApproveProgress(stage.id, update.id)} disabled={approvalMutation.isPending}>Approve</button>}
                              </div>
                            ) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {errorMessage(approvalMutation.error) && <div className="form-error" role="alert">{errorMessage(approvalMutation.error)}</div>}
              </section>
            )}
          </>
        )}
        {errorMessage(freezeMutation.error) && <div className="form-error" role="alert">{errorMessage(freezeMutation.error)}</div>}
      </section>

      {stageDialogOpen && props.canManage && !baseline && (
        <div className="client-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) handleCancelStageEdit(); }}>
          <section className="client-modal client-modal-wide" role="dialog" aria-modal="true" aria-labelledby="stage-editor-title">
            <header className="client-modal-header">
              <div>
                <p className="eyebrow">Project stage</p>
                <h2 id="stage-editor-title">{editingStageId ? 'Edit Stage' : 'Add Stage'}</h2>
              </div>
              <button type="button" className="client-modal-close" aria-label="Close Stage editor" onClick={handleCancelStageEdit}><span aria-hidden="true">×</span></button>
            </header>
            <div className="client-modal-body">
              <form onSubmit={stageForm.handleSubmit((values) => void handleSaveStage(values))}>
                <div className="client-form-grid">
                  <label>Code<input {...stageForm.register('code')} /></label>
                  <label>Name<input {...stageForm.register('name')} /></label>
                  <label>Sequence<input type="number" min="1" {...stageForm.register('sequenceNo')} /></label>
                  <label>Weight %<input inputMode="decimal" {...stageForm.register('weightPercent')} /></label>
                  {props.projectModel === 'COST_PLUS_PERCENTAGE' ? (
                    <label>Profit / Markup % (optional)<input inputMode="decimal" {...stageForm.register('costPlusPercent')} /><small className="muted">Blank uses Project {props.projectCostPlusPercent ?? 'configured'}%.</small></label>
                  ) : null}
                  <label>Planned start<input type="date" {...stageForm.register('plannedStartDate')} /></label>
                  <label>Planned end<input type="date" {...stageForm.register('plannedEndDate')} /></label>
                </div>
                {formErrorMessages(stageForm.formState.errors as Record<string, unknown>).map((message, index) => <div key={index} className="form-error">{message}</div>)}
                {errorMessage(createMutation.error ?? updateMutation.error) && <div className="form-error" role="alert">{errorMessage(createMutation.error ?? updateMutation.error)}</div>}
                <div className="client-modal-actions">
                  <button type="button" className="secondary-button" onClick={handleCancelStageEdit}>Cancel</button>
                  <button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{createMutation.isPending || updateMutation.isPending ? 'Saving…' : editingStageId ? 'Update Stage' : 'Add Stage'}</button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}

      {progressDialogOpen && props.canRecordProgress && baseline && (
        <div className="client-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) handleCloseProgressDialog(); }}>
          <section className="client-modal client-modal-wide" role="dialog" aria-modal="true" aria-labelledby="progress-editor-title">
            <header className="client-modal-header">
              <div>
                <p className="eyebrow">Physical progress</p>
                <h2 id="progress-editor-title">{editingProgress?.update.status === 'APPROVED' ? 'Correct progress' : editingProgress ? 'Edit progress' : 'Add progress'}</h2>
              </div>
              <button type="button" className="client-modal-close" aria-label="Close progress editor" onClick={handleCloseProgressDialog}><span aria-hidden="true">×</span></button>
            </header>
            <div className="client-modal-body">
              <form className="client-modal-form" onSubmit={progressForm.handleSubmit((values) => void handleSaveProgress(values))}>
                <div className="client-form-grid">
                  <label>Stage
                    {editingProgress ? (
                      <>
                        <input value={editingProgressStage ? `${editingProgressStage.sequenceNo}. ${editingProgressStage.code} · ${editingProgressStage.name}` : 'Selected Stage'} disabled />
                        <input type="hidden" {...progressForm.register('stageId')} />
                      </>
                    ) : (
                      <select {...progressForm.register('stageId')}>
                        <option value="">Select Stage</option>
                        {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.sequenceNo}. {stage.code} · {stage.name}</option>)}
                      </select>
                    )}
                  </label>
                  <label>Physical progress %<input inputMode="decimal" {...progressForm.register('progressPercent')} /></label>
                  <label>Progress date<input type="date" {...progressForm.register('progressDate')} /></label>
                  <label>Evidence document (optional)
                    <select {...progressForm.register('evidenceDocumentId')} disabled={!canReadDocuments}>
                      <option value="">{canReadDocuments ? 'No evidence document' : 'Document read permission required'}</option>
                      {documents.map((document) => <option key={document.id} value={document.id}>{document.documentNo ? `${document.documentNo} · ${document.title}` : document.title}</option>)}
                    </select>
                  </label>
                  <label className="client-form-wide">Note / correction reason<textarea rows={4} {...progressForm.register('note')} /></label>
                </div>
                {editingProgress?.update.status === 'APPROVED' ? <p className="muted">Approved progress remains in the audit history. Saving creates a new submitted correction for approval.</p> : editingProgress ? <p className="muted">Submitted progress can be corrected here until it is approved.</p> : null}
                {formErrorMessages(progressForm.formState.errors as Record<string, unknown>).map((message, index) => <div key={index} className="form-error">{message}</div>)}
                {errorMessage(progressMutation.error ?? updateProgressMutation.error) && <div className="form-error" role="alert">{errorMessage(progressMutation.error ?? updateProgressMutation.error)}</div>}
                {errorMessage(documentsQuery.error) && <div className="form-error" role="alert">{errorMessage(documentsQuery.error)}</div>}
                <div className="client-modal-actions">
                  <button type="button" className="secondary-button" onClick={handleCloseProgressDialog}>Cancel</button>
                  <button type="submit" disabled={progressMutation.isPending || updateProgressMutation.isPending || progressStageId === ''}>
                    {progressMutation.isPending || updateProgressMutation.isPending ? 'Saving…' : editingProgress?.update.status === 'APPROVED' ? 'Submit correction' : editingProgress ? 'Update progress' : 'Add progress'}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
