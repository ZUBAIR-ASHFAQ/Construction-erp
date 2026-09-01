import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const freeze = await readFile('docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260827000400_module_21_activity_owner_baseline_reopen_repair/migration.sql', 'utf8');
const gates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const schema = await readFile('apps/api/src/modules/scheduling/scheduling.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/scheduling/scheduling.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/scheduling/scheduling.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/scheduling/scheduling.routes.ts', 'utf8');
const reactApi = await readFile('apps/web/src/features/scheduling/api/scheduling-api.ts', 'utf8');
const reactHooks = await readFile('apps/web/src/features/scheduling/hooks/scheduling.ts', 'utf8');
const workspace = await readFile('apps/web/src/features/scheduling/components/scheduling-workspace.tsx', 'utf8');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));

/** Extract one repair item from the frozen repair contract. */
function repairItem(code) {
  const start = freeze.indexOf(`### ${code}`);
  const next = freeze.indexOf('\n### ', start + 1);
  return freeze.slice(start, next === -1 ? freeze.length : next);
}

/** Extract one Prisma model for focused persistence checks. */
function model(name) {
  return prisma.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';
}

test('Pass 376 closes only M21-01 and M21-02 while advanced and cross-module work stays deferred', () => {
  assert.match(repairItem('M21-01'), /IMPLEMENTED_PASS_376/);
  assert.match(repairItem('M21-02'), /IMPLEMENTED_PASS_376/);
  assert.match(repairItem('M21-03'), /NO_REPAIR \/ OUT OF SCOPE/);
  assert.match(repairItem('M21-04'), /DEFER_STAGE_27/);
});

test('Pass 376 adds one nullable owner foreign key and does not persist a guessed duration field', () => {
  const activity = model('ScheduleActivity');
  assert.match(activity, /ownerUserId\s+String\?/);
  assert.match(activity, /owner\s+User\?/);
  assert.match(migration, /ADD COLUMN "owner_user_id" UUID/);
  assert.match(migration, /REFERENCES "users"\("id"\)/);
  assert.match(migration, /schedule_activities_owner_user_idx/);
  assert.doesNotMatch(`${activity}\n${migration}`, /durationDays\s+|duration_days|planned_duration/);
});

test('Pass 376 registers the migration after the existing post-Stage-23 repair gates', () => {
  const gate = gates.gates.find((item) => item.gate === 'post-stage-23-module-21-activity-owner-baseline-reopen-repair');
  assert.equal(gate.stage, 23);
  assert.equal(gate.gate, 'post-stage-23-module-21-activity-owner-baseline-reopen-repair');
  assert.deepEqual(gate.migrations, ['20260827000400_module_21_activity_owner_baseline_reopen_repair']);
});

test('Pass 376 requires owner on new Activities and derives planned duration only in responses', () => {
  const create = schema.match(/createScheduleActivityBodySchema = z\.object\(\{[\s\S]*?\n\}\)\.strict\(\)\.refine/)?.[0] ?? '';
  const update = schema.match(/updateScheduleActivityBodySchema = z\.object\(\{[\s\S]*?\n\}\)\.strict\(\)/)?.[0] ?? '';
  assert.match(create, /ownerUserId: uuidSchema/);
  assert.match(update, /ownerUserId: uuidSchema\.optional\(\)/);
  assert.doesNotMatch(`${create}\n${update}`, /plannedDurationDays/);
  assert.match(schema, /plannedDurationDays: z\.number\(\)\.int\(\)\.min\(0\)/);
  assert.match(service, /function plannedDurationDays\(start: Date, finish: Date\): number/);
});

test('Pass 376 validates the Activity owner as an active member of the same Project', () => {
  assert.match(repository, /async findActiveProjectMemberUser\(/);
  assert.match(repository, /projectId,/);
  assert.match(repository, /status: 'ACTIVE'/);
  assert.match(repository, /user:[\s\S]*status: 'ACTIVE'/);
  assert.match(service, /requireActivityOwner/);
  assert.match(service, /findActiveProjectMemberUser/);
});

test('Pass 376 locks planning after baseline but keeps progress independent from the planning lock', () => {
  assert.match(service, /function requirePlanningBaselineOpen/);
  assert.ok((service.match(/requirePlanningBaselineOpen\(/g) ?? []).length >= 4);
  const progress = service.match(/private async recordScheduleProgressOnce\([\s\S]*?return \{ statusCode: 201, body: response \};\n  \}/)?.[0] ?? '';
  assert.doesNotMatch(progress, /requirePlanningBaselineOpen/);
});

test('Pass 376 reopens planning by clearing only the current baseline marker and preserves snapshot history', () => {
  assert.match(schema, /reopenScheduleBaselineBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.match(service, /operation: 'scheduling\.baseline-reopen'/);
  assert.match(service, /baselineAt: null/);
  assert.match(service, /action: 'schedule\.baseline_reopened'/);
  const reopen = service.match(/private async reopenScheduleBaselineOnce\([\s\S]*?return \{ statusCode: 200, body:[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.doesNotMatch(reopen, /deleteScheduleBaseline|updateScheduleBaseline\(|eventType:/);
});

test('Pass 376 adds exactly one focused HTTP repair operation without a new permission error or event family', () => {
  assert.match(schema, /MODULE_21_PASS_376_HTTP_ROUTES[\s\S]*baseline\/reopen/);
  assert.equal((routes.match(/app\.(?:get|post|patch|put)\('/g) ?? []).length, 9);
  assert.match(routes, /module21ReopenScheduleBaseline/);
  assert.match(routes, /headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA/);
  assert.doesNotMatch(schema, /schedule\.baseline_reopened'/);
});

test('Pass 376 exposes owner duration and controlled reopen in the existing React Scheduling feature', () => {
  assert.match(reactApi, /ownerUserId: string \| null/);
  assert.match(reactApi, /plannedDurationDays: number/);
  assert.match(reactApi, /export function reopenScheduleBaseline\(/);
  assert.match(reactHooks, /export function useReopenScheduleBaseline\(/);
  assert.match(workspace, /Reopen planning/);
  assert.match(workspace, /Baseline locked/);
  assert.match(workspace, /plannedDurationDays/);
});

test('Pass 376 keeps the package gate focused on Module 21 repair plus historical regression', () => {
  assert.equal(
    rootPackage.scripts['pass-376:module-21-activity-owner-duration-baseline-reopen:gate'],
    'node --test tests/pass-376-module-21-activity-owner-duration-baseline-reopen.test.mjs tests/module-21-static.test.mjs'
  );
});
