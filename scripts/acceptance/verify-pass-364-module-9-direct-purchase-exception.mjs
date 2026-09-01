import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary } from '../foundation/gate-lib.mjs';

const PASS_363_UNCHANGED_SCOPE_SNAPSHOT = '54c7c99d27ff7a497c8a3b45cb1006a254133e605e5ec2b1081ad8efb8820cf4';
const evidencePath = path.resolve('acceptance-evidence/pass-364-module-9-direct-purchase-exception.json');
const allowedChangedPaths = new Set([
  'README.md',
  'acceptance-evidence/pass-364-module-9-direct-purchase-exception.json',
  'apps/api/src/modules/purchase-orders/purchase-orders.repository.ts',
  'apps/api/src/modules/purchase-orders/purchase-orders.routes.ts',
  'apps/api/src/modules/purchase-orders/purchase-orders.schema.ts',
  'apps/api/src/modules/purchase-orders/purchase-orders.service.ts',
  'apps/web/src/features/purchase-orders/api/purchase-orders-api.ts',
  'apps/web/src/features/purchase-orders/components/purchase-orders-workspace.tsx',
  'apps/web/src/features/purchase-orders/pages/purchase-orders-page.tsx',
  'docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md',
  'docs/PASS-364-MODULE-9-DIRECT-PURCHASE-EXCEPTION.md',
  'docs/modules/purchase-orders/STAGE-14-MODULE-9-CONTRACT.md',
  'package.json',
  'packages/database/prisma/migration-checksums.json',
  'packages/database/prisma/migration-gates.json',
  'packages/database/prisma/migrations/20260826000600_module_9_direct_purchase_exception/migration.sql',
  'packages/database/prisma/schema.prisma',
  'scripts/acceptance/verify-pass-364-module-9-direct-purchase-exception.mjs',
  'tests/e2e/module-10-browser.spec.mjs',
  'tests/e2e/module-9-browser.spec.mjs',
  'tests/integration/module-10-api.integration.test.mjs',
  'tests/integration/module-9-api.integration.test.mjs',
  'tests/migration-system.test.mjs',
  'tests/module-9-static.test.mjs',
  'tests/pass-358-stage-0-23-repair-contract-freeze.test.mjs',
  'tests/pass-362-module-8-rfq-item-relational-integrity.test.mjs',
  'tests/pass-363-module-8-vendor-master-rfq-requisition-readback.test.mjs',
  'tests/pass-364-module-9-direct-purchase-exception.test.mjs'
]);
const allowedChangedPrefixes = ['module-9-evidence/'];

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

/** Return true when a path is inside the reviewed Pass-364 change boundary. */
function isAllowedChangedPath(relative) {
  return allowedChangedPaths.has(relative)
    || allowedChangedPrefixes.some((prefix) => relative.startsWith(prefix));
}

/** Hash every file outside the reviewed Pass-364 boundary to prove unrelated Pass-363 code stayed byte-identical. */
async function unchangedScopeSnapshot() {
  const files = await collectFiles('.');
  const hash = createHash('sha256');
  let fileCount = 0;
  for (const file of files.sort((left, right) => left.localeCompare(right))) {
    const relative = path.relative('.', file).replaceAll('\\', '/');
    if (isAllowedChangedPath(relative)) continue;
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
  name: 'pass-363-unchanged-scope-snapshot',
  status: boundary.sha256 === PASS_363_UNCHANGED_SCOPE_SNAPSHOT ? 'passed' : 'failed',
  details: boundary.sha256 === PASS_363_UNCHANGED_SCOPE_SNAPSHOT
    ? `Unrelated Pass-363 scope remains byte-identical across ${boundary.fileCount} files.`
    : `Expected ${PASS_363_UNCHANGED_SCOPE_SNAPSHOT} but found ${boundary.sha256}.`
}];

const typescriptFiles = [
  'apps/api/src/modules/purchase-orders/purchase-orders.schema.ts',
  'apps/api/src/modules/purchase-orders/purchase-orders.repository.ts',
  'apps/api/src/modules/purchase-orders/purchase-orders.service.ts',
  'apps/api/src/modules/purchase-orders/purchase-orders.routes.ts',
  'apps/web/src/features/purchase-orders/api/purchase-orders-api.ts',
  'apps/web/src/features/purchase-orders/components/purchase-orders-workspace.tsx',
  'apps/web/src/features/purchase-orders/pages/purchase-orders-page.tsx'
];
const steps = [
  ['pass-364-focused-static', 'node', ['--test', 'tests/pass-364-module-9-direct-purchase-exception.test.mjs']],
  ['module-9-static-acceptance', 'npm', ['run', 'module-9:gate']],
  ['full-static-regression', 'npm', ['run', 'test:static']],
  ['workspace-contract', 'npm', ['run', 'check:workspace']],
  ['migration-policy', 'npm', ['run', 'db:migrations:check']],
  ['typescript-source-syntax', 'tsc', ['--noEmit', '--noCheck', '--noResolve', '--jsx', 'react-jsx', '--target', 'ES2022', '--module', 'ESNext', ...typescriptFiles]],
  ['module-9-integration-test-syntax', 'node', ['--check', 'tests/integration/module-9-api.integration.test.mjs']],
  ['module-9-playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-9-browser.spec.mjs']],
  ['module-10-integration-fixture-syntax', 'node', ['--check', 'tests/integration/module-10-api.integration.test.mjs']],
  ['module-10-playwright-fixture-syntax', 'node', ['--check', 'tests/e2e/module-10-browser.spec.mjs']]
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
  kind: 'construction-erp-pass-364-module-9-direct-purchase-exception',
  generatedAt: new Date().toISOString(),
  pass: 364,
  baselinePass: 363,
  status: passed ? 'PASS_364_MODULE_9_DIRECT_PURCHASE_EXCEPTION_ACCEPTED' : 'PASS_364_MODULE_9_DIRECT_PURCHASE_EXCEPTION_FAILED',
  repairContractItems: ['M9-01'],
  businessModulesAdded: 0,
  migrationsAdded: 1,
  databaseTablesAdded: 0,
  databaseColumnsAdded: 1,
  publicRoutesAdded: 0,
  sourceRoutesPreserved: 8,
  permissionsAdded: ['purchase_orders.direct_purchase'],
  rolesAutoGrantedPermission: false,
  stableErrorsAdded: [],
  domainEventsAdded: [],
  directPurchaseReasonPersisted: true,
  sourceSwitchingAllowed: false,
  module22ApprovalPreserved: true,
  stage26FinanceDeferralsRemainFrozen: true,
  stage27IntegrationDeferralsRemainFrozen: true,
  unchangedScopeSnapshotExpected: PASS_363_UNCHANGED_SCOPE_SNAPSHOT,
  unchangedScopeSnapshotActual: boundary.sha256,
  unchangedScopeFileCount: boundary.fileCount,
  liveDatabaseVerificationExecuted: false,
  liveDatabaseVerificationReason: 'Dependency-free packaged acceptance was executed. Live PostgreSQL/Prisma and Playwright verification still requires the configured workspace dependencies and disposable test services.',
  nextReviewedPass: 'Pass 365 - Module 9 exact revision history and durable cancellation evidence',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
if (!passed) process.exitCode = 1;
else console.log('PASS_364_MODULE_9_DIRECT_PURCHASE_EXCEPTION_ACCEPTED');
