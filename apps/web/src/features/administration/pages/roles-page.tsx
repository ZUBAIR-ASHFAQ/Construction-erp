import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { usePermission } from '../hooks/auth.js';
import {
  createRole,
  listRoles,
  replaceRolePermissions,
  type AdminRole
} from '../api/admin-api.js';

const createRoleSchema = z.object({
  code: z.string().trim().min(1, 'Code is required.').max(100),
  name: z.string().trim().min(1, 'Name is required.').max(160),
  description: z.string().trim().max(500).optional()
});

const permissionsSchema = z.object({
  permissionCodes: z.array(z.string().trim().min(1)).default([])
});

type CreateRoleValues = z.infer<typeof createRoleSchema>;
type PermissionValues = z.infer<typeof permissionsSchema>;

/** Show visible roles, role creation, and the Administration permission matrix. */
export function RolesPage() {
  const queryClient = useQueryClient();
  const canManage = usePermission('admin.roles.manage');
  const [page, setPage] = useState(1);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  const rolesQuery = useQuery({
    queryKey: ['administration', 'roles', 'admin-page', page],
    // Keep role browsing server-paginated instead of loading an unbounded table.
    queryFn: () => listRoles(page, 20)
  });

  const createForm = useForm<CreateRoleValues>({
    resolver: zodResolver(createRoleSchema),
    defaultValues: { code: '', name: '', description: '' }
  });

  const createMutation = useMutation({
    // Create only company roles; system-role creation remains server controlled.
    mutationFn: createRole,
    // Reload the role list after a successful create so permissionCodes come from the server.
    onSuccess: async (role) => {
      createForm.reset();
      setSelectedRoleId(role.id);
      await queryClient.invalidateQueries({ queryKey: ['administration', 'roles'] });
    }
  });

  const roles = rolesQuery.data?.items ?? [];
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null;
  const pageCount = rolesQuery.data ? Math.max(1, Math.ceil(rolesQuery.data.total / rolesQuery.data.pageSize)) : 1;

  /** Create one company-owned role from the validated form. */
  async function handleCreate(values: CreateRoleValues): Promise<void> {
    await createMutation.mutateAsync({
      code: values.code,
      name: values.name,
      description: values.description ? values.description : null
    });
  }

  /** Select one visible role for permission review or editing. */
  function selectRole(roleId: string): void {
    setSelectedRoleId(roleId);
  }

  /** Refresh role data after permission replacement. */
  async function handlePermissionsSaved(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['administration', 'roles'] });
  }

  return (
    <section className="admin-stack" aria-labelledby="roles-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Module 2</p>
          <h1 id="roles-title">Roles & permissions</h1>
          <p className="muted">Manage company roles and Administration permission codes.</p>
        </div>
      </div>

      <section className="admin-card">
        {rolesQuery.isPending && <p>Loading roles…</p>}
        {rolesQuery.error instanceof Error && <div className="form-error" role="alert">{rolesQuery.error.message}</div>}

        {rolesQuery.data && (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Role</th><th>Type</th><th>Permissions</th><th>Action</th></tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id}>
                    <td><strong>{role.name}</strong><span>{role.code}</span></td>
                    <td>{role.isSystem ? 'System' : 'Company'}</td>
                    <td>{role.permissionCodes.length}</td>
                    <td><button type="button" className="link-button" onClick={() => selectRole(role.id)}>View permissions</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="pagination-row">
          <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
          <span>Page {page} of {pageCount}</span>
          <button type="button" className="secondary-button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
        </div>
      </section>

      {canManage && (
        <section className="admin-card">
          <h2>Create role</h2>
          <form className="admin-form" onSubmit={createForm.handleSubmit(handleCreate)} noValidate>
            <label>Code<input {...createForm.register('code')} /></label>
            {createForm.formState.errors.code && <span className="field-error">{createForm.formState.errors.code.message}</span>}
            <label>Name<input {...createForm.register('name')} /></label>
            {createForm.formState.errors.name && <span className="field-error">{createForm.formState.errors.name.message}</span>}
            <label>Description<textarea rows={3} {...createForm.register('description')} /></label>
            {createForm.formState.errors.description && <span className="field-error">{createForm.formState.errors.description.message}</span>}
            {createMutation.error instanceof Error && <div className="form-error" role="alert">{createMutation.error.message}</div>}
            <button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Creating…' : 'Create role'}</button>
          </form>
        </section>
      )}

      {selectedRole && (
        <RolePermissionEditor
          key={`${selectedRole.id}-${selectedRole.updatedAt}`}
          role={selectedRole}
          availablePermissionCodes={rolesQuery.data?.availablePermissionCodes ?? []}
          canManage={canManage}
          onSaved={handlePermissionsSaved}
        />
      )}
    </section>
  );
}

/** Render the complete server-allowed permission matrix for one selected role. */
function RolePermissionEditor(props: Readonly<{
  role: AdminRole;
  availablePermissionCodes: readonly string[];
  canManage: boolean;
  onSaved: () => Promise<void>;
}>) {
  const form = useForm<PermissionValues>({
    resolver: zodResolver(permissionsSchema),
    defaultValues: { permissionCodes: props.role.permissionCodes }
  });

  const mutation = useMutation({
    // Replace the complete permission set only for company-owned roles.
    mutationFn: (values: PermissionValues) => replaceRolePermissions(props.role.id, values.permissionCodes),
    // Reload role data after the API confirms the replacement.
    onSuccess: props.onSaved
  });

  /** Save the complete validated permission set returned by the server catalog. */
  async function handleSave(values: PermissionValues): Promise<void> {
    await mutation.mutateAsync(values);
  }

  return (
    <section className="admin-card" aria-labelledby="permission-title">
      <h2 id="permission-title">Permissions for {props.role.name}</h2>
      {props.role.isSystem && <p className="muted">System roles are visible for review but cannot be changed by a tenant administrator.</p>}
      <form className="admin-form" onSubmit={form.handleSubmit(handleSave)}>
        <div className="checkbox-grid permission-grid">
          {props.availablePermissionCodes.map((permission) => (
            <label key={permission} className="checkbox-row">
              <input type="checkbox" value={permission} disabled={!props.canManage || props.role.isSystem} {...form.register('permissionCodes')} />
              <span>{permission}</span>
            </label>
          ))}
        </div>
        {props.availablePermissionCodes.length === 0 && <p className="muted">No assignable permissions are available.</p>}
        {mutation.error instanceof Error && <div className="form-error" role="alert">{mutation.error.message}</div>}
        {props.canManage && !props.role.isSystem && (
          <button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Replace permission set'}</button>
        )}
      </form>
    </section>
  );
}
