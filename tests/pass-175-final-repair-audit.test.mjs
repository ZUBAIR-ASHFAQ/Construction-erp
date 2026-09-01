import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

/** Read one UTF-8 repository file used by the final repair audit. */
async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

/** Read one JSON repository file used by the final repair audit. */
async function readJson(relativePath) {
  return JSON.parse(await read(relativePath));
}

/** Return one Prisma model body from the central schema. */
function prismaModel(schema, name) {
  const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `Missing Prisma model ${name}.`);
  return match[0];
}

/** Walk production sources and return files containing unfinished-code markers. */
async function findUnfinishedProductionMarkers() {
  const roots = ['apps', 'packages', 'scripts'];
  const found = [];

  /** Walk one production directory recursively. */
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!/\.(?:ts|tsx|mjs)$/.test(entry.name)) continue;
      const source = await readFile(fullPath, 'utf8');
      if (/\b(?:TODO|FIXME|NOT_IMPLEMENTED)\b|throw new Error\(['"`]Not implemented/i.test(source)) {
        found.push(path.relative(root, fullPath));
      }
    }
  }

  for (const relativeRoot of roots) await walk(path.join(root, relativeRoot));
  return found.sort();
}

test('Pass 175 keeps Module 6 blocked until genuine Pass-174 and final Stage-8 live evidence both succeed', async () => {
  const runner = await read('scripts/acceptance/verify-pass-175-final-handoff.mjs');
  const stage8Gate = await read('scripts/module-24b/verify-stage-8.mjs');
  const hold = await readJson('module-24b-evidence/stage-8-repair-hold.json');

  assert.ok(['STAGE_8_REPAIR_HOLD_ACTIVE', 'STAGE_8_REPAIR_HOLD_CLEARED'].includes(hold.status));
  assert.match(runner, /PASS_174_DEPENDENCY_AND_LIVE_ACCEPTANCE_VERIFIED_READY_FOR_PASS_175/);
  assert.match(runner, /PASS_174_LIVE_ACCEPTANCE_REQUIRED/);
  assert.match(runner, /STAGE_8_ACCEPTED_READY_FOR_STAGE_9/);
  assert.match(runner, /PASS_175_FINAL_REPAIR_AUDIT_ACCEPTED_READY_FOR_MODULE_6/);
  assert.match(stage8Gate, /PASS_175_FINAL_HANDOFF_CONFIRM/);
  assert.match(stage8Gate, /PASS_174_DEPENDENCY_AND_LIVE_ACCEPTANCE_VERIFIED_READY_FOR_PASS_175/);
});

test('Final built-stage database audit contains every required currently-owned model and repaired Project relation', async () => {
  const schema = await read('packages/database/prisma/schema.prisma');
  const requiredModels = [
    'Company', 'AuditLog', 'OutboxEvent', 'IdempotencyRecord', 'NumberSequence',
    'User', 'AuthCredential', 'AuthSession', 'Role', 'Permission', 'RolePermission', 'UserRoleAssignment',
    'DocumentFolder', 'Document', 'DocumentVersion', 'DocumentLink', 'DocumentUploadIntent',
    'ApprovalDefinition', 'ApprovalStep', 'ApprovalRequest', 'ApprovalAction', 'ApprovalDelegation',
    'Client', 'ClientContact', 'Opportunity', 'OpportunityNote',
    'Tender', 'EstimateVersion', 'EstimateItem', 'TenderSubmission',
    'Boq', 'BoqRevision', 'BoqItem',
    'Project', 'ProjectMember', 'ProjectStatusHistory',
    'WbsNode', 'CostCode', 'CostType', 'ProjectCostCode'
  ];

  for (const model of requiredModels) assert.match(schema, new RegExp(`model ${model} \\{`), model);
  assert.match(prismaModel(schema, 'ProjectMember'), /projectId\s+String/);
  assert.match(prismaModel(schema, 'ProjectMember'), /userId\s+String/);
  assert.match(prismaModel(schema, 'UserRoleAssignment'), /scopeType/);
  assert.match(prismaModel(schema, 'UserRoleAssignment'), /scopeId\s+String\?/);
  assert.match(prismaModel(schema, 'DocumentFolder'), /projectId\s+String\?/);
  assert.match(prismaModel(schema, 'Document'), /projectId\s+String\?/);
});

test('Final built-stage service and repository audit keeps the repaired functions in their owning five-file modules', async () => {
  const projectsRepository = await read('apps/api/src/modules/projects/projects.repository.ts');
  const projectsService = await read('apps/api/src/modules/projects/projects.service.ts');
  const usersRepository = await read('apps/api/src/modules/administration/administration.repository.ts');
  const usersService = await read('apps/api/src/modules/administration/administration.service.ts');
  const documentsRepository = await read('apps/api/src/modules/documents/documents.repository.ts');
  const documentsService = await read('apps/api/src/modules/documents/documents.service.ts');

  assert.match(projectsRepository, /listProjectMembers/);
  assert.match(projectsService, /replaceProjectMembers/);
  assert.match(projectsService, /getProject\(projectId: string\)/);
  assert.match(usersRepository, /listUserRoleAssignments/);
  assert.match(usersService, /replaceUserRoles/);
  assert.match(usersService, /roleAssignmentsComplete/);
  assert.match(documentsRepository, /buildProjectVisibilityWhere/);
  assert.match(documentsService, /requireProjectPermission/);
  assert.match(documentsService, /completeUploadIntentInTransaction/);
});

test('Final audit finds no unfinished production TODO/FIXME/not-implemented markers', async () => {
  assert.deepEqual(await findUnfinishedProductionMarkers(), []);
});

test('Final audit preserves the approved five-file backend structure after later Module 6 passes', async () => {
  const builtModules = ['approvals', 'boq', 'clients', 'documents', 'projects', 'tendering-estimation', 'users-rbac', 'wbs-cost-codes'];

  for (const module of builtModules) {
    const expectedPrefix = module;
    assert.deepEqual((await readdir(path.join(root, 'apps/api/src/modules', module))).sort(), [
      'index.ts',
      `${expectedPrefix}.repository.ts`,
      `${expectedPrefix}.routes.ts`,
      `${expectedPrefix}.schema.ts`,
      `${expectedPrefix}.service.ts`
    ].sort());
  }

});

test('Pass 175 exposes only static and guarded live final-handoff commands', async () => {
  const rootPackage = await readJson('package.json');
  assert.equal(rootPackage.scripts['audit-repair:final:gate'], 'node scripts/acceptance/verify-pass-175-final-handoff.mjs --mode=static');
  assert.equal(rootPackage.scripts['audit-repair:final:gate:live'], 'node scripts/acceptance/verify-pass-175-final-handoff.mjs --mode=live');
});
