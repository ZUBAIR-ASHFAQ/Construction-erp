import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const contract = await readFile('docs/modules/scheduling/STAGE-21-MODULE-21-CONTRACT.md', 'utf8');
const gate = await readFile('scripts/module-21/verify-stage-21-contract.mjs', 'utf8');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260826000100_module_21_project_scheduling_core/migration.sql', 'utf8');
const pass376Migration = await readFile('packages/database/prisma/migrations/20260827000400_module_21_activity_owner_baseline_reopen_repair/migration.sql', 'utf8').catch(() => '');
const migrationGates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const schema = await readFile('apps/api/src/modules/scheduling/scheduling.schema.ts', 'utf8');
const schemaGate = await readFile('scripts/module-21/verify-stage-21-schema.mjs', 'utf8').catch(() => '');
const repository = await readFile('apps/api/src/modules/scheduling/scheduling.repository.ts', 'utf8').catch(() => '');
const repositoryGate = await readFile('scripts/module-21/verify-stage-21-repository.mjs', 'utf8').catch(() => '');
const service = await readFile('apps/api/src/modules/scheduling/scheduling.service.ts', 'utf8').catch(() => '');
const serviceGate = await readFile('scripts/module-21/verify-stage-21-service.mjs', 'utf8').catch(() => '');
const routes = await readFile('apps/api/src/modules/scheduling/scheduling.routes.ts', 'utf8').catch(() => '');
const indexFile = await readFile('apps/api/src/modules/scheduling/index.ts', 'utf8').catch(() => '');
const app = await readFile('apps/api/src/app.ts', 'utf8');
const httpGate = await readFile('scripts/module-21/verify-stage-21-http.mjs', 'utf8').catch(() => '');
const integrationTest = await readFile('tests/integration/module-21-api.integration.test.mjs', 'utf8').catch(() => '');
const integrationGate = await readFile('scripts/module-21/verify-stage-21-integration-security.mjs', 'utf8').catch(() => '');
const reactApi = await readFile('apps/web/src/features/scheduling/api/scheduling-api.ts', 'utf8').catch(() => '');
const reactHooks = await readFile('apps/web/src/features/scheduling/hooks/scheduling.ts', 'utf8').catch(() => '');
const reactDataGate = await readFile('scripts/module-21/verify-stage-21-react-data.mjs', 'utf8').catch(() => '');
const reactWorkspace = await readFile('apps/web/src/features/scheduling/components/scheduling-workspace.tsx', 'utf8').catch(() => '');
const reactPage = await readFile('apps/web/src/features/scheduling/pages/scheduling-page.tsx', 'utf8').catch(() => '');
const adminShell = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8').catch(() => '');
const sharedStyles = await readFile('apps/web/src/styles.css', 'utf8').catch(() => '');
const reactGate = await readFile('scripts/module-21/verify-stage-21-react.mjs', 'utf8').catch(() => '');
const browserTest = await readFile('tests/e2e/module-21-browser.spec.mjs', 'utf8').catch(() => '');
const playwrightGate = await readFile('scripts/module-21/verify-stage-21-playwright.mjs', 'utf8').catch(() => '');
const operationsGate = await readFile('scripts/module-21/verify-stage-21-operations.mjs', 'utf8').catch(() => '');
const finalGate = await readFile('scripts/module-21/verify-stage-21.mjs', 'utf8').catch(() => '');
const playwrightConfig = await readFile('playwright.config.mjs', 'utf8').catch(() => '');

const TABLES = [
  'project_schedules',
  'schedule_activities',
  'schedule_dependencies',
  'schedule_baselines',
  'schedule_progress_updates',
];

const ROUTES = [
  'GET   /api/v1/projects/:projectId/schedule',
  'POST  /api/v1/projects/:projectId/schedule',
  'POST  /api/v1/projects/:projectId/schedule/activities',
  'PATCH /api/v1/projects/:projectId/schedule/activities/:id',
  'PUT   /api/v1/projects/:projectId/schedule/dependencies',
  'POST  /api/v1/projects/:projectId/schedule/baseline',
  'POST  /api/v1/projects/:projectId/schedule/progress',
  'GET   /api/v1/projects/:projectId/schedule/lookahead',
];

const PERMISSIONS = ['schedule.read', 'schedule.manage', 'schedule.baseline', 'schedule.progress'];
const ERRORS = [
  'SCHEDULE_NOT_FOUND',
  'DUPLICATE_ACTIVITY_CODE',
  'SCHEDULE_DEPENDENCY_CYCLE',
  'SCHEDULE_BASELINE_LOCKED',
  'INVALID_PROGRESS_UPDATE',
];
const EVENTS = [
  'schedule.created',
  'schedule.baselined',
  'schedule.progress_updated',
  'schedule.milestone_changed',
];

/** Extract one Prisma model block for focused Stage-21 persistence assertions. */
function model(name) {
  return prisma.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';
}

test('Pass 322 freezes Module 21 at corrected Stage 21', () => {
  assert.match(contract, /Stage 20  Module 14B - Payroll Completion/);
  assert.match(contract, /Stage 21  Module 21  - Project Scheduling/);
  assert.match(contract, /Stage 22  Module 17  - Change Orders \/ Variations/);
  assert.match(gate, /pass: 322/);
  assert.match(gate, /stage: 21/);
});

test('Pass 322 requires Stage 20 live handoff only for runtime activation', () => {
  assert.match(contract, /STAGE_20_ACCEPTED_READY_FOR_STAGE_21/);
  assert.match(contract, /contract may be reviewed and frozen while that live handoff is pending/);
  assert.match(gate, /STAGE_21_MODULE_21_CONTRACT_FROZEN_STAGE_20_LIVE_HANDOFF_PENDING/);
  assert.match(gate, /persistencePreparationAllowed: passed/);
});

test('Pass 322 preserves exact corrected business prerequisites', () => {
  assert.match(contract, /Module 5  - Project Management        required/);
  assert.match(contract, /Module 6  - WBS & Cost Codes         optional activity mapping only/);
  assert.match(gate, /hardPrerequisites: \['5 - Project Management'\]/);
  assert.match(gate, /optionalPrerequisites: \['6 - WBS & Cost Codes for optional activity mapping'\]/);
  assert.match(gate, /projectScopeReusesModule24B: true/);
});

test('Pass 322 freezes exactly five source-owned scheduling tables', () => {
  for (const table of TABLES) assert.ok(contract.includes(table), `Missing table ${table}`);
  assert.match(gate, /ownedTables: \[/);
  assert.match(gate, /'project_schedules'/);
  assert.match(gate, /'schedule_progress_updates'/);
});

test('Pass 322 freezes one current Schedule per Project for the singular API', () => {
  assert.match(contract, /one current Project Schedule record per Project/);
  assert.match(contract, /Baseline history belongs in `schedule_baselines`/);
  assert.match(gate, /oneCurrentSchedulePerProject: true/);
});

test('Pass 322 freezes all source-defined Project Schedule fields', () => {
  for (const field of ['company_id', 'project_id', 'name', 'status', 'baseline_at nullable', 'data_date nullable']) {
    assert.ok(contract.includes(field), `Missing project_schedules field ${field}`);
  }
});

test('Pass 322 freezes all source-defined Activity fields', () => {
  for (const field of [
    'schedule_id', 'parent_id nullable', 'activity_code', 'wbs_node_id nullable',
    'planned_start', 'planned_finish', 'actual_start nullable', 'actual_finish nullable',
    'percent_complete', 'milestone', 'status',
  ]) assert.ok(contract.includes(field), `Missing schedule_activities field ${field}`);
});

test('Pass 322 preserves optional same-Project WBS mapping', () => {
  assert.match(contract, /`wbs_node_id`, when present, directly references Module-6 WBS/);
  assert.match(contract, /must belong to the same Project as the Schedule/);
  assert.match(gate, /optionalWbsMapping: true/);
});

test('Pass 322 freezes Activity code uniqueness and date/progress validation', () => {
  assert.match(contract, /`activity_code` is unique inside the Schedule/);
  assert.match(contract, /planned finish cannot precede planned start/i);
  assert.match(contract, /percent complete is bounded from 0 through 100/);
  assert.match(contract, /actual finish normally requires 100 percent complete/);
  assert.match(gate, /activityCodeUniqueInsideSchedule: true/);
});

test('Pass 322 records missing Activity owner and duration fields instead of inventing them', () => {
  assert.match(contract, /workflow mentions activity \*\*owner\*\* and planned \*\*duration\*\*/);
  assert.match(contract, /must not invent `owner_user_id`, `duration_days`/);
});

test('Pass 322 keeps hierarchy limits and milestone-specific date semantics unresolved', () => {
  assert.match(contract, /does not define hierarchy-depth limits/);
  assert.match(contract, /does not say a milestone must have identical planned start\/finish dates/);
});

test('Pass 322 freezes same-Schedule cycle-free dependencies', () => {
  assert.match(contract, /dependency, predecessor and successor must all belong to the same Schedule/);
  assert.match(contract, /complete dependency graph must be cycle-free/);
  assert.match(contract, /self-dependency is invalid/);
  assert.match(gate, /dependencyGraphCycleFree: true/);
});

test('Pass 322 guarantees only finish-start dependency type', () => {
  assert.match(contract, /finish-start \(`FS`\) as the only guaranteed executable dependency type/);
  for (const token of ['SS', 'FF', 'SF']) assert.ok(contract.includes(`\`${token}\``));
  assert.match(gate, /guaranteedDependencyTypes: \['FS'\]/);
});

test('Pass 322 records unresolved lag semantics', () => {
  assert.match(contract, /lead\/negative-lag behavior and fractional-day lag are not defined/);
  assert.match(contract, /whole-day lag/);
});

test('Pass 322 freezes immutable append-only baseline snapshots', () => {
  assert.match(contract, /`snapshot_json` is an immutable server-created snapshot/);
  assert.match(contract, /baseline history is append-only/);
  assert.match(gate, /baselineSnapshotImmutable: true/);
});

test('Pass 322 freezes baseline number uniqueness without inventing its start value', () => {
  assert.match(contract, /uniqueness of `\(schedule_id, baseline_no\)`/);
  assert.match(contract, /does not define whether numbering starts at zero or one/);
  assert.match(gate, /baselineNumberUniqueInsideSchedule: true/);
});

test('Pass 322 keeps baseline snapshot JSON shape unresolved', () => {
  assert.match(contract, /exact JSON snapshot shape is not defined/);
  assert.match(gate, /canonical baseline snapshot_json shape is not defined/);
});

test('Pass 322 freezes Progress Update fields and history behavior', () => {
  for (const field of ['data_date', 'activity_id', 'percent_complete', 'forecast_finish nullable', 'remarks', 'updated_by']) {
    assert.ok(contract.includes(field), `Missing schedule_progress_updates field ${field}`);
  }
  assert.match(contract, /progress update is auditable history/);
});

test('Pass 322 does not invent unsupported forecast and earned-value fields', () => {
  for (const gap of ['forecast_start', 'quantity-based progress', 'earned-value fields', 'progress-weighting formulas']) {
    assert.ok(contract.includes(gap), `Missing explicit gap ${gap}`);
  }
});

test('Pass 322 freezes exactly eight reviewed routes', () => {
  for (const route of ROUTES) assert.ok(contract.includes(route), `Missing route ${route}`);
  assert.match(gate, /reviewedRouteCount: 8/);
});

test('Pass 322 explicitly forbids generic or advanced scheduling routes', () => {
  for (const route of [
    'GET    /api/v1/projects/:projectId/schedules',
    'DELETE /api/v1/projects/:projectId/schedule/activities/:id',
    'POST   /api/v1/projects/:projectId/schedule/reopen',
    'POST   /api/v1/projects/:projectId/schedule/import',
    'POST   /api/v1/projects/:projectId/schedule/sync',
    'POST   /api/v1/projects/:projectId/schedule/recalculate-cpm',
  ]) assert.ok(contract.includes(route), `Missing forbidden route marker ${route}`);
  assert.match(gate, /extraRoutesInvented: false/);
});

test('Pass 322 records the unresolved look-ahead query contract', () => {
  assert.match(contract, /two-to-six-week look-ahead/);
  assert.match(contract, /does not name the query parameters/);
  assert.match(contract, /must not invent arbitrary look-ahead query names/);
});

test('Pass 322 freezes exactly four scheduling permissions', () => {
  for (const permission of PERMISSIONS) assert.ok(contract.includes(permission), `Missing permission ${permission}`);
  assert.match(gate, /reviewedPermissions: \[/);
  assert.match(gate, /extraPermissionsInvented: false/);
});

test('Pass 322 maps reviewed routes only to existing permissions', () => {
  assert.match(contract, /read\/current schedule and look-ahead use `schedule\.read`/);
  assert.match(contract, /create schedule, create\/update activities and replace dependencies use `schedule\.manage`/);
  assert.match(contract, /baseline uses `schedule\.baseline`/);
  assert.match(contract, /progress uses `schedule\.progress`/);
});

test('Pass 322 keeps Company, actor and Project authority server-side', () => {
  for (const field of ['companyId', 'actorUserId', 'permissions', 'allowedProjectIds']) assert.ok(contract.includes(field));
  assert.match(contract, /Browser-provided Company, actor, permission, Project-scope/);
});

test('Pass 322 freezes baseline immutability without blocking reviewed post-baseline progress', () => {
  assert.match(contract, /normal progress after baseline remains allowed/);
  assert.match(contract, /must not mutate baseline JSON/);
  assert.match(contract, /must not block the source-defined post-baseline progress workflow/);
});

test('Pass 322 records the unresolved SCHEDULE_BASELINE_LOCKED scope', () => {
  assert.match(contract, /includes `SCHEDULE_BASELINE_LOCKED` but does not define/);
  assert.match(gate, /exact SCHEDULE_BASELINE_LOCKED scope are not defined/);
});

test('Pass 322 defers Change Order schedule impact to the reviewed later stages', () => {
  assert.match(contract, /Module 17 — Change Orders \/ Variations is generated at Stage 22/);
  assert.match(contract, /Stage 27 remains the mandatory cross-module integration proof/);
  assert.match(gate, /changeOrderIntegrationGeneratedEarly: false/);
});

test('Pass 322 keeps Daily Report integration downstream', () => {
  assert.match(contract, /Module 20 — Daily Site Reports is a later consumer/);
  assert.match(contract, /must not add Daily Report columns or tables early/);
  assert.match(gate, /dailyReportIntegrationGeneratedEarly: false/);
});

test('Pass 322 freezes exactly five stable errors', () => {
  for (const code of ERRORS) {
    assert.ok(contract.includes(code), `Missing error ${code}`);
    assert.ok(gate.includes(code), `Gate missing error ${code}`);
  }
});

test('Pass 322 freezes exactly four source-defined events', () => {
  for (const event of EVENTS) {
    assert.ok(contract.includes(event), `Missing event ${event}`);
    assert.ok(gate.includes(event), `Gate missing event ${event}`);
  }
});

test('Pass 322 records unresolved milestone event semantics', () => {
  assert.match(contract, /exact condition that emits it is not stated/);
  assert.match(gate, /schedule\.milestone_changed emission condition is not defined/);
});

test('Pass 322 does not invent Scheduling approval from optional notification prose', () => {
  assert.match(contract, /No baseline approval API, permission or Module-22 dependency is defined/);
  assert.match(contract, /does not fabricate a Scheduling approval workflow/);
});

test('Pass 322 preserves source-defined React minimum UI', () => {
  for (const label of ['Activity table / Gantt-style view', 'milestones', 'dependencies', 'baseline vs current dates', 'progress entry', 'two-to-six-week look-ahead']) {
    assert.ok(contract.includes(label), `Missing React requirement ${label}`);
  }
});

test('Pass 322 explicitly rejects full CPM and P6 parity', () => {
  assert.match(contract, /does not claim full resource-loaded CPM\/P6 parity/);
  assert.match(contract, /does not authorize an advanced scheduling engine/);
  assert.match(gate, /fullCpmP6ParityClaimed: false/);
});

test('Pass 322 does not invent external scheduler integration', () => {
  assert.match(contract, /external scheduler integration must use an explicit future import\/sync contract/);
  assert.match(gate, /externalSchedulerIntegrationGenerated: false/);
});

test('Pass 322 preserves the five-file backend generation order', () => {
  for (const file of ['scheduling.schema.ts', 'scheduling.repository.ts', 'scheduling.service.ts', 'scheduling.routes.ts', 'index.ts']) {
    assert.ok(contract.includes(file), `Missing generation file ${file}`);
  }
});

test('Pass 322 historically records no production or migration generation', () => {
  assert.match(gate, /productionFilesGenerated: false/);
  assert.match(gate, /databaseMigrationGenerated: false/);
});

test('Pass 322 historically records the contract gate before persistence generation', () => {
  assert.equal(rootPackage.scripts['module-21:contract:gate'], 'node scripts/module-21/verify-stage-21-contract.mjs');
  assert.match(gate, /databaseMigrationGenerated: false/);
});

test('Pass 322 points to the reviewed persistence pass next', () => {
  assert.match(contract, /Pass 323 — Module 21 Project Scheduling Prisma models, constraints, indexes and Stage-21 migration/);
  assert.match(gate, /Pass 323 - Module 21 Project Scheduling Prisma models/);
});

test('Pass 323 implements exactly the five reviewed Module-21 persistence models', () => {
  for (const name of ['ProjectSchedule', 'ScheduleActivity', 'ScheduleDependency', 'ScheduleBaseline', 'ScheduleProgressUpdate']) {
    assert.match(prisma, new RegExp(`model\\s+${name}\\s*\\{`));
  }
  for (const table of TABLES) assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  assert.equal([...migration.matchAll(/CREATE TABLE\s+"([^"]+)"/g)].length, 5);
});

test('Pass 323 persists one Company-scoped current Schedule per Project', () => {
  const schedule = model('ProjectSchedule');
  assert.match(schedule, /companyId\s+String\s+@map\("company_id"\) @db\.Uuid/);
  assert.match(schedule, /projectId\s+String\s+@map\("project_id"\) @db\.Uuid/);
  assert.match(schedule, /baselineAt\s+DateTime\?/);
  assert.match(schedule, /dataDate\s+DateTime\?/);
  assert.match(schedule, /@@unique\(\[projectId\], map: "project_schedules_project_uq"\)/);
  assert.match(migration, /FOREIGN KEY \("project_id", "company_id"\) REFERENCES "projects"\("id", "company_id"\)/);
});

test('Pass 323 persists Activity hierarchy, optional WBS mapping and reviewed date/progress checks', () => {
  const activity = model('ScheduleActivity');
  assert.match(activity, /parentId\s+String\?/);
  assert.match(activity, /wbsNodeId\s+String\?/);
  assert.match(activity, /percentComplete\s+Decimal\s+@map\("percent_complete"\) @db\.Decimal\(7, 4\)/);
  assert.match(activity, /@@unique\(\[scheduleId, activityCode\], map: "schedule_activities_schedule_code_uq"\)/);
  assert.match(migration, /schedule_activities_planned_date_order/);
  assert.match(migration, /schedule_activities_percent_range/);
  assert.match(migration, /schedule_activities_actual_finish_complete/);
  assert.match(migration, /Schedule Activity parent must belong to the same Schedule/);
  assert.match(migration, /Schedule Activity WBS node must belong to the Schedule Project/);
});

test('Pass 323 guarantees only nonnegative whole-day FS dependencies and rejects graph cycles', () => {
  const dependency = model('ScheduleDependency');
  assert.match(dependency, /dependencyType\s+String\s+@map\("dependency_type"\) @db\.VarChar\(8\)/);
  assert.match(dependency, /lagDays\s+Int\s+@map\("lag_days"\)/);
  assert.match(migration, /CHECK \("dependency_type" = 'FS'\)/);
  assert.match(migration, /CHECK \("lag_days" >= 0\)/);
  assert.match(migration, /WITH RECURSIVE reachable/);
  assert.match(migration, /Schedule Dependency graph must not contain cycles/);
  assert.match(migration, /Serialize dependency edits[\s\S]*FOR UPDATE/);
  assert.match(migration, /predecessor must belong to the same Schedule/);
  assert.match(migration, /successor must belong to the same Schedule/);
});

test('Pass 323 persists immutable baseline snapshots with same-Company creator scope', () => {
  const baseline = model('ScheduleBaseline');
  assert.match(baseline, /baselineNo\s+Int\s+@map\("baseline_no"\)/);
  assert.match(baseline, /snapshotJson\s+Json\s+@map\("snapshot_json"\) @db\.JsonB/);
  assert.match(baseline, /@@unique\(\[scheduleId, baselineNo\], map: "schedule_baselines_schedule_no_uq"\)/);
  assert.match(migration, /Schedule Baseline creator must belong to the Schedule Company/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON "schedule_baselines"/);
  assert.match(migration, /Schedule Baseline snapshots are immutable/);
});

test('Pass 323 persists append-only progress evidence without inventing Activity/data-date uniqueness', () => {
  const progress = model('ScheduleProgressUpdate');
  assert.match(progress, /dataDate\s+DateTime\s+@map\("data_date"\) @db\.Date/);
  assert.match(progress, /percentComplete\s+Decimal\s+@map\("percent_complete"\) @db\.Decimal\(7, 4\)/);
  assert.match(progress, /forecastFinish\s+DateTime\?/);
  assert.match(progress, /updatedBy\s+String\s+@map\("updated_by"\) @db\.Uuid/);
  assert.match(migration, /schedule_progress_updates_percent_range/);
  assert.match(migration, /Schedule Progress Activity must belong to the same Schedule/);
  assert.match(migration, /Schedule Progress updater must belong to the Schedule Company/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON "schedule_progress_updates"/);
  assert.match(migration, /Schedule Progress Update history is append-only/);
  assert.doesNotMatch(progress, /@@unique\(\[activityId, dataDate\]/);
});

test('Pass 323 keeps original core persistence narrow while Pass 376 adds only Activity owner persistence', () => {
  const activity = model('ScheduleActivity');
  const schedule = model('ProjectSchedule');
  assert.match(activity, /status\s+String\s+@db\.VarChar\(32\)/);
  assert.match(schedule, /status\s+String\s+@db\.VarChar\(32\)/);
  assert.doesNotMatch(migration, /owner_user_id|duration_days|forecast_start|critical_path|total_float|free_float|calendar_id|resource_id/);
  assert.match(activity, /ownerUserId\s+String\?/);
  assert.match(pass376Migration, /ADD COLUMN "owner_user_id" UUID/);
  assert.doesNotMatch(`${schedule}\n${activity}`, /durationDays|forecastStart|criticalPath|totalFloat|freeFloat|calendarId|resourceId/);
  assert.doesNotMatch(pass376Migration, /duration_days|CREATE TABLE "schedule_(calendars|resources)|CREATE TABLE "change_orders"|CREATE TABLE "daily_reports"/is);
});

test('Pass 323 registers the Stage-21 migration gate before later stages', () => {
  const stage21Gate = migrationGates.gates[38];
  assert.equal(stage21Gate.stage, 21);
  assert.equal(stage21Gate.gate, 'module-21-project-scheduling-core-persistence');
  assert.deepEqual(stage21Gate.migrations, ['20260826000100_module_21_project_scheduling_core']);
});

test('Pass 323 registers the persistence gate after the historical contract gate', () => {
  assert.equal(rootPackage.scripts['module-21:contract:gate'], 'node scripts/module-21/verify-stage-21-contract.mjs');
  assert.equal(rootPackage.scripts['module-21:persistence:gate'], 'node scripts/module-21/verify-stage-21-persistence.mjs');
});



test('Pass 324 adds only the strict Scheduling schema runtime file for this layer', () => {
  assert.match(schema, /from '@construction-erp\/errors'/);
  assert.match(schema, /from 'zod'/);
  assert.doesNotMatch(schema, /PrismaClient|FastifyInstance|useQuery|useMutation/);
});

test('Pass 324 freezes exactly the reviewed four permissions, five errors and four events in code', () => {
  for (const permission of PERMISSIONS) assert.ok(schema.includes(`'${permission}'`), `Schema missing permission ${permission}`);
  for (const code of ERRORS) assert.ok(schema.includes(`'${code}'`), `Schema missing error ${code}`);
  for (const event of EVENTS) assert.ok(schema.includes(`'${event}'`), `Schema missing event ${event}`);
  assert.match(schema, /MODULE_21_PERMISSION_CODES/);
  assert.match(schema, /MODULE_21_ERROR_CODES/);
  assert.match(schema, /MODULE_21_EVENT_TYPES/);
});

test('Pass 324 preserves exactly the eight reviewed Scheduling route constants', () => {
  assert.match(schema, /MODULE_21_HTTP_ROUTES/);
  for (const route of [
    '/api/v1/projects/:projectId/schedule',
    '/api/v1/projects/:projectId/schedule/activities',
    '/api/v1/projects/:projectId/schedule/activities/:id',
    '/api/v1/projects/:projectId/schedule/dependencies',
    '/api/v1/projects/:projectId/schedule/baseline',
    '/api/v1/projects/:projectId/schedule/progress',
    '/api/v1/projects/:projectId/schedule/lookahead',
  ]) assert.ok(schema.includes(route), `Schema missing route ${route}`);
  assert.doesNotMatch(schema, /schedule\/reopen|schedule\/import|schedule\/sync|recalculate-cpm/);
});

test('Pass 324 keeps ownership, lifecycle, baseline and actor fields server-owned', () => {
  for (const field of [
    'companyId', 'actorUserId', 'permissions', 'allowedProjectIds', 'scheduleId',
    'status', 'baselineAt', 'baselineNo', 'snapshotJson', 'createdAt', 'createdBy', 'updatedBy',
  ]) assert.ok(schema.includes(`'${field}'`), `Missing server-owned field ${field}`);
});

test('Pass 324 accepts only Project and Activity UUID path identifiers', () => {
  assert.match(schema, /projectScheduleParamsSchema = z\.object\(\{[\s\S]*projectId: uuidSchema[\s\S]*\}\)\.strict\(\)/);
  assert.match(schema, /scheduleActivityParamsSchema = z\.object\(\{[\s\S]*projectId: uuidSchema,[\s\S]*id: uuidSchema[\s\S]*\}\)\.strict\(\)/);
});

test('Pass 324 keeps current-Schedule and look-ahead queries strict and filter-free', () => {
  assert.match(schema, /getProjectScheduleQuerySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.match(schema, /getScheduleLookaheadQuerySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.doesNotMatch(schema, /lookaheadWeeks|weeksAhead|fromDateQuery|startDateQuery|windowWeeks/);
});

test('Pass 324 create Schedule accepts only name and optional dataDate', () => {
  const block = schema.match(/createProjectScheduleBodySchema = z\.object\(\{[\s\S]*?\n\}\)\.strict\(\);/)?.[0] ?? '';
  assert.match(block, /name: scheduleNameSchema/);
  assert.match(block, /dataDate: dateSchema\.nullable\(\)\.optional\(\)/);
  assert.doesNotMatch(block, /companyId|projectId|status|baselineAt|baselineNo|snapshotJson|actorUserId/);
});

test('Pass 324 planning fields remain narrow while Pass 376 adds authorized owner input and derived duration output only', () => {
  const create = schema.match(/createScheduleActivityBodySchema = z\.object\(\{[\s\S]*?\n\}\)\.strict\(\)\.refine/)?.[0] ?? '';
  const update = schema.match(/updateScheduleActivityBodySchema = z\.object\(\{[\s\S]*?\n\}\)\.strict\(\)/)?.[0] ?? '';
  for (const field of ['parentId', 'activityCode', 'name', 'wbsNodeId', 'plannedStart', 'plannedFinish', 'milestone', 'ownerUserId']) {
    assert.ok(create.includes(field), `Create Activity missing ${field}`);
    assert.ok(update.includes(field), `Update Activity missing ${field}`);
  }
  assert.match(schema, /plannedDurationDays: z\.number\(\)\.int\(\)\.min\(0\)/);
  assert.match(schema, /Planned finish must be on or after planned start/);
  assert.doesNotMatch(`${create}\n${update}`, /actualStart|actualFinish|percentComplete|status|plannedDurationDays|durationDays|forecastStart/);
});

test('Pass 324 dependency replacement supports only FS, whole nonnegative lag and rejects self edges at the boundary', () => {
  assert.match(schema, /dependencyTypeSchema = z\.literal\('FS'\)/);
  assert.match(schema, /lagDaysSchema = z\.number\(\)\.int\(\)\.min\(0\)/);
  assert.match(schema, /predecessorActivityId !== value\.successorActivityId/);
  assert.match(schema, /replaceScheduleDependenciesBodySchema = z\.object\(\{[\s\S]*dependencies: z\.array\(scheduleDependencyInputSchema\)/);
  assert.doesNotMatch(schema, /z\.enum\(\['FS',\s*'SS'|dependencyTypeSchema.*SS|dependencyTypeSchema.*FF|dependencyTypeSchema.*SF/);
});

test('Pass 324 baseline command is bodyless and publishes a canonical server-created snapshot shape', () => {
  assert.match(schema, /createScheduleBaselineBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.match(schema, /scheduleBaselineSnapshotSchema = z\.object\(\{[\s\S]*schedule:[\s\S]*activities: z\.array\(scheduleActivityResponseSchema\),[\s\S]*dependencies: z\.array\(scheduleDependencyResponseSchema\)/);
  assert.match(schema, /snapshotJson: scheduleBaselineSnapshotSchema/);
});

test('Pass 324 progress accepts exact decimal percent, actual-date evidence and forecast finish without invented progress fields', () => {
  const progress = schema.match(/recordScheduleProgressBodySchema = z\.object\(\{[\s\S]*?\n\}\)\.strict\(\)\.refine/)?.[0] ?? '';
  for (const field of ['activityId', 'dataDate', 'percentComplete', 'actualStart', 'actualFinish', 'forecastFinish', 'remarks']) {
    assert.ok(progress.includes(field), `Progress body missing ${field}`);
  }
  assert.match(schema, /percent complete must be an exact decimal string from 0 through 100 with at most 4 decimal places/);
  assert.match(schema, /Actual finish requires 100 percent complete/);
  assert.doesNotMatch(progress, /forecastStart|remainingDuration|plannedQuantity|actualQuantity|progressWeight|approvedBy/);
});

test('Pass 324 responses serialize source decimal progress as strings and keep status vocabularies open', () => {
  assert.match(schema, /percentComplete: percentCompleteSchema/);
  assert.match(schema, /statusTokenSchema = z\.string\(\)\.trim\(\)\.min\(1\)\.max\(32\)/);
  assert.doesNotMatch(schema, /scheduleStatusSchema = z\.enum|activityStatusSchema = z\.enum/);
});

test('Pass 324 current Schedule response exposes owned activity dependency baseline and progress state without Company authority', () => {
  const response = schema.match(/projectScheduleResponseSchema = z\.object\(\{[\s\S]*?\n\}\)\.strict\(\);/)?.[0] ?? '';
  for (const field of ['projectId', 'name', 'status', 'baselineAt', 'dataDate', 'activities', 'dependencies', 'baselines', 'progressUpdates']) {
    assert.ok(response.includes(field), `Schedule response missing ${field}`);
  }
  assert.doesNotMatch(response, /companyId|permissions|allowedProjectIds|actorUserId/);
});

test('Pass 324 maps all reviewed Scheduling business errors to stable shared AppError types', () => {
  assert.match(schema, /createModule21Error\(code: Module21ErrorCode\): AppError/);
  assert.match(schema, /SCHEDULE_NOT_FOUND[\s\S]*new NotFoundError/);
  assert.match(schema, /INVALID_PROGRESS_UPDATE[\s\S]*new ValidationError/);
  assert.match(schema, /DUPLICATE_ACTIVITY_CODE[\s\S]*SCHEDULE_DEPENDENCY_CYCLE[\s\S]*SCHEDULE_BASELINE_LOCKED[\s\S]*new ConflictError/);
});

test('Pass 324 historically records later runtime layers as deferred after schema generation', async () => {
  assert.match(schemaGate, /serviceGenerated: false/);
  assert.match(schemaGate, /routesGenerated: false/);
  assert.match(schemaGate, /indexGenerated: false/);
  await assert.rejects(readFile('apps/web/src/features/scheduling', 'utf8'));
});

test('Pass 324 registers the schema gate and points to the repository pass next', () => {
  assert.equal(rootPackage.scripts['module-21:schema:gate'], 'node scripts/module-21/verify-stage-21-schema.mjs');
  assert.match(schemaGate, /pass: 324/);
  assert.match(schemaGate, /Pass 325 - Module 21 Company\/Project-scoped Scheduling repository primitives/);
});


test('Pass 325 adds only the Company/Project-scoped Scheduling repository runtime layer', () => {
  assert.match(repository, /DatabaseClient, TransactionClient/);
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /SchedulingProjectVisibilityRepositoryInput/);
  assert.doesNotMatch(repository, /FastifyInstance|useQuery|useMutation|createModule21Error/);
});

test('Pass 325 reuses explicit Module-24B Project visibility and trusted Company scope', () => {
  assert.match(repository, /allowedProjectIds: readonly string\[\] \| null/);
  assert.match(repository, /function isProjectVisible/);
  assert.match(repository, /visibility\.allowedProjectIds === null/);
  assert.match(repository, /requireCompanyRepositoryScope\(\)/);
  assert.doesNotMatch(repository, /companyId:\s*string[;,]/);
});

test('Pass 325 provides Project and current-Schedule row locks for concurrency-safe service transactions', () => {
  assert.match(repository, /lockProjectForScheduleWrite/);
  assert.match(repository, /FROM projects[\s\S]*company_id = \$\{scope\.companyId\}::uuid[\s\S]*FOR UPDATE/);
  assert.match(repository, /lockCurrentScheduleForWrite/);
  assert.match(repository, /FROM project_schedules[\s\S]*company_id = \$\{scope\.companyId\}::uuid[\s\S]*FOR UPDATE/);
});

test('Pass 325 prepares the singular current-Schedule aggregate read in deterministic history order', () => {
  assert.match(repository, /findCurrentScheduleByProjectId/);
  for (const relation of ['activities', 'dependencies', 'baselines', 'progressUpdates']) {
    assert.ok(repository.includes(`${relation}: {`), `Current Schedule include missing ${relation}`);
  }
  assert.match(repository, /where: scope\.where\(\{ projectId \}\)/);
});

test('Pass 325 creates one Schedule only after Project visibility and Company ownership are proven', () => {
  assert.match(repository, /createProjectSchedule\(input: CreateProjectScheduleRepositoryInput\)/);
  assert.match(repository, /const project = await this\.findProjectById\(input\.projectId, input\.visibility\)/);
  assert.match(repository, /scope\.createData\(\{/);
  assert.match(repository, /baselineAt: null/);
  assert.match(repository, /status: input\.status/);
});

test('Pass 325 scopes Activity reads to the current Project Schedule and optional WBS to the same Project', () => {
  assert.match(repository, /findScheduleActivityById/);
  assert.match(repository, /schedule: \{ projectId, companyId: scope\.companyId \}/);
  assert.match(repository, /findWbsNodeById/);
  assert.match(repository, /scope\.where\(\{ id: wbsNodeId, projectId \}\)/);
});

test('Pass 325 prepares Activity code collision and dependency endpoint validation reads', () => {
  assert.match(repository, /findScheduleActivityByCode/);
  assert.match(repository, /excludeActivityId/);
  assert.match(repository, /findScheduleActivitiesByIds/);
  assert.match(repository, /const ids = uniqueIds\(activityIds\)/);
});

test('Pass 325 keeps Activity creation planning-only and lifecycle/progress server-owned', () => {
  const block = repository.match(/async createScheduleActivity\([\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(block, /actualStart: null/);
  assert.match(block, /actualFinish: null/);
  assert.match(block, /percentComplete: input\.percentComplete/);
  assert.match(block, /status: input\.status/);
  assert.doesNotMatch(block, /actorUserId|companyId: input|allowedProjectIds: input/);
});

test('Pass 325 limits Activity PATCH persistence to reviewed planning fields', () => {
  const block = repository.match(/async updateScheduleActivity\([\s\S]*?return this\.findScheduleActivityById[\s\S]*?\n  \}/)?.[0] ?? '';
  for (const field of ['parentId', 'activityCode', 'name', 'wbsNodeId', 'plannedStart', 'plannedFinish', 'milestone']) {
    assert.ok(block.includes(field), `Activity update primitive missing ${field}`);
  }
  assert.doesNotMatch(block, /percentComplete|actualStart|actualFinish|status:/);
});

test('Pass 325 replaces the complete dependency set inside caller-owned transactions', () => {
  assert.match(repository, /replaceScheduleDependencies/);
  assert.match(repository, /scheduleDependency\.deleteMany\(\{ where: \{ scheduleId \} \}\)/);
  assert.match(repository, /scheduleDependency\.createMany/);
  assert.match(repository, /dependencyType: dependency\.dependencyType/);
  assert.match(repository, /return this\.listScheduleDependencies/);
});

test('Pass 325 does not duplicate the PostgreSQL dependency-cycle algorithm in the repository', () => {
  assert.doesNotMatch(repository, /WITH RECURSIVE reachable|depth-first|topological|visited = new Set/);
  assert.match(migration, /module_21_validate_dependency_graph/);
});

test('Pass 325 prepares immutable baseline lookup/create and current header timestamp update separately', () => {
  assert.match(repository, /findLatestScheduleBaseline/);
  assert.match(repository, /listScheduleBaselines/);
  assert.match(repository, /createScheduleBaseline/);
  assert.match(repository, /snapshotJson: input\.snapshotJson/);
  assert.match(repository, /updateScheduleBaselineTimestamp/);
  assert.doesNotMatch(repository, /updateScheduleBaseline\(|deleteScheduleBaseline\(/);
});

test('Pass 325 keeps progress history append-only while current Activity progress is a separate primitive', () => {
  assert.match(repository, /createScheduleProgressUpdate/);
  assert.match(repository, /updateScheduleActivityProgress/);
  assert.match(repository, /listScheduleProgressUpdates/);
  assert.doesNotMatch(repository, /updateScheduleProgressUpdate|deleteScheduleProgressUpdate/);
});

test('Pass 325 prepares bounded date-range activity readback without inventing public look-ahead query names', () => {
  assert.match(repository, /listScheduleActivitiesInDateRange/);
  assert.match(repository, /plannedStart: \{ lte: toDate \}/);
  assert.match(repository, /plannedFinish: \{ gte: fromDate \}/);
  assert.match(repository, /Scheduling date range end must not precede its start/);
  assert.doesNotMatch(repository, /lookaheadWeeks|weeksAhead|windowWeeks|fromDateQuery|startDateQuery/);
});

test('Pass 325 does not invent generic Scheduling delete, baseline mutation, CPM or downstream integration repository methods', () => {
  assert.doesNotMatch(repository, /deleteProjectSchedule|deleteScheduleActivity|reopenSchedule|importSchedule|syncSchedule|recalculateCpm|criticalPath|totalFloat|changeOrder|dailyReport/i);
});

test('Pass 325 registers its repository gate after the schema gate', () => {
  assert.equal(rootPackage.scripts['module-21:repository:gate'], 'node scripts/module-21/verify-stage-21-repository.mjs');
  assert.match(repositoryGate, /pass: 325/);
  assert.match(repositoryGate, /STAGE_21_MODULE_21_REPOSITORY_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING/);
});


test('Pass 326 adds only the Scheduling service runtime layer for business orchestration', () => {
  assert.match(service, /recordAudit/);
  assert.match(service, /executeIdempotentCommand/);
  assert.match(service, /recordOutboxEvent/);
  assert.match(service, /AdministrationRepository/);
  assert.match(service, /SchedulingRepository/);
  assert.doesNotMatch(service, /FastifyInstance|useQuery|useMutation|PrismaClient/);
});

test('Pass 326 revalidates exact Project-scoped Scheduling permissions through Module 24B', () => {
  assert.match(service, /requireProjectPermission/);
  assert.match(service, /scope\.kind === 'not-resolved'/);
  assert.match(service, /scope\.kind === 'restricted' && !scope\.projectIds\.includes\(projectId\)/);
  for (const permission of ['schedule.read', 'schedule.manage', 'schedule.baseline', 'schedule.progress']) {
    assert.ok(service.includes(`'${permission}'`), `Service missing permission ${permission}`);
  }
});

test('Pass 326 keeps the eight reviewed service operations and Pass 376 adds only baseline reopen', () => {
  for (const method of ['getProjectSchedule','createProjectSchedule','createScheduleActivity','updateScheduleActivity','replaceScheduleDependencies','createScheduleBaseline','recordScheduleProgress','getScheduleLookahead','reopenScheduleBaseline']) {
    assert.match(service, new RegExp(`async ${method}\\(`));
  }
  assert.doesNotMatch(service, /deleteSchedule|importSchedule|syncSchedule|recalculateCpm/);
});

test('Pass 326 six reviewed mutations remain idempotent and Pass 376 adds one idempotent reopen command', () => {
  for (const operation of ['scheduling.schedule-create','scheduling.activity-create','scheduling.activity-update','scheduling.dependencies-replace','scheduling.baseline-create','scheduling.progress-record','scheduling.baseline-reopen']) {
    assert.ok(service.includes(`operation: '${operation}'`), `Missing idempotency operation ${operation}`);
  }
  assert.equal((service.match(/executeIdempotentCommand\(/g) ?? []).length, 7);
});

test('Pass 326 creates one current Schedule under a Project lock and emits only schedule.created', () => {
  assert.match(service, /lockProjectForScheduleWrite/);
  assert.match(service, /findCurrentScheduleByProjectId/);
  assert.match(service, /status: SCHEDULE_ACTIVE/);
  assert.match(service, /action: 'schedule\.created'/);
  assert.match(service, /eventType: 'schedule\.created'/);
  assert.match(service, /A current Schedule already exists for this Project/);
});

test('Pass 326 validates Activity code parent WBS hierarchy and final date order before planning writes', () => {
  assert.match(service, /findScheduleActivityByCode/);
  assert.match(service, /requireParentActivity/);
  assert.match(service, /requireWbsNode/);
  assert.match(service, /requireValidPlannedDateOrder/);
  assert.match(service, /requireAcyclicActivityParent/);
  assert.match(service, /percentComplete: ZERO_PROGRESS/);
  assert.match(service, /status: ACTIVITY_ACTIVE/);
});

test('Pass 326 resolves schedule.milestone_changed narrowly to an explicit milestone boolean change', () => {
  assert.match(service, /input\.milestone !== undefined && input\.milestone !== current\.milestone/);
  assert.match(service, /eventType: 'schedule\.milestone_changed'/);
  assert.match(service, /previousMilestone: current\.milestone/);
  assert.equal((service.match(/eventType: 'schedule\.milestone_changed'/g) ?? []).length, 1);
});

test('Pass 326 validates complete dependency replacement in service and keeps PostgreSQL as the final cycle safety net', () => {
  assert.match(service, /requireUniqueDependencies\(input\.dependencies\)/);
  assert.match(service, /dependencyGraphHasCycle\(input\.dependencies\)/);
  assert.match(service, /findScheduleActivitiesByIds/);
  assert.match(service, /createModule21Error\('SCHEDULE_DEPENDENCY_CYCLE'\)/);
  assert.match(service, /isConstraintConflict/);
  assert.match(service, /action: 'schedule\.dependencies_replaced'/);
  assert.doesNotMatch(service, /eventType: 'schedule\.dependencies_replaced'/);
});

test('Pass 326 creates immutable baseline history with server-owned monotonic numbering and actor identity', () => {
  assert.match(service, /findLatestScheduleBaseline/);
  assert.match(service, /const baselineNo = \(latest\?\.baselineNo \?\? 0\) \+ 1/);
  assert.match(service, /security\.actorUserId/);
  assert.match(service, /buildBaselineSnapshot/);
  assert.match(service, /scheduleBaselineSnapshotSchema\.parse/);
  assert.match(service, /updateScheduleBaselineTimestamp/);
  assert.match(service, /eventType: 'schedule\.baselined'/);
  assert.doesNotMatch(service, /updateScheduleBaseline\(|deleteScheduleBaseline\(/);
});

test('Pass 326 records append-only progress and current Activity progress atomically without rewriting baselines', () => {
  assert.match(service, /updateScheduleActivityProgress/);
  assert.match(service, /createScheduleProgressUpdate/);
  assert.match(service, /createModule21Error\('INVALID_PROGRESS_UPDATE'\)/);
  assert.match(service, /action: 'schedule\.progress_updated'/);
  assert.match(service, /eventType: 'schedule\.progress_updated'/);
  const progressBlock = service.match(/private async recordScheduleProgressOnce\([\s\S]*?return \{ statusCode: 201, body: response \};\n  \}/)?.[0] ?? '';
  assert.doesNotMatch(progressBlock, /createScheduleBaseline|updateScheduleBaselineTimestamp|snapshotJson/);
});

test('Pass 376 locks planning after baseline while preserving reviewed post-baseline progress', () => {
  const progressBlock = service.match(/private async recordScheduleProgressOnce\([\s\S]*?return \{ statusCode: 201, body: response \};\n  \}/)?.[0] ?? '';
  assert.doesNotMatch(progressBlock, /requirePlanningBaselineOpen/);
  assert.match(service, /requirePlanningBaselineOpen\(schedule/);
  assert.match(service, /reopenScheduleBaseline/);
  assert.match(service, /baselineAt: null/);
});

test('Pass 326 implements a bounded first-scope two-week look-ahead from Schedule data_date without public query invention', () => {
  assert.match(service, /const LOOKAHEAD_DAYS = 14/);
  assert.match(service, /Schedule data date is required for the bounded look-ahead view/);
  assert.match(service, /const fromDate = schedule\.dataDate/);
  assert.match(service, /const toDate = addUtcDays\(fromDate, LOOKAHEAD_DAYS\)/);
  assert.match(service, /listScheduleActivitiesInDateRange/);
  assert.doesNotMatch(service, /weeksAhead|windowWeeks|query\.from|query\.startDate/);
});

test('Pass 326 keeps source-defined audit and outbox behavior inside the same service transactions', () => {
  for (const action of ['schedule.created', 'schedule.baselined', 'schedule.progress_updated']) {
    assert.ok(service.includes(`action: '${action}'`), `Missing audit ${action}`);
    assert.ok(service.includes(`eventType: '${action}'`), `Missing outbox event ${action}`);
  }
  assert.match(service, /action: 'schedule\.dependencies_replaced'/);
  assert.match(service, /action: 'schedule\.activity_updated'/);
});

test('Pass 326 does not pull advanced CPM, Change Order, Daily Report or external-sync logic into Scheduling', () => {
  assert.doesNotMatch(service, /criticalPath|totalFloat|freeFloat|resourceLevel|primavera|p6|changeOrder|dailyReport|externalScheduler/i);
});

test('Pass 326 registers the service gate after the repository gate', () => {
  assert.equal(rootPackage.scripts['module-21:service:gate'], 'node scripts/module-21/verify-stage-21-service.mjs');
  assert.match(serviceGate, /pass: 326/);
  assert.match(serviceGate, /STAGE_21_MODULE_21_SERVICE_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING/);
});


test('Pass 327 preserves eight reviewed HTTP operations and Pass 376 adds one focused reopen route', () => {
  const routeCalls = routes.match(/app\.(?:get|post|patch|put)\('/g) ?? [];
  assert.equal(routeCalls.length, 9);
  for (const route of ["app.get('/api/v1/projects/:projectId/schedule'","app.post('/api/v1/projects/:projectId/schedule'","app.post('/api/v1/projects/:projectId/schedule/activities'","app.patch('/api/v1/projects/:projectId/schedule/activities/:id'","app.put('/api/v1/projects/:projectId/schedule/dependencies'","app.post('/api/v1/projects/:projectId/schedule/baseline'","app.post('/api/v1/projects/:projectId/schedule/baseline/reopen'","app.post('/api/v1/projects/:projectId/schedule/progress'","app.get('/api/v1/projects/:projectId/schedule/lookahead'"]) {
    assert.ok(routes.includes(route), `Missing HTTP registration ${route}`);
  }
  assert.doesNotMatch(routes, /delete\(|importSchedule|syncSchedule|criticalPath|resourceLevel/i);
});

test('Pass 327 authenticates reviewed routes and Pass 376 repair while Project RBAC remains service-authoritative', () => {
  assert.equal((routes.match(/await authenticateRequest\(request, options\.database\)/g) ?? []).length, 9);
  assert.match(routes, /new SchedulingService\(options\.database\)/);
  for (const permission of ['schedule.read','schedule.manage','schedule.baseline','schedule.progress']) assert.ok(service.includes(`'${permission}'`));
  assert.doesNotMatch(routes, /companyId\s*=|actorUserId\s*=|allowedProjectIds\s*=/);
});

test('Pass 327 six reviewed writes plus Pass 376 reopen require Idempotency-Key', () => {
  assert.equal((routes.match(/headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA/g) ?? []).length, 7);
  assert.equal((routes.match(/readIdempotencyKey\(request\)/g) ?? []).length, 7);
  assert.match(routes, /A valid Idempotency-Key header is required/);
});

test('Pass 327 keeps baseline bodyless and look-ahead queryless at the public boundary', () => {
  const baseline = routes.slice(
    routes.indexOf("app.post('/api/v1/projects/:projectId/schedule/baseline'"),
    routes.indexOf("app.post('/api/v1/projects/:projectId/schedule/progress'")
  );
  assert.match(baseline, /body: EMPTY_BODY_JSON_SCHEMA/);
  assert.match(baseline, /request\.body \?\? \{\}/);
  const lookahead = routes.slice(routes.indexOf("app.get('/api/v1/projects/:projectId/schedule/lookahead'"));
  assert.match(lookahead, /querystring: EMPTY_QUERY_JSON_SCHEMA/);
  assert.doesNotMatch(lookahead, /weeksAhead|windowWeeks|startDate|fromDate/);
});

test('Pass 327 keeps strict server-owned request authority and exact first-scope dependency type', () => {
  assert.match(routes, /additionalProperties: false/);
  assert.match(routes, /dependencyType: \{ type: 'string', enum: \['FS'\] \}/);
  assert.match(routes, /percentComplete: PERCENT_COMPLETE_JSON_SCHEMA/);
  for (const forbidden of ['companyId', 'actorUserId', 'allowedProjectIds', 'baselineNo', 'snapshotJson', 'createdBy', 'updatedBy']) {
    const inputSection = routes.slice(routes.indexOf('const CREATE_SCHEDULE_BODY_JSON_SCHEMA'), routes.indexOf('/** Register exactly'));
    assert.doesNotMatch(inputSection, new RegExp(`\\b${forbidden}\\b`), `HTTP input schema exposes ${forbidden}`);
  }
});

test('Pass 327 validates every successful response through the Pass-324 Zod response schemas', () => {
  for (const schemaName of [
    'projectScheduleResponseSchema',
    'createProjectScheduleResponseSchema',
    'createScheduleActivityResponseSchema',
    'updateScheduleActivityResponseSchema',
    'replaceScheduleDependenciesResponseSchema',
    'createScheduleBaselineResponseSchema',
    'recordScheduleProgressResponseSchema',
    'scheduleLookaheadResponseSchema',
  ]) assert.match(routes, new RegExp(`${schemaName}\\.parse\\(`));
});

test('Pass 327 exposes reviewed Scheduling errors without leaking SQL or stack details', () => {
  for (const code of [
    'SCHEDULE_NOT_FOUND',
    'DUPLICATE_ACTIVITY_CODE',
    'SCHEDULE_DEPENDENCY_CYCLE',
    'SCHEDULE_BASELINE_LOCKED',
    'INVALID_PROGRESS_UPDATE',
  ]) assert.ok(routes.includes(`'${code}'`), `OpenAPI missing ${code}`);
  assert.match(routes, /INTERNAL_SERVER_ERROR/);
  assert.doesNotMatch(routes, /stack|sql|queryText|constraintName/);
});

test('Pass 327 completes the required five-file Scheduling backend module and app registration', () => {
  assert.match(indexFile, /export \{ SchedulingRepository \}/);
  assert.match(indexFile, /export \{ SchedulingService \}/);
  assert.match(indexFile, /export \{ registerSchedulingRoutes \}/);
  assert.match(app, /import \{ registerSchedulingRoutes \} from '\.\/modules\/scheduling\/index\.js'/);
  assert.match(app, /app\.register\(registerSchedulingRoutes, \{ database: options\.database \}\)/);
});

test('Pass 327 OpenAPI remains intact and Pass 376 adds only one baseline-reopen operation', () => {
  assert.equal((routes.match(/operationId: 'module21/g) ?? []).length, 9);
  assert.equal((routes.match(/tags: \['Module 21 - Project Scheduling'\]/g) ?? []).length, 9);
  assert.equal((routes.match(/security: BEARER_SECURITY/g) ?? []).length, 9);
  assert.match(routes, /module21ReopenScheduleBaseline/);
  assert.doesNotMatch(routes, /\/schedule\/delete|\/schedule\/import|\/schedule\/sync|\/critical-path/);
});

test('Pass 327 keeps purpose comments on every newly named HTTP function', () => {
  for (const name of ['errorResponseSchema', 'parseRequest', 'readIdempotencyKey', 'registerSchedulingRoutes']) {
    const position = routes.indexOf(`function ${name}`);
    const asyncPosition = routes.indexOf(`function registerSchedulingRoutes`);
    const target = name === 'registerSchedulingRoutes' ? asyncPosition : position;
    assert.ok(target >= 0, `Missing named function ${name}`);
    assert.match(routes.slice(Math.max(0, target - 220), target), /\/\*\*[\s\S]*?\*\//);
  }
});

test('Pass 327 registers the HTTP gate and points to integration/security next', () => {
  assert.equal(rootPackage.scripts['module-21:http:gate'], 'node scripts/module-21/verify-stage-21-http.mjs');
  assert.match(httpGate, /pass: 327/);
  assert.match(httpGate, /exactReviewedRouteCount: 8/);
  assert.match(httpGate, /idempotentCommandRouteCount: 6/);
  assert.match(httpGate, /STAGE_21_MODULE_21_HTTP_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING/);
  assert.match(httpGate, /Pass 328 - Module 21 PostgreSQL\/Fastify integration/);
});


test('Pass 328 adds verification only and keeps the five-file Scheduling production module unchanged', () => {
  assert.match(integrationGate, /productionRuntimeChanges: 0/);
  assert.match(integrationGate, /databaseChanges: 0/);
  assert.match(integrationGate, /newMigrations: 0/);
  assert.match(integrationGate, /publicRoutesAdded: 0/);
  assert.doesNotMatch(integrationGate, /apps\/web\/src\/features\/scheduling/);
});

test('Pass 328 prepares live coverage for all eight reviewed Scheduling operations', () => {
  for (const path of [
    '/api/v1/projects/${PROJECT_ID}/schedule',
    '/api/v1/projects/${PROJECT_ID}/schedule/activities',
    '/api/v1/projects/${PROJECT_ID}/schedule/dependencies',
    '/api/v1/projects/${PROJECT_ID}/schedule/baseline',
    '/api/v1/projects/${PROJECT_ID}/schedule/progress',
    '/api/v1/projects/${PROJECT_ID}/schedule/lookahead',
  ]) assert.ok(integrationTest.includes(path), `Integration suite misses ${path}`);
  assert.match(integrationGate, /reviewedRouteCount: 8/);
  assert.match(integrationGate, /reviewedWriteCount: 6/);
});

test('Pass 328 verifies Schedule, Activity, dependency, baseline, progress and look-ahead persistence', () => {
  for (const clientModel of [
    'client.projectSchedule',
    'client.scheduleActivity',
    'client.scheduleDependency',
    'client.scheduleBaseline',
    'client.scheduleProgressUpdate',
  ]) assert.ok(integrationTest.includes(clientModel), `Integration suite misses ${clientModel}`);
  assert.match(integrationTest, /baseline\.snapshotJson\.activities/);
  assert.match(integrationTest, /schedule\/lookahead/);
});

test('Pass 328 verifies stable validation and dependency-cycle failures', () => {
  assert.match(integrationTest, /DUPLICATE_ACTIVITY_CODE/);
  assert.match(integrationTest, /SCHEDULE_DEPENDENCY_CYCLE/);
  assert.match(integrationTest, /INVALID_REQUEST/);
  assert.match(integrationTest, /OTHER_WBS_ID/);
  assert.match(integrationTest, /hierarchy cycle/i);
});

test('Pass 328 verifies authentication, RBAC, Project scope and cross-Company denial', () => {
  assert.match(integrationTest, /statusCode, 401/);
  assert.match(integrationTest, /statusCode, 403/);
  assert.match(integrationTest, /module21-reader@example\.test/);
  assert.match(integrationTest, /module21-project@example\.test/);
  assert.match(integrationTest, /module21-admin-b@example\.test/);
  assert.match(integrationGate, /crossProjectIsolationVerified/);
  assert.match(integrationGate, /crossCompanyIsolationVerified/);
});

test('Pass 328 verifies Idempotency-Key replay and rejects browser-owned Scheduling authority', () => {
  assert.match(integrationTest, /'idempotency-key'/);
  assert.match(integrationTest, /module21-replay-schedule/);
  assert.match(integrationTest, /companyId: COMPANY_ID/);
  assert.match(integrationGate, /strict rejection of browser-owned Company\/lifecycle\/baseline\/audit authority/);
});

test('Pass 328 verifies immutable baseline and append-only progress database protection', () => {
  assert.match(integrationTest, /client\.scheduleBaseline\.update/);
  assert.match(integrationTest, /client\.scheduleProgressUpdate\.update/);
  assert.match(integrationGate, /baselineImmutabilityVerified/);
  assert.match(integrationGate, /progressAppendOnlyVerified/);
});

test('Pass 328 verifies the reviewed audit and outbox event boundary without inventing dependency events', () => {
  for (const eventType of [
    'schedule.created',
    'schedule.milestone_changed',
    'schedule.baselined',
    'schedule.progress_updated',
  ]) assert.ok(integrationTest.includes(eventType), `Integration suite misses ${eventType}`);
  assert.match(integrationTest, /schedule\.activity_updated/);
  assert.doesNotMatch(integrationTest, /eventType:\s*['"]schedule\.dependencies_replaced/);
});

test('Pass 328 verifies generated OpenAPI exposes exactly eight Module-21 operations and six idempotent writes', () => {
  assert.match(integrationTest, /document\.openapi, '3\.0\.3'/);
  assert.match(integrationTest, /actualModule21/);
  assert.match(integrationTest, /startsWith\('module21'\)/);
  assert.match(integrationTest, /must require Idempotency-Key/);
  assert.match(integrationTest, /critical-path/);
  assert.match(integrationGate, /generatedOpenApiVerified/);
});

test('Pass 328 keeps live PostgreSQL execution fail-honest behind Stage-20 acceptance', () => {
  assert.match(integrationGate, /STAGE_20_ACCEPTED_READY_FOR_STAGE_21/);
  assert.match(integrationGate, /STAGE_20_LIVE_HANDOFF_REQUIRED/);
  assert.match(integrationGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(integrationGate, /runtimeVerificationComplete: passed && mode === 'live' && stage20LiveAccepted/);
});

test('Pass 328 registers static and live integration-security gates and points to React data next', () => {
  assert.equal(
    rootPackage.scripts['module-21:integration-security:gate'],
    'node scripts/module-21/verify-stage-21-integration-security.mjs --mode=static'
  );
  assert.equal(
    rootPackage.scripts['module-21:integration-security:gate:live'],
    'node scripts/module-21/verify-stage-21-integration-security.mjs --mode=live'
  );
  assert.match(rootPackage.scripts['test:integration:module-21'], /tests\/integration\/module-21-api\.integration\.test\.mjs/);
  assert.match(integrationGate, /pass: 328/);
  assert.match(integrationGate, /Pass 329 - Module 21 React typed API client/);
});


test('Pass 329 adds only the typed Scheduling browser API and TanStack Query data layer', () => {
  assert.match(reactDataGate, /productionFilesChanged: 2/);
  assert.match(reactDataGate, /reactComponentsAdded: 0/);
  assert.match(reactDataGate, /reactPagesAdded: 0/);
  assert.match(reactDataGate, /productionBackendChanges: 0/);
  assert.match(reactDataGate, /databaseChanges: 0/);
});

test('Pass 329 browser API preserves eight reviewed operations and Pass 376 adds only baseline reopen', () => {
  for (const name of ['getProjectSchedule','createProjectSchedule','createScheduleActivity','updateScheduleActivity','replaceScheduleDependencies','createScheduleBaseline','reopenScheduleBaseline','recordScheduleProgress','getScheduleLookahead']) assert.match(reactApi, new RegExp(`export function ${name}\\(`));
  assert.equal((reactApi.match(/authenticatedRequest</g) ?? []).length, 9);
  assert.doesNotMatch(reactApi, /deleteSchedule|deleteActivity|criticalPath|resourceLevel|schedulerSync/);
});

test('Pass 329 preserves exact Scheduling request authority and source-bounded field types', () => {
  assert.match(reactApi, /dependencyType: 'FS'/);
  assert.match(reactApi, /percentComplete: string/);
  assert.match(reactApi, /dataDate\?: string \| null/);
  for (const forbidden of ['companyId', 'actorUserId', 'allowedProjectIds', 'baselineNo', 'snapshotJson', 'createdBy', 'updatedBy']) {
    const inputSection = reactApi.slice(reactApi.indexOf('export type CreateProjectScheduleInput'), reactApi.indexOf('/** Build the Foundation retry header'));
    assert.doesNotMatch(inputSection, new RegExp(`\\b${forbidden}\\b`), `Browser input exposes ${forbidden}`);
  }
});

test('Pass 329 six reviewed writes plus Pass 376 reopen send Idempotency-Key and both baseline commands are bodyless', () => {
  assert.equal((reactApi.match(/headers: schedulingCommandHeaders\(idempotencyKey\)/g) ?? []).length, 7);
  const baseline = reactApi.slice(reactApi.indexOf('export function createScheduleBaseline'), reactApi.indexOf('/** Record one append-only'));
  assert.doesNotMatch(baseline, /body:/);
  const reopen = reactApi.slice(reactApi.indexOf('export function reopenScheduleBaseline'), reactApi.indexOf('/** Record one append-only'));
  assert.match(reopen, /method: 'POST'/);
  assert.match(reopen, /headers: schedulingCommandHeaders\(idempotencyKey\)/);
  assert.doesNotMatch(reopen, /body:/);
});

test('Pass 329 keeps look-ahead queryless instead of inventing browser filters', () => {
  const lookahead = reactApi.slice(reactApi.indexOf('export function getScheduleLookahead'));
  assert.match(lookahead, /projects\/\$\{projectId\}\/schedule\/lookahead/);
  assert.doesNotMatch(lookahead, /URLSearchParams|weeksAhead|windowWeeks|startDate|fromDate|\?/);
});

test('Pass 329 exposes one simple TanStack Query hook per reviewed Scheduling operation', () => {
  for (const name of [
    'useProjectSchedule',
    'useCreateProjectSchedule',
    'useCreateScheduleActivity',
    'useUpdateScheduleActivity',
    'useReplaceScheduleDependencies',
    'useCreateScheduleBaseline',
    'useRecordScheduleProgress',
    'useScheduleLookahead',
  ]) assert.match(reactHooks, new RegExp(`export function ${name}\\(`));
  assert.match(reactHooks, /const MODULE_21_QUERY_KEY = \['module-21', 'scheduling'\] as const/);
});

test('Pass 329 keeps cache invalidation limited to current Schedule and relevant look-ahead state', () => {
  assert.match(reactHooks, /function invalidateProjectSchedule/);
  assert.match(reactHooks, /'schedule', projectId/);
  assert.match(reactHooks, /'lookahead', projectId/);
  assert.match(reactHooks, /useReplaceScheduleDependencies[\s\S]*?invalidateProjectSchedule\(queryClient, variables\.projectId, false\)/);
  assert.match(reactHooks, /useCreateScheduleBaseline[\s\S]*?invalidateProjectSchedule\(queryClient, projectId, false\)/);
  assert.match(reactHooks, /useRecordScheduleProgress[\s\S]*?invalidateProjectSchedule\(queryClient, variables\.projectId, true\)/);
});

test('Pass 329 keeps clear purpose comments on every named browser helper and API function', () => {
  for (const [source, name] of [
    [reactApi, 'schedulingCommandHeaders'],
    [reactApi, 'getProjectSchedule'],
    [reactApi, 'createProjectSchedule'],
    [reactApi, 'createScheduleActivity'],
    [reactApi, 'updateScheduleActivity'],
    [reactApi, 'replaceScheduleDependencies'],
    [reactApi, 'createScheduleBaseline'],
    [reactApi, 'recordScheduleProgress'],
    [reactApi, 'getScheduleLookahead'],
    [reactHooks, 'newIdempotencyKey'],
    [reactHooks, 'invalidateProjectSchedule'],
    [reactHooks, 'useProjectSchedule'],
    [reactHooks, 'useScheduleLookahead'],
  ]) {
    const position = source.indexOf(`function ${name}`);
    assert.ok(position >= 0, `Missing named function ${name}`);
    assert.match(source.slice(Math.max(0, position - 240), position), /\/\*\*[\s\S]*?\*\//);
  }
});

test('Pass 329 registers its gate and points to the Scheduling workspace next', () => {
  assert.equal(rootPackage.scripts['module-21:react-data:gate'], 'node scripts/module-21/verify-stage-21-react-data.mjs');
  assert.equal(rootPackage.scripts['pass-329:scheduling-react-data:gate'], 'node scripts/module-21/verify-stage-21-react-data.mjs');
  assert.match(reactDataGate, /pass: 329/);
  assert.match(reactDataGate, /reviewedRouteCount: 8/);
  assert.match(reactDataGate, /reviewedWriteCount: 6/);
  assert.match(reactDataGate, /STAGE_21_MODULE_21_REACT_DATA_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING/);
  assert.match(reactDataGate, /Pass 330 - Module 21 Project Scheduling React workspace/);
});


test('Pass 330 adds one Scheduling workspace and one page without backend or database expansion', () => {
  assert.match(reactGate, /pass: 330/);
  assert.match(reactGate, /productionFilesChanged: 4/);
  assert.match(reactGate, /reactComponentsAdded: 1/);
  assert.match(reactGate, /reactPagesAdded: 1/);
  assert.match(reactGate, /productionBackendChanges: 0/);
  assert.match(reactGate, /databaseChanges: 0/);
});

test('Pass 330 reuses Project discovery and keeps Scheduling actions permission-aware', () => {
  assert.match(reactPage, /useProjects\(\{ page: projectPage, pageSize: 25 \}, canDiscoverProjects\)/);
  assert.match(reactPage, /useProjectWorkspaceVisibility\(\)/);
  for (const permission of ['schedule.read', 'schedule.manage', 'schedule.baseline', 'schedule.progress']) {
    assert.ok(reactPage.includes(`usePermission('${permission}')`), `Missing UI permission ${permission}`);
  }
  assert.match(reactPage, /Project discovery reuses Module 5/);
  assert.match(reactPage, /does not invent a second Project lookup route/);
});

test('Pass 330 provides the source-required Activity table, milestones and planning edit workflow', () => {
  assert.match(reactWorkspace, /Activities & milestones/);
  assert.match(reactWorkspace, /Create Activity/);
  assert.match(reactWorkspace, /Edit Activity/);
  assert.match(reactWorkspace, /useCreateScheduleActivity\(\)/);
  assert.match(reactWorkspace, /useUpdateScheduleActivity\(\)/);
  assert.match(reactWorkspace, /useWbsTree\(props\.projectId, props\.canReadWbs\)/);
  assert.match(reactWorkspace, /Milestone/);
});

test('Pass 330 provides a Gantt-style planned-date view without advanced CPM claims', () => {
  assert.match(reactWorkspace, /Gantt-style planned-date view/);
  assert.match(reactWorkspace, /function activityBarStyle/);
  assert.match(reactWorkspace, /not critical-path, float, resource-loading or P6 logic/);
  assert.match(sharedStyles, /\.module21-gantt-track/);
  assert.match(sharedStyles, /\.module21-gantt-bar/);
  assert.doesNotMatch(reactWorkspace, /criticalPath|totalFloat|freeFloat|resourceLeveling|primavera/i);
});

test('Pass 330 edits only the complete reviewed FS dependency set', () => {
  assert.match(reactWorkspace, /Dependencies/);
  assert.match(reactWorkspace, /useReplaceScheduleDependencies\(\)/);
  assert.match(reactWorkspace, /dependencyType: 'FS'/);
  assert.match(reactWorkspace, /Save complete dependency set/);
  assert.match(reactWorkspace, /whole nonnegative lag days/);
  assert.doesNotMatch(reactWorkspace, /dependencyType: 'SS'|dependencyType: 'FF'|dependencyType: 'SF'/);
});

test('Pass 330 exposes immutable baseline history and baseline-versus-current dates', () => {
  assert.match(reactWorkspace, /Baseline vs current dates/);
  assert.match(reactWorkspace, /useCreateScheduleBaseline\(\)/);
  assert.match(reactWorkspace, /Latest baseline:/);
  assert.match(reactWorkspace, /Baseline start/);
  assert.match(reactWorkspace, /Current finish/);
  assert.match(reactWorkspace, /Baseline snapshots are immutable history/);
});

test('Pass 330 exposes append-only exact progress and the source-bounded look-ahead', () => {
  assert.match(reactWorkspace, /Progress entry/);
  assert.match(reactWorkspace, /useRecordScheduleProgress\(\)/);
  assert.match(reactWorkspace, /Progress history/);
  assert.match(reactWorkspace, /percentComplete: values\.percentComplete/);
  assert.match(reactWorkspace, /Two-week look-ahead/);
  assert.match(reactWorkspace, /useScheduleLookahead\(projectId, enabled\)/);
  assert.match(reactWorkspace, /reviewed API defines no browser query fields/);
  assert.doesNotMatch(reactWorkspace, /weeksAhead|windowWeeks|lookaheadStartDate/);
});

test('Pass 330 integrates Project Scheduling into the existing admin shell only', () => {
  assert.match(adminShell, /import \{ SchedulingPage \}/);
  assert.match(adminShell, /const canUseModule21 =/);
  assert.match(adminShell, /function showScheduling\(\)/);
  assert.match(adminShell, />Project Scheduling<\/button>/);
  assert.match(adminShell, /activeView === 'scheduling' && <SchedulingPage \/>/);
  assert.match(sharedStyles, /\/\* Module 21 - Project Scheduling \*\//);
});

test('Pass 330 keeps purpose comments on every new named Scheduling workspace function', () => {
  for (const name of [
    'errorMessage', 'isNotFound', 'FieldError', 'dayNumber', 'activityBarStyle', 'latestBaseline',
    'activityValues', 'dependencyValues', 'CreateScheduleForm', 'ActivityPlanner', 'GanttStyleView',
    'DependencyEditor', 'BaselinePanel', 'ProgressPanel', 'LookaheadPanel', 'SchedulingWorkspace'
  ]) {
    const position = reactWorkspace.indexOf(`function ${name}`);
    assert.ok(position >= 0, `Missing named function ${name}`);
    assert.match(reactWorkspace.slice(Math.max(0, position - 260), position), /\/\*\*[\s\S]*?\*\//);
  }
  for (const name of ['SchedulingPage', 'handleSelectProject', 'handlePreviousProjectPage', 'handleNextProjectPage']) {
    const position = reactPage.indexOf(`function ${name}`);
    assert.ok(position >= 0, `Missing named page function ${name}`);
    assert.match(reactPage.slice(Math.max(0, position - 260), position), /\/\*\*[\s\S]*?\*\//);
  }
});

test('Pass 330 registers its React gate and points to Playwright next', () => {
  assert.equal(rootPackage.scripts['module-21:react:gate'], 'node scripts/module-21/verify-stage-21-react.mjs');
  assert.equal(rootPackage.scripts['pass-330:scheduling-react:gate'], 'node scripts/module-21/verify-stage-21-react.mjs');
  assert.match(reactGate, /STAGE_21_MODULE_21_REACT_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING/);
  assert.match(reactGate, /Pass 331 - Module 21 Playwright Project Scheduling/);
});


test('Pass 331 adds only the reviewed Module 21 Playwright verification boundary', () => {
  assert.match(playwrightGate, /pass: 331/);
  assert.match(playwrightGate, /stage: 21/);
  assert.match(playwrightGate, /productionRuntimeFilesChanged: 0/);
  assert.match(playwrightGate, /databaseChanges: 0/);
  assert.match(playwrightGate, /newMigrations: 0/);
  assert.match(playwrightGate, /publicRoutesAdded: 0/);
  assert.match(playwrightGate, /newPermissions: 0/);
  assert.match(playwrightGate, /newBrowserFiles: 1/);
  assert.match(playwrightGate, /reviewedRouteCount: 8/);
  assert.match(playwrightGate, /reviewedWriteCount: 6/);
});

test('Pass 331 browser workflow uses real auth, admin navigation and Module 5 Project selection', () => {
  assert.match(browserTest, /async function signIn\(page, email\)/);
  assert.match(browserTest, /button', \{ name: 'Project Scheduling' \}/);
  assert.match(browserTest, /getByLabel\('Project'\)\.selectOption\(PROJECT_ID\)/);
  assert.match(browserTest, /Pass 331 Construction Master Schedule/);
});

test('Pass 331 browser workflow covers Activity hierarchy, WBS planning and reviewed edits', () => {
  assert.match(browserTest, /A100/);
  assert.match(browserTest, /Site mobilization/);
  assert.match(browserTest, /A200/);
  assert.match(browserTest, /Foundation works/);
  assert.match(browserTest, /getByLabel\('Parent Activity'\)\.selectOption\(firstActivity\.id\)/);
  assert.match(browserTest, /getByLabel\('Optional WBS'\)\.selectOption\(WBS_ID\)/);
  assert.match(browserTest, /heading', \{ name: 'Edit Activity' \}/);
  assert.match(browserTest, /2026-08-07/);
});

test('Pass 331 browser workflow keeps dependency scope at complete FS replacement with nonnegative whole lag', () => {
  assert.match(browserTest, /button', \{ name: 'Add dependency' \}/);
  assert.match(browserTest, /button', \{ name: 'Save complete dependency set' \}/);
  assert.match(browserTest, /dependency\.dependencyType\)\.toBe\('FS'\)/);
  assert.match(browserTest, /dependency\.lagDays\)\.toBe\(2\)/);
  assert.doesNotMatch(browserTest, /toBe\('(SS|FF|SF)'\)/);
});

test('Pass 331 browser workflow verifies bodyless immutable baseline before later current-state changes', () => {
  assert.match(browserTest, /button', \{ name: 'Create baseline' \}/);
  assert.match(browserTest, /baselineWrite\?\.body\)\.toBeNull\(\)/);
  assert.match(browserTest, /const snapshot = baseline\.snapshotJson/);
  assert.match(browserTest, /frozenFirstActivity\?\.plannedFinish\)\.toBe\('2026-08-05'\)/);
  assert.match(browserTest, /currentActivity\.plannedFinish[^\n]*toBe\('2026-08-07'\)/);
  assert.match(browserTest, /frozenFirstActivity\?\.actualStart\)\.toBeNull\(\)/);
});

test('Pass 331 browser workflow verifies exact-decimal append-only progress plus Gantt and queryless lookahead', () => {
  assert.match(browserTest, /fill\('35\.5000'\)/);
  assert.match(browserTest, /button', \{ name: 'Record progress' \}/);
  assert.match(browserTest, /scheduleProgressUpdate\.findFirstOrThrow/);
  assert.match(browserTest, /percentComplete\.toString\(\)\)\.toBe\('35\.5'\)/);
  assert.match(browserTest, /module21-gantt-title/);
  assert.match(browserTest, /module21-lookahead-title/);
  assert.match(browserTest, /for \(const request of lookaheadReads\) expect\(request\.query\)\.toEqual\(\{\}\)/);
  assert.doesNotMatch(browserTest, /criticalPath\s*:/);
});

test('Pass 331 browser request capture enforces the eight reviewed routes and all six idempotent writes', () => {
  assert.match(browserTest, /const REVIEWED_OPERATIONS = new Set/);
  assert.match(browserTest, /assertStage21AuthorityBoundary\(managerRequests\)/);
  assert.match(browserTest, /idempotencyKey: request\.headers\(\)\['idempotency-key'\]/);
  assert.match(browserTest, /for \(const request of writes\) expect\(request\.idempotencyKey\)\.toBeTruthy\(\)/);
  assert.match(browserTest, /'companyId'/);
  assert.match(browserTest, /'snapshotJson'/);
  assert.match(browserTest, /'criticalPath'/);
});

test('Pass 331 verifies read-only UI boundaries and direct HTTP 403 for protected Scheduling writes', () => {
  assert.match(browserTest, /READER_EMAIL/);
  assert.match(browserTest, /Create Activity' \}\)\)\.toHaveCount\(0\)/);
  assert.match(browserTest, /deniedActivity\.status\(\)\)\.toBe\(403\)/);
  assert.match(browserTest, /deniedBaseline\.status\(\)\)\.toBe\(403\)/);
  assert.match(browserTest, /deniedProgress\.status\(\)\)\.toBe\(403\)/);
});

test('Pass 331 wires Module 21 into the shared Playwright selector without changing other module selection', () => {
  assert.match(playwrightConfig, /RUN_MODULE_21_E2E/);
  assert.match(playwrightConfig, /module-21-browser\.spec\.mjs/);
  assert.match(playwrightConfig, /enabledModuleCount/);
  assert.match(rootPackage.scripts['test:e2e:module-21'], /playwright test --config playwright\.config\.mjs/);
});

test('Pass 331 registers static/live gates and remains fail-honest until the Stage 20 live handoff exists', () => {
  assert.equal(rootPackage.scripts['module-21:playwright:gate'], 'node scripts/module-21/verify-stage-21-playwright.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-21:playwright:gate:live'], 'node scripts/module-21/verify-stage-21-playwright.mjs --mode=live');
  assert.equal(rootPackage.scripts['pass-331:scheduling-playwright:gate'], 'node scripts/module-21/verify-stage-21-playwright.mjs --mode=static');
  assert.match(playwrightGate, /STAGE_21_MODULE_21_PLAYWRIGHT_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING/);
  assert.match(playwrightGate, /Pass 332 - Module 21 PostgreSQL migration, concurrency, idempotency, audit\/outbox and operational verification/);
});


test('Pass 332 adds one focused Module 21 operational gate and live PostgreSQL command', () => {
  assert.match(operationsGate, /construction-erp-stage-21-module-21-project-scheduling-operations-evidence/);
  assert.match(rootPackage.scripts['test:operations:module-21'], /--test-name-pattern="\^Module 21 operational"/);
  assert.equal(rootPackage.scripts['module-21:operations:gate'], 'node scripts/module-21/verify-stage-21-operations.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-21:operations:gate:live'], 'node scripts/module-21/verify-stage-21-operations.mjs --mode=live');
  assert.equal(rootPackage.scripts['pass-332:scheduling-operations:gate'], 'node scripts/module-21/verify-stage-21-operations.mjs --mode=static');
});

test('Pass 332 verifies concurrent Schedule idempotency and one-current-Schedule serialization', () => {
  assert.match(integrationTest, /Module 21 operational same-key Schedule create leaves one Schedule audit outbox and idempotency result/);
  assert.match(integrationTest, /IDEMPOTENCY_REQUEST_IN_PROGRESS/);
  assert.match(integrationTest, /operation: 'scheduling\.schedule-create'/);
  assert.match(integrationTest, /Module 21 operational concurrent different-key Schedule create commits one current Schedule/);
  assert.match(integrationTest, /projectSchedule\.count\(\{ where: \{ projectId: PROJECT_ID \} \}\)/);
});

test('Pass 332 verifies baseline numbering progress replay and dependency concurrency', () => {
  assert.match(integrationTest, /Module 21 operational concurrent baselines allocate unique increasing server-owned numbers/);
  assert.match(integrationTest, /baselineNo\)\.sort/);
  assert.match(integrationTest, /Module 21 operational same-key progress leaves one history row one Activity update and one audit outbox result/);
  assert.match(integrationTest, /operation: 'scheduling\.progress-record'/);
  assert.match(integrationTest, /Module 21 operational concurrent direct dependency inserts cannot commit a cycle/);
  assert.match(integrationTest, /Promise\.allSettled/);
});

test('Pass 332 exercises Stage-21 PostgreSQL constraints below the service layer', () => {
  assert.match(integrationTest, /Module 21 operational Stage-21 PostgreSQL constraints reject invalid scope actor dependency and progress state/);
  for (const token of [
    "dependencyType: 'SS'",
    'lagDays: -1',
    'createdBy: ADMIN_B_ID',
    'updatedBy: ADMIN_B_ID',
    "percentComplete: '50.0000'"
  ]) assert.equal(integrationTest.includes(token), true, `Missing Stage-21 operational database assertion: ${token}`);
});

test('Pass 332 proves late progress outbox failure rolls back the whole Scheduling transaction', () => {
  assert.match(integrationTest, /installModule21OutboxFailure/);
  assert.match(integrationTest, /schedule\.progress_updated/);
  assert.match(integrationTest, /Module 21 operational forced progress outbox failure rolls back Activity history audit and idempotency state/);
  assert.match(integrationTest, /persistedActivity\.percentComplete\.toString\(\), '0'/);
  assert.match(integrationTest, /scheduleProgressUpdate\.count/);
  assert.match(integrationTest, /idempotencyRecord\.count/);
});

test('Pass 332 inspects reviewed Stage-21 indexes without timing thresholds', () => {
  assert.match(integrationTest, /Module 21 operational Stage-21 Scheduling indexes are deployed/);
  for (const name of [
    'project_schedules_project_uq',
    'schedule_activities_schedule_code_uq',
    'schedule_dependencies_schedule_predecessor_idx',
    'schedule_baselines_schedule_no_uq',
    'schedule_progress_updates_activity_date_idx'
  ]) assert.equal(integrationTest.includes(name), true, `Missing Stage-21 index assertion: ${name}`);
  assert.match(operationsGate, /hardDurationThresholds: false/);
});

test('Pass 332 live gate requires genuine Stage-20 integration and Playwright handoffs before PostgreSQL operations', () => {
  assert.match(operationsGate, /STAGE_20_ACCEPTED_READY_FOR_STAGE_21/);
  assert.match(operationsGate, /STAGE_21_MODULE_21_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_329/);
  assert.match(operationsGate, /STAGE_21_MODULE_21_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_332/);
  assert.match(operationsGate, /STAGE_20_LIVE_HANDOFF_REQUIRED/);
  assert.match(operationsGate, /STAGE_21_MODULE_21_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED/);
  assert.match(operationsGate, /STAGE_21_MODULE_21_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED/);
  assert.match(operationsGate, /db:migrations:verify/);
  assert.match(operationsGate, /test:operations:module-21/);
});

test('Pass 332 remains verification-only and points to final Stage-21 acceptance', () => {
  assert.match(operationsGate, /pass: 332/);
  assert.match(operationsGate, /productionRuntimeChanges: 0/);
  assert.match(operationsGate, /databaseChanges: 0/);
  assert.match(operationsGate, /newMigrations: 0/);
  assert.match(operationsGate, /publicApiChanges: 0/);
  assert.match(operationsGate, /newPermissionsAdded: 0/);
  assert.match(operationsGate, /advancedCpmAdded: false/);
  assert.match(operationsGate, /externalSchedulerSyncAdded: false/);
  assert.match(operationsGate, /changeOrderIntegrationAdded: false/);
  assert.match(operationsGate, /dailyReportIntegrationAdded: false/);
  assert.match(operationsGate, /Pass 333 - Module 21 final Stage-21 acceptance and regression gate/);
});

test('Pass 333 adds the final Stage-21 static live and acceptance commands', () => {
  assert.equal(rootPackage.scripts['module-21:gate'], 'node scripts/module-21/verify-stage-21.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-21:gate:live'], 'node scripts/module-21/verify-stage-21.mjs --mode=live');
  assert.equal(rootPackage.scripts['module-21:acceptance:live'], 'node scripts/module-21/verify-stage-21.mjs --mode=live');
  assert.equal(rootPackage.scripts['pass-333:scheduling-acceptance:gate'], 'node scripts/module-21/verify-stage-21.mjs --mode=static');
  assert.match(finalGate, /construction-erp-module-21-stage-21-\$\{mode\}-evidence/);
});

test('Pass 333 requires the full Stage-21 live verification chain before acceptance', () => {
  assert.match(finalGate, /STAGE_20_ACCEPTED_READY_FOR_STAGE_21/);
  assert.match(finalGate, /STAGE_21_MODULE_21_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_329/);
  assert.match(finalGate, /STAGE_21_MODULE_21_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_332/);
  assert.match(finalGate, /STAGE_21_MODULE_21_OPERATIONS_VERIFIED_READY_FOR_PASS_333/);
  assert.match(finalGate, /STAGE_20_LIVE_HANDOFF_REQUIRED/);
  assert.match(finalGate, /STAGE_21_MODULE_21_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED/);
  assert.match(finalGate, /STAGE_21_MODULE_21_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED/);
  assert.match(finalGate, /STAGE_21_MODULE_21_OPERATIONS_LIVE_VERIFICATION_REQUIRED/);
});

test('Pass 333 preserves the reviewed Stage-21 Scheduling boundary and deferred integrations', () => {
  assert.match(finalGate, /reviewedRouteCount: 8/);
  assert.match(finalGate, /reviewedWriteRouteCount: 6/);
  assert.match(finalGate, /projectAuthorizationUsesModule24B: true/);
  assert.match(finalGate, /baselineSnapshotImmutable: true/);
  assert.match(finalGate, /dependencyCycleProtection: true/);
  assert.match(finalGate, /advancedCpmAdded: false/);
  assert.match(finalGate, /fullP6ParityClaimed: false/);
  assert.match(finalGate, /externalSchedulerSyncAdded: false/);
  assert.match(finalGate, /changeOrderIntegrationStillDeferredToStage22And27: true/);
  assert.match(finalGate, /dailyReportIntegrationStillDeferredToStage25And27: true/);
  assert.match(finalGate, /stage27ScheduleImpactProofStillRequired: true/);
  assert.match(finalGate, /exactApprovedBusinessModuleCount: 24/);
  assert.match(finalGate, /stageSuffixCreatesBusinessModule: false/);
});

test('Pass 333 keeps unresolved Scheduling source gaps explicit instead of expanding scope', () => {
  for (const token of [
    'Project Schedule status vocabulary is not enumerated',
    'activity owner and planned duration',
    'Dependency types beyond the guaranteed first-scope finish-start relationship',
    'baseline snapshot_json shape and baseline numbering start value',
    'Look-ahead public query parameter names',
    'Approved Change Order schedule impact belongs to Module 17',
    'Advanced CPM/P6 calculations',
  ]) assert.equal(finalGate.includes(token), true, `Missing Stage-21 unresolved-source boundary: ${token}`);
});

test('Pass 333 is verification-only and hands off to Stage 22 Change Orders', () => {
  assert.match(finalGate, /pass: 333/);
  assert.match(finalGate, /productionRuntimeChanges: 0/);
  assert.match(finalGate, /databaseChanges: 0/);
  assert.match(finalGate, /newMigrations: 0/);
  assert.match(finalGate, /publicApiChanges: 0/);
  assert.match(finalGate, /newPermissions: 0/);
  assert.match(finalGate, /STAGE_21_ACCEPTED_READY_FOR_STAGE_22/);
  assert.match(finalGate, /nextDependentStage: '22 - Module 17 Change Orders \/ Variations'/);
  assert.match(finalGate, /Pass 334 - Stage 22 \/ Module 17 Change Orders \/ Variations contract freeze/);
});
