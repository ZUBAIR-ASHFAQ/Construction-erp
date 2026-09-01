import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('apps/api/src/modules/projects/projects.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/projects/projects.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/projects/projects.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/projects/projects.routes.ts', 'utf8');
const index = await readFile('apps/api/src/modules/projects/index.ts', 'utf8');
const webApi = await readFile('apps/web/src/features/projects/api/projects-api.ts', 'utf8');
const webHooks = await readFile('apps/web/src/features/projects/hooks/projects.ts', 'utf8');
const webDetails = await readFile('apps/web/src/features/projects/components/project-details-panel.tsx', 'utf8');
const administrationSchema = await readFile('apps/api/src/modules/administration/administration.schema.ts', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const b8Migration = await readFile('packages/database/prisma/migrations/20260829001200_final21_project_team_assignment/migration.sql', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

const activeProjectSources = [schema, repository, service, routes, index, webApi, webHooks, webDetails];

/** Return whether one repository path exists. */
async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('Pass B6 removes legacy Project-member ownership from active Module 6 runtime', () => {
  for (const source of activeProjectSources) {
    assert.doesNotMatch(source, /projects\.manage_members/);
    assert.doesNotMatch(source, /project\.member_changed/);
    assert.doesNotMatch(source, /replaceProjectMembers/);
    assert.doesNotMatch(source, /projectMember/);
    assert.doesNotMatch(source, /ProjectMember/);
    assert.doesNotMatch(source, /projects\/:id\/members/);
  }

  assert.doesNotMatch(routes, /app\.put\('\/api\/v1\/projects\/:id\/members'/);
  assert.doesNotMatch(webApi, /projects\/\$\{projectId\}\/members/);
});

test('Pass B6 Project detail keeps Project master plus lifecycle history and no legacy members after later summary extensions', () => {
  assert.match(schema, /projectDetailsResponseSchema = z\.object\(\{[\s\S]*project: projectResponseSchema,[\s\S]*statusHistory: z\.array\(projectStatusHistoryResponseSchema\)/);
  assert.match(service, /statusHistory/);
  assert.match(routes, /'project', 'statusHistory', 'stageSummary', 'teamSummary', 'budgetSummary', 'costSummary',[\s\S]*'billingSummary', 'receiptSummary'/);
  assert.doesNotMatch(routes, /members/);
  assert.doesNotMatch(webApi, /members:\s*ProjectMember\[\]/);
});

test('Pass B6 uses distinct final lifecycle permissions', () => {
  for (const permission of [
    'projects.read',
    'projects.create',
    'projects.update',
    'projects.activate',
    'projects.complete',
    'projects.close'
  ]) {
    assert.match(schema, new RegExp(`'${permission.replace('.', '\\.')}'`));
  }

  assert.match(service, /async suspendProject[\s\S]*?'projects\.update'/);
  assert.match(service, /async completeProject[\s\S]*?'projects\.complete'/);
  assert.match(service, /async closeProject[\s\S]*?'projects\.close'/);
  assert.match(webDetails, /usePermission\('projects\.complete'\)/);
});

test('Pass B6 bridge is retired after B8 migrates useful legacy member data', () => {
  assert.doesNotMatch(administrationSchema, /projects\.manage_members|REMOVED_FINAL_21_PERMISSION_CODES/);
  assert.doesNotMatch(prisma, /model ProjectMember \{/);
  assert.match(b8Migration, /FROM "project_members" pm/);
  assert.match(b8Migration, /JOIN "employees" employee/);
  assert.match(b8Migration, /DROP TABLE "project_members"/);

  for (const source of [repository, service, routes]) {
    assert.doesNotMatch(source, /\.projectMember\./);
  }
});

test('Pass B6 removes obsolete Module-24B runtime verification surface', async () => {
  assert.equal(await pathExists('scripts/module-24b'), false);
  assert.equal(await pathExists('tests/module-24b-static.test.mjs'), false);
  assert.equal(await pathExists('tests/integration/module-24b-api.integration.test.mjs'), false);
  assert.equal(await pathExists('tests/e2e/module-24b-browser.spec.mjs'), false);

  const scriptNames = Object.keys(packageJson.scripts ?? {});
  assert.equal(scriptNames.some((name) => name.startsWith('module-24b:')), false);
  assert.equal(scriptNames.some((name) => name.endsWith(':module-24b')), false);
});
