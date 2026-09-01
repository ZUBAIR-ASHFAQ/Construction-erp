import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const pass = await readFile('docs/PASS-360-MODULE-6-COST-TYPE-ARCHIVE-LIFECYCLE.md', 'utf8');
const contract = await readFile('docs/modules/wbs-cost-codes/STAGE-9-MODULE-6-CONTRACT.md', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const schema = await readFile('apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.routes.ts', 'utf8');
const webApi = await readFile('apps/web/src/features/wbs-cost-codes/api/wbs-cost-codes-api.ts', 'utf8');
const webHooks = await readFile('apps/web/src/features/wbs-cost-codes/hooks/wbs-cost-codes.ts', 'utf8');
const workspace = await readFile('apps/web/src/features/wbs-cost-codes/components/wbs-cost-structure-workspace.tsx', 'utf8');
const page = await readFile('apps/web/src/features/wbs-cost-codes/pages/wbs-cost-codes-page.tsx', 'utf8');
const integration = await readFile('tests/integration/module-6-api.integration.test.mjs', 'utf8');
const e2e = await readFile('tests/e2e/module-6-browser.spec.mjs', 'utf8');
const migrations = (await readdir('packages/database/prisma/migrations', { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const repairedRoutes = [
  'POST /api/v1/projects/:projectId/wbs/nodes/:id/archive',
  'POST /api/v1/projects/:projectId/wbs/nodes/:id/restore',
  'POST /api/v1/cost-codes/:id/archive',
  'POST /api/v1/cost-codes/:id/restore',
  'GET /api/v1/cost-types',
  'POST /api/v1/cost-types',
  'POST /api/v1/cost-types/:id/archive',
  'POST /api/v1/cost-types/:id/restore'
];

test('Pass 360 closes only M6-02 and M6-03 on the accepted Pass-359 repair baseline', () => {
  assert.match(pass, /M6-02/);
  assert.match(pass, /M6-03/);
  assert.match(pass, /does not start Pass 361 or any Stage-26\/27 integration work/);
  assert.match(contract, /Pass 360 post-Stage-23 repair amendment/);
  assert.match(pass, /No new business module, Prisma model, table, migration or permission is added/);
});

test('Pass 360 reuses the existing CostType persistence and introduced no Pass-360 migration', () => {
  assert.match(prisma, /model CostType \{/);
  assert.match(prisma, /@@unique\(\[companyId, code\]/);
  assert.ok(migrations.includes('20260826000400_module_6_durable_cost_structure_state'));
  assert.ok(!migrations.some((name) => name.includes('pass_360') || name.includes('cost_type_archive')));
  assert.match(pass, /No new business module, Prisma model, table, migration or permission is added/);
});

test('Pass 360 adds strict Cost Type and bodyless lifecycle boundary schemas without new permissions', () => {
  assert.match(schema, /listCostTypesQuerySchema/);
  assert.match(schema, /createCostTypeBodySchema/);
  assert.match(schema, /lifecycleCommandBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.match(schema, /costTypeResponseSchema/);
  assert.match(schema, /listCostTypesResponseSchema/);
  assert.doesNotMatch(schema, /cost_types\.read|cost_types\.manage/);
  for (const permission of ['wbs.read', 'wbs.manage', 'cost_codes.read', 'cost_codes.manage', 'wbs.freeze']) {
    assert.ok(schema.includes(`'${permission}'`), permission);
  }
});

test('Pass 360 repository keeps Cost Type and archive persistence small and Company-scoped', () => {
  for (const method of [
    'updateCostCodeStatus',
    'listCostTypes',
    'findCostTypeById',
    'findCostTypeByCode',
    'createCostType',
    'updateCostTypeStatus'
  ]) assert.match(repository, new RegExp(`async ${method}\\(`), method);
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /companyId: scope\.companyId/);
  assert.doesNotMatch(repository, /deleteCostType\(|deleteCostCode\(|deleteWbsNode\(/);
});

test('Pass 360 service uses non-destructive ACTIVE/ARCHIVED transitions and blocks WBS lifecycle while frozen', () => {
  assert.match(service, /MASTER_ACTIVE = 'ACTIVE'/);
  assert.match(service, /MASTER_ARCHIVED = 'ARCHIVED'/);
  assert.match(service, /private async changeWbsNodeLifecycle/);
  assert.match(service, /await this\.requireOpenCostStructure\(repository, projectId\)/);
  assert.match(service, /private async changeCostCodeLifecycle/);
  assert.match(service, /private async changeCostTypeLifecycle/);
  for (const method of [
    'archiveWbsNode', 'restoreWbsNode', 'archiveCostCode', 'restoreCostCode',
    'listCostTypes', 'createCostType', 'archiveCostType', 'restoreCostType'
  ]) assert.match(service, new RegExp(`async ${method}\\(`), method);
  assert.match(service, /action: 'cost_type\.created'/);
  assert.match(service, /action: 'cost_type\.status_changed'/);
  assert.match(service, /action: 'cost_code\.status_changed'/);
  assert.doesNotMatch(service, /eventType: 'cost_type\.|eventType: 'cost_code\.status_changed'/);
  assert.doesNotMatch(service, /deleteCostType|deleteCostCode|deleteWbsNode/);
});

test('Pass 360 exposes exactly eight reviewed repair routes and no DELETE route', () => {
  const routeCalls = [...routes.matchAll(/app\.(get|post|put|patch|delete)\('([^']+)'/g)]
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`);
  for (const route of repairedRoutes) assert.ok(routeCalls.includes(route), route);
  assert.equal(routeCalls.length, 16);
  assert.equal(routeCalls.filter((route) => route.includes('/archive') || route.includes('/restore') || route.includes('/cost-types')).length, 8);
  assert.doesNotMatch(routes, /app\.delete\(/);
  assert.equal((routes.match(/await authenticateRequest\(request, options\.database\);/g) ?? []).length, 16);
});

test('Pass 360 reuses cost_codes authorities for Cost Type and wbs.manage for WBS lifecycle', () => {
  assert.match(routes, /module6ListCostTypes[\s\S]*requireCompanyRoutePermission\('cost_codes\.read'\)/);
  assert.match(routes, /module6CreateCostType[\s\S]*requireCompanyRoutePermission\('cost_codes\.manage'\)/);
  assert.match(service, /changeWbsNodeLifecycle[\s\S]*'wbs\.manage'/);
  assert.doesNotMatch(routes, /cost_types\.read|cost_types\.manage/);
});

test('Pass 360 React API and hooks expose the repaired workflow without client-owned authority', () => {
  for (const fn of [
    'archiveWbsNode', 'restoreWbsNode', 'archiveCostCode', 'restoreCostCode',
    'listCostTypes', 'createCostType', 'archiveCostType', 'restoreCostType'
  ]) assert.match(webApi, new RegExp(`export function ${fn}\\(`), fn);
  for (const hook of [
    'useCostTypes', 'useArchiveWbsNode', 'useRestoreWbsNode', 'useArchiveCostCode', 'useRestoreCostCode',
    'useCreateCostType', 'useArchiveCostType', 'useRestoreCostType'
  ]) assert.match(webHooks, new RegExp(`export function ${hook}\\(`), hook);
  assert.doesNotMatch(webApi, /method: 'DELETE'/);
  const writeTypes = webApi.slice(webApi.indexOf('export type CreateWbsNodeInput'), webApi.indexOf('/** Read the authorized WBS tree'));
  assert.doesNotMatch(writeTypes, /companyId|actorUserId|projectScope|effectivePermissions/);
});

test('Pass 360 React renders Cost Type and non-destructive lifecycle controls while keeping frozen WBS authoritative', () => {
  assert.match(page, /Company Cost Type master|Cost Type master/);
  assert.match(page, /useCostTypes/);
  assert.match(page, /Create Cost Type/);
  assert.match(page, /useArchiveCostCode/);
  assert.match(page, /useRestoreCostCode/);
  assert.match(workspace, /useArchiveWbsNode/);
  assert.match(workspace, /useRestoreWbsNode/);
  assert.match(workspace, /canEditCostStructure = canManageWbs && !isFrozen/);
  assert.match(workspace, /costTypes/);
  assert.doesNotMatch(`${page}\n${workspace}`, /Delete Cost Type|Delete Cost Code|Delete WBS/);
});

test('Pass 360 integration scenario proves row preservation and rejects archived masters for new mappings', () => {
  assert.match(integration, /Pass 360 Cost Type and archive lifecycle preserve history and block archived masters from new mappings/);
  assert.match(integration, /INVALID_POSTING_COMBINATION/);
  assert.match(integration, /WBS_COST_STRUCTURE_FROZEN/);
  assert.match(integration, /projectCostCode\.count/);
  assert.match(integration, /cost_type\.status_changed/);
  assert.match(integration, /cost_code\.status_changed/);
  assert.match(integration, /module6ListCostTypes/);
  assert.match(integration, /module6CreateCostType/);
});

test('Pass 360 Playwright workflow covers Cost Type, Cost Code and WBS archive/restore without DELETE', () => {
  assert.match(e2e, /Create Cost Type/);
  assert.match(e2e, /PASS360-MATERIAL/);
  assert.match(e2e, /Archive/);
  assert.match(e2e, /Restore/);
  assert.match(e2e, /\/cost-types/);
  assert.match(e2e, /FROZEN · revision 1/);
  assert.doesNotMatch(e2e, /method:\s*['"]DELETE['"]/);
});
