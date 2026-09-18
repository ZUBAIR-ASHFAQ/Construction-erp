import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');
const backend = 'apps/api/src/modules/project-stages';
const web = 'apps/web/src/features/project-stages';

/** Keep progress entry compact: one upper action opens the existing two-column modal form. */
test('Project Stage progress entry is modal-first with the Add progress action in the upper header', async () => {
  const workspace = await read(`${web}/components/project-stages-workspace.tsx`);
  assert.match(workspace, /onClick=\{handleAddProgress\}[\s\S]*Add progress/);
  assert.match(workspace, /progressDialogOpen[\s\S]*client-modal-backdrop/);
  assert.match(workspace, /className="client-modal-form"[\s\S]*className="client-form-grid"/);
  assert.doesNotMatch(workspace, /<section className="admin-card project-stage-progress-card">/);
});

/** Make mistakes editable while preserving immutable approved history through a new correction row. */
test('Progress timeline exposes Edit and keeps approved corrections append-only', async () => {
  const workspace = await read(`${web}/components/project-stages-workspace.tsx`);
  assert.match(workspace, /props\.canRecordProgress[\s\S]*handleEditProgress/);
  assert.match(workspace, /editingProgress\?\.update\.status === 'SUBMITTED'[\s\S]*updateProgressMutation/);
  assert.match(workspace, /Approved progress remains in the audit history/);
  assert.match(workspace, /Submit correction/);
  assert.match(workspace, /handleApproveProgress\(stage\.id, update\.id\)/);
});

/** Carry the edit through the typed browser API and TanStack mutation layer. */
test('Progress edit uses the scoped PATCH API and refreshes Project Stage server state', async () => {
  const [api, hooks] = await Promise.all([
    read(`${web}/api/project-stages-api.ts`),
    read(`${web}/hooks/project-stages.ts`)
  ]);
  assert.match(api, /updateStageProgress[\s\S]*method: 'PATCH'/);
  assert.match(api, /stages\/\$\{stageId\}\/progress\/\$\{updateId\}/);
  assert.match(hooks, /useUpdateStageProgress/);
  assert.match(hooks, /invalidateQueries\(\{ queryKey: STAGES_QUERY_KEY \}\)/);
});

/** Enforce the edit at every backend layer without adding a schema migration. */
test('Submitted progress edit is validated, idempotent, tenant-scoped, audited and outboxed', async () => {
  const [schema, routes, service, repository] = await Promise.all([
    read(`${backend}/project-stages.schema.ts`),
    read(`${backend}/project-stages.routes.ts`),
    read(`${backend}/project-stages.service.ts`),
    read(`${backend}/project-stages.repository.ts`)
  ]);
  assert.match(schema, /updateStageProgressBodySchema = createStageProgressBodySchema/);
  assert.match(routes, /app\.patch\('\/api\/v1\/projects\/:projectId\/stages\/:stageId\/progress\/:updateId'/);
  assert.match(service, /operation: 'project-stages\.progress\.update'/);
  assert.match(service, /project_stage\.progress_updated/);
  assert.match(repository, /updateSubmittedProgress/);
  assert.match(repository, /status: 'SUBMITTED'/);
  assert.match(repository, /stage: \{ projectId, companyId: scope\.companyId \}/);
});

/** Never mutate approved progress: editing is limited to the unapproved draft-like state. */
test('Backend rejects editing an approved progress row', async () => {
  const service = await read(`${backend}/project-stages.service.ts`);
  const repository = await read(`${backend}/project-stages.repository.ts`);
  assert.match(service, /if \(before\.status !== 'SUBMITTED'\) throw createStageError\('INVALID_STAGE_PROGRESS'\)/);
  assert.match(repository, /where: \{[\s\S]*status: 'SUBMITTED'[\s\S]*\}/);
});
