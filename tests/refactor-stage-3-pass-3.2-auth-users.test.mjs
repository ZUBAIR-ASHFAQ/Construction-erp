import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('apps/api/src/modules/administration/administration.schema.ts', 'utf8');
const service = await readFile('apps/api/src/modules/administration/administration.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/administration/administration.routes.ts', 'utf8');
const authApi = await readFile('apps/web/src/features/administration/api/auth-api.ts', 'utf8');
const adminApi = await readFile('apps/web/src/features/administration/api/admin-api.ts', 'utf8');

/** Verify the final Administration authentication routes exist and the web client uses them. */
test('Pass 3.2 exposes and uses final login/logout routes', () => {
  assert.match(routes, /app\.post\('\/api\/v1\/auth\/login'/);
  assert.match(routes, /app\.post\('\/api\/v1\/auth\/logout'/);
  assert.match(routes, /app\.get\('\/api\/v1\/auth\/me'/);
  assert.match(authApi, /'auth\/login'/);
  assert.match(authApi, /'auth\/logout'/);
  assert.doesNotMatch(authApi, /'auth\/sign-in'/);
  assert.doesNotMatch(authApi, /'auth\/sign-out'/);
});

/** Verify final user-management routes are under /admin and remain server-owned for company authority. */
test('Pass 3.2 exposes final Administration user routes without client company ownership', () => {
  assert.match(routes, /app\.get\('\/api\/v1\/admin\/users'/);
  assert.match(routes, /app\.post\('\/api\/v1\/admin\/users'/);
  assert.match(routes, /app\.patch\('\/api\/v1\/admin\/users\/:id'/);
  assert.match(adminApi, /`admin\/users\?\$\{query\.toString\(\)\}`/);
  assert.match(adminApi, /'admin\/users'/);
  assert.match(adminApi, /`admin\/users\/\$\{userId\}`/);
  assert.doesNotMatch(schema, /createUserBodySchema[\s\S]{0,300}companyId\s*:/);
  assert.doesNotMatch(schema, /adminUpdateUserBodySchema[\s\S]{0,500}companyId\s*:/);
});

/** Verify the single final PATCH route handles profile changes separately from lifecycle status changes. */
test('Pass 3.2 keeps profile updates and status commands explicit', () => {
  assert.match(schema, /adminUpdateUserBodySchema/);
  assert.match(schema, /status:\s*z\.enum\(\['ACTIVE', 'INACTIVE'\]\)/);
  assert.match(schema, /Update profile fields and status in separate requests\./);
  assert.match(routes, /if \(body\.status === 'ACTIVE'\)[\s\S]{0,220}service\.activateUser\(params\.id\)/);
  assert.match(routes, /if \(body\.status === 'INACTIVE'\)[\s\S]{0,220}service\.deactivateUser\(params\.id\)/);
  assert.match(adminApi, /JSON\.stringify\(\{ status: 'ACTIVE' \}\)/);
  assert.match(adminApi, /JSON\.stringify\(\{ status: 'INACTIVE' \}\)/);
});

/** Verify inactive users cannot authenticate and deactivation still revokes server sessions. */
test('Pass 3.2 preserves authentication and deactivation security behavior', () => {
  assert.match(service, /if \(!user \|\| user\.status !== USER_ACTIVE\)/);
  assert.match(service, /revokeAllUserSessions\(userId, now\)/);
  assert.match(service, /clearUserAuthAction\(userId\)/);
});

/** Keep old route aliases during migration so unmigrated module tests and callers are not broken mid-refactor. */
test('Pass 3.2 keeps temporary legacy aliases until dependent modules migrate', () => {
  assert.match(routes, /app\.post\('\/api\/v1\/auth\/sign-in'/);
  assert.match(routes, /app\.post\('\/api\/v1\/auth\/sign-out'/);
  assert.match(routes, /app\.get\('\/api\/v1\/users'/);
  assert.match(routes, /app\.post\('\/api\/v1\/users'/);
  assert.match(routes, /app\.patch\('\/api\/v1\/users\/:id'/);
});
