import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const schema = await readFile('apps/api/src/modules/administration/administration.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/administration/administration.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/administration/administration.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/administration/administration.routes.ts', 'utf8');
const authentication = await readFile('apps/api/src/plugins/authentication.ts', 'utf8');
const adminApi = await readFile('apps/web/src/features/administration/api/admin-api.ts', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260828000400_administration_user_project_scopes/migration.sql', 'utf8');
const migrationGates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const migrationChecksums = JSON.parse(await readFile('packages/database/prisma/migration-checksums.json', 'utf8'));

/** Verify final Administration has a dedicated Project-scope persistence model. */
test('Pass 3.4 adds dedicated same-company user Project scopes', () => {
  assert.match(prisma, /model UserProjectScope \{/);
  assert.match(prisma, /@@map\("user_project_scopes"\)/);
  assert.match(prisma, /user_project_scopes_company_user_project_uq/);
  assert.match(prisma, /user\s+User\s+@relation\(fields: \[userId, companyId\], references: \[id, companyId\]/);
  assert.match(prisma, /project\s+Project\s+@relation\(fields: \[projectId, companyId\], references: \[id, companyId\]/);
});

/** Verify Project-scope management is a separate final Administration permission and command. */
test('Pass 3.4 exposes final project-scope permission and replacement route', () => {
  assert.match(schema, /'admin\.project_scopes\.manage'/);
  assert.doesNotMatch(schema, /\['users\.manage', 'admin\.project_scopes\.manage'\]/);
  assert.match(schema, /replaceAdminUserProjectScopesBodySchema/);
  assert.ok(routes.includes("app.put('/api/v1/admin/users/:id/project-scopes'"));
  assert.match(routes, /service\.replaceAdminUserProjectScopes\(params\.id, body\)/);
  assert.match(service, /this\.requirePermission\('admin\.project_scopes\.manage'\)/);
  assert.match(adminApi, /`admin\/users\/\$\{userId\}\/project-scopes`/);
});

/** Verify the replacement command validates both current and requested scope against the actor. */
test('Pass 3.4 prevents cross-company and out-of-scope Project grants or removals', () => {
  assert.match(repository, /async findCompanyProjectsByIds\(projectIds: readonly string\[\]\)/);
  assert.match(service, /if \(projects\.length !== projectIds\.length\) throw createAdministrationError\('PROJECT_SCOPE_INVALID'\)/);
  assert.match(service, /for \(const scope of beforeScopes\) this\.requireActorProjectScope\(scope\.projectId\)/);
  assert.match(service, /for \(const projectId of projectIds\) this\.requireActorProjectScope\(projectId\)/);
  assert.match(service, /if \(isUnchanged\) return beforeScopes\.map\(safeUserProjectScope\)/);
  assert.match(repository, /where: scope\.where\(\{\s*userId/);
});

/** Verify authentication reads explicit Project access instead of legacy Project membership. */
test('Pass 3.4 makes dedicated Project scope authoritative for authentication', () => {
  const resolverStart = repository.indexOf('async resolveProjectScopeForAuthentication');
  const resolver = repository.slice(resolverStart, resolverStart + 2600);
  assert.match(resolver, /this\.db\.userProjectScope\.findMany/);
  assert.doesNotMatch(resolver, /this\.db\.projectMember\.findMany/);
  assert.match(authentication, /projectScopeStatuses: ACTIVE_PROJECT_SCOPE_STATUSES/);
  assert.match(service, /projectScopeStatuses: \[PROJECT_SCOPE_ACTIVE\]/);
});

/** Verify Project-scope replacement is audited and published without mixing role assignments. */
test('Pass 3.4 audits and emits the final project-scope change event', () => {
  assert.match(repository, /async deleteUserProjectScopes\(userId: string\)/);
  assert.match(repository, /async createUserProjectScopes\(userId: string, projectIds: readonly string\[\], status: string\)/);
  assert.match(service, /action: 'user\.project_scope_changed'/);
  assert.match(service, /eventType: 'user\.project_scope_changed'/);
  const body = schema.match(/replaceAdminUserProjectScopesBodySchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\);/);
  assert.ok(body);
  assert.match(body[0], /projectIds/);
  assert.doesNotMatch(body[0], /roleId/);
});

/** Verify the forward migration preserves active access and remains checksum-gated. */
test('Pass 3.4 migration backfills active legacy access and is checksum locked', () => {
  assert.match(migration, /CREATE TABLE "user_project_scopes"/);
  assert.match(migration, /FROM "project_members" member/);
  assert.match(migration, /member\."status" = 'ACTIVE'/);
  assert.match(migration, /'admin\.project_scopes\.manage'/);
  const gate = migrationGates.gates.find((item) => item.gate === 'refactor-stage-3-pass-3-4-administration-project-scopes');
  assert.ok(gate);
  assert.deepEqual(gate.migrations, ['20260828000400_administration_user_project_scopes']);
  assert.match(migrationChecksums.migrations['20260828000400_administration_user_project_scopes'], /^[a-f0-9]{64}$/);
});
