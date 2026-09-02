import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useProjects } from '../../projects/hooks/projects.js';
import type { Equipment, EquipmentAssignment, EquipmentHistory } from '../api/equipment-api.js';
import {
  useAssignEquipment,
  useCreateEquipment,
  useCreateEquipmentMaintenance,
  useEquipment,
  useEquipmentHistory,
  useEndEquipmentAssignment,
  useRecordEquipmentUsage
} from '../hooks/equipment.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
const decimalSchema = z.string().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/, 'Use a non-negative number with up to 4 decimals.');
const moneySchema = z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/, 'Use a non-negative amount with up to 2 decimals.');

const equipmentSchema = z.object({
  code: z.string().trim().min(1, 'Code is required.').max(100),
  name: z.string().trim().min(1, 'Name is required.').max(300),
  equipmentType: z.string().trim().min(1, 'Equipment type is required.').max(120),
  ownershipType: z.string().trim().min(1, 'Ownership type is required.').max(64),
  defaultRate: z.union([z.literal(''), decimalSchema]),
  rateUnit: z.string().trim().max(32)
}).refine((value) => (value.defaultRate === '') === (value.rateUnit === ''), {
  path: ['rateUnit'],
  message: 'Default rate and rate unit must be provided together.'
});

const assignmentSchema = z.object({
  projectId: z.string().uuid('Select a Project.'),
  stageId: z.string(),
  fromDate: dateSchema,
  toDate: z.union([z.literal(''), dateSchema])
}).refine((value) => value.toDate === '' || value.toDate >= value.fromDate, {
  path: ['toDate'],
  message: 'End date must be on or after the start date.'
});

const usageSchema = z.object({
  assignmentId: z.string().uuid('Select an active assignment.'),
  usageDate: dateSchema,
  quantity: decimalSchema,
  rate: z.union([z.literal(''), decimalSchema])
});

const maintenanceSchema = z.object({
  maintenanceDate: dateSchema,
  type: z.string().trim().min(1, 'Maintenance type is required.').max(120),
  cost: moneySchema,
  note: z.string().trim().max(4000)
});

type EquipmentValues = z.infer<typeof equipmentSchema>;
type AssignmentValues = z.infer<typeof assignmentSchema>;
type UsageValues = z.infer<typeof usageSchema>;
type MaintenanceValues = z.infer<typeof maintenanceSchema>;

export type EquipmentWorkspaceProps = Readonly<{
  canRead: boolean;
  canManage: boolean;
  canAssign: boolean;
  canRecordUsage: boolean;
  canMaintain: boolean;
}>;

/** Return one readable request error without exposing backend internals. */
function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

/** Render one Equipment identity consistently across the workspace. */
function EquipmentIdentity({ equipment }: Readonly<{ equipment: Equipment }>) {
  return (
    <span>
      <strong>{equipment.code}</strong><br />
      {equipment.name}<br />
      <small className="muted">ID: {equipment.id}</small><br />
      <small className="muted">{equipment.equipmentType} · {equipment.ownershipType} · {equipment.status}</small>
    </span>
  );
}

/** Render the permission-scoped Equipment register and selection control. */
function EquipmentRegister(props: Readonly<{
  canRead: boolean;
  selectedId: string | null;
  onSelect: (equipmentId: string) => void;
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
              <thead><tr><th>Equipment</th><th>Default rate</th><th>Select</th></tr></thead>
              <tbody>
                {query.data.items.map((equipment) => (
                  <tr key={equipment.id}>
                    <td><EquipmentIdentity equipment={equipment} /></td>
                    <td>{equipment.defaultRate ? `${equipment.defaultRate} / ${equipment.rateUnit ?? 'unit'}` : 'Not configured'}</td>
                    <td>
                      <button type="button" className="secondary-button" aria-pressed={props.selectedId === equipment.id} onClick={() => props.onSelect(equipment.id)}>
                        {props.selectedId === equipment.id ? 'Selected' : 'Select'}
                      </button>
                    </td>
                  </tr>
                ))}
                {query.data.items.length === 0 && <tr><td colSpan={3} className="muted">No Equipment found.</td></tr>}
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
function CreateEquipmentForm() {
  const mutation = useCreateEquipment();
  const form = useForm<EquipmentValues>({
    resolver: zodResolver(equipmentSchema),
    defaultValues: { code: '', name: '', equipmentType: '', ownershipType: '', defaultRate: '', rateUnit: '' }
  });

  /** Create one Equipment master using only business-owned fields. */
  async function handleSubmit(values: EquipmentValues): Promise<void> {
    await mutation.mutateAsync({
      code: values.code.trim(),
      name: values.name.trim(),
      equipmentType: values.equipmentType.trim(),
      ownershipType: values.ownershipType.trim(),
      ...(values.defaultRate === '' ? {} : { defaultRate: values.defaultRate, rateUnit: values.rateUnit.trim() })
    });
    form.reset();
  }

  return (
    <section className="admin-card">
      <h2>Register Equipment</h2>
      <form className="admin-stack" onSubmit={form.handleSubmit((values) => void handleSubmit(values))}>
        <label>Code<input {...form.register('code')} /></label>
        <label>Name<input {...form.register('name')} /></label>
        <label>Equipment type<input placeholder="Excavator, crane, generator…" {...form.register('equipmentType')} /></label>
        <label>Ownership type<input placeholder="Owned or Rented" {...form.register('ownershipType')} /></label>
        <label>Default rate (optional)<input inputMode="decimal" {...form.register('defaultRate')} /></label>
        <label>Rate unit (optional)<input placeholder="hour, day…" {...form.register('rateUnit')} /></label>
        {Object.values(form.formState.errors).map((error, index) => error?.message && <div key={index} className="form-error">{String(error.message)}</div>)}
        {errorMessage(mutation.error) && <div className="form-error" role="alert">{errorMessage(mutation.error)}</div>}
        <button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Creating…' : 'Create Equipment'}</button>
      </form>
    </section>
  );
}

/** Render one Project/Stage assignment form for the selected Equipment item. */
function AssignmentForm({ equipmentId }: Readonly<{ equipmentId: string }>) {
  const mutation = useAssignEquipment(equipmentId);
  const projects = useProjects({ status: 'ACTIVE', pageSize: 100 }, true);
  const form = useForm<AssignmentValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: { projectId: '', stageId: '', fromDate: '', toDate: '' }
  });
  const projectId = form.watch('projectId');
  const stages = useProjectStages(projectId === '' ? null : projectId, projectId !== '');

  useEffect(() => form.setValue('stageId', ''), [form, projectId]);

  /** Create one non-overlapping Project assignment and optional Stage attribution. */
  async function handleSubmit(values: AssignmentValues): Promise<void> {
    await mutation.mutateAsync({
      projectId: values.projectId,
      ...(values.stageId === '' ? {} : { stageId: values.stageId }),
      fromDate: values.fromDate,
      ...(values.toDate === '' ? {} : { toDate: values.toDate })
    });
    form.reset();
  }

  return (
    <section className="admin-card">
      <h2>Assign to Project / Stage</h2>
      <form className="admin-stack" onSubmit={form.handleSubmit((values) => void handleSubmit(values))}>
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
        <label>From date<input type="date" {...form.register('fromDate')} /></label>
        <label>To date (optional)<input type="date" {...form.register('toDate')} /></label>
        {errorMessage(projects.error) && <div className="form-error">{errorMessage(projects.error)}</div>}
        {errorMessage(stages.error) && <div className="form-error">{errorMessage(stages.error)}</div>}
        {Object.values(form.formState.errors).map((error, index) => error?.message && <div key={index} className="form-error">{String(error.message)}</div>)}
        {errorMessage(mutation.error) && <div className="form-error" role="alert">{errorMessage(mutation.error)}</div>}
        <button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Assigning…' : 'Assign Equipment'}</button>
      </form>
    </section>
  );
}

/** Describe one assignment without inventing Project or Stage names not returned by the Equipment API. */
function assignmentLabel(assignment: EquipmentAssignment): string {
  return `${assignment.projectId}${assignment.stageId ? ` / stage ${assignment.stageId}` : ''} · ${assignment.fromDate}${assignment.toDate ? ` to ${assignment.toDate}` : ''}`;
}

/** Render usage entry for a selected active Equipment assignment. */
function UsageForm({ equipmentId, assignments }: Readonly<{ equipmentId: string; assignments: EquipmentAssignment[] }>) {
  const mutation = useRecordEquipmentUsage(equipmentId);
  const form = useForm<UsageValues>({ resolver: zodResolver(usageSchema), defaultValues: { assignmentId: '', usageDate: '', quantity: '', rate: '' } });
  const activeAssignments = assignments.filter((assignment) => assignment.status === 'ACTIVE');

  /** Record usage and let the server calculate/post the actual Equipment cost. */
  async function handleSubmit(values: UsageValues): Promise<void> {
    await mutation.mutateAsync({
      assignmentId: values.assignmentId,
      usageDate: values.usageDate,
      quantity: values.quantity,
      ...(values.rate === '' ? {} : { rate: values.rate })
    });
    form.reset();
  }

  return (
    <section className="admin-card">
      <h2>Record usage</h2>
      <form className="admin-stack" onSubmit={form.handleSubmit((values) => void handleSubmit(values))}>
        <label>Assignment
          <select {...form.register('assignmentId')}>
            <option value="">Select assignment</option>
            {activeAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignmentLabel(assignment)}</option>)}
          </select>
        </label>
        <label>Usage date<input type="date" {...form.register('usageDate')} /></label>
        <label>Quantity<input inputMode="decimal" placeholder="Hours or days according to the rate unit" {...form.register('quantity')} /></label>
        <label>Rate override (optional)<input inputMode="decimal" {...form.register('rate')} /></label>
        {activeAssignments.length === 0 && <p className="muted">Create an active Project assignment before recording usage.</p>}
        {Object.values(form.formState.errors).map((error, index) => error?.message && <div key={index} className="form-error">{String(error.message)}</div>)}
        {errorMessage(mutation.error) && <div className="form-error" role="alert">{errorMessage(mutation.error)}</div>}
        <button type="submit" disabled={mutation.isPending || activeAssignments.length === 0}>{mutation.isPending ? 'Posting…' : 'Record Usage & Cost'}</button>
      </form>
    </section>
  );
}

/** Render the simple Equipment maintenance-history command required by Module 12. */
function MaintenanceForm({ equipmentId }: Readonly<{ equipmentId: string }>) {
  const mutation = useCreateEquipmentMaintenance(equipmentId);
  const form = useForm<MaintenanceValues>({ resolver: zodResolver(maintenanceSchema), defaultValues: { maintenanceDate: '', type: '', cost: '0', note: '' } });

  /** Record one maintenance entry while preserving history. */
  async function handleSubmit(values: MaintenanceValues): Promise<void> {
    await mutation.mutateAsync({
      maintenanceDate: values.maintenanceDate,
      type: values.type.trim(),
      cost: values.cost,
      ...(values.note === '' ? {} : { note: values.note.trim() })
    });
    form.reset();
  }

  return (
    <section className="admin-card">
      <h2>Record maintenance</h2>
      <form className="admin-stack" onSubmit={form.handleSubmit((values) => void handleSubmit(values))}>
        <label>Maintenance date<input type="date" {...form.register('maintenanceDate')} /></label>
        <label>Type<input placeholder="Service, repair, inspection…" {...form.register('type')} /></label>
        <label>Cost<input inputMode="decimal" {...form.register('cost')} /></label>
        <label>Note (optional)<textarea rows={3} {...form.register('note')} /></label>
        {Object.values(form.formState.errors).map((error, index) => error?.message && <div key={index} className="form-error">{String(error.message)}</div>)}
        {errorMessage(mutation.error) && <div className="form-error" role="alert">{errorMessage(mutation.error)}</div>}
        <button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Record Maintenance'}</button>
      </form>
    </section>
  );
}

/** Render assignment, usage, maintenance and Project/Stage cost history for one Equipment item. */
function EquipmentHistoryPanel(props: Readonly<{ equipmentId: string; canAssign: boolean; data: EquipmentHistory | undefined; isPending: boolean; error: unknown }>) {
  const endMutation = useEndEquipmentAssignment(props.equipmentId);

  /** End one active assignment with an explicit effective date instead of deleting it. */
  async function endAssignment(assignmentId: string): Promise<void> {
    const endDate = window.prompt('End date (YYYY-MM-DD)');
    if (!endDate) return;
    await endMutation.mutateAsync({ assignmentId, endDate });
  }

  if (props.isPending) return <section className="admin-card"><p>Loading Equipment history…</p></section>;
  if (errorMessage(props.error)) return <section className="admin-card"><div className="form-error">{errorMessage(props.error)}</div></section>;
  if (!props.data) return null;

  return (
    <section className="admin-card">
      <h2>Equipment history</h2>
      <EquipmentIdentity equipment={props.data.equipment} />

      <h3>Assignments</h3>
      <div className="table-scroll"><table><thead><tr><th>Assignment ID</th><th>Equipment ID</th><th>Project / Stage</th><th>Dates</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {props.data.assignments.map((row) => <tr key={row.id}><td>{row.id}</td><td>{row.equipmentId}</td><td>{row.projectId}<br /><small>{row.stageId ?? 'Project-level'}</small></td><td>{row.fromDate} → {row.toDate ?? 'Open'}</td><td>{row.status}</td><td>{props.canAssign && row.status === 'ACTIVE' ? <button type="button" className="secondary-button" disabled={endMutation.isPending} onClick={() => void endAssignment(row.id)}>End</button> : '—'}</td></tr>)}
        {props.data.assignments.length === 0 && <tr><td colSpan={6} className="muted">No assignments.</td></tr>}
      </tbody></table></div>
      {errorMessage(endMutation.error) && <div className="form-error" role="alert">{errorMessage(endMutation.error)}</div>}

      <h3>Usage & actual cost</h3>
      <div className="table-scroll"><table><thead><tr><th>Usage ID</th><th>Assignment ID</th><th>Date</th><th>Project / Stage</th><th>Quantity</th><th>Rate</th><th>Amount</th><th>Entered by</th><th>Cost actual</th><th>Status</th></tr></thead><tbody>
        {props.data.usage.map((row) => <tr key={row.id}><td>{row.id}</td><td>{row.assignmentId}</td><td>{row.usageDate}</td><td>{row.projectId}<br /><small>{row.stageId ?? 'Project-level'}</small></td><td>{row.quantity}</td><td>{row.rate}</td><td>{row.amount}</td><td>{row.enteredBy}</td><td>{row.costActualId ?? '—'}</td><td>{row.status}</td></tr>)}
        {props.data.usage.length === 0 && <tr><td colSpan={10} className="muted">No usage posted.</td></tr>}
      </tbody></table></div>

      <h3>Maintenance</h3>
      <div className="table-scroll"><table><thead><tr><th>Maintenance ID</th><th>Equipment ID</th><th>Date</th><th>Type</th><th>Cost</th><th>Note</th><th>Status</th></tr></thead><tbody>
        {props.data.maintenance.map((row) => <tr key={row.id}><td>{row.id}</td><td>{row.equipmentId}</td><td>{row.maintenanceDate}</td><td>{row.type}</td><td>{row.cost}</td><td>{row.note ?? '—'}</td><td>{row.status}</td></tr>)}
        {props.data.maintenance.length === 0 && <tr><td colSpan={7} className="muted">No maintenance history.</td></tr>}
      </tbody></table></div>

      <h3>Project / Stage Equipment cost summary</h3>
      <div className="table-scroll"><table><thead><tr><th>Project</th><th>Stage</th><th>Actual cost</th></tr></thead><tbody>
        {props.data.costSummary.map((row) => <tr key={`${row.projectId}:${row.stageId ?? ''}`}><td>{row.projectId}</td><td>{row.stageId ?? 'Project-level'}</td><td>{row.amount}</td></tr>)}
        {props.data.costSummary.length === 0 && <tr><td colSpan={3} className="muted">No Equipment actual cost posted.</td></tr>}
      </tbody></table></div>
    </section>
  );
}

/** Render the Final-21 Equipment Management feature without legacy fleet subsystems. */
export function EquipmentWorkspace(props: EquipmentWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const history = useEquipmentHistory(selectedId, props.canRead);

  return (
    <div className="admin-stack">
      <EquipmentRegister canRead={props.canRead} selectedId={selectedId} onSelect={setSelectedId} />
      {props.canManage && <CreateEquipmentForm />}

      {selectedId && (
        <>
          {props.canAssign && <AssignmentForm equipmentId={selectedId} />}
          {props.canRecordUsage && <UsageForm equipmentId={selectedId} assignments={history.data?.assignments ?? []} />}
          {props.canMaintain && <MaintenanceForm equipmentId={selectedId} />}
          {props.canRead && <EquipmentHistoryPanel equipmentId={selectedId} canAssign={props.canAssign} data={history.data} isPending={history.isPending} error={history.error} />}
        </>
      )}

      {!selectedId && (props.canAssign || props.canRecordUsage || props.canMaintain) && (
        <section className="admin-card"><p className="muted">Select an Equipment item to manage assignments, usage, maintenance and cost history.</p></section>
      )}
    </div>
  );
}
