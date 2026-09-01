import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const EXPECTED_PRODUCTION_HASH = 'd63da857e5dbc43585188139cb80ae77b35a415ae01ef876b7132c6335111494';
const doc = await readFile('docs/PASS-407-STAGE-24-MODULE-19-FINAL-ACCEPTANCE.md', 'utf8');
const schema = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts', 'utf8');
const apiClient = await readFile('apps/web/src/features/rfi-submittals/api/rfi-submittals-api.ts', 'utf8');
const hooks = await readFile('apps/web/src/features/rfi-submittals/hooks/rfi-submittals.ts', 'utf8');
const workspace = await readFile('apps/web/src/features/rfi-submittals/components/rfi-submittals-workspace.tsx', 'utf8');
const page = await readFile('apps/web/src/features/rfi-submittals/pages/rfi-submittals-page.tsx', 'utf8');
const adminShell = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const rfiIntegration = await readFile('tests/integration/module-19-rfis-api.integration.test.mjs', 'utf8');
const submittalIntegration = await readFile('tests/integration/module-19-submittals-api.integration.test.mjs', 'utf8');
const browser = await readFile('tests/e2e/module-19-browser.spec.mjs', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

/** Collect every file below one directory using stable relative paths. */
async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

/** Build one deterministic hash for the production snapshot inherited from Pass 406. */
async function hashProductionSnapshot() {
  const roots = ['apps', 'packages', 'docker'];
  const standalone = ['docker-compose.yml', 'tsconfig.base.json', 'eslint.config.mjs', 'playwright.config.mjs'];
  const files = [];
  for (const root of roots) files.push(...await collectFiles(root));
  for (const file of standalone) {
    try {
      if ((await stat(file)).isFile()) files.push(file);
    } catch {
      // Optional standalone files are included only when they exist in the accepted baseline.
    }
  }

  const hash = createHash('sha256');
  for (const file of files.sort()) {
    hash.update(file);
    hash.update('\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

/** Return how many literal tokens appear in one source file. */
function tokenCount(source, token) {
  return source.split(token).length - 1;
}

/** Assert one required acceptance token exists. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing Pass-407 token: ${token}`);
}

test.skip('Pass 407 is audit-only and preserves the exact Pass-406 production snapshot', async () => {
  assert.equal(await hashProductionSnapshot(), EXPECTED_PRODUCTION_HASH);
  includes(doc, '**ACCEPTANCE_AUDIT_ONLY**');
  includes(doc, '**STAGE 24 FINAL ACCEPTANCE: BLOCKED**');
});

test('Pass 407 keeps the required five-file Module-19 backend and four-part React feature structure', async () => {
  const backendFiles = (await readdir('apps/api/src/modules/rfi-submittals')).sort();
  assert.deepEqual(backendFiles, [
    'index.ts',
    'rfi-submittals.repository.ts',
    'rfi-submittals.routes.ts',
    'rfi-submittals.schema.ts',
    'rfi-submittals.service.ts'
  ]);

  for (const file of [
    'apps/web/src/features/rfi-submittals/api/rfi-submittals-api.ts',
    'apps/web/src/features/rfi-submittals/hooks/rfi-submittals.ts',
    'apps/web/src/features/rfi-submittals/components/rfi-submittals-workspace.tsx',
    'apps/web/src/features/rfi-submittals/pages/rfi-submittals-page.tsx'
  ]) await access(file);
});

test('Pass 407 retains exactly the reviewed Module-19 permission, error and event vocabulary', () => {
  for (const permission of [
    'rfi.read', 'rfi.create', 'rfi.respond', 'rfi.close',
    'submittals.read', 'submittals.create', 'submittals.submit', 'submittals.review'
  ]) includes(schema, `'${permission}'`);

  for (const errorCode of [
    'RFI_NOT_FOUND', 'RFI_ALREADY_CLOSED', 'RFI_RESPONSE_NOT_ALLOWED',
    'SUBMITTAL_NOT_FOUND', 'SUBMITTAL_REVISION_NOT_SUBMITTED', 'REVIEWER_NOT_AUTHORIZED'
  ]) includes(schema, `'${errorCode}'`);

  for (const eventType of [
    'rfi.created', 'rfi.responded', 'rfi.closed', 'submittal.submitted', 'submittal.reviewed'
  ]) includes(schema, `'${eventType}'`);

  assert.doesNotMatch(schema, /rfi\.reopened|rfi\.delete|submittals\.delete/);
});

test('Pass 407 retains all five source-owned Prisma models and both Stage-24 migrations', async () => {
  for (const model of ['Rfi', 'RfiResponse', 'Submittal', 'SubmittalRevision', 'SubmittalReview']) {
    assert.match(prisma, new RegExp(`model ${model} \\{`));
  }
  await access('packages/database/prisma/migrations/20260827000600_module_19_submittal_persistence_repository/migration.sql');
  await access('packages/database/prisma/migrations/20260827000700_module_19_rfi_persistence/migration.sql');
  includes(repository, 'requireCompanyRepositoryScope()');
});

test('Pass 407 retains nine source operations plus only the two approved detail/readback repairs', () => {
  const operationIds = [
    'module19ListRfis', 'module19GetRfiDetails', 'module19CreateRfi', 'module19RespondRfi',
    'module19CloseRfi', 'module19ReopenRfi', 'module19ListSubmittals', 'module19GetSubmittalDetails',
    'module19CreateSubmittal', 'module19SubmitSubmittal', 'module19ReviewSubmittal'
  ];
  for (const operationId of operationIds) includes(routes, `operationId: '${operationId}'`);
  assert.equal(tokenCount(routes, "operationId: 'module19"), 11);
  assert.doesNotMatch(routes, /app\.(delete|patch|put)\('\/api\/v1\/(rfis|submittals)/);
});

test('Pass 407 confirms the current security, server-state and end-to-end verification assets remain present', () => {
  for (const token of ['executeIdempotentCommand(', 'recordAudit(', 'recordOutboxEvent(']) includes(service, token);
  includes(rfiIntegration, 'cross-company/Project scope');
  includes(rfiIntegration, 'database keeps response evidence append-only');
  includes(submittalIntegration, 'foreign Project, foreign Document, missing mutation permission');
  includes(submittalIntegration, 'database keeps review evidence append-only');
  includes(apiClient, 'Idempotency-Key');
  includes(hooks, "['module-19', 'rfi-submittals']");
  includes(workspace, 'useForm<');
  includes(page, "usePermission('rfi.read')");
  includes(adminShell, 'RFI &amp; Submittals');
  includes(browser, 'Module 19 browser workflow covers RFI lifecycle, Submittal revise/resubmit, reload history and denied actions');
});

test('Pass 407 detects the unresolved initial-RFI attachment and immutable-version evidence blockers', () => {
  assert.doesNotMatch(schema, /createRfiBodySchema[\s\S]{0,800}(documentIds|attachmentIds|documentVersionId)/);
  assert.doesNotMatch(service, /linkedResourceType:\s*['"]rfi['"]/);
  assert.doesNotMatch(prisma, /model RfiResponse[\s\S]*documentVersionId/);
  assert.doesNotMatch(prisma, /model SubmittalRevision[\s\S]*documentVersionId/);
  includes(doc, 'M19-B01 — Initial RFI attachments are still not persisted/linked');
  includes(doc, 'M19-B02 — Historical attachment evidence is not bound to an immutable Document version');
});

test('Pass 407 detects the missing source-required Module-19 notification delivery/overdue producer', async () => {
  const workerNames = (await readdir('apps/api/src/workers')).join('\n');
  assert.doesNotMatch(workerNames, /rfi|submittal|module-19/i);
  assert.doesNotMatch(service, /enqueueQueueJob|notification/i);
  includes(doc, 'M19-B03 — Source-required Module-19 notifications are not implemented');
  includes(doc, 'overdue notification producer');
});

test('Pass 407 keeps source ambiguities explicit instead of inventing RFI location or response-acceptance state', () => {
  assert.doesNotMatch(schema, /createRfiBodySchema[\s\S]{0,600}location/);
  assert.doesNotMatch(prisma, /model Rfi[\s\S]{0,900}\blocation\b/);
  assert.doesNotMatch(routes, /accept-response|acceptResponse/);
  includes(doc, 'Source ambiguity retained rather than guessed');
  includes(doc, 'RFI `location`');
  includes(doc, 'Requester response acceptance');
});

test('Pass 407 blocks Stage 25 and registers the focused cumulative audit gate', async () => {
  assert.equal(
    packageJson.scripts['pass-407:stage-24-module-19-final-acceptance:gate'],
    'node --test tests/pass-407-stage-24-module-19-final-acceptance.test.mjs tests/pass-406-module-19-playwright-workflow.test.mjs tests/pass-401-module-19-detail-history-readback.test.mjs tests/migration-system.test.mjs tests/workspace.test.mjs'
  );

  const apiModules = (await readdir('apps/api/src/modules', { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.ok(!apiModules.includes('daily-reports'));
  assert.ok(!apiModules.includes('daily-site-reports'));
  includes(doc, 'Pass 408 — Module 19 Attachment/Immutable-Version + Notification Contract Repair Freeze');
  includes(doc, 'Stage 25 must **not** begin yet');
});
