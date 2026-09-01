import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

/** Read one UTF-8 repository file for focused static audit checks. */
async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

/** Read one JSON evidence file produced by an earlier repair gate. */
async function readJson(relativePath) {
  return JSON.parse(await read(relativePath));
}

/** Return one Prisma model body from the central schema. */
function prismaModel(schema, name) {
  const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `Missing Prisma model ${name}.`);
  return match[0];
}

/** Collect TypeScript and TSX production sources below one directory. */
async function listSourceFiles(relativePath) {
  const base = path.join(root, relativePath);
  const found = [];

  /** Walk one source directory without introducing another repository dependency. */
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (/\.(?:ts|tsx)$/.test(entry.name)) found.push(fullPath);
    }
  }

  await walk(base);
  return found.sort();
}

test('Passes 165-172 repair evidence remains present and the Stage-8 repair hold has a valid final state', async () => {
  const expected = new Map([
    ['module-24b-evidence/stage-8-readback-contract.json', 'STAGE_8_READBACK_CONTRACT_FROZEN_REPAIR_REQUIRED'],
    ['module-24b-evidence/stage-8-readback.json', 'STAGE_8_READBACK_BACKEND_OPENAPI_PREPARED_REPAIR_HOLD_ACTIVE'],
    ['module-24b-evidence/stage-8-react-readback.json', 'STAGE_8_REACT_READBACK_PREPARED_REPAIR_HOLD_ACTIVE'],
    ['module-18-evidence/project-relationship-persistence.json', 'MODULE_18_PROJECT_RELATIONSHIP_PERSISTENCE_PREPARED_REPAIR_HOLD_ACTIVE'],
    ['module-18-evidence/project-security.json', 'MODULE_18_PROJECT_SECURITY_PREPARED_REPAIR_HOLD_ACTIVE'],
    ['module-18-evidence/project-completion.json', 'MODULE_18_PROJECT_COMPLETION_PREPARED_REPAIR_HOLD_ACTIVE'],
    ['acceptance-evidence/pass-171-ui-completion.json', 'PASS_171_EXISTING_MODULE_UI_COMPLETION_PREPARED_REPAIR_HOLD_ACTIVE'],
    ['acceptance-evidence/pass-172-service-readability.json', 'PASS_172_JUNIOR_READABLE_SERVICE_REFACTOR_PREPARED_REPAIR_HOLD_ACTIVE']
  ]);

  for (const [file, status] of expected) {
    assert.equal((await readJson(file)).status, status, file);
  }

  const hold = await readJson('module-24b-evidence/stage-8-repair-hold.json');
  assert.ok(['STAGE_8_REPAIR_HOLD_ACTIVE', 'STAGE_8_REPAIR_HOLD_CLEARED'].includes(hold.status));
  if (hold.status === 'STAGE_8_REPAIR_HOLD_ACTIVE') assert.equal(hold.module6Allowed, false);
  else {
    assert.equal(hold.clearedByPass, 175);
    assert.equal(hold.module6Allowed, true);
  }
});

test('Stage-8 read-before-replace repair is present from API through React', async () => {
  const projectService = await read('apps/api/src/modules/projects/projects.service.ts');
  const projectRoutes = await read('apps/api/src/modules/projects/projects.routes.ts');
  const userService = await read('apps/api/src/modules/administration/administration.service.ts');
  const userSchema = await read('apps/api/src/modules/administration/administration.schema.ts');
  const projectUi = await read('apps/web/src/features/projects/components/project-details-panel.tsx');
  const usersUi = await read('apps/web/src/features/administration/pages/users-page.tsx');

  assert.match(projectService, /async getProject\(projectId: string\)[\s\S]*listProjectMembers\(projectId\)/);
  assert.match(projectRoutes, /members: result\.members\.map\(serializeProjectMember\)/);
  assert.match(userService, /roleAssignmentsComplete/);
  assert.match(userSchema, /roleAssignmentsComplete: \{ type: 'boolean' \}/);
  assert.match(projectUi, /currentMembers\.map\(\(member\) => \(\{/);
  assert.match(usersUi, /!props\.user\.roleAssignmentsComplete/);
  assert.match(usersUi, /roleAssignments\.map/);
});

test('Module 18 Project persistence uses nullable Project ownership with same-company foreign keys', async () => {
  const schema = await read('packages/database/prisma/schema.prisma');
  const migration = await read('packages/database/prisma/migrations/20260823000600_module_18_project_relationship_activation/migration.sql');

  for (const modelName of ['DocumentFolder', 'Document', 'DocumentUploadIntent']) {
    assert.match(prismaModel(schema, modelName), /projectId\s+String\?/);
  }

  for (const constraint of [
    'document_folders_project_company_fkey',
    'documents_project_company_fkey',
    'document_upload_intents_project_company_fkey'
  ]) {
    assert.match(migration, new RegExp(constraint));
  }

  assert.match(migration, /FOREIGN KEY \("project_id", "company_id"\)[\s\S]*REFERENCES "projects"\("id", "company_id"\)/);
  assert.match(migration, /document_folders_project_scope_consistency/);
  assert.match(migration, /documents_project_scope_consistency/);
  assert.match(migration, /document_upload_intents_project_scope_consistency/);
});

test('Module 18 repository and service enforce trusted Project visibility and exact Project permissions', async () => {
  const repository = await read('apps/api/src/modules/documents/documents.repository.ts');
  const service = await read('apps/api/src/modules/documents/documents.service.ts');
  const routes = await read('apps/api/src/modules/documents/documents.routes.ts');
  const browserTest = await read('tests/e2e/module-18-browser.spec.mjs');

  assert.match(repository, /allowedProjectIds: readonly string\[\] \| null/);
  assert.match(repository, /function buildProjectVisibilityWhere/);
  assert.match(service, /requireProjectPermission/);
  assert.match(service, /documents\.project\.read/);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  assert.match(service, /resolveRequestedReadVisibility/);
  assert.match(routes, /projectId/);
  assert.match(browserTest, /Project A/);
  assert.match(browserTest, /Project B/);
});

test('CRM links and BOQ CSV import use existing reviewed contracts only', async () => {
  const clientDetails = await read('apps/web/src/features/clients/components/client-details-panel.tsx');
  const tendersPage = await read('apps/web/src/features/tendering-estimation/pages/tenders-page.tsx');
  const projectsPage = await read('apps/web/src/features/projects/pages/projects-page.tsx');
  const boqPanel = await read('apps/web/src/features/boq/components/boq-revision-panel.tsx');
  const boqApi = await read('apps/web/src/features/boq/api/boq-api.ts');

  assert.match(clientDetails, /Open Client Tenders/);
  assert.match(clientDetails, /Open Client Projects/);
  assert.match(tendersPage, /clientId/);
  assert.match(projectsPage, /clientId/);
  assert.match(boqPanel, /function parseBoqImportCsv\(/);
  assert.match(boqPanel, /item_code,parent_item_code,description,unit,quantity,rate/);
  assert.match(boqApi, /replaceBoqRevisionItems/);
  assert.doesNotMatch(boqApi, /importBoq|uploadBoqCsv/);
});

test('Pass-172 service workflows remain delegated to small purpose-focused helpers', async () => {
  const documents = await read('apps/api/src/modules/documents/documents.service.ts');
  const approvals = await read('apps/api/src/modules/approvals/approvals.service.ts');
  const tenders = await read('apps/api/src/modules/tendering-estimation/tendering-estimation.service.ts');

  assert.match(documents, /completeUploadIntentInTransaction/);
  assert.match(documents, /loadAuthorizedUploadIntent/);
  assert.match(approvals, /actOnApprovalInTransaction/);
  assert.match(approvals, /loadApprovalActionContext/);
  assert.match(approvals, /requestApprovalInTransaction/);
  assert.match(tenders, /submitTenderInTransaction/);
});

test('Built backend modules preserve the approved five-file structure', async () => {
  const modules = {
    approvals: 'approvals',
    boq: 'boq',
    clients: 'clients',
    documents: 'documents',
    projects: 'projects',
    'tendering-estimation': 'tendering-estimation',
    'users-rbac': 'users-rbac'
  };

  for (const [directory, prefix] of Object.entries(modules)) {
    assert.deepEqual((await readdir(path.join(root, 'apps/api/src/modules', directory))).sort(), [
      'index.ts',
      `${prefix}.repository.ts`,
      `${prefix}.routes.ts`,
      `${prefix}.schema.ts`,
      `${prefix}.service.ts`
    ].sort());
  }
});

test('Production source no longer claims Project scope is waiting for Module 24B', async () => {
  const sourceFiles = await listSourceFiles('apps');
  const stale = [];

  for (const file of sourceFiles) {
    const source = await readFile(file, 'utf8');
    if (/until Module 24B|deferred until Module 24B|not resolved until Module 24B/i.test(source)) {
      stale.push(path.relative(root, file));
    }
  }

  assert.deepEqual(stale, []);
});
