import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workspace = await readFile('apps/web/src/features/project-stages/components/project-stages-workspace.tsx', 'utf8');
const service = await readFile('apps/api/src/modules/project-stages/project-stages.service.ts', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260901000200_final21_project_stage_create_repair/migration.sql', 'utf8');
const gates = await readFile('packages/database/prisma/migration-gates.json', 'utf8');

/** Keep automatic sequence state current even when the user starts typing before the Stage query finishes. */
test('R16 updates only an untouched automatic sequence and resolves it again at create submit time', () => {
  assert.match(workspace, /stageForm\.formState\.dirtyFields\.sequenceNo/);
  assert.doesNotMatch(workspace, /editingStageId !== null \|\| stageForm\.formState\.isDirty/);
  assert.match(workspace, /const latest = await stagesQuery\.refetch\(\)/);
  assert.match(workspace, /const firstSequenceNo = sequenceWasEdited[\s\S]*nextStageSequenceNo\(latest\.data\?\.items \?\? stages\)/);
});

/** Retry only a server-confirmed automatic sequence conflict and never hide a duplicate Stage code. */
test('R16 retries one automatic sequence collision while preserving explicit code-conflict errors', () => {
  assert.match(workspace, /function isAutomaticSequenceConflict\(error: unknown\)/);
  assert.match(workspace, /Stage sequence number is already in use inside the Project\./);
  assert.match(workspace, /if \(sequenceWasEdited \|\| !isAutomaticSequenceConflict\(error\)\) throw error/);
  assert.match(workspace, /const refreshed = await stagesQuery\.refetch\(\)/);
  assert.match(service, /function stageUniqueConstraintMessage\(error: unknown\)/);
  assert.match(service, /Stage code is already in use inside the Project\./);
  assert.match(service, /Stage sequence number is already in use inside the Project\./);
});

/** Re-run the intended B7 Project-to-Stage permission mapping now that R9 has registered projects.* permissions. */
test('R16 backfills Stage manage/read/lifecycle grants and active system-admin Stage permissions', () => {
  assert.match(migration, /\('projects\.read', 'stages\.read'\)/);
  assert.match(migration, /\('projects\.update', 'stages\.manage'\)/);
  assert.match(migration, /\('projects\.update', 'stages\.progress\.update'\)/);
  assert.match(migration, /\('projects\.activate', 'stages\.baseline\.freeze'\)/);
  assert.match(migration, /\('projects\.complete', 'stages\.progress\.approve'\)/);
  assert.match(migration, /role\."code" = 'system-admin'/);
  assert.match(migration, /'stages\.manage'/);
  assert.match(gates, /final-21-repair-project-stage-create-flow/);
});
