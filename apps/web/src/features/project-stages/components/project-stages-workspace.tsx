import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
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
  useUpdateProjectStage
} from '../hooks/project-stages.js';
import type { ProjectStage, StageProgressUpdate } from '../api/project-stages-api.js';

const stageFormSchema = z.object({
  code: z.string().trim().min(1, 'Stage code is required.').max(100),
  name: z.string().trim().min(1, 'Stage name is required.').max(300),
  sequenceNo: z.coerce.number().int().min(1),
  weightPercent: z.string().regex(/^(?:0|[1-9]\d{0,2}|100)(?:\.\d{1,4})?$/, 'Use 0-100 with up to 4 decimals.'),
  plannedStartDate: z.string(),
  plannedEndDate: z.string()
}).refine((value) => value.plannedStartDate === '' || value.plannedEndDate === '' || value.plannedEndDate >= value.plannedStartDate, {
  path: ['plannedEndDate'],
  message: 'Planned end date cannot precede planned start date.'
});

const progressFormSchema = z.object({
  stageId: z.string().uuid('Select a Stage.'),
  progressPercent: z.string().regex(/^(?:0|[1-9]\d{0,2}|100)(?:\.\d{1,4})?$/, 'Use 0-100 with up to 4 decimals.'),
  progressDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
  note: z.string().trim().max(5000),
  evidenceDocumentId: z.union([z.literal(''), z.string().uuid('Use a valid Document UUID.')])
});

type StageFormValues = z.infer<typeof stageFormSchema>;
type ProgressFormValues = z.infer<typeof progressFormSchema>;

export type ProjectStagesWorkspaceProps = Readonly<{
  projectId: string;
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

/** Render one Stage row without confusing physical progress with weight or money. */
function StageRow({ stage, canEdit, onEdit }: Readonly<{
  stage: ProjectStage;
  canEdit: boolean;
  onEdit: (stage: ProjectStage) => void;
}>) {
  return (
    <tr>
      <td>{stage.sequenceNo}</td>
      <td><strong>{stage.code}</strong><br />{stage.name}</td>
      <td>{stage.weightPercent}%</td>
      <td>{stage.approvedPhysicalProgressPercent ?? '0.0000'}%</td>
      <td>{stage.plannedAmount ?? '—'}</td>
      <td>{stage.financials?.actualCost ?? 'Restricted'}</td>
      <td>{stage.financials?.billedAmount ?? 'Restricted'}</td>
      <td>{stage.financials?.receivedAmount ?? 'Restricted'}</td>
      <td>{stage.financials?.outstandingAmount ?? 'Restricted'}</td>
      <td>{stage.status}</td>
      <td>{canEdit ? <button type="button" onClick={() => onEdit(stage)}>Edit</button> : '—'}</td>
    </tr>
  );
}

/** Render the minimal Stage setup, baseline and progress workspace required by Module 7. */
export function ProjectStagesWorkspace(props: ProjectStagesWorkspaceProps) {
  const stagesQuery = useProjectStages(props.projectId);
  const canReadDocuments = usePermission('documents.read');
  const documentsQuery = useDocuments({ projectId: props.projectId, status: 'active', page: 1, pageSize: 100 }, canReadDocuments && props.canRecordProgress);
  const createMutation = useCreateProjectStage(props.projectId);
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const updateMutation = useUpdateProjectStage(props.projectId, editingStageId ?? '');
  const freezeMutation = useFreezeProjectStageBaseline(props.projectId);
  const [submittedUpdate, setSubmittedUpdate] = useState<StageProgressUpdate | null>(null);

  const stageForm = useForm<StageFormValues>({
    resolver: zodResolver(stageFormSchema),
    defaultValues: { code: '', name: '', sequenceNo: 1, weightPercent: '', plannedStartDate: '', plannedEndDate: '' }
  });
  const progressForm = useForm<ProgressFormValues>({
    resolver: zodResolver(progressFormSchema),
    defaultValues: { stageId: '', progressPercent: '', progressDate: '', note: '', evidenceDocumentId: '' }
  });

  const progressStageId = progressForm.watch('stageId');
  const progressMutation = useRecordStageProgress(props.projectId, progressStageId);
  const approvalMutation = useApproveStageProgress(props.projectId, progressStageId);

  /** Create or update one draft Stage using only editable planning fields. */
  async function handleSaveStage(values: StageFormValues): Promise<void> {
    const input = {
      code: values.code,
      name: values.name,
      sequenceNo: values.sequenceNo,
      weightPercent: values.weightPercent,
      plannedStartDate: values.plannedStartDate === '' ? null : values.plannedStartDate,
      plannedEndDate: values.plannedEndDate === '' ? null : values.plannedEndDate
    };

    if (editingStageId) {
      await updateMutation.mutateAsync(input);
    } else {
      await createMutation.mutateAsync(input);
    }

    setEditingStageId(null);
    stageForm.reset({ code: '', name: '', sequenceNo: values.sequenceNo + 1, weightPercent: '', plannedStartDate: '', plannedEndDate: '' });
  }

  /** Load one draft Stage into the shared planning form for a simple edit flow. */
  function handleEditStage(stage: ProjectStage): void {
    setEditingStageId(stage.id);
    stageForm.reset({
      code: stage.code,
      name: stage.name,
      sequenceNo: stage.sequenceNo,
      weightPercent: stage.weightPercent,
      plannedStartDate: stage.plannedStartDate ?? '',
      plannedEndDate: stage.plannedEndDate ?? ''
    });
  }

  /** Cancel a draft Stage edit without changing persisted Stage data. */
  function handleCancelStageEdit(): void {
    setEditingStageId(null);
    stageForm.reset({ code: '', name: '', sequenceNo: stages.length + 1, weightPercent: '', plannedStartDate: '', plannedEndDate: '' });
  }

  /** Submit one physical-progress update and preserve its id for immediate approval when allowed. */
  async function handleRecordProgress(values: ProgressFormValues): Promise<void> {
    const update = await progressMutation.mutateAsync({
      progressPercent: values.progressPercent,
      progressDate: values.progressDate,
      ...(values.note === '' ? {} : { note: values.note }),
      ...(values.evidenceDocumentId === '' ? {} : { evidenceDocumentId: values.evidenceDocumentId })
    });
    setSubmittedUpdate(update);
  }

  /** Approve the most recently submitted progress row returned by the server. */
  async function handleApproveLatest(): Promise<void> {
    if (!submittedUpdate) return;
    const approved = await approvalMutation.mutateAsync(submittedUpdate.id);
    setSubmittedUpdate(approved);
  }

  const stages = stagesQuery.data?.items ?? [];
  const documents = documentsQuery.data?.items ?? [];
  const documentLabels = new Map(documents.map((document) => [document.id, document.documentNo ? `${document.documentNo} · ${document.title}` : document.title]));
  const weightTotal = stages.reduce((sum, stage) => sum + Number(stage.weightPercent), 0);

  return (
    <div className="admin-stack">
      <section className="admin-card">
        <div className="section-heading">
          <h2>Stage baseline</h2>
          <p className="muted">Weight, physical progress, cost, billing and receipts stay separate. Freeze is allowed only when the Stage weights total exactly 100.0000%.</p>
        </div>
        {stagesQuery.isPending && <p>Loading Project Stages…</p>}
        {errorMessage(stagesQuery.error) && <div className="form-error" role="alert">{errorMessage(stagesQuery.error)}</div>}
        {stagesQuery.data && (
          <>
            <p><strong>Overall physical progress:</strong> {stagesQuery.data.overallPhysicalProgressPercent}%</p>
            <p><strong>Weight total:</strong> {weightTotal.toFixed(4)}% · <strong>Baseline:</strong> {stagesQuery.data.baseline?.status ?? 'Not frozen'}</p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>#</th><th>Stage</th><th>Weight</th><th>Physical</th><th>Planned value</th><th>Actual cost</th><th>Billed</th><th>Received</th><th>Outstanding</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {stages.map((stage) => <StageRow key={stage.id} stage={stage} canEdit={props.canManage && !stagesQuery.data?.baseline && stage.status === 'DRAFT'} onEdit={handleEditStage} />)}
                  {stages.length === 0 && <tr><td colSpan={11} className="muted">No Stage has been created yet.</td></tr>}
                </tbody>
              </table>
            </div>
            {stages.some((stage) => (stage.progressUpdates?.length ?? 0) > 0) && (
              <div className="table-scroll">
                <h3>Progress timeline</h3>
                <table>
                  <thead><tr><th>Stage</th><th>Date</th><th>Physical</th><th>Status</th><th>Note</th><th>Evidence</th></tr></thead>
                  <tbody>
                    {stages.flatMap((stage) => (stage.progressUpdates ?? []).map((update) => (
                      <tr key={update.id}>
                        <td>{stage.name}</td>
                        <td>{update.progressDate ?? '—'}</td>
                        <td>{update.progressPercent}%</td>
                        <td>{update.status}</td>
                        <td>{update.note ?? '—'}</td>
                        <td>{update.evidenceDocumentId ? (documentLabels.get(update.evidenceDocumentId) ?? 'Evidence linked') : 'None'}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {props.canFreeze && !stagesQuery.data?.baseline && (
          <button type="button" onClick={() => void freezeMutation.mutateAsync()} disabled={freezeMutation.isPending || stages.length === 0}>
            {freezeMutation.isPending ? 'Freezing…' : 'Freeze 100% baseline'}
          </button>
        )}
        {errorMessage(freezeMutation.error) && <div className="form-error" role="alert">{errorMessage(freezeMutation.error)}</div>}
      </section>

      {props.canManage && !stagesQuery.data?.baseline && (
        <section className="admin-card">
          <h2>{editingStageId ? 'Edit Stage' : 'Add Stage'}</h2>
          <form onSubmit={stageForm.handleSubmit((values) => void handleSaveStage(values))}>
            <div className="form-grid">
              <label>Code<input {...stageForm.register('code')} /></label>
              <label>Name<input {...stageForm.register('name')} /></label>
              <label>Sequence<input type="number" min="1" {...stageForm.register('sequenceNo')} /></label>
              <label>Weight %<input inputMode="decimal" {...stageForm.register('weightPercent')} /></label>
              <label>Planned start<input type="date" {...stageForm.register('plannedStartDate')} /></label>
              <label>Planned end<input type="date" {...stageForm.register('plannedEndDate')} /></label>
            </div>
            {formErrorMessages(stageForm.formState.errors as Record<string, unknown>).map((message, index) => <div key={index} className="form-error">{message}</div>)}
            {errorMessage(createMutation.error ?? updateMutation.error) && <div className="form-error" role="alert">{errorMessage(createMutation.error ?? updateMutation.error)}</div>}
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{createMutation.isPending || updateMutation.isPending ? 'Saving…' : editingStageId ? 'Update Stage' : 'Add Stage'}</button>
            {editingStageId && <button type="button" onClick={handleCancelStageEdit}>Cancel edit</button>}
          </form>
        </section>
      )}

      {props.canRecordProgress && stagesQuery.data?.baseline && (
        <section className="admin-card">
          <h2>Record physical progress</h2>
          <form onSubmit={progressForm.handleSubmit((values) => void handleRecordProgress(values))}>
            <div className="form-grid">
              <label>Stage
                <select {...progressForm.register('stageId')}>
                  <option value="">Select Stage</option>
                  {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.sequenceNo}. {stage.name}</option>)}
                </select>
              </label>
              <label>Physical progress %<input inputMode="decimal" {...progressForm.register('progressPercent')} /></label>
              <label>Progress date<input type="date" {...progressForm.register('progressDate')} /></label>
              <label>Evidence document (optional)
                <select {...progressForm.register('evidenceDocumentId')} disabled={!canReadDocuments}>
                  <option value="">{canReadDocuments ? 'No evidence document' : 'Document read permission required'}</option>
                  {documents.map((document) => <option key={document.id} value={document.id}>{document.documentNo ? `${document.documentNo} · ${document.title}` : document.title}</option>)}
                </select>
              </label>
              <label>Note / correction reason<textarea {...progressForm.register('note')} /></label>
            </div>
            {formErrorMessages(progressForm.formState.errors as Record<string, unknown>).map((message, index) => <div key={index} className="form-error">{message}</div>)}
            {errorMessage(progressMutation.error) && <div className="form-error" role="alert">{errorMessage(progressMutation.error)}</div>}
            <button type="submit" disabled={progressMutation.isPending || progressStageId === ''}>{progressMutation.isPending ? 'Recording…' : 'Record progress'}</button>
          </form>
          {submittedUpdate && (
            <div>
              <p className="form-success">Progress {submittedUpdate.progressPercent}% is {submittedUpdate.status.toLowerCase()}.</p>
              {props.canApproveProgress && submittedUpdate.status === 'SUBMITTED' && (
                <button type="button" onClick={() => void handleApproveLatest()} disabled={approvalMutation.isPending}>
                  {approvalMutation.isPending ? 'Approving…' : 'Approve this progress'}
                </button>
              )}
            </div>
          )}
          {errorMessage(documentsQuery.error) && <div className="form-error" role="alert">{errorMessage(documentsQuery.error)}</div>}
          {errorMessage(approvalMutation.error) && <div className="form-error" role="alert">{errorMessage(approvalMutation.error)}</div>}
        </section>
      )}
    </div>
  );
}
