import { useState, type FormEvent } from 'react';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useProjects } from '../../projects/hooks/projects.js';
import { useAdjustStock, useCreateMaterialIssue, useInventoryLedger, useInventoryStock, useMaterials, useTransferMaterial } from '../hooks/inventory.js';

type InventoryWorkspaceProps = Readonly<{
  canRead: boolean;
  canIssue: boolean;
  canTransfer: boolean;
  canAdjust: boolean;
}>;

/** Render project-owned stock and stage issue controls. */
export function InventoryWorkspace(props: InventoryWorkspaceProps) {
  const materials = useMaterials(props.canRead);
  // Inventory history remains relevant after a Project leaves ACTIVE status, so
  // the selector must not hide Draft, Suspended, Completed, or Closed Projects.
  const projects = useProjects({ page: 1, pageSize: 100 }, props.canRead || props.canIssue || props.canAdjust);
  const [projectId, setProjectId] = useState('');
  const stock = useInventoryStock(projectId || undefined, props.canRead && Boolean(projectId));
  const ledger = useInventoryLedger(projectId || undefined, props.canRead && Boolean(projectId));
  const createIssue = useCreateMaterialIssue();
  const addDirectStock = useAdjustStock();
  const transferStock = useTransferMaterial();

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
  const [transferSourceWarehouseId, setTransferSourceWarehouseId] = useState('');
  const [transferMaterialId, setTransferMaterialId] = useState('');
  const [destinationProjectId, setDestinationProjectId] = useState('');
  const [destinationStageId, setDestinationStageId] = useState('');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('1.0000');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const destinationStages = useProjectStages(destinationProjectId || null, Boolean(destinationProjectId && props.canTransfer));

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

  /** Move unused stock to another Project and recognize its receiving material cost. */
  function submitProjectTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !destinationProjectId || !transferSourceWarehouseId || !destinationWarehouseId || !transferMaterialId || Number(transferQuantity) <= 0) return;
    transferStock.mutate({
      sourceProjectId: projectId,
      destinationProjectId,
      destinationStageId: destinationStageId || null,
      sourceWarehouseId: transferSourceWarehouseId,
      destinationWarehouseId,
      materialId: transferMaterialId,
      quantity: transferQuantity,
      transferDate
    });
  }

  const stockedWarehouseIds = new Set((stock.data?.items ?? []).filter((row) => Number(row.quantityOnHand) > 0).map((row) => row.warehouseId));
  const stockedMaterialIds = new Set((stock.data?.items ?? []).filter((row) => Number(row.quantityOnHand) > 0 && (!issueWarehouseId || row.warehouseId === issueWarehouseId)).map((row) => row.materialId));
  const warehouseOptions = (stock.data?.warehouses ?? []).filter((warehouse) => stockedWarehouseIds.has(warehouse.id));
  const directWarehouseOptions = stock.data?.warehouses ?? [];
  const transferMaterialIds = new Set((stock.data?.items ?? []).filter((row) => Number(row.quantityOnHand) > 0 && (!transferSourceWarehouseId || row.warehouseId === transferSourceWarehouseId)).map((row) => row.materialId));
  const transferMaterialOptions = (materials.data?.items ?? []).filter((material) => transferMaterialIds.has(material.id));
  const transferSourcePosition = (stock.data?.items ?? []).find((row) => row.warehouseId === transferSourceWarehouseId && row.materialId === transferMaterialId);
  const destinationProjects = (projects.data?.items ?? []).filter((project) => project.id !== projectId && project.status === 'ACTIVE');
  const destinationWarehouseOptions = (stock.data?.warehouses ?? []).filter((warehouse) => warehouse.projectId === null || warehouse.projectId === destinationProjectId);
  const materialOptions = (materials.data?.items ?? []).filter((material) => stockedMaterialIds.has(material.id));
  const warehouseNames = new Map((stock.data?.warehouses ?? []).map((warehouse) => [warehouse.id, warehouse.name]));
  const materialNames = new Map((materials.data?.items ?? []).map((material) => [material.id, material.name]));
  const stageNames = new Map((stages.data?.items ?? []).map((stage) => [stage.id, stage.name]));
  const selectedProject = (projects.data?.items ?? []).find((project) => project.id === projectId);
  const readError = [materials.error, stock.error, ledger.error].find((error): error is Error => error instanceof Error);

  return (
    <div className="admin-stack">
      <section className="admin-card">
        <h2>Project inventory</h2>
        <p className="muted">Select a project to see its received stock and issue material to a project stage.</p>
        <label>Project
          <select disabled={projects.isPending} value={projectId} onChange={(event) => { setProjectId(event.target.value); setStageId(''); setIssueWarehouseId(''); setIssueMaterialId(''); }}>
            <option value="">{projects.isPending ? 'Loading projects...' : 'Select project'}</option>
            {(projects.data?.items ?? []).map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name} ({project.status.replaceAll('_', ' ')})</option>)}
          </select>
        </label>
        {projects.isSuccess && projects.data.items.length === 0 && <p className="muted">No accessible projects were found. Create a project or check this user&apos;s Project permissions.</p>}
        {projects.error instanceof Error && <div className="form-error" role="alert">Projects could not be loaded: {projects.error.message}</div>}
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

      {props.canIssue && projectId && selectedProject?.status === 'ACTIVE' && (
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

      {props.canIssue && projectId && selectedProject && selectedProject.status !== 'ACTIVE' && (
        <section className="admin-card">
          <p className="muted">This project is {selectedProject.status.replaceAll('_', ' ').toLowerCase()}. Its inventory remains available for review, but material can only be issued to an active project.</p>
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

      {props.canTransfer && projectId && (
        <section className="admin-card">
          <h2>Transfer unused stock to another project</h2>
          <p className="muted">The source Project stock and material expense decrease, while the destination Project receives the same stock and material expense at the source average unit cost.</p>
          <form className="form-grid" onSubmit={submitProjectTransfer}>
            <label>Source warehouse<select value={transferSourceWarehouseId} onChange={(event) => { setTransferSourceWarehouseId(event.target.value); setTransferMaterialId(''); }} required><option value="">Select source warehouse</option>{warehouseOptions.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
            <label>Material<select value={transferMaterialId} onChange={(event) => setTransferMaterialId(event.target.value)} required><option value="">Select available material</option>{transferMaterialOptions.map((material) => { const position = (stock.data?.items ?? []).find((row) => row.warehouseId === transferSourceWarehouseId && row.materialId === material.id); return <option key={material.id} value={material.id}>{material.code} · {material.name}{position ? ` · ${position.quantityOnHand} ${position.unit} available` : ''}</option>; })}</select></label>
            <label>Destination project<select value={destinationProjectId} onChange={(event) => { setDestinationProjectId(event.target.value); setDestinationStageId(''); setDestinationWarehouseId(''); }} required><option value="">Select destination project</option>{destinationProjects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}</select></label>
            <label>Destination stage<select value={destinationStageId} onChange={(event) => setDestinationStageId(event.target.value)}><option value="">Project level</option>{(destinationStages.data?.items ?? []).map((stage) => <option key={stage.id} value={stage.id}>{stage.code} · {stage.name}</option>)}</select></label>
            <label>Destination warehouse<select value={destinationWarehouseId} onChange={(event) => setDestinationWarehouseId(event.target.value)} required><option value="">Select destination warehouse</option>{destinationWarehouseOptions.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
            <label>Quantity{transferSourcePosition && <small className="muted">Available: {transferSourcePosition.quantityOnHand} {transferSourcePosition.unit}</small>}<input inputMode="decimal" min="0.0001" max={transferSourcePosition?.quantityOnHand} step="0.0001" value={transferQuantity} onChange={(event) => setTransferQuantity(event.target.value)} required /></label>
            <label>Transfer date<input type="date" value={transferDate} onChange={(event) => setTransferDate(event.target.value)} required /></label>
            <button type="submit" disabled={transferStock.isPending}>{transferStock.isPending ? 'Transferring…' : 'Transfer stock'}</button>
          </form>
          {transferStock.data && <p className="muted">Transfer posted successfully. Source expense reduced and destination expense increased by {transferStock.data.lineCost}.</p>}
          {transferStock.error instanceof Error && <div className="form-error" role="alert">{transferStock.error.message}</div>}
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
