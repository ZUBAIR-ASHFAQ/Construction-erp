import { useState, type FormEvent } from 'react';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useProjects } from '../../projects/hooks/projects.js';
import { useAdjustStock, useCreateMaterialIssue, useInventoryLedger, useInventoryStock, useMaterials } from '../hooks/inventory.js';

type InventoryWorkspaceProps = Readonly<{
  canRead: boolean;
  canIssue: boolean;
  canTransfer: boolean;
  canAdjust: boolean;
}>;

/** Render project-owned stock and stage issue controls. */
export function InventoryWorkspace(props: InventoryWorkspaceProps) {
  const materials = useMaterials(props.canRead);
  const projects = useProjects({ page: 1, pageSize: 100, status: 'ACTIVE' }, props.canRead || props.canIssue);
  const [projectId, setProjectId] = useState('');
  const stock = useInventoryStock(projectId || undefined, props.canRead && Boolean(projectId));
  const ledger = useInventoryLedger(projectId || undefined, props.canRead && Boolean(projectId));
  const createIssue = useCreateMaterialIssue();
  const addDirectStock = useAdjustStock();

  const stages = useProjectStages(projectId || null, Boolean(projectId && props.canIssue));
  const [stageId, setStageId] = useState('');
  const [issueWarehouseId, setIssueWarehouseId] = useState('');
  const [issueMaterialId, setIssueMaterialId] = useState('');
  const [issueQuantity, setIssueQuantity] = useState('1.0000');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [directWarehouseId, setDirectWarehouseId] = useState('');
  const [directMaterialId, setDirectMaterialId] = useState('');
  const [directQuantity, setDirectQuantity] = useState('1.0000');
  const [directReason, setDirectReason] = useState('Direct stock entry');

  /** Submit one single-line Project/Stage Material Issue from the compact UI. */
  function submitIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !issueWarehouseId || !issueMaterialId) return;
    createIssue.mutate({
      projectId,
      stageId: stageId || null,
      warehouseId: issueWarehouseId,
      issueDate,
      items: [{ materialId: issueMaterialId, quantity: issueQuantity }]
    });
  }

  /** Add positive stock directly to the selected Project without a Procurement document. */
  function submitDirectStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !directWarehouseId || !directMaterialId || Number(directQuantity) <= 0) return;
    addDirectStock.mutate({ projectId, warehouseId: directWarehouseId, materialId: directMaterialId, quantityDelta: directQuantity, reason: directReason });
  }

  const stockedWarehouseIds = new Set((stock.data?.items ?? []).filter((row) => Number(row.quantityOnHand) > 0).map((row) => row.warehouseId));
  const stockedMaterialIds = new Set((stock.data?.items ?? []).filter((row) => Number(row.quantityOnHand) > 0 && (!issueWarehouseId || row.warehouseId === issueWarehouseId)).map((row) => row.materialId));
  const warehouseOptions = (stock.data?.warehouses ?? []).filter((warehouse) => stockedWarehouseIds.has(warehouse.id));
  const directWarehouseOptions = stock.data?.warehouses ?? [];
  const materialOptions = (materials.data?.items ?? []).filter((material) => stockedMaterialIds.has(material.id));
  const warehouseNames = new Map((stock.data?.warehouses ?? []).map((warehouse) => [warehouse.id, warehouse.name]));
  const materialNames = new Map((materials.data?.items ?? []).map((material) => [material.id, material.name]));
  const stageNames = new Map((stages.data?.items ?? []).map((stage) => [stage.id, stage.name]));
  const readError = [materials.error, stock.error, ledger.error].find((error): error is Error => error instanceof Error);

  return (
    <div className="admin-stack">
      <section className="admin-card">
        <h2>Project inventory</h2>
        <p className="muted">Select a project to see its received stock and issue material to a project stage.</p>
        <label>Project
          <select value={projectId} onChange={(event) => { setProjectId(event.target.value); setStageId(''); setIssueWarehouseId(''); setIssueMaterialId(''); }}>
            <option value="">Select project</option>
            {(projects.data?.items ?? []).map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}
          </select>
        </label>
      </section>
      {props.canRead && projectId && (materials.isPending || stock.isPending || ledger.isPending) && <section className="admin-card"><p>Loading Inventory…</p></section>}
      {props.canRead && readError && <section className="admin-card"><div className="form-error" role="alert">Inventory could not be loaded: {readError.message}</div></section>}
      {props.canRead && projectId && (
        <section className="admin-card">
          <h2>Warehouse stock <small className="muted">({stock.data?.total ?? 0} row(s))</small></h2>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Warehouse</th><th>Material</th><th>Unit</th><th>On hand</th><th>Average cost</th></tr></thead>
              <tbody>
                {(stock.data?.items ?? []).map((row) => (
                  <tr key={`${row.warehouseId}:${row.materialId}`}>
                    <td>{row.warehouseCode} · {row.warehouseName}</td>
                    <td>{row.materialCode} · {row.materialName}</td>
                    <td>{row.unit}</td><td>{row.quantityOnHand}</td><td>{row.averageCost}</td>
                  </tr>
                ))}
                {stock.isSuccess && (stock.data?.items.length ?? 0) === 0 && <tr><td colSpan={5} className="muted">No goods have been received for this project yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {props.canIssue && projectId && (
        <section className="admin-card">
          <h2>Issue material to project / stage</h2>
          <form className="form-grid" onSubmit={submitIssue}>
            <label>Stage<select value={stageId} onChange={(event) => setStageId(event.target.value)}><option value="">Project level</option>{(stages.data?.items ?? []).map((stage) => <option key={stage.id} value={stage.id}>{stage.code} · {stage.name}</option>)}</select></label>
            <label>Warehouse<select value={issueWarehouseId} onChange={(event) => { setIssueWarehouseId(event.target.value); setIssueMaterialId(''); }} required><option value="">Select warehouse</option>{warehouseOptions.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
            <label>Material<select value={issueMaterialId} onChange={(event) => setIssueMaterialId(event.target.value)} required><option value="">Select material</option>{materialOptions.map((material) => <option key={material.id} value={material.id}>{material.code} · {material.name}</option>)}</select></label>
            <label>Quantity<input value={issueQuantity} onChange={(event) => setIssueQuantity(event.target.value)} required /></label>
            <label>Issue date<input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} required /></label>
            <button type="submit" disabled={createIssue.isPending}>Issue material</button>
          </form>
          {createIssue.data && <p className="muted">Issued {createIssue.data.issueNo} · {createIssue.data.status} · {createIssue.data.issueDate}</p>}
          {createIssue.error instanceof Error && <div className="form-error" role="alert">{createIssue.error.message}</div>}
        </section>
      )}

      {props.canAdjust && projectId && (
        <section className="admin-card">
          <h2>Direct stock entry</h2>
          <p className="muted">Use this only for opening stock or material received without Procurement. It is added directly to the selected project.</p>
          <form className="form-grid" onSubmit={submitDirectStock}>
            <label>Warehouse<select value={directWarehouseId} onChange={(event) => setDirectWarehouseId(event.target.value)} required><option value="">Select warehouse</option>{directWarehouseOptions.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
            <label>Material<select value={directMaterialId} onChange={(event) => setDirectMaterialId(event.target.value)} required><option value="">Select material</option>{(materials.data?.items ?? []).map((material) => <option key={material.id} value={material.id}>{material.code} · {material.name}</option>)}</select></label>
            <label>Quantity<input inputMode="decimal" value={directQuantity} onChange={(event) => setDirectQuantity(event.target.value)} required /></label>
            <label>Reason<input value={directReason} onChange={(event) => setDirectReason(event.target.value)} required /></label>
            <button type="submit" disabled={addDirectStock.isPending}>{addDirectStock.isPending ? 'Adding…' : 'Add to project inventory'}</button>
          </form>
          {addDirectStock.data && <p className="muted">Stock added successfully. The project balance and ledger have been updated.</p>}
          {addDirectStock.error instanceof Error && <div className="form-error" role="alert">{addDirectStock.error.message}</div>}
        </section>
      )}

      {props.canRead && projectId && (
        <section className="admin-card">
          <h2>Append-only stock ledger <small className="muted">({ledger.data?.total ?? 0} row(s))</small></h2>
          <div className="table-scroll"><table><thead><tr><th>When</th><th>Type</th><th>Warehouse</th><th>Material</th><th>Project / Stage</th><th>Source</th><th>Quantity</th><th>Unit cost</th></tr></thead><tbody>
            {(ledger.data?.items ?? []).map((row) => <tr key={row.id}><td>{new Date(row.occurredAt).toLocaleString()}</td><td>{row.movementType}</td><td>{warehouseNames.get(row.warehouseId) ?? 'Unknown warehouse'}</td><td>{materialNames.get(row.materialId) ?? 'Unknown material'}</td><td>{projects.data?.items.find((project) => project.id === row.projectId)?.name ?? 'Company'}{row.stageId ? ` / ${stageNames.get(row.stageId) ?? 'Project stage'}` : ''}</td><td>{row.sourceType.replaceAll('_', ' ')}</td><td>{row.quantity}</td><td>{row.unitCost}</td></tr>)}
          </tbody></table></div>
        </section>
      )}
    </div>
  );
}
