import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useProjects } from '../../projects/hooks/projects.js';
import {
  useCreateSubcontractContract,
  useFinishSubcontractContract,
  useSubcontractContracts,
  useSubcontractors
} from '../hooks/vendors-subcontractors.js';

const contractFormSchema = z.object({
  subcontractorId: z.string().uuid('Select a subcontractor.'),
  projectId: z.string().uuid('Select a Project.'),
  contractAmount: z.string().trim().regex(
    /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/,
    'Enter a valid amount with at most 2 decimal places.'
  ).refine((value) => Number(value) > 0, 'Contract amount must be greater than 0.'),
  contractDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select the subcontract date.')
});

type ContractFormValues = z.infer<typeof contractFormSchema>;

type WorkspaceProps = Readonly<{
  canReadSubcontractors: boolean;
  canManageSubcontractors: boolean;
  canReadProjects: boolean;
}>;

/** Render the subcontract Project-assignment workflow on its own page. */
export function SubcontractContractsWorkspace(props: WorkspaceProps) {
  const subcontractors = useSubcontractors({ status: 'ACTIVE', page: 1, pageSize: 100 }, props.canReadSubcontractors);
  const projects = useProjects({ page: 1, pageSize: 100 }, props.canReadProjects);
  const contracts = useSubcontractContracts({ page: 1, pageSize: 100 }, props.canReadSubcontractors);
  const createMutation = useCreateSubcontractContract();
  const finishMutation = useFinishSubcontractContract();
  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: { subcontractorId: '', projectId: '', contractAmount: '', contractDate: '' }
  });

  /** Create one subcontract Project assignment from the selected master records. */
  async function handleCreate(values: ContractFormValues): Promise<void> {
    await createMutation.mutateAsync(values);
    form.reset({ subcontractorId: '', projectId: '', contractAmount: '', contractDate: '' });
  }

  /** Finish one active subcontract contract after explicit user confirmation. */
  async function handleFinish(contractId: string): Promise<void> {
    if (!window.confirm('Finish this subcontract? This will mark the contract as FINISHED.')) return;
    await finishMutation.mutateAsync(contractId);
  }

  return (
    <section className="admin-stack" aria-labelledby="subcontract-contracts-title">
      <section className="admin-card">
        <p className="eyebrow">Subcontractor Module</p>
        <h1 id="subcontract-contracts-title">Subcontract Contracts</h1>
        <p className="muted">Assign a Project, agreed contract amount and subcontract date. Finish the contract when the subcontract work is complete.</p>
      </section>

      {props.canManageSubcontractors && props.canReadProjects && props.canReadSubcontractors && (
        <section className="admin-card">
          <h2>Assign Project to subcontractor</h2>
          <form className="admin-form" onSubmit={form.handleSubmit(handleCreate)} noValidate>
            <div className="client-form-grid">
              <label>
                Subcontractor
                <select {...form.register('subcontractorId')}>
                  <option value="">Select subcontractor</option>
                  {(subcontractors.data?.items ?? []).map((subcontractor) => (
                    <option key={subcontractor.id} value={subcontractor.id}>
                      {subcontractor.name} · {subcontractor.specialty}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Project
                <select {...form.register('projectId')}>
                  <option value="">Select Project</option>
                  {(projects.data?.items ?? []).map((project) => (
                    <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Contract amount
                <input type="number" min="0.01" step="0.01" inputMode="decimal" {...form.register('contractAmount')} />
              </label>
              <label>
                Subcontract date
                <input type="date" {...form.register('contractDate')} />
              </label>
            </div>
            {Object.values(form.formState.errors).map((error, index) => <span className="field-error" key={index}>{error?.message}</span>)}
            {createMutation.error instanceof Error && <div className="form-error">{createMutation.error.message}</div>}
            <button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Assigning…' : 'Create subcontract'}</button>
          </form>
        </section>
      )}

      {props.canManageSubcontractors && !props.canReadProjects && (
        <section className="admin-card"><p className="muted">Project read access is required before a Project can be assigned to a subcontractor.</p></section>
      )}

      {props.canReadSubcontractors && (
        <section className="admin-card">
          <h2>Subcontract register</h2>
          {contracts.isLoading && <p className="muted">Loading subcontract contracts…</p>}
          {contracts.error instanceof Error && <div className="form-error">{contracts.error.message}</div>}
          {finishMutation.error instanceof Error && <div className="form-error">{finishMutation.error.message}</div>}
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Subcontractor</th><th>Project</th><th>Contract amount</th><th>Contract date</th><th>Status</th><th>Finished</th><th>Action</th></tr></thead>
              <tbody>
                {(contracts.data?.items ?? []).map((contract) => (
                  <tr key={contract.id}>
                    <td>{contract.subcontractor.name} · {contract.subcontractor.specialty}</td>
                    <td>{contract.project.projectCode} · {contract.project.name}</td>
                    <td>{contract.contractAmount} {contract.project.currency}</td>
                    <td>{contract.contractDate.slice(0, 10)}</td>
                    <td>{contract.status === 'FINISHED' ? 'Finished' : 'Active'}</td>
                    <td>{contract.finishedAt ? new Date(contract.finishedAt).toLocaleString() : '—'}</td>
                    <td>
                      {contract.status === 'ACTIVE' && props.canManageSubcontractors
                        ? <button type="button" className="link-button" disabled={finishMutation.isPending} onClick={() => handleFinish(contract.id)}>Finish subcontract</button>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!contracts.isLoading && (contracts.data?.items.length ?? 0) === 0 && <p className="muted">No subcontract contracts yet.</p>}
        </section>
      )}

      {!props.canReadSubcontractors && (
        <section className="admin-card"><p className="muted">Your current role does not include subcontractor read access.</p></section>
      )}
    </section>
  );
}
