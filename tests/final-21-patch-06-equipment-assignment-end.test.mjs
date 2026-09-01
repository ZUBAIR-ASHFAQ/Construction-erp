import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');
const backend = 'apps/api/src/modules/equipment';
const web = 'apps/web/src/features/equipment';

/** Confirm the new command is a narrow idempotent end operation that reuses equipment.assign. */
test('PATCH 06 adds one controlled Equipment assignment-end API without changing assignment creation', async () => {
  const [schema, routes, service] = await Promise.all([
    read(`${backend}/equipment.schema.ts`),
    read(`${backend}/equipment.routes.ts`),
    read(`${backend}/equipment.service.ts`)
  ]);

  assert.match(schema, /POST', route: '\/api\/v1\/equipment\/:id\/assignments\/:assignmentId\/end'/);
  assert.match(schema, /endEquipmentAssignmentBodySchema[\s\S]*endDate: date/);
  assert.match(routes, /app\.post\('\/api\/v1\/equipment\/:id\/assignments\/:assignmentId\/end'/);
  assert.match(routes, /operationId: 'endEquipmentAssignment'/);
  assert.match(service, /operation: 'equipment\.assignment\.end'/);
  assert.match(service, /'equipment\.assign'/);
  assert.match(service, /const ENDED = 'ENDED'/);
});

/** Confirm ending is concurrency-safe and cannot cut off already-posted Equipment usage. */
test('PATCH 06 locks assignment lifecycle and protects posted usage history', async () => {
  const [repository, service] = await Promise.all([
    read(`${backend}/equipment.repository.ts`),
    read(`${backend}/equipment.service.ts`)
  ]);

  assert.match(repository, /async lockAssignmentForWrite\(equipmentId: string, assignmentId: string\)/);
  assert.match(repository, /FOR UPDATE OF assignment/);
  assert.match(repository, /async findLatestUsageDate\(equipmentId: string, assignmentId: string\)/);
  assert.match(repository, /status: 'POSTED'/);
  assert.match(repository, /data: \{ toDate: endDate, status: 'ENDED' \}/);
  assert.match(service, /endDate < locked\.fromDate/);
  assert.match(service, /endDate < latestUsageDate/);
  assert.match(service, /endDate cannot precede posted Equipment usage/);

  const usageStart = service.indexOf('private async recordUsageOnce');
  const usageBlock = service.slice(usageStart, usageStart + 2500);
  assert.ok(usageBlock.indexOf('lockEquipmentForWrite') < usageBlock.indexOf('lockAssignmentForWrite'));
  assert.match(usageBlock, /token\(assignment\.status\) !== ACTIVE/);
});

/** Confirm ending preserves history, audit/outbox traceability and makes reassignment possible by closing the date range. */
test('PATCH 06 ends instead of deleting Equipment assignments and records the lifecycle event', async () => {
  const [repository, service] = await Promise.all([
    read(`${backend}/equipment.repository.ts`),
    read(`${backend}/equipment.service.ts`)
  ]);

  assert.match(repository, /equipmentAssignment\.updateMany/);
  assert.doesNotMatch(repository, /equipmentAssignment\.delete/);
  assert.match(service, /action: 'equipment\.assignment_ended'/);
  assert.match(service, /eventType: 'equipment\.assignment_ended'/);
  assert.match(service, /before: assignmentResponse\(locked\)/);
  assert.match(service, /after: response/);
});

/** Confirm the browser exposes End only for active assignments the actor is allowed to assign. */
test('PATCH 06 wires assignment end through React API hook and permission-aware history action', async () => {
  const [api, hooks, workspace] = await Promise.all([
    read(`${web}/api/equipment-api.ts`),
    read(`${web}/hooks/equipment.ts`),
    read(`${web}/components/equipment-workspace.tsx`)
  ]);

  assert.match(api, /export function endEquipmentAssignment\(equipmentId: string, assignmentId: string, endDate: string\)/);
  assert.match(api, /assignments\/\$\{assignmentId\}\/end/);
  assert.match(hooks, /export function useEndEquipmentAssignment\(equipmentId: string\)/);
  assert.match(hooks, /invalidateQueries\(\{ queryKey: EQUIPMENT_QUERY_KEY \}\)/);
  assert.match(workspace, /props\.canAssign && row\.status === 'ACTIVE'/);
  assert.match(workspace, /window\.prompt\('End date \(YYYY-MM-DD\)'\)/);
  assert.match(workspace, />End<\/button>/);
});

/** Confirm the fix uses existing persistence and permission architecture with no schema migration or new dependency. */
test('PATCH 06 keeps the existing EquipmentAssignment database shape and permission vocabulary', async () => {
  const [schema, prisma, packageJson] = await Promise.all([
    read(`${backend}/equipment.schema.ts`),
    read('packages/database/prisma/schema.prisma'),
    read('package.json')
  ]);

  const assignment = prisma.match(/model EquipmentAssignment \{[\s\S]*?@@map\("equipment_assignments"\)\n\}/)?.[0] ?? '';
  assert.match(assignment, /toDate\s+DateTime\?/);
  assert.match(assignment, /status\s+String/);
  assert.match(schema, /'equipment\.assign'/);
  assert.doesNotMatch(schema, /equipment\.assignment\.end'[,\]]/);
  assert.doesNotMatch(packageJson, /patch-06|assignment-end/);
});
