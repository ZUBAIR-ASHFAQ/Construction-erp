import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useProjects } from '../../projects/hooks/projects.js';
import type { Material } from '../api/inventory-api.js';
import { useCreateMaterial, useDeleteMaterial, useMaterials } from '../hooks/inventory.js';

type MaterialsWorkspaceProps = Readonly<{
  canRead: boolean;
  canManage: boolean;
}>;

/** Render the Project-owned Material master with server-numbered modal creation. */
export function MaterialsWorkspace(props: MaterialsWorkspaceProps) {
  const projects = useProjects({ page: 1, pageSize: 100 }, props.canRead || props.canManage);
  const projectItems = projects.data?.items ?? [];
  const [projectId, setProjectId] = useState('');
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false);
  const [materialPendingDeletion, setMaterialPendingDeletion] = useState<Material | null>(null);
  const materials = useMaterials(projectId || undefined, props.canRead);
  const createMaterial = useCreateMaterial();
  const deleteMaterialMutation = useDeleteMaterial();
  const projectNames = useMemo(() => new Map(projectItems.map((project) => [project.id, `${project.projectCode} · ${project.name}`])), [projectItems]);

  useEffect(() => {
    if (projectId || projectItems.length !== 1) return;
    setProjectId(projectItems[0]?.id ?? '');
  }, [projectId, projectItems]);

  /** Create one Material; its code is allocated only by the backend. */
  async function submitMaterial(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const selectedProjectId = String(form.get('projectId') ?? '');
    if (!selectedProjectId) return;
    try {
      await createMaterial.mutateAsync({
        projectId: selectedProjectId,
        name: String(form.get('name') ?? ''),
        unit: String(form.get('unit') ?? ''),
        category: String(form.get('category') ?? '') || null
      });
      setProjectId(selectedProjectId);
      formElement.reset();
      setMaterialDialogOpen(false);
    } catch {
      // The mutation exposes the API error inside the modal.
    }
  }

  /** Permanently delete one unused Material after explicit confirmation. */
  async function confirmDeleteMaterial(): Promise<void> {
    if (!materialPendingDeletion) return;
    try {
      await deleteMaterialMutation.mutateAsync(materialPendingDeletion.id);
      setMaterialPendingDeletion(null);
    } catch {
      // The mutation exposes the backend conflict/not-found message in the dialog.
    }
  }

  return (
    <div className="admin-stack">
      <section className="admin-card">
        <div className="client-page-heading">
          <div>
            <h2>Project material scope</h2>
            <p className="muted">Filter the material master by Project. New material codes are generated automatically by the server.</p>
          </div>
          {props.canManage && (
            <button
              type="button"
              className="client-primary-action"
              aria-haspopup="dialog"
              onClick={() => {
                createMaterial.reset();
                setMaterialDialogOpen(true);
              }}
            >
              <span aria-hidden="true">+</span> Add material
            </button>
          )}
        </div>
        <label>Project
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">{projectItems.length === 1 ? 'Assigned project' : 'All visible projects'}</option>
            {projectItems.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}
          </select>
        </label>
      </section>

      {props.canRead && (
        <section className="admin-card">
          <h2>Material master <small className="muted">({materials.data?.total ?? 0} material(s))</small></h2>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Project</th><th>Code</th><th>Name</th><th>Unit</th><th>Category</th><th>Status</th>{props.canManage && <th>Action</th>}</tr></thead>
              <tbody>
                {(materials.data?.items ?? []).map((material) => (
                  <tr key={material.id}>
                    <td>{material.projectId ? projectNames.get(material.projectId) ?? 'Project' : 'Legacy company material'}</td>
                    <td>{material.code}</td>
                    <td>{material.name}<br /><small>{material.id}</small></td>
                    <td>{material.unit}</td>
                    <td>{material.category ?? '—'}</td>
                    <td>{material.status}</td>
                    {props.canManage && <td><div className="client-row-actions"><button type="button" className="danger-button" onClick={() => { deleteMaterialMutation.reset(); setMaterialPendingDeletion(material); }}>Delete</button></div></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {materialDialogOpen && props.canManage && (
        <MaterialModal onClose={() => { createMaterial.reset(); setMaterialDialogOpen(false); }}>
          <form className="admin-form client-modal-form" onSubmit={submitMaterial}>
            <div className="client-form-grid">
              <label>
                Project
                <select name="projectId" defaultValue={projectId} required>
                  <option value="">Select Project</option>
                  {projectItems.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}
                </select>
              </label>
              <label>Name<input name="name" required maxLength={300} /></label>
              <label>Unit<input name="unit" required maxLength={64} placeholder="KG, BAG, PCS" /></label>
              <label>Category<input name="category" maxLength={120} /></label>
            </div>
            {createMaterial.error instanceof Error && <div className="form-error" role="alert">{createMaterial.error.message}</div>}
            <div className="client-modal-actions">
              <button type="button" className="secondary-button" onClick={() => { createMaterial.reset(); setMaterialDialogOpen(false); }}>Cancel</button>
              <button type="submit" disabled={createMaterial.isPending}>{createMaterial.isPending ? 'Creating…' : 'Create material'}</button>
            </div>
          </form>
        </MaterialModal>
      )}


      {materialPendingDeletion && props.canManage && (
        <MaterialDeleteModal onClose={() => { deleteMaterialMutation.reset(); setMaterialPendingDeletion(null); }}>
          <p>Delete <strong>{materialPendingDeletion.code} · {materialPendingDeletion.name}</strong>?</p>
          <p className="muted">Only an unused material master can be deleted. Materials already referenced by Procurement, Goods Receipts, stock movements, or Material Issues are protected and will not be removed.</p>
          {deleteMaterialMutation.error instanceof Error && <div className="form-error" role="alert">{deleteMaterialMutation.error.message}</div>}
          <div className="client-modal-actions">
            <button type="button" className="secondary-button" disabled={deleteMaterialMutation.isPending} onClick={() => { deleteMaterialMutation.reset(); setMaterialPendingDeletion(null); }}>Cancel</button>
            <button type="button" className="danger-button" disabled={deleteMaterialMutation.isPending} onClick={() => void confirmDeleteMaterial()}>{deleteMaterialMutation.isPending ? 'Deleting…' : 'Delete material'}</button>
          </div>
        </MaterialDeleteModal>
      )}
    </div>
  );
}

/** Render one accessible Material create modal using the established admin modal styling. */
function MaterialModal(props: Readonly<{ onClose: () => void; children: ReactNode }>) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') props.onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [props.onClose]);

  return (
    <div className="client-modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section className="client-modal client-modal-wide" role="dialog" aria-modal="true" aria-labelledby="material-create-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="client-modal-header">
          <div><p className="eyebrow">Inventory material</p><h2 id="material-create-modal-title">Add material</h2></div>
          <button type="button" className="client-modal-close" onClick={props.onClose} aria-label="Close Add material"><span aria-hidden="true">×</span></button>
        </header>
        <div className="client-modal-body">{props.children}</div>
      </section>
    </div>
  );
}


/** Render one focused confirmation dialog for permanent Material deletion. */
function MaterialDeleteModal(props: Readonly<{ onClose: () => void; children: ReactNode }>) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') props.onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [props.onClose]);

  return (
    <div className="client-modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section className="client-modal" role="dialog" aria-modal="true" aria-labelledby="material-delete-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="client-modal-header">
          <div><p className="eyebrow">Inventory material</p><h2 id="material-delete-modal-title">Delete material</h2></div>
          <button type="button" className="client-modal-close" onClick={props.onClose} aria-label="Close Delete material"><span aria-hidden="true">×</span></button>
        </header>
        <div className="client-modal-body">{props.children}</div>
      </section>
    </div>
  );
}
