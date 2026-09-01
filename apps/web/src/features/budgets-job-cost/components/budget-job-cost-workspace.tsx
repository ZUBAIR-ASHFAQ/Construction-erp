import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Project } from '../../projects/api/projects-api.js';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import type { ProjectBudget } from '../api/budgets-job-cost-api.js';
import {
  useCreateBudget,
  useCurrentBudget,
  useFreezeBudget,
  useJobCost,
  useJobCostLedger,
  useReplaceBudgetLines,
  useUpdateForecast
} from '../hooks/budgets-job-cost.js';

const COST_CATEGORIES = ['material', 'labour', 'security', 'equipment', 'subcontract', 'site_expense', 'other'] as const;
const moneySchema = z.string().trim().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/, 'Use a non-negative amount with at most 2 decimals.');
const optionalUuidSchema = z.union([z.literal(''), z.string().uuid('Choose a valid Stage.')]);
const budgetLineFormSchema = z.object({
  lines: z.array(z.object({
    stageId: optionalUuidSchema,
    category: z.enum(COST_CATEGORIES),
    description: z.string().trim().min(1, 'Description is required.').max(500),
    plannedAmount: moneySchema
  }))
});
const forecastFormSchema = z.object({
  lines: z.array(z.object({
    stageId: optionalUuidSchema,
    category: z.enum(COST_CATEGORIES),
    forecastAmount: moneySchema
  }))
});

type BudgetLineFormValues = z.infer<typeof budgetLineFormSchema>;
type ForecastFormValues = z.infer<typeof forecastFormSchema>;

type BudgetJobCostWorkspaceProps = Readonly<{
  project: Project;
  canReadBudget: boolean;
  canReadStages: boolean;
  canCreateBudget: boolean;
  canEditBudget: boolean;
  canFreezeBudget: boolean;
  canReadJobCost: boolean;
  canUpdateForecast: boolean;
}>;

/** Convert one persisted budget into editable category-line values. */
function budgetLineDefaults(budget: ProjectBudget | null): BudgetLineFormValues {
  return {
    lines: budget?.lines.map((line) => ({
      stageId: line.stageId ?? '',
      category: line.category,
      description: line.description,
      plannedAmount: line.plannedAmount
    })) ?? []
  };
}

/** Return a useful message for one failed browser request. */
function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

/** Render one Project's Final Module 9 budget, forecast and source-cost workspace. */
export function BudgetJobCostWorkspace({
  project,
  canReadBudget,
  canReadStages,
  canCreateBudget,
  canEditBudget,
  canFreezeBudget,
  canReadJobCost,
  canUpdateForecast
}: BudgetJobCostWorkspaceProps) {
  const [ledgerPage, setLedgerPage] = useState(1);
  const currentBudgetQuery = useCurrentBudget(project.id, canReadBudget);
  const jobCostQuery = useJobCost(project.id, canReadJobCost);
  const ledgerQuery = useJobCostLedger(project.id, { page: ledgerPage, pageSize: 25 }, canReadJobCost);
  const stagesQuery = useProjectStages(project.id, canReadStages);
  const currentBudget = currentBudgetQuery.data ?? null;
  const editableBudget = currentBudget?.status.toUpperCase() === 'DRAFT' ? currentBudget : null;
  const createBudgetMutation = useCreateBudget(project.id);
  const replaceBudgetLinesMutation = useReplaceBudgetLines(project.id, editableBudget?.id ?? '00000000-0000-0000-0000-000000000000');
  const freezeBudgetMutation = useFreezeBudget(project.id, editableBudget?.id ?? '00000000-0000-0000-0000-000000000000');
  const updateForecastMutation = useUpdateForecast(project.id);
  const stages = stagesQuery.data?.items ?? [];
  const stageById = useMemo(() => new Map(stages.map((stage) => [stage.id, stage])), [stages]);

  const budgetForm = useForm<BudgetLineFormValues>({
    resolver: zodResolver(budgetLineFormSchema),
    defaultValues: budgetLineDefaults(editableBudget)
  });
  const budgetRows = useFieldArray({ control: budgetForm.control, name: 'lines' });
  const forecastForm = useForm<ForecastFormValues>({
    resolver: zodResolver(forecastFormSchema),
    defaultValues: { lines: [] }
  });
  const forecastRows = useFieldArray({ control: forecastForm.control, name: 'lines' });

  useEffect(() => {
    budgetForm.reset(budgetLineDefaults(editableBudget));
  }, [budgetForm, editableBudget]);

  useEffect(() => {
    forecastForm.reset({
      lines: (jobCostQuery.data?.forecasts ?? []).map((line) => ({
        stageId: line.stageId ?? '',
        category: line.category,
        forecastAmount: line.forecastAmount
      }))
    });
  }, [forecastForm, jobCostQuery.data?.forecasts]);

  /** Add one empty editable budget line. */
  function addBudgetLine(): void {
    budgetRows.append({ stageId: '', category: 'other', description: '', plannedAmount: '0.00' });
  }

  /** Add one empty current forecast line. */
  function addForecastLine(): void {
    forecastRows.append({ stageId: '', category: 'other', forecastAmount: '0.00' });
  }

  /** Save the complete DRAFT budget line set. */
  async function handleSaveBudgetLines(values: BudgetLineFormValues): Promise<void> {
    if (!editableBudget) return;
    await replaceBudgetLinesMutation.mutateAsync({
      lines: values.lines.map((line) => ({
        stageId: line.stageId || null,
        category: line.category,
        description: line.description,
        plannedAmount: line.plannedAmount
      }))
    });
  }

  /** Replace the current Project forecast. */
  async function handleUpdateForecast(values: ForecastFormValues): Promise<void> {
    await updateForecastMutation.mutateAsync({
      lines: values.lines.map((line) => ({
        stageId: line.stageId || null,
        category: line.category,
        forecastAmount: line.forecastAmount
      }))
    });
  }

  const actionError = errorMessage(createBudgetMutation.error)
    ?? errorMessage(replaceBudgetLinesMutation.error)
    ?? errorMessage(freezeBudgetMutation.error)
    ?? errorMessage(updateForecastMutation.error);

  return (
    <section className="admin-stack" aria-label={`${project.name} Project Budget & Cost Tracking`}>
      <section className="admin-card">
        <div className="section-heading">
          <p className="eyebrow">{project.projectCode}</p>
          <h2>{project.name}</h2>
          <p className="muted">Budget baseline, source-derived commitments/actuals and current forecast remain separate and traceable.</p>
        </div>
        {actionError && <div className="form-error" role="alert">{actionError}</div>}
        {currentBudget && (
          <dl className="module9-summary-grid">
            <div><dt>Version</dt><dd>{currentBudget.versionNo}</dd></div>
            <div><dt>Status</dt><dd>{currentBudget.status}</dd></div>
            <div><dt>Budget total</dt><dd>{currentBudget.currency} {currentBudget.totalAmount}</dd></div>
            <div><dt>Created by</dt><dd>{currentBudget.createdBy}</dd></div>
            <div><dt>Frozen</dt><dd>{currentBudget.frozenAt ? new Date(currentBudget.frozenAt).toLocaleString() : 'No'}</dd></div>
          </dl>
        )}
        {!currentBudget && canCreateBudget && (
          <button type="button" disabled={createBudgetMutation.isPending} onClick={() => createBudgetMutation.mutate()}>
            Create budget version
          </button>
        )}
        {currentBudget && currentBudget.status.toUpperCase() !== 'DRAFT' && canCreateBudget && (
          <button type="button" disabled={createBudgetMutation.isPending} onClick={() => createBudgetMutation.mutate()}>
            Create revision
          </button>
        )}
        {currentBudgetQuery.error instanceof Error && !currentBudget && (
          <p className="muted">No budget version is available yet.</p>
        )}
      </section>

      {editableBudget && canEditBudget && (
        <section className="admin-card">
          <h2>Budget lines</h2>
          <form onSubmit={budgetForm.handleSubmit(handleSaveBudgetLines)} noValidate>
            <div className="table-wrap">
              <table className="admin-table">
                <thead><tr><th>Stage</th><th>Category</th><th>Description</th><th>Planned amount</th><th>Action</th></tr></thead>
                <tbody>
                  {budgetRows.fields.map((field, index) => (
                    <tr key={field.id}>
                      <td>
                        <select {...budgetForm.register(`lines.${index}.stageId`)}>
                          <option value="">Project level</option>
                          {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <select {...budgetForm.register(`lines.${index}.category`)}>
                          {COST_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                        </select>
                      </td>
                      <td><input {...budgetForm.register(`lines.${index}.description`)} /></td>
                      <td><input inputMode="decimal" {...budgetForm.register(`lines.${index}.plannedAmount`)} /></td>
                      <td><button type="button" className="secondary-button" onClick={() => budgetRows.remove(index)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="module9-command-row">
              <button type="button" className="secondary-button" onClick={addBudgetLine}>Add line</button>
              <button type="submit" disabled={replaceBudgetLinesMutation.isPending}>Save lines</button>
              {canFreezeBudget && (
                <button type="button" disabled={freezeBudgetMutation.isPending} onClick={() => freezeBudgetMutation.mutate()}>
                  Freeze budget
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      {currentBudget && currentBudget.lines.length > 0 && (
        <section className="admin-card">
          <h2>Current budget</h2>
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Stage</th><th>Category</th><th>Description</th><th>Planned</th></tr></thead>
              <tbody>{currentBudget.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.stageId ? (stageById.get(line.stageId)?.name ?? line.stageId) : 'Project level'}</td>
                  <td>{line.category}</td><td>{line.description}</td><td>{currentBudget.currency} {line.plannedAmount}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      {canReadJobCost && (
        <section className="admin-card">
          <h2>Job-cost position</h2>
          {jobCostQuery.data && (
            <>
              <dl className="module9-summary-grid">
                <div><dt>Budget</dt><dd>{project.currency} {jobCostQuery.data.totals.budgetCost}</dd></div>
                <div><dt>Committed</dt><dd>{project.currency} {jobCostQuery.data.totals.committedCost}</dd></div>
                <div><dt>Actual</dt><dd>{project.currency} {jobCostQuery.data.totals.actualCost}</dd></div>
                <div><dt>Forecast</dt><dd>{project.currency} {jobCostQuery.data.totals.forecastCost}</dd></div>
                <div><dt>Variance</dt><dd>{project.currency} {jobCostQuery.data.totals.variance}</dd></div>
              </dl>
              {jobCostQuery.data.forecasts.length > 0 && (
                <div className="table-wrap">
                  <table className="admin-table">
                    <thead><tr><th>Stage</th><th>Category</th><th>Forecast</th><th>Updated by</th><th>Updated</th></tr></thead>
                    <tbody>{jobCostQuery.data.forecasts.map((line) => (
                      <tr key={line.id}>
                        <td>{line.stageId ? (stageById.get(line.stageId)?.name ?? line.stageId) : 'Project level'}</td>
                        <td>{line.category}</td><td>{project.currency} {line.forecastAmount}</td><td>{line.updatedBy}</td><td>{new Date(line.updatedAt).toLocaleString()}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {canUpdateForecast && (
        <section className="admin-card">
          <h2>Current forecast</h2>
          <p className="muted">Forecasts are planning values by Project/Stage and cost category. They do not overwrite posted actuals.</p>
          <form onSubmit={forecastForm.handleSubmit(handleUpdateForecast)} noValidate>
            <div className="table-wrap">
              <table className="admin-table">
                <thead><tr><th>Stage</th><th>Category</th><th>Forecast amount</th><th>Action</th></tr></thead>
                <tbody>{forecastRows.fields.map((field, index) => (
                  <tr key={field.id}>
                    <td>
                      <select {...forecastForm.register(`lines.${index}.stageId`)}>
                        <option value="">Project level</option>
                        {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select {...forecastForm.register(`lines.${index}.category`)}>
                        {COST_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                      </select>
                    </td>
                    <td><input inputMode="decimal" {...forecastForm.register(`lines.${index}.forecastAmount`)} /></td>
                    <td><button type="button" className="secondary-button" onClick={() => forecastRows.remove(index)}>Remove</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="module9-command-row">
              <button type="button" className="secondary-button" onClick={addForecastLine}>Add forecast line</button>
              <button type="submit" disabled={updateForecastMutation.isPending}>Save forecast</button>
            </div>
          </form>
        </section>
      )}

      {canReadJobCost && (
        <section className="admin-card">
          <h2>Source cost ledger</h2>
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Stage</th><th>Source</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>{(ledgerQuery.data?.items ?? []).map((entry) => (
                <tr key={`${entry.recordType}-${entry.id}`}>
                  <td>{entry.postingDate}</td><td>{entry.recordType}</td><td>{entry.category}</td>
                  <td>{entry.stageId ? (stageById.get(entry.stageId)?.name ?? entry.stageId) : 'Project level'}</td>
                  <td><code>{entry.sourceKey}</code><br /><small>{entry.sourceType} · {entry.sourceId}</small></td><td>{project.currency} {entry.amount}</td><td>{entry.status ?? 'POSTED'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="module9-command-row">
            <button type="button" className="secondary-button" disabled={ledgerPage <= 1} onClick={() => setLedgerPage((value) => Math.max(1, value - 1))}>Previous</button>
            <span>Page {ledgerPage}</span>
            <button type="button" className="secondary-button" disabled={(ledgerQuery.data?.items.length ?? 0) < 25} onClick={() => setLedgerPage((value) => value + 1)}>Next</button>
          </div>
        </section>
      )}
    </section>
  );
}
