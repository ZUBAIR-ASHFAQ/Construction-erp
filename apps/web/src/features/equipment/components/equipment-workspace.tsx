import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useProjects } from '../../projects/hooks/projects.js';
import type { Equipment, EquipmentAssignment } from '../api/equipment-api.js';
import {
  useAssignEquipment,
  useCreateEquipment,
  useEquipment,
  useEquipmentHistory,
  useEndEquipmentAssignment,
  useReverseEquipmentAssignment,
  useUpdateEquipment
} from '../hooks/equipment.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm.');
const decimalSchema = z.string().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/, 'Use a non-negative number with up to 4 decimals.');
const equipmentSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(300),
  equipmentType: z.string().trim().max(120),
  ownershipType: z.enum(['OWNED', 'RENTED']),
  rateUnit: z.enum(['HOUR', 'DAY', 'MONTH']),
  defaultRate: decimalSchema
});

const assignmentSchema = z.object({
  projectId: z.string().uuid('Select a Project.'),
  stageId: z.string(),
  quantity: decimalSchema.refine((value) => value !== '0' && !/^0\.0+$/.test(value), 'Quantity must be greater than zero.'),
  fromDate: dateSchema,
  fromTime: z.union([z.literal(''), timeSchema]),
  toDate: z.union([z.literal(''), dateSchema]),
  toTime: z.union([z.literal(''), timeSchema])
}).refine((value) => value.toDate === '' || value.toDate >= value.fromDate, {
  path: ['toDate'],
  message: 'End date must be on or after the start date.'
});

type EquipmentValues = z.infer<typeof equipmentSchema>;
type AssignmentValues = z.infer<typeof assignmentSchema>;

export type EquipmentWorkspaceProps = Readonly<{
  canRead: boolean;
  canManage: boolean;
  canAssign: boolean;
  canRecordUsage: boolean;
}>;

/** Return one readable request error without exposing backend internals. */
function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

/** Return the user's current local date and minute for a ready-to-submit assignment. */
function localAssignmentStart(): Readonly<{ date: string; time: string }> {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return { date: new Date(now.getTime() - offset).toISOString().slice(0, 10), time: now.toTimeString().slice(0, 5) };
}

/** Preview the inclusive date-unit estimate stored by the server. */
function assignmentEstimate(equipment: Equipment, quantityText: string, fromDate: string, fromTime: string, toDate: string, toTime: string): string | null {
  const quantity = Number(quantityText);
  const rate = Number(equipment.defaultRate);
  if (!Number.isFinite(quantity) || !Number.isFinite(rate) || quantity <= 0 || !equipment.rateUnit) return null;
  let periods = 1;
  if (fromDate && toDate) {
    const days = Math.floor((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000) + 1;
    if (days < 1) return null;
    if (equipment.rateUnit === 'HOUR') {
      if (!fromTime || !toTime) return null;
      const elapsedMinutes = (days - 1) * 1440 + Number(toTime.slice(0, 2)) * 60 + Number(toTime.slice(3)) - Number(fromTime.slice(0, 2)) * 60 - Number(fromTime.slice(3));
      if (elapsedMinutes <= 0) return null;
      periods = elapsedMinutes / 60;
    } else periods = equipment.rateUnit === 'MONTH' ? Math.ceil(days / 30) : days;
  }
  return (quantity * periods * rate).toFixed(2);
}

/** Calculate the completion preview from the assignment's captured rate. */
function completionEstimate(assignment: EquipmentAssignment, endDate: string, endTime: string): string | null {
  return assignmentEstimate({ defaultRate: assignment.rate, rateUnit: assignment.rateUnit } as Equipment, assignment.quantity, assignment.fromDate, assignment.fromTime, endDate, endTime);
}

/** Return exact elapsed minutes for an hourly assignment completion preview. */
function completionMinutes(assignment: EquipmentAssignment, endDate: string, endTime: string): number | null {
  if (assignment.rateUnit !== 'HOUR' || !endDate || !endTime) return null;
  const start = Date.parse(`${assignment.fromDate}T${assignment.fromTime}:00`);
  const end = Date.parse(`${endDate}T${endTime}:00`);
  const minutes = Math.round((end - start) / 60_000);
  return minutes > 0 ? minutes : null;
}

/** Render one Equipment identity consistently across the workspace. */
function EquipmentIdentity({ equipment }: Readonly<{ equipment: Equipment }>) {
  return (
    <span>
      <strong>{equipment.code}</strong><br />
      {equipment.name}<br />
      <small className="muted">{equipment.equipmentType} · {equipment.ownershipType} · {equipment.status}</small>
    </span>
  );
}

/** Render the permission-scoped Equipment register and selection control. */
function EquipmentRegister(props: Readonly<{
  canRead: boolean;
  canManage: boolean;
  canAssign: boolean;
  canComplete: boolean;
  onLedger: (equipment: Equipment) => void;
  onEdit: (equipment: Equipment) => void;
  onAssign: (equipment: Equipment) => void;
  onComplete: (equipment: Equipment) => void;
}>) {
  const [page, setPage] = useState(1);
  const query = useEquipment({ page, pageSize: 25 }, props.canRead);
  const pageCount = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.pageSize)) : 1;

  return (
    <section className="admin-card">
      <h2>Equipment register</h2>
      {!props.canRead && <p className="muted"><code>equipment.read</code> permission is required.</p>}
      {props.canRead && query.isPending && <p>Loading Equipment…</p>}
      {errorMessage(query.error) && <div className="form-error" role="alert">{errorMessage(query.error)}</div>}
      {query.data && (
        <>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Equipment</th><th>Type</th><th>Ownership</th><th>Default rate</th><th>Status</th><th>Project / Stage</th><th>Actions</th></tr></thead>
              <tbody>
                {query.data.items.map((equipment) => (
                  <tr key={equipment.id}>
                    <td><EquipmentIdentity equipment={equipment} /></td>
                    <td>{equipment.equipmentType}</td>
                    <td>{equipment.ownershipType === 'RENTED' ? 'Rented' : 'Owned'}</td>
                    <td>{equipment.defaultRate ? `${equipment.defaultRate} / ${(equipment.rateUnit ?? 'unit').toLowerCase()}` : 'Not configured'}</td>
                    <td><span className={`equipment-status ${equipment.status === 'ACTIVE' ? 'is-active' : ''}`}>{equipment.status === 'ACTIVE' ? 'Active' : equipment.status}</span></td>
                    <td>{equipment.assignmentStatus === 'ASSIGNED' ? <><strong>{equipment.assignedProjectName}</strong><br /><small className="muted">{equipment.assignedStageName ?? 'Project level'} · Assigned</small></> : <span className="equipment-status is-unassigned">Available</span>}</td>
                    <td><div className="equipment-actions">
                      {props.canManage && <button type="button" className="secondary-button" onClick={() => props.onEdit(equipment)}>Edit</button>}
                      {props.canAssign && equipment.assignmentStatus === 'UNASSIGNED' && <button type="button" onClick={() => props.onAssign(equipment)}>Assign To</button>}
                      {props.canComplete && equipment.assignmentStatus === 'ASSIGNED' && <button type="button" onClick={() => props.onComplete(equipment)}>Complete</button>}
                      <button type="button" className="secondary-button" onClick={() => props.onLedger(equipment)}>Ledger</button>
                    </div></td>
                  </tr>
                ))}
                {query.data.items.length === 0 && <tr><td colSpan={7} className="muted">No equipment has been added yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="pagination-row">
            <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
            <span>Page {query.data.page} of {pageCount} · Total {query.data.total} · Page size {query.data.pageSize}</span>
            <button type="button" className="secondary-button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>
        </>
      )}
    </section>
  );
}

/** Render the Final-21 Equipment-master create form. */
function EquipmentEditorModal(props: Readonly<{ equipment: Equipment | null; onClose: () => void }>) {
  const createMutation = useCreateEquipment();
  const updateMutation = useUpdateEquipment(props.equipment?.id ?? 'new');
  const mutation = props.equipment ? updateMutation : createMutation;
  const form = useForm<EquipmentValues>({
    resolver: zodResolver(equipmentSchema),
    defaultValues: { name: props.equipment?.name ?? '', equipmentType: props.equipment?.equipmentType === 'General' ? '' : (props.equipment?.equipmentType ?? ''), ownershipType: props.equipment?.ownershipType === 'RENTED' ? 'RENTED' : 'OWNED', rateUnit: props.equipment?.rateUnit === 'DAY' || props.equipment?.rateUnit === 'MONTH' ? props.equipment.rateUnit : 'HOUR', defaultRate: props.equipment?.defaultRate ?? '0' }
  });

  /** Create one Equipment master using only business-owned fields. */
  async function handleSubmit(values: EquipmentValues): Promise<void> {
    const input = {
      name: values.name.trim(),
      ...(values.equipmentType.trim() ? { equipmentType: values.equipmentType.trim() } : {}),
      ownershipType: values.ownershipType,
      defaultRate: values.defaultRate,
      rateUnit: values.rateUnit
    } as const;
    if (props.equipment) await updateMutation.mutateAsync(input);
    else await createMutation.mutateAsync(input);
    props.onClose();
  }

  return (
    <div className="finance-modal-backdrop" role="presentation"><section className="finance-modal" role="dialog" aria-modal="true" aria-labelledby="equipment-editor-title"><header className="finance-modal-header"><div><p className="eyebrow">Equipment register</p><h2 id="equipment-editor-title">{props.equipment ? 'Edit Equipment' : 'Add Equipment'}</h2><p>The equipment code is generated automatically by the server.</p></div><button type="button" className="finance-modal-close" aria-label="Close equipment editor" onClick={props.onClose}>×</button></header><div className="finance-modal-body">
      <form className="admin-grid two-columns" onSubmit={form.handleSubmit((values) => void handleSubmit(values))}>
        <label>Name<input {...form.register('name')} /></label>
        <label>Equipment type (optional)<input placeholder="Excavator, crane, generator…" {...form.register('equipmentType')} /></label>
        <label>Ownership type<select {...form.register('ownershipType')}><option value="OWNED">Owned</option><option value="RENTED">Rented</option></select></label>
        <label>Rate unit<select {...form.register('rateUnit')}><option value="HOUR">Hour</option><option value="DAY">Day</option><option value="MONTH">Month</option></select></label>
        <label>Default rate<input type="number" min="0" step="0.0001" inputMode="decimal" {...form.register('defaultRate')} /></label>
        {Object.values(form.formState.errors).map((error, index) => error?.message && <div key={index} className="form-error">{String(error.message)}</div>)}
        {errorMessage(mutation.error) && <div className="form-error" role="alert">{errorMessage(mutation.error)}</div>}
        <button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : props.equipment ? 'Save Changes' : 'Create Equipment'}</button>
      </form></div></section></div>
  );
}

/** Render one Project/Stage assignment form for the selected Equipment item. */
function AssignmentForm({ equipment, onClose }: Readonly<{ equipment: Equipment; onClose: () => void }>) {
  const mutation = useAssignEquipment(equipment.id);
  const projects = useProjects({ status: 'ACTIVE', pageSize: 100 }, true);
  const initialStart = localAssignmentStart();
  const form = useForm<AssignmentValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: { projectId: '', stageId: '', quantity: '1', fromDate: initialStart.date, fromTime: equipment.rateUnit === 'HOUR' ? initialStart.time : '', toDate: '', toTime: '' }
  });
  const projectId = form.watch('projectId');
  const quantity = form.watch('quantity');
  const fromDate = form.watch('fromDate');
  const fromTime = form.watch('fromTime');
  const toDate = form.watch('toDate');
  const toTime = form.watch('toTime');
  const estimate = assignmentEstimate(equipment, quantity, fromDate, fromTime, toDate, toTime);
  const stages = useProjectStages(projectId === '' ? null : projectId, projectId !== '');

  useEffect(() => form.setValue('stageId', ''), [form, projectId]);

  /** Create one non-overlapping Project assignment and optional Stage attribution. */
  async function handleSubmit(values: AssignmentValues): Promise<void> {
    if (equipment.rateUnit === 'HOUR' && !values.fromTime) {
      form.setError('fromTime', { message: 'Start time is required for hourly equipment.' });
      return;
    }
    if (equipment.rateUnit === 'HOUR' && values.toDate && !values.toTime) {
      form.setError('toTime', { message: 'To time is required when a planned To date is selected.' });
      return;
    }
    await mutation.mutateAsync({
      projectId: values.projectId,
      ...(values.stageId === '' ? {} : { stageId: values.stageId }),
      quantity: values.quantity,
      fromDate: values.fromDate,
      ...(values.fromTime === '' ? {} : { fromTime: values.fromTime }),
      ...(values.toDate === '' ? {} : { toDate: values.toDate }),
      ...(values.toTime === '' ? {} : { toTime: values.toTime })
    });
    onClose();
  }

  return (
    <div className="finance-modal-backdrop" role="presentation"><section className="finance-modal" role="dialog" aria-modal="true" aria-labelledby="equipment-assign-title"><header className="finance-modal-header"><div><p className="eyebrow">{equipment.code} · {equipment.name}</p><h2 id="equipment-assign-title">Assign to Project / Stage</h2></div><button type="button" className="finance-modal-close" onClick={onClose} aria-label="Close assignment">×</button></header><div className="finance-modal-body"><form className="admin-grid two-columns" onSubmit={form.handleSubmit((values) => void handleSubmit(values))}>
        <label>Project
          <select {...form.register('projectId')}>
            <option value="">Select Project</option>
            {projects.data?.items.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}
          </select>
        </label>
        <label>Stage (optional)
          <select {...form.register('stageId')} disabled={projectId === ''}>
            <option value="">Project-level assignment</option>
            {stages.data?.items.map((stage) => <option key={stage.id} value={stage.id}>{stage.code} · {stage.name}</option>)}
          </select>
        </label>
        <label>Quantity<input type="number" min="0.0001" step="0.0001" {...form.register('quantity')} /></label>
        <label>From date<input type="date" {...form.register('fromDate')} /></label>
        {equipment.rateUnit === 'HOUR' && <label>Start time<input type="time" {...form.register('fromTime')} /></label>}
        <label>To date (optional)<input type="date" {...form.register('toDate')} /></label>
        {equipment.rateUnit === 'HOUR' && <label>To time {toDate ? '' : '(select To date first)'}<input type="time" disabled={!toDate} {...form.register('toTime')} /></label>}
        {form.formState.errors.fromTime?.message && <div className="form-error" role="alert">{form.formState.errors.fromTime.message}</div>}
        {form.formState.errors.toTime?.message && <div className="form-error" role="alert">{form.formState.errors.toTime.message}</div>}
        {equipment.rateUnit === 'HOUR' && equipment.defaultRate && <p className="muted">Hourly rate {equipment.defaultRate} = {(Number(equipment.defaultRate) / 60).toFixed(4)} per minute.</p>}
        <p className="muted">Estimated Equipment Expense: {estimate ?? 'Enter valid assignment details'} · {toDate ? 'selected date range' : `one ${equipment.rateUnit?.toLowerCase() ?? 'rate'} unit until completion`}</p>
        {errorMessage(projects.error) && <div className="form-error">{errorMessage(projects.error)}</div>}
        {errorMessage(stages.error) && <div className="form-error">{errorMessage(stages.error)}</div>}
        {Object.values(form.formState.errors).map((error, index) => error?.message && <div key={index} className="form-error">{String(error.message)}</div>)}
        {errorMessage(mutation.error) && <div className="form-error" role="alert">{errorMessage(mutation.error)}</div>}
        <button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Assigning…' : 'Assign Equipment'}</button>
      </form></div></section></div>
  );
}

/** Complete the active assignment and post its calculated usage cost. */
function CompleteAssignmentModal({ equipment, onClose }: Readonly<{ equipment: Equipment; onClose: () => void }>) {
  const history = useEquipmentHistory(equipment.id, true);
  const mutation = useEndEquipmentAssignment(equipment.id);
  const assignment = history.data?.assignments.find((row) => row.id === equipment.activeAssignmentId && row.status === 'ACTIVE');
  const [completionDate, setCompletionDate] = useState(() => localAssignmentStart().date);
  const [completionTime, setCompletionTime] = useState(() => localAssignmentStart().time);
  const finalAmount = assignment ? completionEstimate(assignment, completionDate, completionTime) : null;
  const elapsedMinutes = assignment ? completionMinutes(assignment, completionDate, completionTime) : null;

  /** End the active assignment using the selected actual completion date. */
  async function complete(): Promise<void> {
    if (!assignment || !completionDate || (assignment.rateUnit === 'HOUR' && !completionTime) || !finalAmount) return;
    if (!window.confirm(`Complete this assignment and finalize Equipment Expense at ${finalAmount}?`)) return;
    await mutation.mutateAsync({ assignmentId: assignment.id, endDate: completionDate, ...(completionTime ? { endTime: completionTime } : {}) });
    onClose();
  }

  return <div className="finance-modal-backdrop" role="presentation"><section className="finance-modal" role="dialog" aria-modal="true" aria-labelledby="equipment-complete-title"><header className="finance-modal-header"><div><p className="eyebrow">{equipment.code} · {equipment.name}</p><h2 id="equipment-complete-title">Complete Assignment</h2></div><button type="button" className="finance-modal-close" onClick={onClose} aria-label="Close completion">×</button></header><div className="finance-modal-body">{history.isPending && <p>Loading assignment…</p>}{assignment && <form className="admin-stack" onSubmit={(event) => { event.preventDefault(); void complete(); }}><p>Quantity: {assignment.quantity} · Rate: {assignment.rate} / {assignment.rateUnit.toLowerCase()}</p>{assignment.rateUnit === 'HOUR' && <p className="muted">Per-minute rate: {(Number(assignment.rate) / 60).toFixed(4)}{elapsedMinutes !== null ? ` · ${elapsedMinutes} minute${elapsedMinutes === 1 ? '' : 's'} (${(elapsedMinutes / 60).toFixed(2)} hours)` : ''}</p>}<p>Equipment Expense posted at assignment: {assignment.estimatedAmount ?? 'Calculated on completion'}</p><label>Completion date<input type="date" min={assignment.fromDate} max={assignment.toDate ?? undefined} value={completionDate} onChange={(event) => setCompletionDate(event.target.value)} /></label>{assignment.rateUnit === 'HOUR' && <label>Completion time<input type="time" value={completionTime} onChange={(event) => setCompletionTime(event.target.value)} /></label>}<div className="equipment-cost-preview"><span>Final Equipment Expense</span><strong>{finalAmount ?? 'Select a time after the assignment start'}</strong></div><p className="muted">Completion posts only the difference between the assignment estimate and final usage, so Project cost is never counted twice.</p><button type="submit" disabled={!finalAmount || mutation.isPending}>{mutation.isPending ? 'Completing…' : 'Complete & Finalize Expense'}</button></form>}{!history.isPending && !assignment && <div className="form-error">No active assignment was found.</div>}{errorMessage(history.error) && <div className="form-error">{errorMessage(history.error)}</div>}{errorMessage(mutation.error) && <div className="form-error">{errorMessage(mutation.error)}</div>}</div></section></div>;
}

/** Confirm one completion/usage-selected Equipment Expense reversal with a dated business reason. */
function ReverseAssignmentModal({ equipment, assignment, onClose }: Readonly<{ equipment: Equipment; assignment: EquipmentAssignment; onClose: () => void }>) {
  const mutation = useReverseEquipmentAssignment(equipment.id);
  const [reversalDate, setReversalDate] = useState(() => localAssignmentStart().date);
  const [reason, setReason] = useState('');

  /** Post one append-only compensating Equipment Expense entry and preserve history. */
  async function reverse(): Promise<void> {
    if (!reversalDate || reason.trim().length < 3) return;
    await mutation.mutateAsync({ assignmentId: assignment.id, reversalDate, reason: reason.trim() });
    onClose();
  }

  return <div className="finance-modal-backdrop" role="presentation"><section className="finance-modal" role="dialog" aria-modal="true" aria-labelledby="equipment-reverse-title"><header className="finance-modal-header"><div><p className="eyebrow">{equipment.code} · {equipment.name}</p><h2 id="equipment-reverse-title">Reverse Equipment Expense</h2><p>This reverses the full posted Equipment Expense for the selected completion / usage assignment. History is retained.</p></div><button type="button" className="finance-modal-close" onClick={onClose} aria-label="Close reversal">×</button></header><div className="finance-modal-body"><form className="admin-stack" onSubmit={(event) => { event.preventDefault(); void reverse(); }}><div className="equipment-cost-preview"><span>Posted completion / usage</span><strong>{assignment.projectName ?? 'Project'} · {assignment.stageName ?? 'Project level'}</strong></div><label>Reversal date<input type="date" min={assignment.fromDate} value={reversalDate} onChange={(event) => setReversalDate(event.target.value)} /></label><label>Reason<textarea rows={3} maxLength={500} placeholder="Why is this Equipment Expense being reversed?" value={reason} onChange={(event) => setReason(event.target.value)} /></label><p className="muted">A compensating expense entry removes this assignment's posted Equipment Expense from Project cost, profitability, reports and billing calculations without deleting ledger history.</p><button type="submit" disabled={reason.trim().length < 3 || mutation.isPending}>{mutation.isPending ? 'Reversing…' : 'Reverse Equipment Expense'}</button></form>{errorMessage(mutation.error) && <div className="form-error">{errorMessage(mutation.error)}</div>}</div></section></div>;
}

/** Display the selected equipment's assignment, cost, and maintenance ledger in one popup. */
function EquipmentLedgerModal({ equipment, canReverse, onReverse, onClose }: Readonly<{
  equipment: Equipment;
  canReverse: boolean;
  onReverse: (assignment: EquipmentAssignment) => void;
  onClose: () => void;
}>) {
  const history = useEquipmentHistory(equipment.id, true);
  const postedTotal = history.data?.costSummary.reduce((total, row) => total + Number(row.amount), 0) ?? 0;
  const assignmentById = new Map(history.data?.assignments.map((row) => [row.id, row] as const) ?? []);
  const reverseActionUsageIds = new Set<string>();
  const handledAssignmentIds = new Set<string>();
  for (const row of history.data?.usage ?? []) {
    const assignment = assignmentById.get(row.assignmentId);
    if (row.status === 'POSTED' && assignment && assignment.status !== 'REVERSED' && !handledAssignmentIds.has(row.assignmentId)) {
      reverseActionUsageIds.add(row.id);
      handledAssignmentIds.add(row.assignmentId);
    }
  }

  return (
    <div className="finance-modal-backdrop" role="presentation">
      <section className="finance-modal finance-modal-wide" role="dialog" aria-modal="true" aria-labelledby="equipment-ledger-title">
        <header className="finance-modal-header">
          <div>
            <p className="eyebrow">{equipment.code} · {equipment.name}</p>
            <h2 id="equipment-ledger-title">Equipment Expense Ledger</h2>
            <p>{equipment.equipmentType} · {equipment.ownershipType === 'RENTED' ? 'Rented' : 'Owned'} · {equipment.defaultRate ?? '0.0000'} / {(equipment.rateUnit ?? 'unit').toLowerCase()}</p>
          </div>
          <button type="button" className="finance-modal-close" onClick={onClose} aria-label="Close equipment ledger">×</button>
        </header>
        <div className="finance-modal-body">
          {history.isPending && <p className="finance-modal-state">Loading equipment expense ledger…</p>}
          {errorMessage(history.error) && <div className="form-error">{errorMessage(history.error)}</div>}
          {history.data && (
            <div className="admin-stack">
              <div className="equipment-ledger-summary">
                <span><small>Assignment status</small><strong>{equipment.assignmentStatus === 'ASSIGNED' ? 'Assigned' : 'Available'}</strong></span>
                <span><small>Posted Equipment Expense</small><strong>{postedTotal.toFixed(2)}</strong></span>
                <span><small>Completion / usage entries</small><strong>{history.data.usage.length}</strong></span>
              </div>
              <h3>Project assignments</h3>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Project / Stage</th><th>Period</th><th>Quantity</th><th>Rate</th><th>Status</th></tr></thead>
                  <tbody>
                    {history.data.assignments.map((row) => (
                      <tr key={row.id}>
                        <td><strong>{row.projectName ?? 'Project'}</strong><br /><small>{row.stageName ?? 'Project level'}</small></td>
                        <td>{row.fromDate} {row.fromTime} → {row.toDate ? `${row.toDate} ${row.toTime ?? ''}` : 'In progress'}</td>
                        <td>{row.quantity}</td>
                        <td>{row.rate} / {row.rateUnit.toLowerCase()}</td>
                        <td>{row.status === 'ACTIVE' ? 'Assigned' : row.status === 'REVERSED' ? 'Reversed' : 'Completed'}</td>
                      </tr>
                    ))}
                    {history.data.assignments.length === 0 && <tr><td colSpan={5} className="muted">No project assignments yet.</td></tr>}
                  </tbody>
                </table>
              </div>
              <h3>Completion / usage detail</h3>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Posting date</th><th>Project / Stage</th><th>Usage</th><th>Rate</th><th>Final amount</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>
                    {history.data.usage.map((row) => {
                      const assignment = assignmentById.get(row.assignmentId);
                      return <tr key={row.id}><td>{row.usageDate}</td><td><strong>{row.projectName ?? 'Project'}</strong><br /><small>{row.stageName ?? 'Project level'}</small></td><td>{row.quantity} hours/units</td><td>{row.rate}</td><td>{row.amount}</td><td>{row.status}</td><td>{canReverse && assignment && reverseActionUsageIds.has(row.id) ? <button type="button" className="secondary-button" onClick={() => onReverse(assignment)}>Reverse</button> : row.status === 'REVERSED' ? <span className="muted">Reversed</span> : '—'}</td></tr>;
                    })}
                    {history.data.usage.length === 0 && <tr><td colSpan={7} className="muted">The assignment estimate is already posted as Equipment Expense; final usage appears here after completion.</td></tr>}
                  </tbody>
                </table>
              </div>
              <h3>Maintenance history</h3>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Date</th><th>Type</th><th>Cost</th><th>Note</th><th>Status</th></tr></thead>
                  <tbody>
                    {history.data.maintenance.map((row) => <tr key={row.id}><td>{row.maintenanceDate}</td><td>{row.type}</td><td>{row.cost}</td><td>{row.note ?? '—'}</td><td>{row.status}</td></tr>)}
                    {history.data.maintenance.length === 0 && <tr><td colSpan={5} className="muted">No maintenance entries.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/** Render the Final-21 Equipment Management feature without legacy fleet subsystems. */
export function EquipmentWorkspace(props: EquipmentWorkspaceProps) {
  const [editor, setEditor] = useState<Equipment | 'create' | null>(null);
  const [assignmentEditor, setAssignmentEditor] = useState<Equipment | null>(null);
  const [completionEditor, setCompletionEditor] = useState<Equipment | null>(null);
  const [reversalEditor, setReversalEditor] = useState<Readonly<{ equipment: Equipment; assignment: EquipmentAssignment }> | null>(null);
  const [ledgerEquipment, setLedgerEquipment] = useState<Equipment | null>(null);

  return (
    <div className="admin-stack">
      <section className="equipment-workflow-bar"><div><strong>Equipment workflow</strong><span>Assign → Complete to finalize Equipment Expense → Reverse from completion / usage detail</span></div>{props.canManage && <button type="button" onClick={() => setEditor('create')}>Add Equipment</button>}</section>
      <EquipmentRegister canRead={props.canRead} canManage={props.canManage} canAssign={props.canAssign} canComplete={props.canAssign && props.canRecordUsage} onLedger={setLedgerEquipment} onEdit={setEditor} onAssign={setAssignmentEditor} onComplete={setCompletionEditor} />
      {editor && <EquipmentEditorModal equipment={editor === 'create' ? null : editor} onClose={() => setEditor(null)} />}
      {assignmentEditor && <AssignmentForm equipment={assignmentEditor} onClose={() => setAssignmentEditor(null)} />}
      {completionEditor && <CompleteAssignmentModal equipment={completionEditor} onClose={() => setCompletionEditor(null)} />}
      {reversalEditor && <ReverseAssignmentModal equipment={reversalEditor.equipment} assignment={reversalEditor.assignment} onClose={() => setReversalEditor(null)} />}
      {ledgerEquipment && (
        <EquipmentLedgerModal
          equipment={ledgerEquipment}
          canReverse={props.canAssign && props.canRecordUsage}
          onReverse={(assignment) => {
            setReversalEditor({ equipment: ledgerEquipment, assignment });
            setLedgerEquipment(null);
          }}
          onClose={() => setLedgerEquipment(null)}
        />
      )}
    </div>
  );
}
