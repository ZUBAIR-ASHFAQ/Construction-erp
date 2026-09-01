import { authenticatedRequest, type AdministrationUser } from './auth-api.js';


export type AdminUser = AdministrationUser & Readonly<{
  roleIds: string[];
  projectScopes: UserProjectScope[];
}>;

export type AdminRole = Readonly<{
  id: string;
  companyId: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  permissionCodes: string[];
}>;

export type CreatedRole = Omit<AdminRole, 'permissionCodes'>;

export type PageResult<T> = Readonly<{
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}>;

export type RolesPageResult = PageResult<AdminRole> & Readonly<{
  availablePermissionCodes: string[];
}>;

export type CreateUserInput = Readonly<{
  email: string;
  phone?: string | null;
  name: string;
}>;

export type UpdateUserInput = Readonly<{
  email?: string;
  phone?: string | null;
  name?: string;
  status?: 'ACTIVE' | 'INACTIVE';
}>;

export type CreateRoleInput = Readonly<{
  code: string;
  name: string;
  description?: string | null;
}>;

export type UserProjectScope = Readonly<{
  id: string;
  projectId: string;
  roleCode: string | null;
  status: string;
}>;

export type Department = Readonly<{
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}>;

export type OrganizationProfile = Readonly<{
  id: string;
  legalName: string;
  displayName: string;
  status: string;
  baseCurrency: string;
  timeZone: string;
  locale: string;
  fiscalSettings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}>;

export type UpdateOrganizationProfileInput = Readonly<{
  legalName?: string;
  displayName?: string;
  timeZone?: string;
  locale?: string;
}>;

/** Load the authenticated company's Organization Profile. */
export function getOrganizationProfile(): Promise<OrganizationProfile> {
  return authenticatedRequest<OrganizationProfile>('admin/organization-profile');
}

/** Update only the Organization Profile fields owned by this Administration surface. */
export function updateOrganizationProfile(input: UpdateOrganizationProfileInput): Promise<OrganizationProfile> {
  return authenticatedRequest<OrganizationProfile>('admin/organization-profile', {
    method: 'PATCH',
    body: JSON.stringify(input)
  });
}

/** Load one server-paginated page of users with company roles and explicit Project scopes. */
export function listUsers(input: Readonly<{ search?: string; page: number; pageSize?: number }>): Promise<PageResult<AdminUser>> {
  const query = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize ?? 20)
  });
  if (input.search) query.set('search', input.search);
  return authenticatedRequest<PageResult<AdminUser>>(`admin/users?${query.toString()}`);
}

/** Create one inactive user in the authenticated company. */
export function createUser(input: CreateUserInput): Promise<AdministrationUser> {
  return authenticatedRequest<AdministrationUser>('admin/users', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

/** Update the approved editable profile fields for one company user. */
export function updateUser(userId: string, input: UpdateUserInput): Promise<AdministrationUser> {
  return authenticatedRequest<AdministrationUser>(`admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(input)
  });
}

/** Load one server-paginated page of visible roles with their current permission codes. */
export function listRoles(page = 1, pageSize = 100): Promise<RolesPageResult> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return authenticatedRequest<RolesPageResult>(`admin/roles?${query.toString()}`);
}

/** Create one company-owned role. */
export function createRole(input: CreateRoleInput): Promise<CreatedRole> {
  return authenticatedRequest<CreatedRole>('admin/roles', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

/** Replace the full permission set for one company-owned role. */
export function replaceRolePermissions(roleId: string, permissionCodes: readonly string[]): Promise<string[]> {
  return authenticatedRequest<string[]>(`admin/roles/${roleId}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissionCodes })
  });
}

/** Replace the final Administration company-level role set for one user. */
export function replaceUserRoles(userId: string, roleIds: readonly string[]): Promise<string[]> {
  return authenticatedRequest<string[]>(`admin/users/${userId}/roles`, {
    method: 'PUT',
    body: JSON.stringify({ roleIds })
  });
}


/** Replace the explicit final Administration Project access set for one user. */
export function replaceUserProjectScopes(
  userId: string,
  projectScopes: readonly Readonly<{ projectId: string; roleCode?: string | null }>[]
): Promise<UserProjectScope[]> {
  return authenticatedRequest<UserProjectScope[]>(`admin/users/${userId}/project-scopes`, {
    method: 'PUT',
    body: JSON.stringify({ projectScopes })
  });
}

/** Load one bounded page of company Departments. */
export function listDepartments(page = 1, pageSize = 100): Promise<PageResult<Department>> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return authenticatedRequest<PageResult<Department>>(`admin/departments?${query.toString()}`);
}

/** Create one active company Department. */
export function createDepartment(name: string): Promise<Department> {
  return authenticatedRequest<Department>('admin/departments', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
}
