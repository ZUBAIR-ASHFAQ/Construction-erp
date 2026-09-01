import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary } from '../foundation/gate-lib.mjs';

const PASS_366_UNCHANGED_SCOPE_SNAPSHOT = '6d71ebace32852bf19dbcff4d9c99bf23aba122d6fd9926c0aaf29f0e8c88e94';
const evidencePath = path.resolve('acceptance-evidence/pass-367-module-4-boq-durable-revision-readback.json');
const allowedChangedPaths = new Set([
  'README.md',
  'acceptance-evidence/pass-367-module-4-boq-durable-revision-readback.json',
  'apps/api/src/modules/boq/boq.routes.ts',
  'apps/api/src/modules/boq/boq.schema.ts',
  'apps/api/src/modules/boq/boq.service.ts',
  'apps/api/src/modules/boq/index.ts',
  'apps/web/src/features/boq/api/boq-api.ts',
  'apps/web/src/features/boq/components/boq-revision-panel.tsx',
  'apps/web/src/features/boq/hooks/boq.ts',
  'apps/web/src/features/boq/pages/boqs-page.tsx',
  'docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md',
  'docs/PASS-367-MODULE-4-BOQ-DURABLE-REVISION-READBACK.md',
  'docs/modules/boq/STAGE-10-MODULE-4B-CONTRACT.md',
  'docs/modules/boq/STAGE-6-MODULE-4A-CONTRACT.md',
  'package.json',
  'scripts/acceptance/verify-pass-367-module-4-boq-durable-revision-readback.mjs',
  'tests/e2e/module-4a-browser.spec.mjs',
  'tests/integration/module-4a-api.integration.test.mjs',
  'tests/integration/module-4b-api.integration.test.mjs',
  'tests/module-4a-static.test.mjs',
  'tests/module-4b-static.test.mjs',
  'tests/pass-367-module-4-boq-durable-revision-readback.test.mjs'
]);

/** Collect repository files in stable order while excluding dependency and VCS directories. */
async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

/** Hash every file outside the reviewed Pass-367 boundary to prove unrelated Pass-366 scope stayed byte-identical. */
async function unchangedScopeSnapshot() {
  const files = await collectFiles('.');
  const hash = createHash('sha256');
  let fileCount = 0;
  for (const file of files.sort((left, right) => left.localeCompare(right))) {
    const relative = path.relative('.', file).replaceAll('\\', '/');
    if (allowedChangedPaths.has(relative)) continue;
    const relativeBytes = Buffer.from(relative);
    const content = await readFile(file);
    const pathLength = Buffer.alloc(8);
    const contentLength = Buffer.alloc(8);
    pathLength.writeBigUInt64BE(BigInt(relativeBytes.length));
    contentLength.writeBigUInt64BE(BigInt(content.length));
    hash.update(pathLength);
    hash.update(relativeBytes);
    hash.update(contentLength);
    hash.update(content);
    fileCount += 1;
  }
  return { sha256: hash.digest('hex'), fileCount };
}

const boundary = await unchangedScopeSnapshot();
const results = [{
  name: 'pass-366-unchanged-scope-snapshot',
  status: boundary.sha256 === PASS_366_UNCHANGED_SCOPE_SNAPSHOT ? 'passed' : 'failed',
  details: boundary.sha256 === PASS_366_UNCHANGED_SCOPE_SNAPSHOT
    ? `Unrelated Pass-366 scope remains byte-identical across ${boundary.fileCount} files.`
    : `Expected ${PASS_366_UNCHANGED_SCOPE_SNAPSHOT} but found ${boundary.sha256}.`
}];

const typescriptFiles = [
  'apps/api/src/modules/boq/boq.schema.ts',
  'apps/api/src/modules/boq/boq.service.ts',
  'apps/api/src/modules/boq/boq.routes.ts',
  'apps/api/src/modules/boq/index.ts',
  'apps/web/src/features/boq/api/boq-api.ts',
  'apps/web/src/features/boq/hooks/boq.ts',
  'apps/web/src/features/boq/components/boq-revision-panel.tsx',
  'apps/web/src/features/boq/pages/boqs-page.tsx'
];
const steps = [
  ['pass-367-focused-static', 'node', ['--test', 'tests/pass-367-module-4-boq-durable-revision-readback.test.mjs']],
  ['module-4a-cumulative-static', 'node', ['--test', 'tests/module-4a-static.test.mjs']],
  ['module-4b-cumulative-static', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
  ['full-static-regression', 'npm', ['run', 'test:static']],
  ['workspace-contract', 'npm', ['run', 'check:workspace']],
  ['migration-policy', 'npm', ['run', 'db:migrations:check']],
  ['typescript-source-syntax', 'tsc', ['--noEmit', '--noCheck', '--noResolve', '--jsx', 'react-jsx', '--target', 'ES2022', '--module', 'ESNext', ...typescriptFiles]],
  ['module-4a-integration-test-syntax', 'node', ['--check', 'tests/integration/module-4a-api.integration.test.mjs']],
  ['module-4b-integration-test-syntax', 'node', ['--check', 'tests/integration/module-4b-api.integration.test.mjs']],
  ['module-4a-playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-4a-browser.spec.mjs']]
];

if (results[0].status === 'passed') {
  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }
}

const passed = results.length === steps.length + 1 && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-pass-367-module-4-boq-durable-revision-readback',
  generatedAt: new Date().toISOString(),
  pass: 367,
  baselinePass: 366,
  status: passed ? 'PASS_367_MODULE_4_BOQ_DURABLE_REVISION_READBACK_ACCEPTED' : 'PASS_367_MODULE_4_BOQ_DURABLE_REVISION_READBACK_FAILED',
  repairContractItems: ['M4A-01'],
  businessModulesAdded: 0,
  migrationsAdded: 0,
  databaseTablesAdded: [],
  prismaModelsAdded: [],
  repositoryFunctionsAdded: [],
  sourceRoutesPreserved: 6,
  publicRepairRoutesAdded: [
    'GET /api/v1/boqs/:id',
    'GET /api/v1/boqs/:id/revisions/:revId'
  ],
  repairRoutesReadOnly: true,
  readAuthority: 'boq.read',
  permissionsAdded: [],
  stableErrorsAdded: [],
  domainEventsAdded: [],
  genericItemCrudAdded: false,
  historicalRevisionReadbackDurable: true,
  browserReloadHistorySupported: true,
  browserReloadComparisonSupported: true,
  frozenRevisionImmutabilityPreserved: true,
  stage26FinanceDeferralsRemainFrozen: true,
  stage27IntegrationDeferralsRemainFrozen: true,
  unchangedScopeSnapshotExpected: PASS_366_UNCHANGED_SCOPE_SNAPSHOT,
  unchangedScopeSnapshotActual: boundary.sha256,
  unchangedScopeFileCount: boundary.fileCount,
  liveDatabaseVerificationExecuted: false,
  liveDatabaseVerificationReason: 'Dependency-free packaged acceptance was executed. Live PostgreSQL/Prisma and Playwright verification still requires the configured workspace dependencies and disposable test services.',
  nextReviewedPass: 'Pass 368 - Module 10 Inventory warehouse management, stock-ledger read and low-stock support',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
if (!passed) process.exitCode = 1;
else console.log('PASS_367_MODULE_4_BOQ_DURABLE_REVISION_READBACK_ACCEPTED');
