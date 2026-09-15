import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routesSource = await readFile('apps/api/src/modules/administration/administration.routes.ts', 'utf8');
const serviceSource = await readFile('apps/api/src/modules/administration/administration.service.ts', 'utf8');
const repositorySource = await readFile('apps/api/src/modules/administration/administration.repository.ts', 'utf8');
const schemaSource = await readFile('apps/api/src/modules/administration/administration.schema.ts', 'utf8');
const prismaSource = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migrationSource = await readFile('packages/database/prisma/migrations/20260829000600_final21_administration_alignment/migration.sql', 'utf8');
const adminApiSource = await readFile('apps/web/src/features/administration/api/admin-api.ts', 'utf8');
const authApiSource = await readFile('apps/web/src/features/administration/api/auth-api.ts', 'utf8');
const authHookSource = await readFile('apps/web/src/features/administration/hooks/auth.tsx', 'utf8');
const usersPageSource = await readFile('apps/web/src/features/administration/pages/users-page.tsx', 'utf8');
const rolesPageSource = await readFile('apps/web/src/features/administration/pages/roles-page.tsx', 'utf8');
const departmentsPageSource = await readFile('apps/web/src/features/administration/pages/departments-page.tsx', 'utf8');
const adminShellSource = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');
const appSource = await readFile('apps/api/src/app.ts', 'utf8');
const authRateLimitSource = await readFile('apps/api/src/plugins/auth-rate-limit.ts', 'utf8');
const authRefreshCookieSource = await readFile('apps/api/src/plugins/auth-refresh-cookie.ts', 'utf8');

const REQUIRED_ADMINISTRATION_ROUTES = [
  "app.post('/api/v1/auth/login'",
  "app.post('/api/v1/auth/logout'",
  "app.get('/api/v1/auth/me'",
  "app.get('/api/v1/admin/users'",
  "app.post('/api/v1/admin/users'",
  "app.patch('/api/v1/admin/users/:id'",
  "app.get('/api/v1/admin/roles'",
  "app.post('/api/v1/admin/roles'",
  "app.put('/api/v1/admin/roles/:id/permissions'",
  "app.put('/api/v1/admin/users/:id/roles'",
  "app.put('/api/v1/admin/users/:id/project-scopes'",
  "app.get('/api/v1/admin/departments'",
  "app.post('/api/v1/admin/departments'"
];

const REMOVED_LEGACY_ALIASES = [
  "app.post('/api/v1/auth/sign-in'",
  "app.post('/api/v1/auth/sign-out'",
  "app.get('/api/v1/users'",
  "app.post('/api/v1/users'",
  "app.patch('/api/v1/users/:id'",
  "app.get('/api/v1/roles'",
  "app.post('/api/v1/roles'",
  "app.put('/api/v1/roles/:id/permissions'",
  "app.put('/api/v1/users/:id/roles'"
];

const FINAL_ADMINISTRATION_PERMISSIONS = [
  'admin.users.read',
  'admin.users.manage',
  'admin.roles.read',
  'admin.roles.manage',
  'admin.project_scopes.manage',
  'admin.departments.manage'
];

/** Extract one route block from its declaration through the next route declaration. */
function routeBlock(source, routeOpening) {
  const start = source.indexOf(routeOpening);
  assert.notEqual(start, -1, `Missing route ${routeOpening}.`);
  const next = source.indexOf('\n  app.', start + routeOpening.length);
  return source.slice(start, next === -1 ? source.length : next);
}

/** Extract one method block from source by its opening marker and the next method comment. */
function methodBlock(source, methodName) {
  const start = source.indexOf(`async ${methodName}(`);
  assert.notEqual(start, -1, `Missing method ${methodName}().`);
  const next = source.indexOf('\n  /**', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test('final Administration exposes all required Module 2 routes', () => {
  for (const route of REQUIRED_ADMINISTRATION_ROUTES) {
    assert.equal(routesSource.includes(route), true, `Missing final Administration route: ${route}`);
  }
});

test('final Administration is registered from the final administration module path', () => {
  assert.match(appSource, /modules\/administration\/index\.js/);
  assert.match(appSource, /registerAdministrationRoutes/);
  assert.doesNotMatch(appSource, /users-rbac|registerUsersRbacRoutes/);
});

test('final Administration removes superseded legacy route aliases', () => {
  for (const alias of REMOVED_LEGACY_ALIASES) {
    assert.equal(routesSource.includes(alias), false, `Superseded legacy route alias is still active: ${alias}`);
  }
});

test('public authentication commands are rate-limited without changing protected session routes', () => {
  const limitedRoutes = [
    ["app.post('/api/v1/auth/login'", "authRateLimit.hook('login', AUTH_RATE_LIMITS.login)"],
    ["app.post('/api/v1/auth/refresh'", "authRateLimit.hook('refresh', AUTH_RATE_LIMITS.refresh)"],
    ["app.post('/api/v1/auth/invitations/accept'", "authRateLimit.hook('invitation-accept', AUTH_RATE_LIMITS.invitationAccept)"],
    ["app.post('/api/v1/auth/password-reset/request'", "authRateLimit.hook('password-reset-request', AUTH_RATE_LIMITS.passwordResetRequest)"],
    ["app.post('/api/v1/auth/password-reset/complete'", "authRateLimit.hook('password-reset-complete', AUTH_RATE_LIMITS.passwordResetComplete)"]
  ];

  for (const [opening, hook] of limitedRoutes) {
    const block = routeBlock(routesSource, opening);
    assert.equal(block.includes(hook), true, `Missing auth rate limit hook on ${opening}.`);
    assert.equal(block.includes('429: AUTH_RATE_LIMIT_RESPONSE'), true, `Missing 429 OpenAPI response on ${opening}.`);
  }

  assert.equal(routeBlock(routesSource, "app.post('/api/v1/auth/logout'").includes('authRateLimit.hook('), false);
  assert.equal(routeBlock(routesSource, "app.get('/api/v1/auth/me'").includes('authRateLimit.hook('), false);
  assert.match(authRateLimitSource, /request\.ip/);
  assert.match(authRateLimitSource, /RATE_LIMIT_EXCEEDED/);
  assert.match(authRateLimitSource, /Retry-After/);
  assert.match(authRateLimitSource, /MAX_TRACKED_AUTH_CLIENTS = 10_000/);
});

test('refresh credentials stay in a rotated HttpOnly cookie instead of browser-readable storage or JSON', () => {
  const loginBlock = routeBlock(routesSource, "app.post('/api/v1/auth/login'");
  const refreshBlock = routeBlock(routesSource, "app.post('/api/v1/auth/refresh'");
  const logoutBlock = routeBlock(routesSource, "app.post('/api/v1/auth/logout'");
  const authResultStart = schemaSource.indexOf('export const AUTH_RESULT_SCHEMA');
  const currentIdentityStart = schemaSource.indexOf('export const CURRENT_IDENTITY_SCHEMA', authResultStart);
  const authResultBlock = schemaSource.slice(authResultStart, currentIdentityStart);

  assert.match(loginBlock, /createRefreshTokenCookie\(refreshToken, result\.session\.expiresAt, secureRefreshCookie\)/);
  assert.match(refreshBlock, /readRefreshTokenCookie\(request\.headers\.cookie\)/);
  assert.match(refreshBlock, /createRefreshTokenCookie\(nextRefreshToken, result\.session\.expiresAt, secureRefreshCookie\)/);
  assert.doesNotMatch(refreshBlock, /clearRefreshTokenCookie\(secureRefreshCookie\)/);
  assert.match(logoutBlock, /clearRefreshTokenCookie\(secureRefreshCookie\)/);
  assert.match(schemaSource, /refreshSessionBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.doesNotMatch(authResultBlock, /refreshToken/);

  assert.match(authRefreshCookieSource, /construction-erp-refresh-token/);
  assert.match(authRefreshCookieSource, /Path=\$\{REFRESH_COOKIE_PATH\}/);
  assert.match(authRefreshCookieSource, /'HttpOnly'/);
  assert.match(authRefreshCookieSource, /'SameSite=Strict'/);
  assert.match(authRefreshCookieSource, /attributes\.push\('Secure'\)/);
  assert.match(authRefreshCookieSource, /'Max-Age=0'/);

  assert.match(appSource, /credentials: true/);
  assert.match(appSource, /secureRefreshCookie: nodeEnv === 'production'/);
  assert.match(authApiSource, /credentials: 'include'/);
  assert.match(authApiSource, /saveAccessToken\(result\.accessToken, result\.session\.accessExpiresAt\)/);
  assert.doesNotMatch(authApiSource, /readRefreshToken|sessionStorage\.getItem\(LEGACY_REFRESH_TOKEN_KEY\)|sessionStorage\.setItem\(LEGACY_REFRESH_TOKEN_KEY/);
  assert.match(authApiSource, /sessionStorage\.removeItem\(LEGACY_REFRESH_TOKEN_KEY\)/);
  assert.doesNotMatch(authApiSource, /refreshToken:\s*string/);
  assert.doesNotMatch(authApiSource, /JSON\.stringify\(\{\s*refreshToken/);
  assert.match(authHookSource, /saveAccessToken\(result\.accessToken, result\.session\.accessExpiresAt\)/);
});

test('browser authentication restores and proactively rotates active sessions without exposing the refresh token', () => {
  const refreshBlock = routeBlock(routesSource, "app.post('/api/v1/auth/refresh'");

  assert.match(authApiSource, /const ACCESS_EXPIRES_AT_KEY = 'construction-erp-access-expires-at'/);
  assert.match(authApiSource, /export function readAccessTokenExpiresAt\(\): number \| null/);
  assert.match(authApiSource, /export async function refreshStoredSession\(\): Promise<AuthSessionResult>/);
  assert.match(authApiSource, /if \(!accessToken\) \{[\s\S]*refreshStoredSession\(\)/);
  assert.match(authApiSource, /if \(!isAuthenticationFailure\(error\)\) throw error/);
  assert.match(authApiSource, /saveAccessToken\(result\.accessToken, result\.session\.accessExpiresAt\)/);
  assert.match(authApiSource, /sessionStorage\.removeItem\(ACCESS_EXPIRES_AT_KEY\)/);

  assert.match(authHookSource, /const \[hasSession, setHasSession\] = useState\(true\)/);
  assert.match(authHookSource, /const ACCESS_REFRESH_LEAD_MS = 60 \* 1000/);
  assert.match(authHookSource, /readAccessTokenExpiresAt\(\)/);
  assert.match(authHookSource, /window\.setTimeout/);
  assert.match(authHookSource, /refreshStoredSession\(\)/);
  assert.match(authHookSource, /identityFromSession\(result\)/);
  assert.match(authHookSource, /if \(identityQuery\.isError && readAccessToken\(\) === null\)/);

  // A failed/replayed refresh must not clear a newer cookie that another tab may
  // already have rotated successfully. Explicit logout remains the cookie clear.
  assert.doesNotMatch(refreshBlock, /clearRefreshTokenCookie/);
  assert.match(routeBlock(routesSource, "app.post('/api/v1/auth/logout'"), /clearRefreshTokenCookie/);
});

test('production app construction fails closed without a valid auth action token secret', () => {
  assert.match(appSource, /const nodeEnv = options\.nodeEnv \?\? 'development'/);
  assert.match(
    appSource,
    /options\.authActionTokenSecret\s*\?\? \(nodeEnv === 'production' \? '' : 'development-only-auth-action-secret-change-me'\)/
  );
  assert.match(appSource, /nodeEnv === 'production' && authActionTokenSecret\.length < 32/);
  assert.match(appSource, /authActionTokenSecret must contain at least 32 characters in production/);
  assert.match(appSource, /environment: nodeEnv/);
  assert.match(appSource, /secureRefreshCookie: nodeEnv === 'production'/);
  assert.match(appSource, /exposeDiagnostics: nodeEnv !== 'production'/);
});

test('Administration service authorizes final user, role, Department, and Project-scope commands', () => {
  const requiredChecks = [
    "this.requirePermission('admin.users.read')",
    "this.requirePermission('admin.users.manage')",
    "this.requirePermission('admin.roles.read')",
    "this.requirePermission('admin.roles.manage')",
    "this.requirePermission('admin.departments.manage')",
    "this.requirePermission('admin.project_scopes.manage')"
  ];
  for (const check of requiredChecks) {
    assert.equal(serviceSource.includes(check), true, `Missing final Administration permission check: ${check}`);
  }
});

test('Administration active permission contract uses only final admin permission names', () => {
  for (const permission of FINAL_ADMINISTRATION_PERMISSIONS) {
    assert.equal(schemaSource.includes(`'${permission}'`), true, `Missing ${permission}.`);
  }
  assert.doesNotMatch(schemaSource, /filterActivePermissionCodes|REMOVED_FINAL_21_PERMISSION_CODES/);
  assert.doesNotMatch(serviceSource, /MODULE_24A|['"]users\.read['"]|['"]roles\.manage['"]|['"]sessions\.manage['"]/);
});

test('Administration repository uses explicit Project scopes for Project access', () => {
  const projectScopeBlock = methodBlock(repositorySource, 'resolveProjectScopeForAuthentication');
  const permissionProjectBlock = methodBlock(repositorySource, 'listProjectIdsWithPermission');
  const projectPermissionBlock = methodBlock(repositorySource, 'findEffectivePermissionCodesForProject');

  assert.equal(projectScopeBlock.includes('userProjectScope'), true);
  assert.equal(permissionProjectBlock.includes('resolveProjectScopeForAuthentication'), true);
  assert.equal(projectPermissionBlock.includes('resolveProjectScopeForAuthentication'), true);
  assert.equal(repositorySource.includes("scopeType: 'PROJECT'"), false);
});

test('Administration persistence matches final users, user_roles, roles, departments, and project scopes', () => {
  assert.match(prismaSource, /passwordHash\s+String\?/);
  assert.doesNotMatch(prismaSource, /model AuthCredential\s*\{/);
  assert.match(prismaSource, /model UserRole\s*\{/);
  assert.match(prismaSource, /@@map\("user_roles"\)/);
  assert.doesNotMatch(prismaSource, /model UserRoleAssignment\s*\{/);
  assert.match(prismaSource, /model Role[\s\S]*?companyId\s+String\s+@map\("company_id"\)/);
  assert.match(prismaSource, /roles_id_company_uq/);
  assert.match(prismaSource, /departments_company_name_uq/);
  assert.match(prismaSource, /user_project_scopes_company_user_project_uq/);
});

test('Administration forward migration preserves old data while retiring legacy identity tables', () => {
  assert.match(migrationSource, /UPDATE "users"[\s\S]*"password_hash"/);
  assert.match(migrationSource, /DROP TABLE IF EXISTS "auth_credentials"/);
  assert.match(migrationSource, /CREATE TABLE "user_roles"/);
  assert.match(migrationSource, /INSERT INTO "user_project_scopes"/);
  assert.match(migrationSource, /DROP TABLE "user_role_assignments"/);
  assert.match(migrationSource, /ALTER TABLE "roles" ALTER COLUMN "company_id" SET NOT NULL/);
});

test('Administration user contract separates company roles from Project scopes including optional roleCode', () => {
  assert.equal(schemaSource.includes('roleIds:'), true);
  assert.equal(schemaSource.includes('projectScopes:'), true);
  assert.match(schemaSource, /roleCode: roleCodeSchema\.nullable\(\)\.optional\(\)/);
  assert.equal(adminApiSource.includes('roleIds: string[]'), true);
  assert.equal(adminApiSource.includes('projectScopes: UserProjectScope[]'), true);
  assert.match(adminApiSource, /JSON\.stringify\(\{ projectScopes \}\)/);
});

test('Administration user PATCH uses one service command for profile and status fields', () => {
  const updateBlock = methodBlock(serviceSource, 'updateUser');
  assert.match(updateBlock, /repository\.updateUser/);
  assert.match(updateBlock, /user\.status_changed/);
  assert.match(updateBlock, /revokeAllUserSessions/);
  assert.doesNotMatch(serviceSource, /async activateUser\(|async deactivateUser\(/);
  assert.doesNotMatch(routesSource, /service\.activateUser|service\.deactivateUser/);
});

test('Administration Users UI separates role replacement from Project-scope replacement', () => {
  assert.equal(usersPageSource.includes('replaceUserRoles'), true);
  assert.equal(usersPageSource.includes('replaceUserProjectScopes'), true);
  assert.equal(usersPageSource.includes('Company roles define permissions.'), true);
  assert.equal(usersPageSource.includes('Project scopes define which Projects the user may access.'), true);
  assert.match(usersPageSource, /projectScopes/);
});

test('Administration role editor uses the server permission catalog instead of a hard-coded partial list', () => {
  assert.match(schemaSource, /availablePermissionCodes/);
  assert.match(serviceSource, /listPermissionCodes/);
  assert.match(adminApiSource, /availablePermissionCodes: string\[\]/);
  assert.match(rolesPageSource, /availablePermissionCodes/);
  assert.doesNotMatch(rolesPageSource, /ADMINISTRATION_PERMISSION_CODES/);
});

test('Administration emits the documented lifecycle events', () => {
  assert.match(serviceSource, /eventType: 'user\.created'/);
  assert.match(serviceSource, /eventType: 'user\.status_changed'/);
  assert.match(serviceSource, /eventType: 'role\.updated'/);
  assert.match(serviceSource, /eventType: 'user\.roles_changed'/);
  assert.match(serviceSource, /eventType: 'user\.project_scope_changed'/);
});

test('Administration exposes the Department master in API and React workspace', () => {
  assert.equal(adminApiSource.includes('listDepartments'), true);
  assert.equal(adminApiSource.includes('createDepartment'), true);
  assert.equal(departmentsPageSource.includes('export function DepartmentsPage()'), true);
  assert.equal(adminShellSource.includes("import { DepartmentsPage }"), true);
  assert.equal(adminShellSource.includes("setView('departments')"), true);
  assert.equal(adminShellSource.includes("activeView === 'departments'"), true);
});

test('Administration prevents tenant edits to system-role permission sets', () => {
  const block = methodBlock(serviceSource, 'replaceRolePermissions');
  assert.equal(block.includes('companyRole.isSystem'), true);
  assert.equal(block.includes("createAdministrationError('FORBIDDEN')"), true);
});
