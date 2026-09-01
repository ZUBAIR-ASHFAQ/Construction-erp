import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary } from '../foundation/gate-lib.mjs';

const PASS_359_UNCHANGED_SCOPE_SNAPSHOT = '5e90fe853cdab78a48a59d3c95c8dd7dfbb9786e9666d000a8e8c46de8a801c0';
const evidencePath = path.resolve('acceptance-evidence/pass-360-module-6-cost-type-archive-lifecycle.json');
const allowedChangedPaths = new Set([
  'acceptance-evidence/pass-360-module-6-cost-type-archive-lifecycle.json',
  'scripts/acceptance/verify-pass-360-module-6-cost-type-archive-lifecycle.mjs',
  'package.json',
  'docs/PASS-360-MODULE-6-COST-TYPE-ARCHIVE-LIFECYCLE.md',
  'docs/modules/wbs-cost-codes/STAGE-9-MODULE-6-CONTRACT.md',
  'apps/api/src/modules/wbs-cost-codes/index.ts',
  'apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.repository.ts',
  'apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.routes.ts',
  'apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.schema.ts',
  'apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.service.ts',
  'apps/web/src/features/wbs-cost-codes/api/wbs-cost-codes-api.ts',
  'apps/web/src/features/wbs-cost-codes/components/wbs-cost-structure-workspace.tsx',
  'apps/web/src/features/wbs-cost-codes/hooks/wbs-cost-codes.ts',
  'apps/web/src/features/wbs-cost-codes/pages/wbs-cost-codes-page.tsx',
  'tests/e2e/module-6-browser.spec.mjs',
  'tests/integration/module-6-api.integration.test.mjs',
  'tests/module-6-static.test.mjs',
  'tests/pass-359-module-6-durable-wbs-freeze-reopen.test.mjs',
  'tests/pass-360-module-6-cost-type-archive-lifecycle.test.mjs',
  'module-6-evidence/stage-9-api-contract.json',
  'module-6-evidence/stage-9-http.json',
  'module-6-evidence/stage-9-integration.json',
  'module-6-evidence/stage-9-operations.json',
  'module-6-evidence/stage-9-playwright.json',
  'module-6-evidence/stage-9-react-register.json',
  'module-6-evidence/stage-9-react-workflow.json',
  'module-6-evidence/stage-9-security.json',
  'module-6-evidence/stage-9-static.json'
]);

/** Collect every repository file in stable lexical order without dependency or VCS directories. */
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

/** Hash every file outside the reviewed Pass-360 boundary to prove unrelated Pass-359 code stayed byte-identical. */
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
const results = [];

if (boundary.sha256 === PASS_359_UNCHANGED_SCOPE_SNAPSHOT) {
  results.push({
    name: 'pass-359-unchanged-scope-snapshot',
    status: 'passed',
    details: `Unrelated Pass-359 scope remains byte-identical across ${boundary.fileCount} files.`
  });
} else {
  results.push({
    name: 'pass-359-unchanged-scope-snapshot',
    status: 'failed',
    details: `Expected ${PASS_359_UNCHANGED_SCOPE_SNAPSHOT} but found ${boundary.sha256}.`
  });
}

const steps = [
  ['pass-360-focused-static', 'node', ['--test', 'tests/pass-360-module-6-cost-type-archive-lifecycle.test.mjs']],
  ['module-6-static-acceptance', 'npm', ['run', 'module-6:gate']],
  ['full-static-regression', 'npm', ['run', 'test:static']],
  ['workspace-contract', 'npm', ['run', 'check:workspace']],
  ['migration-policy', 'npm', ['run', 'db:migrations:check']],
  ['integration-test-syntax', 'node', ['--check', 'tests/integration/module-6-api.integration.test.mjs']],
  ['playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-6-browser.spec.mjs']]
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
  kind: 'construction-erp-pass-360-module-6-cost-type-archive-lifecycle',
  generatedAt: new Date().toISOString(),
  pass: 360,
  baselinePass: 359,
  status: passed ? 'PASS_360_MODULE_6_COST_TYPE_ARCHIVE_LIFECYCLE_ACCEPTED' : 'PASS_360_MODULE_6_COST_TYPE_ARCHIVE_LIFECYCLE_FAILED',
  repairContractItems: ['M6-02', 'M6-03'],
  businessModulesAdded: 0,
  migrationsAdded: 0,
  databaseTablesAdded: 0,
  publicRoutesAdded: 8,
  permissionsAdded: 0,
  stableErrorsAdded: [],
  domainEventsAdded: [],
  costTypeMasterCompleted: true,
  nonDestructiveArchiveLifecycle: true,
  deleteRoutesAdded: 0,
  durableFreezeProtectionPreserved: true,
  stage26FinanceDeferralsRemainFrozen: true,
  stage27IntegrationDeferralsRemainFrozen: true,
  unchangedScopeSnapshotExpected: PASS_359_UNCHANGED_SCOPE_SNAPSHOT,
  unchangedScopeSnapshotActual: boundary.sha256,
  unchangedScopeFileCount: boundary.fileCount,
  liveDatabaseVerificationExecuted: false,
  liveDatabaseVerificationReason: 'This packaged acceptance run is dependency-free; live PostgreSQL/Prisma and Playwright execution remain available through the guarded Module-6 live gates when workspace dependencies and a disposable test database are configured.',
  nextReviewedPass: 'Pass 361 - Module 7 Budget approval and DRAFT readback',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

if (!passed) process.exitCode = 1;
else console.log('PASS_360_MODULE_6_COST_TYPE_ARCHIVE_LIFECYCLE_ACCEPTED');
