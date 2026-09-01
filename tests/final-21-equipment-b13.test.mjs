import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const backend = 'apps/api/src/modules/equipment';
const web = 'apps/web/src/features/equipment';
const migrationPath = 'packages/database/prisma/migrations/20260829001700_final21_equipment_alignment/migration.sql';

/** Extract one Prisma model block for focused Final-21 Equipment assertions. */
function prismaModel(name) {
  const schema = read('packages/database/prisma/schema.prisma');
  return schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?@@map\\([^\\n]+\\)\\n\\}`))?.[0] ?? '';
}

/** Confirm Equipment remains the required five-file backend registered after Inventory. */
test('B13 keeps Equipment as one simple five-file backend after Inventory', () => {
  assert.deepEqual(readdirSync(new URL(`../${backend}`, import.meta.url)).sort(), [
    'equipment.repository.ts',
    'equipment.routes.ts',
    'equipment.schema.ts',
    'equipment.service.ts',
    'index.ts'
  ]);
  const app = read('apps/api/src/app.ts');
  assert.ok(app.indexOf('registerInventoryRoutes') < app.indexOf('registerEquipmentRoutes'));
});

/** Confirm the public Equipment API is exactly the six routes in the Final-21 contract. */
test('B13 exposes exactly the six Final-21 Equipment routes', () => {
  const schema = read(`${backend}/equipment.schema.ts`);
  const routes = read(`${backend}/equipment.routes.ts`);
  const expected = [
    "GET', route: '/api/v1/equipment'",
    "POST', route: '/api/v1/equipment'",
    "POST', route: '/api/v1/equipment/:id/assignments'",
    "POST', route: '/api/v1/equipment/:id/usage'",
    "POST', route: '/api/v1/equipment/:id/maintenance'",
    "GET', route: '/api/v1/equipment/:id/history'"
  ];
  for (const route of expected) assert.ok(schema.includes(route), `missing ${route}`);
  assert.equal((schema.match(/method: '(?:GET|POST|PUT|PATCH|DELETE)', route: '\/api\/v1\/equipment/g) ?? []).length, 6);
  assert.doesNotMatch(routes, /\/api\/v1\/equipment[^'\"]*(?:transfer|archive|dispose|utilization|submit|post-cost|return)/i);
});

/** Confirm Module 12 persistence uses the final Equipment assignment usage maintenance shapes. */
test('B13 aligns Equipment persistence to Project Stage assignment and source-derived usage cost', () => {
  const equipment = prismaModel('Equipment');
  const assignment = prismaModel('EquipmentAssignment');
  const usage = prismaModel('EquipmentUsage');
  const maintenance = prismaModel('EquipmentMaintenance');

  assert.match(equipment, /code\s+String/);
  assert.match(equipment, /equipmentType\s+String/);
  assert.match(equipment, /defaultRate\s+Decimal\?/);
  assert.match(equipment, /rateUnit\s+String\?/);
  assert.doesNotMatch(equipment, /serialNo|plateNo|costRatePerHour|category\s+String/);

  assert.match(assignment, /stageId\s+String\?/);
  assert.match(assignment, /stage\s+ProjectStage\?/);
  assert.match(assignment, /usage\s+EquipmentUsage\[\]/);
  assert.doesNotMatch(assignment, /assignedBy/);

  assert.match(usage, /assignmentId\s+String/);
  assert.match(usage, /quantity\s+Decimal/);
  assert.match(usage, /rate\s+Decimal/);
  assert.match(usage, /amount\s+Decimal/);
  assert.match(usage, /enteredBy\s+String/);
  assert.doesNotMatch(usage, /equipmentId|projectId|costStructure|meterStart|meterEnd|fuelQty|approvalStatus/);

  assert.match(maintenance, /maintenanceDate\s+DateTime/);
  assert.match(maintenance, /type\s+String/);
  assert.match(maintenance, /cost\s+Decimal/);
  assert.match(maintenance, /note\s+String\?/);
});

/** Confirm assignment service and migration reject overlapping or invalid Project Stage ownership. */
test('B13 enforces active Equipment availability Stage scope and non-overlapping assignments', () => {
  const service = read(`${backend}/equipment.service.ts`);
  const repository = read(`${backend}/equipment.repository.ts`);
  const migration = read(migrationPath);
  assert.match(service, /token\(equipment\.status\) !== ACTIVE/);
  assert.match(service, /findStage\(input\.projectId, input\.stageId\)/);
  assert.match(service, /hasAssignmentOverlap\(equipmentId, fromDate, toDate\)/);
  assert.match(service, /createModule12Error\('ASSIGNMENT_OVERLAP'\)/);
  assert.match(repository, /equipmentAssignment\.count/);
  assert.match(migration, /equipment_assignments_stage_project_fkey/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /Equipment assignment periods may not overlap/);
});

/** Confirm usage amount is server-calculated and posts one stable Project Stage cost source. */
test('B13 posts Equipment usage to Module 9 with stable source key and exact money calculation', () => {
  const service = read(`${backend}/equipment.service.ts`);
  const repository = read(`${backend}/equipment.repository.ts`);
  assert.match(service, /calculateAmount\(input\.quantity, rate\)/);
  assert.match(service, /repository\.createUsageCostActual/);
  assert.match(repository, /category: 'equipment'/);
  assert.match(repository, /sourceType: 'equipment_usage'/);
  assert.match(repository, /sourceKey: `equipment_usage:\$\{input\.usageId\}`/);
  assert.match(repository, /stageId: input\.stageId/);
  assert.doesNotMatch(service, /parseFloat|Number\(input\.quantity\)|Number\(rate\)/);
});

/** Confirm Final Module 12 permissions, stable errors, idempotency, audit and outbox are present. */
test('B13 uses the final Equipment permission error and event vocabulary', () => {
  const schema = read(`${backend}/equipment.schema.ts`);
  const routes = read(`${backend}/equipment.routes.ts`);
  const service = read(`${backend}/equipment.service.ts`);
  for (const permission of ['equipment.read', 'equipment.manage', 'equipment.assign', 'equipment.usage.create', 'equipment.maintenance.manage']) {
    assert.ok(schema.includes(`'${permission}'`), `missing ${permission}`);
  }
  for (const error of ['EQUIPMENT_NOT_FOUND', 'EQUIPMENT_NOT_AVAILABLE', 'ASSIGNMENT_OVERLAP', 'INVALID_EQUIPMENT_STAGE']) {
    assert.ok(schema.includes(`'${error}'`), `missing ${error}`);
  }
  for (const event of ['equipment.assigned', 'equipment.usage_posted', 'equipment.maintenance_recorded']) {
    assert.ok(schema.includes(`'${event}'`), `missing ${event}`);
    assert.ok(service.includes(event), `service does not emit ${event}`);
  }
  assert.equal((routes.match(/headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA/g) ?? []).length, 4);
  assert.equal((routes.match(/readIdempotencyKey\(request\)/g) ?? []).length, 4);
  assert.match(service, /executeIdempotentCommand/);
  assert.match(service, /recordAudit/);
  assert.match(service, /recordOutboxEvent/);
});

/** Confirm bounded history preserves assignment usage maintenance and permission-scoped cost readback. */
test('B13 exposes bounded Equipment history and Project Stage cost summary', () => {
  const repository = read(`${backend}/equipment.repository.ts`);
  const service = read(`${backend}/equipment.service.ts`);
  const schema = read(`${backend}/equipment.schema.ts`);
  assert.match(repository, /take > MODULE_12_MAX_PAGE_SIZE/);
  assert.match(repository, /equipmentAssignment\.findMany/);
  assert.match(repository, /equipmentUsage\.findMany/);
  assert.match(repository, /equipmentMaintenance\.findMany/);
  assert.match(repository, /allowedProjectIds/);
  assert.match(service, /historyVisibility/);
  assert.match(service, /costSummary/);
  assert.match(schema, /equipmentHistoryResponseSchema/);
});

/** Confirm React uses the Final permissions, Project Stage selectors, usage and maintenance history only. */
test('B13 simplifies the Equipment React feature to the Final-21 workflow', () => {
  const page = read(`${web}/pages/equipment-page.tsx`);
  const workspace = read(`${web}/components/equipment-workspace.tsx`);
  const api = read(`${web}/api/equipment-api.ts`);
  const hooks = read(`${web}/hooks/equipment.ts`);
  assert.match(page, /usePermission\('equipment\.usage\.create'\)/);
  assert.match(page, /usePermission\('equipment\.maintenance\.manage'\)/);
  assert.match(workspace, /useProjects/);
  assert.match(workspace, /useProjectStages/);
  assert.match(workspace, /Record Usage & Cost/);
  assert.match(workspace, /Project \/ Stage Equipment cost summary/);
  assert.match(api, /Idempotency-Key/);
  assert.match(hooks, /useEquipmentHistory/);
  for (const source of [page, workspace, api, hooks]) {
    assert.doesNotMatch(source, /equipment\.usage'|equipment\.maintenance'|useEquipmentUtilization|useTransferEquipment|useArchiveEquipment|useReturnEquipment|postEquipmentUsageCost/i);
  }
});

/** Confirm B13 removes the obsolete Stage-17 Equipment verifier/test/evidence stack. */
test('B13 removes obsolete Equipment-only legacy files instead of carrying duplicate logic', () => {
  for (const path of [
    'scripts/module-12',
    'module-12-evidence',
    'docs/modules/equipment',
    'tests/module-12-static.test.mjs',
    'tests/integration/module-12-api.integration.test.mjs',
    'tests/e2e/module-12-browser.spec.mjs',
    'tests/pass-371-module-12-usage-approval-job-cost.test.mjs',
    'tests/pass-372-module-12-history-transfer-archive.test.mjs'
  ]) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false, `${path} should be removed`);
  }
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(Object.keys(scripts).some((name) => name.includes('module-12')), false);
});

/** Confirm the forward migration preserves historical usage before retiring legacy columns and permissions. */
test('B13 migration transforms legacy Equipment data forward without editing historical migrations', () => {
  const migration = read(migrationPath);
  assert.match(migration, /ALTER TABLE "equipment" RENAME COLUMN "equipment_code" TO "code"/);
  assert.match(migration, /ALTER TABLE "equipment_assignments" ADD COLUMN IF NOT EXISTS "stage_id" UUID/);
  assert.match(migration, /Resolve every historical usage row to the assignment/);
  assert.match(migration, /B13 cannot migrate Equipment usage without a matching historical assignment\/actor/);
  assert.match(migration, /ALTER TABLE "equipment_usage" DROP COLUMN IF EXISTS "cost_structure_id"/);
  assert.match(migration, /final21_prevent_posted_equipment_usage_mutation/);
  assert.match(migration, /Posted Equipment usage is immutable/);
  assert.match(migration, /ALTER TABLE "equipment_maintenance" RENAME COLUMN "scheduled_date" TO "maintenance_date"/);
  assert.match(migration, /'equipment\.usage\.create'/);
  assert.match(migration, /'equipment\.maintenance\.manage'/);
});

/** Confirm changed B13 functions and methods have nearby short purpose comments. */
test('B13 keeps changed Equipment functions junior-readable with purpose comments', () => {
  const paths = [
    `${backend}/equipment.schema.ts`,
    `${backend}/equipment.repository.ts`,
    `${backend}/equipment.service.ts`,
    `${backend}/equipment.routes.ts`,
    `${web}/api/equipment-api.ts`,
    `${web}/hooks/equipment.ts`,
    `${web}/components/equipment-workspace.tsx`,
    `${web}/pages/equipment-page.tsx`
  ];
  for (const path of paths) {
    const lines = read(path).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const isFunction = /^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
      const isMethod = /^\s*(?:private\s+)?async\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
      if (!isFunction && !isMethod) continue;
      const previous = lines.slice(Math.max(0, index - 3), index).join('\n');
      assert.match(previous, /\/\*\*[^]*\*\//, `${path}:${index + 1} needs a short purpose comment`);
    }
  }
});
