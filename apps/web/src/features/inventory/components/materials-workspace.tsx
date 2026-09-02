import { type FormEvent } from 'react';
import { useCreateMaterial, useMaterials } from '../hooks/inventory.js';

type MaterialsWorkspaceProps = Readonly<{
  canRead: boolean;
  canManage: boolean;
}>;

/** Render the Company Material master create form and readable master list. */
export function MaterialsWorkspace(props: MaterialsWorkspaceProps) {
  const materials = useMaterials(props.canRead);
  const createMaterial = useCreateMaterial();

  /** Submit one new Company Material through the existing Inventory material API. */
  function submitMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createMaterial.mutate({
      code: String(form.get('code') ?? ''),
      name: String(form.get('name') ?? ''),
      unit: String(form.get('unit') ?? ''),
      category: String(form.get('category') ?? '') || null
    });
    event.currentTarget.reset();
  }

  return (
    <div className="admin-stack">
      {props.canManage && (
        <section className="admin-card">
          <h2>Add material</h2>
          <form className="form-grid" onSubmit={submitMaterial}>
            <label>Code<input name="code" required /></label>
            <label>Name<input name="name" required /></label>
            <label>Unit<input name="unit" required placeholder="KG, BAG, PCS" /></label>
            <label>Category<input name="category" /></label>
            <button type="submit" disabled={createMaterial.isPending}>Create material</button>
          </form>
        </section>
      )}

      {props.canRead && (
        <section className="admin-card">
          <h2>Material master <small className="muted">({materials.data?.total ?? 0} material(s))</small></h2>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Code</th><th>Name</th><th>Unit</th><th>Category</th><th>Status</th></tr></thead>
              <tbody>
                {(materials.data?.items ?? []).map((material) => (
                  <tr key={material.id}>
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
