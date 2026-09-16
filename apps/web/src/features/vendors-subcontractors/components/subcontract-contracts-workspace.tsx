import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { useProjects } from '../../projects/hooks/projects.js';
import type { SubcontractContract } from '../api/vendors-subcontractors-api.js';
import {
  useCreateSubcontractContract,
  useFinishSubcontractContract,
  useSubcontractContracts,
  useSubcontractors,
  useUpdateSubcontractContract
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
type ContractDialog = Readonly<{ kind: 'create' }> | Readonly<{ kind: 'edit'; contract: SubcontractContract }> | null;

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
  const [contractDialog, setContractDialog] = useState<ContractDialog>(null);
  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: { subcontractorId: '', projectId: '', contractAmount: '', contractDate: '' }
  });

  /** Create one subcontract Project assignment from the selected master records. */
  async function handleCreate(values: ContractFormValues): Promise<void> {
    await createMutation.mutateAsync(values);
    form.reset({ subcontractorId: '', projectId: '', contractAmount: '', contractDate: '' });
    setContractDialog(null);
  }

  /** Finish one active subcontract contract after explicit user confirmation. */
  async function handleFinish(contractId: string): Promise<void> {
    if (!window.confirm('Finish this subcontract? This will mark the contract as FINISHED.')) return;
    await finishMutation.mutateAsync(contractId);
  }

  const canEditContracts = props.canManageSubcontractors && props.canReadProjects && props.canReadSubcontractors;

  return (
    <section className="admin-stack" aria-labelledby="subcontract-contracts-title">
      <section className="admin-card">
        <div className="client-page-heading">
          <div>
            <p className="eyebrow">Subcontractor Module</p>
            <h1 id="subcontract-contracts-title">Subcontract Contracts</h1>
            <p className="muted">Assign a Project, agreed contract amount and subcontract date. Finish the contract when the subcontract work is complete.</p>
          </div>
          {canEditContracts && (
            <button
              type="button"
              className="client-primary-action"
              onClick={() => {
                createMutation.reset();
                form.reset({ subcontractorId: '', projectId: '', contractAmount: '', contractDate: '' });
                setContractDialog({ kind: 'create' });
              }}
            >
              <span aria-hidden="true">+</span> Add contract
            </button>
          )}
        </div>
      </section>

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
              <thead><tr><th>Subcontractor</th><th>Project</th><th>Contract amount</th><th>Contract date</th><th>Status</th><th>Finished</th><th>Actions</th></tr></thead>
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
                        ? <div className="client-row-actions">
                            {props.canReadProjects && <button type="button" className="secondary-button client-edit-button" onClick={() => setContractDialog({ kind: 'edit', contract })}>Edit</button>}
                            <button type="button" className="link-button" disabled={finishMutation.isPending} onClick={() => handleFinish(contract.id)}>Finish subcontract</button>
                          </div>
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

      {contractDialog?.kind === 'create' && canEditContracts && (
        <ContractModal title="Add contract" eyebrow="Subcontract contract" onClose={() => { createMutation.reset(); form.reset(); setContractDialog(null); }}>
          <form className="admin-form client-modal-form" onSubmit={form.handleSubmit(handleCreate)} noValidate>
            <ContractFields form={form} subcontractors={subcontractors.data?.items ?? []} projects={projects.data?.items ?? []} />
            {Object.values(form.formState.errors).map((error, index) => <span className="field-error" key={index}>{error?.message}</span>)}
            {createMutation.error instanceof Error && <div className="form-error" role="alert">{createMutation.error.message}</div>}
            <div className="client-modal-actions">
              <button type="button" className="secondary-button" onClick={() => { createMutation.reset(); form.reset(); setContractDialog(null); }}>Cancel</button>
              <button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Creating…' : 'Create contract'}</button>
            </div>
          </form>
        </ContractModal>
      )}

      {contractDialog?.kind === 'edit' && canEditContracts && (
        <ContractEditModal
          contract={contractDialog.contract}
          subcontractors={subcontractors.data?.items ?? []}
          projects={projects.data?.items ?? []}
          onClose={() => setContractDialog(null)}
        />
      )}
    </section>
  );
}

type ContractFieldsProps = Readonly<{
  form: UseFormReturn<ContractFormValues>;
  subcontractors: ReadonlyArray<{ id: string; name: string; specialty: string }>;
  projects: ReadonlyArray<{ id: string; projectCode: string; name: string }>;
  currentContract?: SubcontractContract;
}>;

/** Render the four editable contract fields in the standard two-column modal grid. */
function ContractFields(props: ContractFieldsProps) {
  const currentSubcontractorMissing = props.currentContract && !props.subcontractors.some((item) => item.id === props.currentContract?.subcontractorId);
  const currentProjectMissing = props.currentContract && !props.projects.some((item) => item.id === props.currentContract?.projectId);

  return (
    <div className="client-form-grid">
      <label>
        Subcontractor
        <select {...props.form.register('subcontractorId')}>
          <option value="">Select subcontractor</option>
          {currentSubcontractorMissing && props.currentContract && <option value={props.currentContract.subcontractorId}>{props.currentContract.subcontractor.name} · {props.currentContract.subcontractor.specialty}</option>}
          {props.subcontractors.map((subcontractor) => <option key={subcontractor.id} value={subcontractor.id}>{subcontractor.name} · {subcontractor.specialty}</option>)}
        </select>
      </label>
      <label>
        Project
        <select {...props.form.register('projectId')}>
          <option value="">Select Project</option>
          {currentProjectMissing && props.currentContract && <option value={props.currentContract.projectId}>{props.currentContract.project.projectCode} · {props.currentContract.project.name}</option>}
          {props.projects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}
        </select>
      </label>
      <label>
        Contract amount
        <input type="number" min="0.01" step="0.01" inputMode="decimal" {...props.form.register('contractAmount')} />
      </label>
      <label>
        Subcontract date
        <input type="date" {...props.form.register('contractDate')} />
      </label>
    </div>
  );
}

/** Render one accessible contract modal using the existing Supplier/Subcontractor modal styling. */
function ContractModal(props: Readonly<{ title: string; eyebrow: string; onClose: () => void; children: ReactNode }>) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') props.onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [props.onClose]);

  return (
    <div className="client-modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section className="client-modal client-modal-wide" role="dialog" aria-modal="true" aria-labelledby="subcontract-contract-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="client-modal-header">
          <div><p className="eyebrow">{props.eyebrow}</p><h2 id="subcontract-contract-modal-title">{props.title}</h2></div>
          <button type="button" className="client-modal-close" onClick={props.onClose} aria-label={`Close ${props.title}`}><span aria-hidden="true">×</span></button>
        </header>
        <div className="client-modal-body">{props.children}</div>
      </section>
    </div>
  );
}

/** Edit one selected active subcontract contract through the dedicated PATCH endpoint. */
function ContractEditModal(props: Readonly<{
  contract: SubcontractContract;
  subcontractors: ReadonlyArray<{ id: string; name: string; specialty: string }>;
  projects: ReadonlyArray<{ id: string; projectCode: string; name: string }>;
  onClose: () => void;
}>) {
  const mutation = useUpdateSubcontractContract(props.contract.id);
  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: {
      subcontractorId: props.contract.subcontractorId,
      projectId: props.contract.projectId,
      contractAmount: props.contract.contractAmount,
      contractDate: props.contract.contractDate.slice(0, 10)
    }
  });

  async function handleUpdate(values: ContractFormValues): Promise<void> {
    await mutation.mutateAsync(values);
    props.onClose();
  }

  return (
    <ContractModal title={`Edit ${props.contract.subcontractor.name} contract`} eyebrow="Subcontract contract" onClose={props.onClose}>
      <form className="admin-form client-modal-form" onSubmit={form.handleSubmit(handleUpdate)} noValidate>
        <ContractFields form={form} subcontractors={props.subcontractors} projects={props.projects} currentContract={props.contract} />
        {Object.values(form.formState.errors).map((error, index) => <span className="field-error" key={index}>{error?.message}</span>)}
        {mutation.error instanceof Error && <div className="form-error" role="alert">{mutation.error.message}</div>}
        <div className="client-modal-actions">
          <button type="button" className="secondary-button" onClick={props.onClose}>Cancel</button>
          <button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save contract'}</button>
        </div>
      </form>
    </ContractModal>
  );
}
