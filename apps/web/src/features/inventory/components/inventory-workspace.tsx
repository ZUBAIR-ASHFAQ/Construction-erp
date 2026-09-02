import { useState, type FormEvent } from 'react';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useProjects } from '../../projects/hooks/projects.js';
import {
  useAdjustStock,
  useCreateMaterialIssue,
  useInventoryLedger,
  useInventoryStock,
  useMaterials,
  useTransferMaterial
} from '../hooks/inventory.js';

type InventoryWorkspaceProps = Readonly<{
  canRead: boolean;
  canIssue: boolean;
  canTransfer: boolean;
  canAdjust: boolean;
}>;

/** Render the Final-21 stock, issue, transfer and adjustment workspace. */
export function InventoryWorkspace(props: InventoryWorkspaceProps) {
  const materials = useMaterials(props.canRead);
  const stock = useInventoryStock(props.canRead);
  const ledger = useInventoryLedger(props.canRead);
  const projects = useProjects({ page: 1, pageSize: 100, status: 'ACTIVE' }, props.canIssue);
  const createIssue = useCreateMaterialIssue();
  const transfer = useTransferMaterial();
  const adjust = useAdjustStock();

  const [projectId, setProjectId] = useState('');
  const stages = useProjectStages(projectId || null, Boolean(projectId && props.canIssue));
  const [stageId, setStageId] = useState('');
  const [issueWarehouseId, setIssueWarehouseId] = useState('');
  const [issueMaterialId, setIssueMaterialId] = useState('');
  const [issueQuantity, setIssueQuantity] = useState('1.0000');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));

  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
  const [transferMaterialId, setTransferMaterialId] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('1.0000');

  const [adjustWarehouseId, setAdjustWarehouseId] = useState('');
  const [adjustMaterialId, setAdjustMaterialId] = useState('');
  const [adjustQuantity, setAdjustQuantity] = useState('1.0000');
  const [adjustReason, setAdjustReason] = useState('Stock correction');

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

  /** Submit one Warehouse-to-Warehouse transfer. */
  function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sourceWarehouseId || !destinationWarehouseId || !transferMaterialId) return;
    transfer.mutate({ sourceWarehouseId, destinationWarehouseId, materialId: transferMaterialId, quantity: transferQuantity });
  }

  /** Submit one append-only stock adjustment. */
  function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adjustWarehouseId || !adjustMaterialId) return;
    adjust.mutate({ warehouseId: adjustWarehouseId, materialId: adjustMaterialId, quantityDelta: adjustQuantity, reason: adjustReason });
  }

  const warehouseOptions = stock.data?.warehouses ?? [];
  const materialOptions = materials.data?.items ?? [];

  return (
    <div className="admin-stack">
      {props.canRead && (
        <section className="admin-card">
          <h2>Warehouse stock <small className="muted">({stock.data?.total ?? 0} row(s))</small></h2>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Warehouse</th><th>Material</th><th>Unit</th><th>On hand</th><th>Average cost</th></tr></thead>
              <tbody>
                {(stock.data?.items ?? []).map((row) => (
                  <tr key={`${row.warehouseId}:${row.materialId}`}>
                    <td>{row.warehouseCode} · {row.warehouseName}<br /><small>{row.projectId ?? 'Company warehouse'} · {row.warehouseId}</small></td>
                    <td>{row.materialCode} · {row.materialName}</td>
                    <td>{row.unit}</td><td>{row.quantityOnHand}</td><td>{row.averageCost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {props.canIssue && (
        <section className="admin-card">
          <h2>Issue material to project / stage</h2>
          <form className="form-grid" onSubmit={submitIssue}>
            <label>Project<select value={projectId} onChange={(event) => { setProjectId(event.target.value); setStageId(''); }} required><option value="">Select project</option>{(projects.data?.items ?? []).map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}</select></label>
            <label>Stage<select value={stageId} onChange={(event) => setStageId(event.target.value)}><option value="">Project level</option>{(stages.data?.items ?? []).map((stage) => <option key={stage.id} value={stage.id}>{stage.code} · {stage.name}</option>)}</select></label>
            <label>Warehouse<select value={issueWarehouseId} onChange={(event) => setIssueWarehouseId(event.target.value)} required><option value="">Select warehouse</option>{warehouseOptions.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
            <label>Material<select value={issueMaterialId} onChange={(event) => setIssueMaterialId(event.target.value)} required><option value="">Select material</option>{materialOptions.map((material) => <option key={material.id} value={material.id}>{material.code} · {material.name}</option>)}</select></label>
            <label>Quantity<input value={issueQuantity} onChange={(event) => setIssueQuantity(event.target.value)} required /></label>
            <label>Issue date<input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} required /></label>
            <button type="submit" disabled={createIssue.isPending}>Issue material</button>
          </form>
          {createIssue.data && <p className="muted">Issued {createIssue.data.issueNo} · {createIssue.data.status} · {createIssue.data.issueDate} · Record {createIssue.data.id}</p>}
        </section>
      )}

      {props.canTransfer && (
        <section className="admin-card">
          <h2>Transfer stock</h2>
          <form className="form-grid" onSubmit={submitTransfer}>
            <label>From<select value={sourceWarehouseId} onChange={(event) => setSourceWarehouseId(event.target.value)} required><option value="">Select warehouse</option>{warehouseOptions.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
            <label>To<select value={destinationWarehouseId} onChange={(event) => setDestinationWarehouseId(event.target.value)} required><option value="">Select warehouse</option>{warehouseOptions.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
            <label>Material<select value={transferMaterialId} onChange={(event) => setTransferMaterialId(event.target.value)} required><option value="">Select material</option>{materialOptions.map((material) => <option key={material.id} value={material.id}>{material.code} · {material.name}</option>)}</select></label>
            <label>Quantity<input value={transferQuantity} onChange={(event) => setTransferQuantity(event.target.value)} required /></label>
            <button type="submit" disabled={transfer.isPending}>Transfer</button>
          </form>
        </section>
      )}

      {props.canAdjust && (
        <section className="admin-card">
          <h2>Controlled adjustment</h2>
          <form className="form-grid" onSubmit={submitAdjustment}>
            <label>Warehouse<select value={adjustWarehouseId} onChange={(event) => setAdjustWarehouseId(event.target.value)} required><option value="">Select warehouse</option>{warehouseOptions.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
            <label>Material<select value={adjustMaterialId} onChange={(event) => setAdjustMaterialId(event.target.value)} required><option value="">Select material</option>{materialOptions.map((material) => <option key={material.id} value={material.id}>{material.code} · {material.name}</option>)}</select></label>
            <label>Quantity delta<input value={adjustQuantity} onChange={(event) => setAdjustQuantity(event.target.value)} required /></label>
            <label>Reason<input value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)} required /></label>
            <button type="submit" disabled={adjust.isPending}>Post adjustment</button>
          </form>
        </section>
      )}

      {props.canRead && (
        <section className="admin-card">
          <h2>Append-only stock ledger <small className="muted">({ledger.data?.total ?? 0} row(s))</small></h2>
          <div className="table-scroll"><table><thead><tr><th>When</th><th>Type</th><th>Warehouse</th><th>Material</th><th>Project / Stage</th><th>Source</th><th>Quantity</th><th>Unit cost</th></tr></thead><tbody>
            {(ledger.data?.items ?? []).map((row) => <tr key={row.id}><td>{new Date(row.occurredAt).toLocaleString()}<br /><small>{row.id}</small></td><td>{row.movementType}</td><td>{row.warehouseId}</td><td>{row.materialId}</td><td>{row.projectId ?? 'Company'}{row.stageId ? ` / ${row.stageId}` : ''}</td><td>{row.sourceType}<br /><small>{row.sourceId}</small></td><td>{row.quantity}</td><td>{row.unitCost}</td></tr>)}
          </tbody></table></div>
        </section>
      )}
    </div>
  );
}
