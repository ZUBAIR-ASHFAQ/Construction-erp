import { useState, type FormEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { listProjects } from '../../projects/api/projects-api.js';
import { usePermission } from '../hooks/auth.js';
import {
  createUser,
  listRoles,
  listUsers,
  replaceUserProjectScopes,
  replaceUserRoles,
  updateUser,
  type AdminRole,
  type AdminUser
} from '../api/admin-api.js';

const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200),
  email: z.string().trim().email('Enter a valid email address.'),
  phone: z.string().trim().max(50).optional()
});

const editUserSchema = createUserSchema;

type CreateUserValues = z.infer<typeof createUserSchema>;
type EditUserValues = z.infer<typeof editUserSchema>;

/** Show company users and the final Administration actions. */
export function UsersPage() {
  const queryClient = useQueryClient();
  const canReadUsers = usePermission('admin.users.read');
  const canManageUsers = usePermission('admin.users.manage');
  const canReadRoles = usePermission('admin.roles.read');
  const canManageProjectScopes = usePermission('admin.project_scopes.manage');
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [panel, setPanel] = useState<'edit' | 'access' | null>(null);

  const usersQuery = useQuery({
    queryKey: ['administration', 'users', search, page],
    queryFn: () => listUsers({ ...(search ? { search } : {}), page }),
    enabled: canReadUsers
  });

  const rolesQuery = useQuery({
    queryKey: ['administration', 'roles', 'user-options'],
    queryFn: () => listRoles(1, 100),
    enabled: canReadRoles
  });

  const createForm = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: '', email: '', phone: '' }
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: async () => {
      createForm.reset();
      await queryClient.invalidateQueries({ queryKey: ['administration', 'users'] });
    }
  });

  const statusMutation = useMutation({
    mutationFn: (input: Readonly<{ userId: string; activate: boolean }>) =>
      updateUser(input.userId, { status: input.activate ? 'ACTIVE' : 'INACTIVE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['administration', 'users'] });
    }
  });

  const users = usersQuery.data?.items ?? [];
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  const roles = rolesQuery.data?.items ?? [];
  const pageCount = usersQuery.data ? Math.max(1, Math.ceil(usersQuery.data.total / usersQuery.data.pageSize)) : 1;

  /** Apply the typed search text and restart pagination from page one. */
  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSearch(searchText.trim());
    setPage(1);
  }

  /** Create one invited user from the validated form values. */
  async function handleCreate(values: CreateUserValues): Promise<void> {
    await createMutation.mutateAsync({
      name: values.name,
      email: values.email,
      phone: values.phone ? values.phone : null
    });
  }

  /** Open one requested user administration panel. */
  function openPanel(userId: string, nextPanel: 'edit' | 'access'): void {
    setSelectedUserId(userId);
    setPanel(nextPanel);
  }

  /** Close the selected user administration panel. */
  function closePanel(): void {
    setSelectedUserId(null);
    setPanel(null);
  }

  /** Refresh users after a profile or access change has been saved. */
  async function refreshUsers(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['administration', 'users'] });
  }

  /** Refresh users and close the edit panel after a profile save. */
  async function handleUserSaved(): Promise<void> {
    await refreshUsers();
    closePanel();
  }

  /** Ask the API to activate or deactivate one company user. */
  function changeStatus(user: AdminUser): void {
    void statusMutation.mutateAsync({ userId: user.id, activate: user.status !== 'ACTIVE' });
  }

  return (
    <section className="admin-stack" aria-labelledby="users-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Module 2 · Administration</p>
          <h1 id="users-title">Users</h1>
          <p className="muted">Manage company users, company roles, and explicit Project access as separate responsibilities.</p>
        </div>
      </div>

      <section className="admin-card">
        <form className="search-row" onSubmit={handleSearch}>
          <label>
            Search users
            <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Name or email" />
          </label>
          <button type="submit" className="secondary-button">Search</button>
        </form>

        {usersQuery.isPending && <p>Loading users…</p>}
        {usersQuery.error instanceof Error && <div className="form-error" role="alert">{usersQuery.error.message}</div>}

        {usersQuery.data && (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Status</th>
                  <th>Roles</th>
                  <th>Project access</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name}</strong><span>{user.email}</span>
                      <small className="muted">Company {user.companyId} · Last login {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'} · Created {new Date(user.createdAt).toLocaleString()} · Updated {new Date(user.updatedAt).toLocaleString()}</small>
                    </td>
                    <td>{user.status}</td>
                    <td>{roleNames(user, roles)}</td>
                    <td>{user.projectScopes.length}</td>
                    <td>
                      <div className="action-row">
                        {canManageUsers && <button type="button" className="link-button" onClick={() => openPanel(user.id, 'edit')}>Edit</button>}
                        {((canManageUsers && canReadRoles) || canManageProjectScopes) && <button type="button" className="link-button" onClick={() => openPanel(user.id, 'access')}>Manage access</button>}
                        {canManageUsers && (
                          <button type="button" className="link-button" onClick={() => changeStatus(user)} disabled={statusMutation.isPending}>
                            {user.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {usersQuery.data && users.length === 0 && <p className="muted">No users found.</p>}
        {statusMutation.error instanceof Error && <div className="form-error" role="alert">{statusMutation.error.message}</div>}

        <div className="pagination-row">
          <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
          <span>Page {page} of {pageCount}</span>
          <button type="button" className="secondary-button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
        </div>
      </section>

      {canManageUsers && (
        <section className="admin-card">
          <h2>Create user</h2>
          <p className="muted">New users stay inactive until they accept the invitation and set their first password.</p>
          <form className="admin-form" onSubmit={createForm.handleSubmit(handleCreate)} noValidate>
            <label>Name<input {...createForm.register('name')} /></label>
            {createForm.formState.errors.name && <span className="field-error">{createForm.formState.errors.name.message}</span>}
            <label>Email<input type="email" {...createForm.register('email')} /></label>
            {createForm.formState.errors.email && <span className="field-error">{createForm.formState.errors.email.message}</span>}
            <label>Phone<input {...createForm.register('phone')} /></label>
            {createForm.formState.errors.phone && <span className="field-error">{createForm.formState.errors.phone.message}</span>}
            {createMutation.error instanceof Error && <div className="form-error" role="alert">{createMutation.error.message}</div>}
            <button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Creating…' : 'Create user'}</button>
          </form>
        </section>
      )}

      {selectedUser && panel === 'edit' && canManageUsers && (
        <EditUserForm key={selectedUser.id} user={selectedUser} onSaved={handleUserSaved} onCancel={closePanel} />
      )}

      {selectedUser && panel === 'access' && ((canManageUsers && canReadRoles) || canManageProjectScopes) && (
        <UserAccessForm
          key={`access-${selectedUser.id}`}
          user={selectedUser}
          roles={roles}
          canManageRoles={canManageUsers && canReadRoles}
          canManageProjectScopes={canManageProjectScopes}
          onSaved={refreshUsers}
          onCancel={closePanel}
        />
      )}
    </section>
  );
}

/** Render the editable profile fields for one selected user. */
function EditUserForm(props: Readonly<{ user: AdminUser; onSaved: () => Promise<void>; onCancel: () => void }>) {
  const form = useForm<EditUserValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      name: props.user.name,
      email: props.user.email,
      phone: props.user.phone ?? ''
    }
  });

  const mutation = useMutation({
    mutationFn: (values: EditUserValues) => updateUser(props.user.id, {
      name: values.name,
      email: values.email,
      phone: values.phone ? values.phone : null
    }),
    onSuccess: props.onSaved
  });

  /** Submit the validated edit form to the Administration user update command. */
  async function handleSave(values: EditUserValues): Promise<void> {
    await mutation.mutateAsync(values);
  }

  return (
    <section className="admin-card" aria-labelledby="edit-user-title">
      <h2 id="edit-user-title">Edit {props.user.name}</h2>
      <form className="admin-form" onSubmit={form.handleSubmit(handleSave)} noValidate>
        <label>Name<input {...form.register('name')} /></label>
        {form.formState.errors.name && <span className="field-error">{form.formState.errors.name.message}</span>}
        <label>Email<input type="email" {...form.register('email')} /></label>
        {form.formState.errors.email && <span className="field-error">{form.formState.errors.email.message}</span>}
        <label>Phone<input {...form.register('phone')} /></label>
        {form.formState.errors.phone && <span className="field-error">{form.formState.errors.phone.message}</span>}
        {mutation.error instanceof Error && <div className="form-error" role="alert">{mutation.error.message}</div>}
        <div className="action-row">
          <button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save changes'}</button>
          <button type="button" className="secondary-button" onClick={props.onCancel}>Cancel</button>
        </div>
      </form>
    </section>
  );
}

type UserAccessFormProps = Readonly<{
  user: AdminUser;
  roles: readonly AdminRole[];
  canManageRoles: boolean;
  canManageProjectScopes: boolean;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}>;

/** Render separate company-role and Project-scope controls for one user. */
function UserAccessForm(props: UserAccessFormProps) {
  const [roleIds, setRoleIds] = useState<string[]>(props.user.roleIds);
  const [projectScopes, setProjectScopes] = useState(props.user.projectScopes.map((scope) => ({ projectId: scope.projectId, roleCode: scope.roleCode })));
  const projectsQuery = useQuery({
    queryKey: ['administration', 'projects', 'scope-options'],
    queryFn: () => listProjects({ page: 1, pageSize: 100 }),
    enabled: props.canManageProjectScopes
  });

  const rolesMutation = useMutation({
    mutationFn: () => replaceUserRoles(props.user.id, roleIds),
    onSuccess: props.onSaved
  });
  const scopesMutation = useMutation({
    mutationFn: () => replaceUserProjectScopes(props.user.id, projectScopes),
    onSuccess: props.onSaved
  });

  /** Toggle one role ID in the complete company-role replacement set. */
  function toggleRole(roleId: string): void {
    setRoleIds((current) => current.includes(roleId)
      ? current.filter((id) => id !== roleId)
      : [...current, roleId].sort());
  }

  /** Toggle one Project ID in the complete explicit Project-scope replacement set. */
  function toggleProject(projectId: string): void {
    setProjectScopes((current) => current.some((scope) => scope.projectId === projectId)
      ? current.filter((scope) => scope.projectId !== projectId)
      : [...current, { projectId, roleCode: null }].sort((left, right) => left.projectId.localeCompare(right.projectId)));
  }

  return (
    <section className="admin-card" aria-labelledby="user-access-title">
      <p className="eyebrow">Module 2 · Administration</p>
      <h2 id="user-access-title">Access for {props.user.name}</h2>
      <p className="muted">Company roles define permissions. Project scopes define which Projects the user may access. They are saved separately so the two responsibilities are not mixed.</p>

      {props.canManageRoles && (
        <fieldset className="admin-form">
          <legend>Company roles</legend>
          {props.roles.map((role) => (
            <label className="checkbox-row" key={role.id}>
              <input type="checkbox" checked={roleIds.includes(role.id)} onChange={() => toggleRole(role.id)} />
              <span>{role.name} ({role.code})</span>
            </label>
          ))}
          {props.roles.length === 0 && <p className="muted">No assignable roles are available.</p>}
          {rolesMutation.error instanceof Error && <div className="form-error" role="alert">{rolesMutation.error.message}</div>}
          <button type="button" onClick={() => rolesMutation.mutate()} disabled={rolesMutation.isPending}>
            {rolesMutation.isPending ? 'Saving roles…' : 'Save company roles'}
          </button>
        </fieldset>
      )}

      {props.canManageProjectScopes && (
        <fieldset className="admin-form">
          <legend>Project access</legend>
          {projectsQuery.isPending && <p>Loading Projects…</p>}
          {(projectsQuery.data?.items ?? []).map((project) => (
            <label className="checkbox-row" key={project.id}>
              <input type="checkbox" checked={projectScopes.some((scope) => scope.projectId === project.id)} onChange={() => toggleProject(project.id)} />
              <span>{project.projectCode} · {project.name}</span>
            </label>
          ))}
          {projectsQuery.error instanceof Error && <div className="form-error" role="alert">{projectsQuery.error.message}</div>}
          {scopesMutation.error instanceof Error && <div className="form-error" role="alert">{scopesMutation.error.message}</div>}
          <button type="button" onClick={() => scopesMutation.mutate()} disabled={scopesMutation.isPending || projectsQuery.isPending}>
            {scopesMutation.isPending ? 'Saving Project access…' : 'Save Project access'}
          </button>
        </fieldset>
      )}

      <div className="action-row">
        <button type="button" className="secondary-button" onClick={props.onCancel}>Close</button>
      </div>
    </section>
  );
}

/** Convert a user's current role IDs into readable names for the table. */
function roleNames(user: AdminUser, roles: readonly AdminRole[]): string {
  if (user.roleIds.length === 0) return 'None';
  if (roles.length === 0) return `${user.roleIds.length} assigned`;

  return user.roleIds.map((roleId) => {
    const role = roles.find((item) => item.id === roleId);
    return role?.name ?? 'Assigned role';
  }).join(', ');
}
