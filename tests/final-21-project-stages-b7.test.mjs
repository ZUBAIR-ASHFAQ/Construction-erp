import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const backend = 'apps/api/src/modules/project-stages';
const web = 'apps/web/src/features/project-stages';

/** Confirm the final five-file backend module and app registration exist. */
test('B7 creates the final five-file Project Stages backend and registers it after Projects', () => {
  for (const file of [
    'project-stages.routes.ts',
    'project-stages.service.ts',
    'project-stages.repository.ts',
    'project-stages.schema.ts',
    'index.ts'
  ]) {
    assert.equal(existsSync(new URL(`../${backend}/${file}`, import.meta.url)), true, `${file} must exist`);
  }
  const app = read('apps/api/src/app.ts');
  assert.match(app, /registerProjectStagesRoutes/);
  assert.ok(app.indexOf('registerProjectRoutes') < app.indexOf('registerProjectStagesRoutes'));
});


/** Confirm B7 fixes the B4/B5 role-permission migration vocabulary without rewriting those historical files. */
test('B7 adds a forward-only role-permission compatibility bridge and removes it after B7 grants are mapped', () => {
  const bridge = read('packages/database/prisma/migrations/20260829000850_final21_role_permission_legacy_bridge/migration.sql');
  const migration = read('packages/database/prisma/migrations/20260829001100_final21_project_stages_progress/migration.sql');
  assert.match(bridge, /ADD COLUMN IF NOT EXISTS "permission_code"/);
  assert.match(bridge, /final21_sync_role_permission_legacy_code/);
  assert.match(migration, /DROP COLUMN IF EXISTS "permission_code"/);
  assert.match(migration, /INSERT INTO "role_permissions" \("role_id", "permission_code"\)/);
});

/** Confirm the Stage persistence contract and exact 100-percent baseline constraint. */
test('B7 adds Project Stage, progress and frozen baseline persistence with Company and Project ownership', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  const migration = read('packages/database/prisma/migrations/20260829001100_final21_project_stages_progress/migration.sql');
  assert.match(prisma, /model ProjectStage[\s\S]*@@map\("project_stages"\)/);
  assert.match(prisma, /model StageProgressUpdate[\s\S]*@@map\("stage_progress_updates"\)/);
  assert.match(prisma, /model StageProgressBaseline[\s\S]*@@map\("stage_progress_baselines"\)/);
  assert.match(prisma, /project\s+Project\s+@relation\(fields: \[projectId, companyId\]/);
  assert.match(migration, /CHECK \("weight_percent" > 0 AND "weight_percent" <= 100\)/);
  assert.match(migration, /CHECK \("total_weight_percent" = 100\.0000\)/);
  assert.match(migration, /FOREIGN KEY \("project_id", "company_id"\) REFERENCES "projects"\("id", "company_id"\)/);
});

/** Confirm the public Module 7 command/read surface exactly matches the Final-21 contract. */
test('B7 exposes the exact final Project Stages route surface with no generic delete endpoint', () => {
  const schema = read(`${backend}/project-stages.schema.ts`);
  const expected = [
    "GET', route: '/api/v1/projects/:projectId/stages'",
    "POST', route: '/api/v1/projects/:projectId/stages'",
    "PATCH', route: '/api/v1/projects/:projectId/stages/:stageId'",
    "POST', route: '/api/v1/projects/:projectId/stages/baseline/freeze'",
    "POST', route: '/api/v1/projects/:projectId/stages/:stageId/progress'",
    "POST', route: '/api/v1/projects/:projectId/stages/:stageId/progress/:updateId/approve'",
    "GET', route: '/api/v1/projects/:projectId/stages/:stageId/financials'"
  ];
  for (const route of expected) assert.ok(schema.includes(route), `missing ${route}`);
  assert.doesNotMatch(schema, /method: 'DELETE'/);
});

/** Confirm final permissions, errors and events are stable rather than legacy aliases. */
test('B7 uses the required Stage permission, error and event vocabulary', () => {
  const schema = read(`${backend}/project-stages.schema.ts`);
  for (const permission of ['stages.read', 'stages.manage', 'stages.baseline.freeze', 'stages.progress.update', 'stages.progress.approve', 'stages.financial.read']) {
    assert.ok(schema.includes(`'${permission}'`), `missing ${permission}`);
  }
  for (const code of ['STAGE_NOT_FOUND', 'STAGE_WEIGHT_TOTAL_INVALID', 'STAGE_BASELINE_LOCKED', 'INVALID_STAGE_PROGRESS', 'STAGE_SCOPE_FORBIDDEN']) {
    assert.ok(schema.includes(`'${code}'`), `missing ${code}`);
  }
  for (const event of ['project_stage.created', 'project_stage.baseline_frozen', 'project_stage.progress_recorded', 'project_stage.progress_approved', 'project_stage.completed']) {
    assert.ok(schema.includes(`'${event}'`), `missing ${event}`);
  }
});


/** Confirm Project commercial values cannot silently invalidate an already frozen Stage baseline. */
test('B7 protects the frozen Stage value baseline from later Project commercial edits', () => {
  const projectRepository = read('apps/api/src/modules/projects/projects.repository.ts');
  const projectService = read('apps/api/src/modules/projects/projects.service.ts');
  const stageService = read(`${backend}/project-stages.service.ts`);
  assert.match(projectRepository, /hasFrozenStageBaseline/);
  assert.match(projectService, /cannot change after the Project Stage baseline is frozen/);
  assert.match(stageService, /derivePlannedAmount\(project\.projectModel, project\.projectValue, stage\.weightPercent\)/);
});

/** Confirm Stage weight, physical progress and financial values remain separate source concepts. */
test('B7 calculates weighted physical progress and never stores manual Stage cost, billing or receipt totals', () => {
  const service = read(`${backend}/project-stages.service.ts`);
  const prisma = read('packages/database/prisma/schema.prisma');
  assert.match(service, /weightedUnits \+= \(percentToUnits\(stage\.weightPercent\) \* percentToUnits\(progress\)\) \/ HUNDRED_PERCENT_UNITS/);
  assert.match(service, /sumStageActualCost/);
  assert.match(service, /sumStageBilled/);
  assert.match(service, /readReceiptFinancialTotals\(\{ projectId, stageId \}\)/);
  const stageModel = prisma.match(/model ProjectStage \{[\s\S]*?@@map\("project_stages"\)\n\}/)?.[0] ?? '';
  assert.doesNotMatch(stageModel, /actualCost|billedAmount|receivedAmount|outstandingAmount/);
});

/** Confirm Stage writes are scoped, idempotent, audited and evidence-aware. */
test('B7 protects Stage writes with Project scope, idempotency, audit, outbox and evidence validation', () => {
  const service = read(`${backend}/project-stages.service.ts`);
  const repository = read(`${backend}/project-stages.repository.ts`);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  assert.match(service, /executeIdempotentCommand/);
  assert.match(service, /recordAudit/);
  assert.match(service, /recordOutboxEvent/);
  assert.match(service, /findProjectEvidenceDocument/);
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /FOR UPDATE/);
});

/** Confirm Documents can now link evidence to the Stage owner created by B7. */
test('B7 extends Documents evidence linking to the final Project Stage resource', () => {
  const documentSchema = read('apps/api/src/modules/documents-audit/documents-audit.schema.ts');
  const documentRepository = read('apps/api/src/modules/documents-audit/documents-audit.repository.ts');
  const documentService = read('apps/api/src/modules/documents-audit/documents-audit.service.ts');
  assert.match(documentSchema, /'project_stage'/);
  assert.match(documentRepository, /resourceType === 'project_stage'/);
  assert.match(documentRepository, /this\.db\.projectStage\.findFirst/);
  assert.match(documentService, /resourceType === 'project_stage' && !hasPermission\('stages\.read'\)/);
  assert.match(documentService, /stageId: resource\.stageId/);
});

/** Confirm the React feature follows the required server-state/form stack and shell navigation. */
test('B7 adds the Project Stages React API, hooks, workspace and page using TanStack Query and React Hook Form plus Zod', () => {
  for (const file of [
    'api/project-stages-api.ts',
    'hooks/project-stages.ts',
    'components/project-stages-workspace.tsx',
    'pages/project-stages-page.tsx'
  ]) {
    assert.equal(existsSync(new URL(`../${web}/${file}`, import.meta.url)), true, `${file} must exist`);
  }
  const hooks = read(`${web}/hooks/project-stages.ts`);
  const workspace = read(`${web}/components/project-stages-workspace.tsx`);
  const shell = read('apps/web/src/features/administration/components/admin-shell.tsx');
  assert.match(hooks, /@tanstack\/react-query/);
  assert.match(workspace, /react-hook-form/);
  assert.match(workspace, /zodResolver/);
  assert.match(shell, /Project Stages \/ Progress/);
});

/** Confirm every named function introduced by B7 has a nearby short purpose comment. */
test('B7 keeps new named functions junior-readable with short purpose comments', () => {
  const paths = [
    `${backend}/project-stages.schema.ts`,
    `${backend}/project-stages.repository.ts`,
    `${backend}/project-stages.service.ts`,
    `${backend}/project-stages.routes.ts`,
    `${web}/api/project-stages-api.ts`,
    `${web}/hooks/project-stages.ts`,
    `${web}/components/project-stages-workspace.tsx`,
    `${web}/pages/project-stages-page.tsx`
  ];

  for (const path of paths) {
    const lines = read(path).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (!/^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(lines[index])) continue;
      const previous = lines.slice(Math.max(0, index - 3), index).join('\n');
      assert.match(previous, /\/\*\*[^]*\*\//, `${path}:${index + 1} needs a short purpose comment`);
    }
  }
});
