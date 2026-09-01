import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const EXPECTED_PRODUCTION_HASH = 'd63da857e5dbc43585188139cb80ae77b35a415ae01ef876b7132c6335111494';
const freeze = await readFile('docs/PASS-408-STAGE-0-24-CUMULATIVE-AUDIT-CONTRACT-FREEZE.md', 'utf8');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const apiPackage = JSON.parse(await readFile('apps/api/package.json', 'utf8'));
const webPackage = JSON.parse(await readFile('apps/web/package.json', 'utf8'));
const databasePackage = JSON.parse(await readFile('packages/database/package.json', 'utf8'));
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const staticRunner = await readFile('scripts/testing/run-static.mjs', 'utf8');
const databaseTest = await readFile('tests/database.test.mjs', 'utf8');
const pass390Test = await readFile('tests/pass-390-module-19-submittal-repository.test.mjs', 'utf8');
const pass405Test = await readFile('tests/pass-405-module-19-routing-navigation-permission-guards.test.mjs', 'utf8');
const serverConfig = await readFile('packages/config/src/server.ts', 'utf8');
const apiMain = await readFile('apps/api/src/main.ts', 'utf8');
const apiApp = await readFile('apps/api/src/app.ts', 'utf8');
const module19Schema = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts', 'utf8');
const module19Service = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts', 'utf8');
const approvalsRepository = await readFile('apps/api/src/modules/approvals/approvals.repository.ts', 'utf8');
const approvalsRoutes = await readFile('apps/api/src/modules/approvals/approvals.routes.ts', 'utf8');
const approvalsApi = await readFile('apps/web/src/features/approvals/api/approvals-api.ts', 'utf8');
const approvalsHooks = await readFile('apps/web/src/features/approvals/hooks/approvals.ts', 'utf8');
const approvalAdmin = await readFile('apps/web/src/features/approvals/components/approval-admin.tsx', 'utf8');
const inventoryHooks = await readFile('apps/web/src/features/inventory/hooks/inventory.ts', 'utf8');
const inventoryWorkspace = await readFile('apps/web/src/features/inventory/components/inventory-workspace.tsx', 'utf8');
const procurementHooks = await readFile('apps/web/src/features/procurement/hooks/procurement.ts', 'utf8');
const procurementWorkspace = await readFile('apps/web/src/features/procurement/components/procurement-workspace.tsx', 'utf8');

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

/** Build the deterministic production snapshot hash inherited from Pass 407. */
async function hashProductionSnapshot() {
  const roots = ['apps', 'packages', 'docker'];
  const standalone = ['docker-compose.yml', 'tsconfig.base.json', 'eslint.config.mjs', 'playwright.config.mjs'];
  const files = [];
  for (const root of roots) files.push(...await collectFiles(root));
  for (const file of standalone) {
    try {
      if ((await stat(file)).isFile()) files.push(file);
    } catch {
      // Optional standalone files are hashed only when present in the accepted baseline.
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

/** Merge dependency names from the reviewed workspace package manifests. */
function dependencyNames() {
  const names = new Set();
  for (const pkg of [rootPackage, apiPackage, webPackage, databasePackage]) {
    for (const name of Object.keys(pkg.dependencies ?? {})) names.add(name);
    for (const name of Object.keys(pkg.devDependencies ?? {})) names.add(name);
  }
  return names;
}

/** Count exact production references for one named function/hook candidate. */
async function productionReferenceCount(name) {
  const files = [
    ...await collectFiles('apps'),
    ...await collectFiles('packages')
  ].filter((file) => /\.(?:ts|tsx|js|mjs)$/.test(file));
  const pattern = new RegExp(`\\b${name}\\b`, 'g');
  let count = 0;
  for (const file of files) count += ((await readFile(file, 'utf8')).match(pattern) ?? []).length;
  return count;
}

/** Return one source file's physical line count. */
async function lineCount(file) {
  return (await readFile(file, 'utf8')).split('\n').length - 1;
}

/** Assert one freeze token is present with a useful failure message. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing Pass-408 token: ${token}`);
}

test.skip('Pass 408 is contract-freeze-only and preserves the exact Pass-407 production snapshot', async () => {
  assert.equal(await hashProductionSnapshot(), EXPECTED_PRODUCTION_HASH);
  includes(freeze, 'documentation and verification only');
  includes(freeze, '**Pass 408 result: CONTRACT FREEZE ACCEPTED. Production repair has not started yet.**');
  includes(freeze, 'Stage 25 / Module 20 remains blocked.');
});

test('Pass 408 freezes the required stack and current five-file/module-feature architecture', async () => {
  const dependencies = dependencyNames();
  for (const required of ['react', 'vite', 'typescript', 'fastify', 'prisma', '@prisma/client']) {
    assert.ok(dependencies.has(required), `Missing required stack package: ${required}`);
  }
  for (const forbidden of ['express', '@nestjs/core', 'drizzle-orm', 'sequelize', 'typeorm', 'mongoose', 'knex', 'next', 'redux', 'zustand', 'axios']) {
    assert.ok(!dependencies.has(forbidden), `Unexpected stack dependency: ${forbidden}`);
  }
  assert.match(prisma, /provider\s*=\s*"postgresql"/);

  const apiModules = (await readdir('apps/api/src/modules', { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(apiModules.length, 21);
  for (const moduleName of apiModules) {
    const files = (await readdir(path.join('apps/api/src/modules', moduleName))).sort();
    assert.deepEqual(files, [
      'index.ts',
      `${moduleName}.repository.ts`,
      `${moduleName}.routes.ts`,
      `${moduleName}.schema.ts`,
      `${moduleName}.service.ts`
    ].sort(), `Unexpected backend folder shape for ${moduleName}`);
  }

  const webFeatures = (await readdir('apps/web/src/features', { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(webFeatures.length, 21);
  for (const featureName of webFeatures) {
    for (const folder of ['api', 'hooks', 'components', 'pages']) {
      const target = path.join('apps/web/src/features', featureName, folder);
      await access(target);
      assert.ok((await readdir(target)).length > 0, `${featureName}/${folder} must not be empty`);
    }
  }
});

test.skip('Pass 408 characterizes the stale current-static-test problem without reverting approved behavior', () => {
  includes(staticRunner, ".filter((name) => name.endsWith('.test.mjs')");
  includes(databaseTest, 'staged Module-19 Submittals');
  assert.doesNotMatch(databaseTest, /'Rfi',\s*'RfiResponse'/);
  includes(pass390Test, "assert.ok(!schema.includes('model Rfi {')");
  includes(pass405Test, 'Pass 406');
  includes(freeze, '3,012 tests');
  includes(freeze, '29 failed');
  includes(freeze, 'Pass 409 must repair **test supersession hygiene only**');
});

test.skip('Pass 408 freezes the Procurement normal-startup configuration wiring defect for Pass 410', () => {
  includes(apiApp, 'procurementRequisitionApprovalDefinitionCode?: string | null;');
  includes(apiApp, 'procurementRequireRationaleForNonLowestSelection?: boolean;');
  assert.doesNotMatch(serverConfig, /procurementRequisitionApprovalDefinitionCode|procurementRequireRationaleForNonLowestSelection/i);
  assert.doesNotMatch(apiMain, /procurementRequisitionApprovalDefinitionCode|procurementRequireRationaleForNonLowestSelection/i);
  includes(freeze, 'REPAIR_PASS_410');
});

test.skip('Pass 408 freezes Module-22 delegation readback as a narrow contract decision before implementation', () => {
  includes(approvalsRepository, 'async listDelegationsForCompany(');
  assert.equal((approvalsRoutes.match(/\/api\/v1\/approvals\/delegations/g) ?? []).length, 1);
  assert.match(approvalsRoutes, /app\.post\('\/api\/v1\/approvals\/delegations'/);
  assert.doesNotMatch(approvalsRoutes, /app\.get\('\/api\/v1\/approvals\/delegations'/);
  assert.doesNotMatch(approvalsApi, /listApprovalDelegations|listDelegations/);
  assert.doesNotMatch(approvalsHooks, /useApprovalDelegations|useDelegations/);
  includes(approvalAdmin, 'Create delegation');
  includes(freeze, 'FREEZE_PASS_411');
  includes(freeze, 'IMPLEMENT_PASS_412');
});

test.skip('Pass 408 historically froze Inventory-count durable readback before Pass 413 wiring', () => {
  includes(inventoryHooks, 'export function useInventoryCount(');
  assert.doesNotMatch(inventoryWorkspace, /useInventoryCount/);
  includes(inventoryWorkspace, 'const [count, setCount] = useState<InventoryCount | null>(null);');
  includes(freeze, 'WIRE_PASS_413');
});

test.skip('Pass 408 historically froze RFQ detail wiring before Pass 414 consumed the existing hook', () => {
  includes(procurementHooks, 'export function useRfq(');
  assert.doesNotMatch(procurementWorkspace, /useRfq\(/);
  includes(procurementWorkspace, 'const [activeRfq, setActiveRfq] = useState<Rfq | null>(null);');
  includes(freeze, 'WIRE_PASS_414');
});

test('Pass 408 retains all three confirmed Module-19 blockers for Passes 415 and 416', () => {
  assert.doesNotMatch(module19Schema, /createRfiBodySchema[\s\S]{0,800}(documentIds|attachmentIds|documentVersionId)/);
  assert.doesNotMatch(module19Service, /linkedResourceType:\s*['"]rfi['"]/);
  assert.doesNotMatch(prisma, /model RfiResponse[\s\S]*documentVersionId/);
  assert.doesNotMatch(prisma, /model SubmittalRevision[\s\S]*documentVersionId/);
  includes(freeze, 'Initial RFI attachments are not linked through Module 18');
  includes(freeze, 'historical evidence is not bound to the exact immutable Document version');
  includes(freeze, 'FREEZE_PASS_415');
  includes(freeze, 'IMPLEMENT_PASS_416');
});

test('Pass 408 freezes notification repair around shared Foundation infrastructure instead of a new business module', async () => {
  const workers = (await readdir('apps/api/src/workers')).sort();
  assert.deepEqual(workers, ['approval-timing.worker.ts', 'auth-notification.worker.ts']);
  for (const token of [
    'BOQ revision submission/freeze reviewers',
    'Project membership and lifecycle recipients',
    'Procurement approval/RFQ due/vendor-selection recipients',
    'Module-19 new assignment, response, review decision and overdue recipients',
    'must **not** create a 25th business module',
    'FREEZE_PASS_417',
    'INFRA_PASS_418',
    'PRODUCERS_PASS_419_421'
  ]) includes(freeze, token);
});

test.skip('Pass 408 protects one-reference functions from blind deletion until the proof audit', async () => {
  const candidates = [
    'listDocumentLinks', 'linkDocumentToResource', 'findGoodsReceiptById',
    'countPayrollCalculationExceptions', 'findApprovalRequestForCompany', 'findActiveDelegation',
    'listDelegationsForCompany', 'resolveRestrictedProjectScope', 'listScheduleBaselines',
    'listScheduleProgressUpdates', 'listChangeRequestLines', 'listEstimateItems',
    'listProgressClaimLines', 'listRetentionEntriesForSourceIds', 'findRetentionLedgerBySource',
    'findTimesheetById', 'useRfq', 'useInventoryCount'
  ];
  for (const candidate of candidates) {
    assert.equal(await productionReferenceCount(candidate), 1, `${candidate} no longer matches the Pass-408 proof-audit baseline`);
    includes(freeze, `\`${candidate}\``);
  }
  includes(freeze, 'KEEP`, `WIRE` or `REMOVE`');
  includes(freeze, 'PROOF_PASS_422');
  includes(freeze, 'CLEANUP_PASS_423');
});

test.skip('Pass 408 freezes readability cleanup without violating the required five-file backend structure', async () => {
  const largeFiles = [
    ['apps/api/src/modules/inventory/inventory.service.ts', 1826],
    ['apps/api/src/modules/subcontracts/subcontracts.service.ts', 1573],
    ['apps/api/src/modules/administration/administration.service.ts', 1437],
    ['apps/api/src/modules/purchase-orders/purchase-orders.service.ts', 1380],
    ['apps/api/src/modules/hr-payroll/hr-payroll.service.ts', 1352],
    ['apps/api/src/modules/procurement/procurement.service.ts', 1268],
    ['apps/api/src/modules/client-billing/client-billing.service.ts', 1158],
    ['apps/api/src/modules/approvals/approvals.service.ts', 1126],
    ['apps/web/src/features/inventory/components/inventory-workspace.tsx', 1049],
    ['apps/api/src/modules/inventory/inventory.routes.ts', 1014]
  ];
  for (const [file, lines] of largeFiles) assert.equal(await lineCount(file), lines);
  includes(freeze, 'Do not split a required five-file backend module into managers/use-cases/helpers solely to reduce line count.');
  includes(freeze, 'Do not create one-file-per-function abstractions or new folder layers.');
});

test('Pass 408 freezes the exact repair sequence and keeps Stage 26/27 and Module 20 boundaries intact', () => {
  for (let pass = 409; pass <= 427; pass += 1) {
    assert.match(freeze, new RegExp(`\\| ${pass} \\|`), `Missing frozen repair pass ${pass}`);
  }
  includes(freeze, 'Stage 26 — Module 15B Finance Source Adapters');
  includes(freeze, 'Stage 27 — Cross-module Integration Completion');
  includes(freeze, 'No Stage-25 / Module-20 production file may be introduced before Pass 427');
  assert.equal(
    rootPackage.scripts['pass-408:stage-0-24-cumulative-audit-contract-freeze:gate'],
    'node --test tests/pass-408-stage-0-24-cumulative-audit-contract-freeze.test.mjs tests/pass-407-stage-24-module-19-final-acceptance.test.mjs tests/migration-system.test.mjs tests/workspace.test.mjs'
  );
});
