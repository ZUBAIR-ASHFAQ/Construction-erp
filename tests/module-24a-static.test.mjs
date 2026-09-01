import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const apiPackage = JSON.parse(await readFile('apps/api/package.json', 'utf8'));
const webPackage = JSON.parse(await readFile('apps/web/package.json', 'utf8'));
const databasePackage = JSON.parse(await readFile('packages/database/package.json', 'utf8'));
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const schema = await readFile('apps/api/src/modules/administration/administration.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/administration/administration.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/administration/administration.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/administration/administration.routes.ts', 'utf8');
const authentication = await readFile('apps/api/src/plugins/authentication.ts', 'utf8');
const authNotificationWorker = await readFile('apps/api/src/workers/auth-notification.worker.ts', 'utf8');
const queueEnqueue = await readFile('packages/queue/src/enqueue.ts', 'utf8');
const apiApp = await readFile('apps/api/src/app.ts', 'utf8');
const authApi = await readFile('apps/web/src/features/administration/api/auth-api.ts', 'utf8');
const browserE2e = await readFile('tests/e2e/module-24a-browser.spec.mjs', 'utf8');
const migrationGates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));

const permissions = [
  'users.read',
  'users.create',
  'users.update',
  'users.manage',
  'roles.read',
  'roles.manage',
  'sessions.manage'
];

const stableErrors = [
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_SESSION_EXPIRED',
  'USER_NOT_FOUND',
  'DUPLICATE_USER_EMAIL',
  'ROLE_NOT_FOUND',
  'FORBIDDEN',
  'INVALID_SCOPE_ASSIGNMENT'
];

const expectedRoutes = [
  "app.post('/api/v1/auth/sign-in'",
  "app.post('/api/v1/auth/refresh'",
  "app.post('/api/v1/auth/invitations/accept'",
  "app.post('/api/v1/auth/password-reset/request'",
  "app.post('/api/v1/auth/password-reset/complete'",
  "app.post('/api/v1/auth/sign-out'",
  "app.get('/api/v1/auth/me'",
  "app.get('/api/v1/users'",
  "app.post('/api/v1/users'",
  "app.patch('/api/v1/users/:id'",
  "app.post('/api/v1/users/:id/activate'",
  "app.post('/api/v1/users/:id/deactivate'",
  "app.get('/api/v1/roles'",
  "app.post('/api/v1/roles'",
  "app.put('/api/v1/roles/:id/permissions'",
  "app.put('/api/v1/users/:id/roles'"
];

/** Verify Module 24A stays company-scoped until Module 24B activates Project membership. */
test('Module 24A persistence remains company-scoped after the Project master exists', () => {
  for (const model of ['User', 'AuthCredential', 'AuthSession', 'Role', 'Permission', 'RolePermission', 'UserRoleAssignment']) {
    assert.match(prisma, new RegExp(`model\\s+${model}\\s*\\{`));
  }
  const assignment = prisma.match(/model\s+UserRoleAssignment\s*\{[\s\S]*?\n\}/);
  assert.ok(assignment);
  assert.doesNotMatch(assignment[0], /projectId|@map\("project_id"\)|Project\s+@relation/);
  assert.match(prisma, /model\s+Project\s*\{/);
  assert.match(prisma, /scopeType\s+String\s+@default\("COMPANY"\)/);
  assert.match(prisma, /scopeId\s+String\?/);
});

/** Verify stable Module 24A permission and error contracts remain present. */
test('Module 24A keeps its stable permissions and error codes', () => {
  for (const permission of permissions) assert.ok(schema.includes(`'${permission}'`), `missing permission ${permission}`);
  for (const errorCode of stableErrors) assert.ok(schema.includes(`'${errorCode}'`), `missing error ${errorCode}`);
  assert.doesNotMatch(schema, /companyId\s*:\s*z\./);
});

/** Verify repository methods cover the current service data needs and company scoping. */
test('Module 24A repository keeps required company-scoped operations', () => {
  for (const method of [
    'findUserById', 'findUserByEmail', 'listUsers', 'createUser', 'updateUserProfile', 'setUserStatus',
    'findCredentialByUserId', 'createCredential', 'updateCredentialPassword', 'createSession',
    'findSessionByAccessTokenHash', 'rotateSession', 'revokeSession', 'revokeAllUserSessions',
    'findRoleById', 'findRoleByCode', 'listRoles', 'createCompanyRole', 'findVisibleRolesByIds',
    'findPermissionsByCodes', 'listRolePermissionCodes', 'createUserRoleAssignment', 'findEffectivePermissionCodes'
  ]) {
    assert.match(repository, new RegExp(`\\b${method}\\s*\\(`), `missing repository method ${method}`);
  }
  assert.match(repository, /companyId/);
  assert.match(repository, /scopeType:\s*'COMPANY'/);
  assert.match(repository, /scopeId:\s*null/);
});

/** Verify authentication uses separate hashed access and refresh credentials. */
test('Module 24A separates access and refresh credentials', () => {
  for (const marker of ['createAccessToken', 'createRefreshToken', 'hashAccessToken', 'hashRefreshToken']) {
    assert.match(authentication, new RegExp(`\\b${marker}\\b`));
  }
  assert.match(authentication, /scrypt/);
  assert.match(authentication, /timingSafeEqual/);
  assert.match(authentication, /findSessionForAuthenticationByAccessTokenHash/);
  assert.doesNotMatch(authentication, /findSessionForAuthenticationByRefreshTokenHash/);
});

/** Verify service logic includes lifecycle, RBAC, bootstrap, onboarding and recovery behavior. */
test('Module 24A service contains the required business operations', () => {
  for (const method of [
    'signIn', 'refreshSession', 'signOut', 'getCurrentIdentity', 'listUsers', 'createUser', 'updateUser',
    'activateUser', 'deactivateUser', 'listRoles', 'createRole', 'replaceRolePermissions', 'replaceUserRoles',
    'acceptInvitation', 'requestPasswordReset', 'completePasswordReset'
  ]) {
    assert.match(service, new RegExp(`\\b${method}\\s*\\(`), `missing service method ${method}`);
  }
  assert.match(service, /MODULE_24A_PERMISSION_CODES/);
  for (const eventType of ['user.created', 'user.activated', 'user.deactivated', 'user.roles_changed', 'auth.session_revoked']) {
    assert.ok(service.includes(eventType), `missing event ${eventType}`);
  }
  assert.match(service, /recordAudit/);
  assert.match(service, /recordOutboxEvent/);
  assert.match(service, /input\.permissionCodes\.some\(\(code\) => !hasPermission\(code\)\)/);
  assert.match(service, /role\.rolePermissions\.some\(\(row\) => !hasPermission\(row\.permission\.code\)\)/);
});

/** Verify invitation/reset delivery is durable and signed only inside the worker. */
test('Module 24A queues asynchronous authentication notifications safely', () => {
  assert.match(service, /enqueueInvitationDelivery/);
  assert.match(service, /enqueuePasswordResetDelivery/);
  assert.match(service, /queueName:\s*AUTH_NOTIFICATION_QUEUE/);
  assert.match(service, /jobType:\s*AUTH_INVITATION_JOB/);
  assert.match(service, /jobType:\s*AUTH_PASSWORD_RESET_JOB/);
  assert.match(queueEnqueue, /enqueueUnauthenticatedJob/);
  assert.match(queueEnqueue, /actorUserId:\s*null/);
  assert.doesNotMatch(service, /createAuthActionToken/);

  assert.match(authNotificationWorker, /createAuthActionToken/);
  assert.match(authNotificationWorker, /authActionNonce !== payload\.actionNonce/);
  assert.match(authNotificationWorker, /authActionExpiresAt <= now/);
  assert.match(authNotificationWorker, /idempotency-key/);
  assert.match(authNotificationWorker, /AUTH_NOTIFICATION_WEBHOOK_URL must use https:\/\//);
  assert.doesNotMatch(authNotificationWorker, /console\.(?:info|error)\([^)]*(?:token|actionUrl)/);
});

/** Keep legacy Module 24A routes available while final Module 2 routes are introduced incrementally. */
test('Module 24A legacy route aliases remain available during Administration alignment', () => {
  for (const route of expectedRoutes) assert.ok(routes.includes(route), `missing legacy route ${route}`);
  assert.ok((routes.match(/app\.(?:get|post|put|patch|delete)\('/g) ?? []).length >= expectedRoutes.length);
  assert.doesNotMatch(routes, /app\.delete\('/);
});

/** Verify OpenAPI and module registration stay on the approved Fastify stack. */
test('Module 24A remains registered with Fastify OpenAPI', () => {
  assert.equal(apiPackage.dependencies['@fastify/swagger'], '^9.0.0');
  assert.match(apiApp, /app\.register\(swagger,/);
  assert.match(apiApp, /app\.get\('\/openapi\.json'/);
  assert.match(apiApp, /registerAdministrationRoutes/);
});

/** Verify the React feature uses the approved form/query stack and real onboarding APIs. */
test('Module 24A React feature uses the approved frontend stack', () => {
  for (const dependency of ['@tanstack/react-query', '@hookform/resolvers', 'react-hook-form', 'zod']) {
    assert.ok(webPackage.dependencies[dependency], `missing web dependency ${dependency}`);
  }
  assert.match(authApi, /refreshToken/);
  assert.match(authApi, /password-reset/);
  assert.match(authApi, /invitations\/accept/);
  assert.doesNotMatch(browserE2e, /authCredential\.create/);
});

/** Verify Stage 1 owns only its three reviewed Module 24A migrations. */
test('Module 24A keeps the reviewed Stage 1 migration gates', () => {
  const stage1 = migrationGates.gates.filter((gate) => gate.stage === 1);
  assert.deepEqual(stage1.map((gate) => gate.gate), [
    'module-24a-users-rbac-core-persistence',
    'module-24a-access-session-security',
    'module-24a-invitation-recovery'
  ]);
  assert.equal(stage1.flatMap((gate) => gate.migrations).length, 3);
});

/** Verify the monorepo still uses the required Construction ERP technology stack. */
test('required stack and monorepo shape stay unchanged', () => {
  assert.deepEqual(rootPackage.workspaces, ['apps/*', 'packages/*']);
  assert.equal(apiPackage.dependencies.fastify, '^5.0.0');
  assert.ok(databasePackage.dependencies['@prisma/client']);
  assert.equal(webPackage.dependencies.react, '^19.0.0');
  assert.equal(webPackage.devDependencies.vite, '^7.0.0');
});
