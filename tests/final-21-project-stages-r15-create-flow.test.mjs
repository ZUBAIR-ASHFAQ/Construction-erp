import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workspace = await readFile('apps/web/src/features/project-stages/components/project-stages-workspace.tsx', 'utf8');
const api = await readFile('apps/web/src/features/project-stages/api/project-stages-api.ts', 'utf8');
const schema = await readFile('apps/api/src/modules/project-stages/project-stages.schema.ts', 'utf8');
const service = await readFile('apps/api/src/modules/project-stages/project-stages.service.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/project-stages/project-stages.repository.ts', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260829001100_final21_project_stages_progress/migration.sql', 'utf8');

/** Keep Enter submission on the normal validated form path while preventing stale sequence collisions. */
test('R15 Project Stage create uses the next persisted sequence when the selected Project already has Stages', () => {
  assert.match(workspace, /function nextStageSequenceNo\(stages:[\s\S]*Math\.max\(highest, stage\.sequenceNo\)[\s\S]*\+ 1/);
  assert.match(workspace, /const automaticSequenceNo = nextStageSequenceNo\(stages\)/);
  assert.match(workspace, /stagesQuery\.data\?\.projectId !== props\.projectId/);
  assert.match(workspace, /stageForm\.setValue\('sequenceNo', automaticSequenceNo/);
  assert.match(workspace, /<form onSubmit=\{stageForm\.handleSubmit\(\(values\) => void handleSaveStage\(values\)\)\}>/);
  assert.match(workspace, /const latest = await stagesQuery\.refetch\(\)/);
  assert.match(workspace, /sequenceNo: created\.sequenceNo \+ 1/);
  assert.doesNotMatch(workspace, /sequenceNo: stages\.length \+ 1/);
});

/** Keep browser validation aligned with the backend/database Stage weight invariant before POST. */
test('R15 rejects zero or over-100 Stage weight in the browser before the backend request', () => {
  assert.match(workspace, /Number\(value\) > 0 && Number\(value\) <= 100/);
  assert.match(schema, /weightPercent must be greater than 0 and at most 100/);
  assert.match(migration, /CHECK \("weight_percent" > 0 AND "weight_percent" <= 100\)/);
});

/** Preserve the existing audited/idempotent backend create contract and database uniqueness rules. */
test('R15 keeps Stage creation on the existing POST service repository and unique Project sequence contract', () => {
  assert.match(api, /authenticatedRequest<ProjectStage>\(`projects\/\$\{projectId\}\/stages`, \{[\s\S]*method: 'POST'/);
  assert.match(service, /executeIdempotentCommand\([\s\S]*operation: 'project-stages\.create'/);
  assert.match(service, /await repository\.createStage\(\{/);
  assert.match(repository, /this\.db\.projectStage\.create\(/);
  assert.match(migration, /CREATE UNIQUE INDEX "project_stages_company_project_sequence_uq"/);
});
