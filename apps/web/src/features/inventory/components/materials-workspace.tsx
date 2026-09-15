import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useProjects } from '../../projects/hooks/projects.js';
import { useCreateMaterial, useMaterials } from '../hooks/inventory.js';

type MaterialsWorkspaceProps = Readonly<{
  canRead: boolean;
  canManage: boolean;
}>;

/** Render the Project-owned Material create form and permission-scoped master list. */
export function MaterialsWorkspace(props: MaterialsWorkspaceProps) {
  const projects = useProjects({ page: 1, pageSize: 100 }, props.canRead || props.canManage);
  const projectItems = projects.data?.items ?? [];
  const [projectId, setProjectId] = useState('');
  const materials = useMaterials(projectId || undefined, props.canRead);
  const createMaterial = useCreateMaterial();
  const projectNames = useMemo(() => new Map(projectItems.map((project) => [project.id, `${project.projectCode} · ${project.name}`])), [projectItems]);

  useEffect(() => {
    if (projectId || projectItems.length !== 1) return;
    setProjectId(projectItems[0]?.id ?? '');
  }, [projectId, projectItems]);

  /** Submit one new Material owned by the selected Project. */
  function submitMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId) return;
    const form = new FormData(event.currentTarget);
    createMaterial.mutate({
      projectId,
      code: String(form.get('code') ?? ''),
      name: String(form.get('name') ?? ''),
      unit: String(form.get('unit') ?? ''),
      category: String(form.get('category') ?? '') || null
    });
    event.currentTarget.reset();
  }

  return (
    <div className="admin-stack">
      <section className="admin-card">
        <h2>Project material scope</h2>
        <label>Project
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">{projectItems.length === 1 ? 'Assigned project' : 'All visible projects'}</option>
            {projectItems.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.name}</option>)}
          </select>
        </label>
        {!projectId && props.canManage ? <p className="muted">Select a Project before creating a Material.</p> : null}
      </section>

      {props.canManage && (
        <section className="admin-card">
          <h2>Add material</h2>
          <form className="form-grid" onSubmit={submitMaterial}>
            <label>Code<input name="code" required /></label>
            <label>Name<input name="name" required /></label>
            <label>Unit<input name="unit" required placeholder="KG, BAG, PCS" /></label>
            <label>Category<input name="category" /></label>
            <button type="submit" disabled={createMaterial.isPending || !projectId}>Create material</button>
          </form>
        </section>
      )}

      {props.canRead && (
        <section className="admin-card">
          <h2>Material master <small className="muted">({materials.data?.total ?? 0} material(s))</small></h2>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Project</th><th>Code</th><th>Name</th><th>Unit</th><th>Category</th><th>Status</th></tr></thead>
              <tbody>
                {(materials.data?.items ?? []).map((material) => (
                  <tr key={material.id}>
                    <td>{material.projectId ? projectNames.get(material.projectId) ?? 'Project' : 'Legacy company material'}</td>
                    <td>{material.code}</td>
                    <td>{material.name}<br /><small>{material.id}</small></td>
                    <td>{material.unit}</td>
                    <td>{material.category ?? '—'}</td>
                    <td>{material.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
