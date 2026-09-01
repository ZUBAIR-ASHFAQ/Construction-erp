import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary } from '../foundation/gate-lib.mjs';

const PASS_362_UNCHANGED_SCOPE_SNAPSHOT = '9d388844d46945f4cc42271ba6afce9574505ead559484447e63e50b55860303';
const evidencePath = path.resolve('acceptance-evidence/pass-363-module-8-vendor-master-rfq-requisition-readback.json');
const allowedChangedPaths = new Set([
  'acceptance-evidence/pass-363-module-8-vendor-master-rfq-requisition-readback.json',
  'apps/api/src/modules/procurement/index.ts',
  'apps/api/src/modules/procurement/procurement.repository.ts',
  'apps/api/src/modules/procurement/procurement.routes.ts',
  'apps/api/src/modules/procurement/procurement.schema.ts',
  'apps/api/src/modules/procurement/procurement.service.ts',
  'apps/web/src/features/procurement/api/procurement-api.ts',
  'apps/web/src/features/procurement/components/procurement-workspace.tsx',
  'apps/web/src/features/procurement/hooks/procurement.ts',
  'apps/web/src/features/procurement/pages/procurement-page.tsx',
  'docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md',
  'docs/PASS-363-MODULE-8-VENDOR-MASTER-RFQ-REQUISITION-READBACK.md',
  'docs/modules/procurement/STAGE-13-MODULE-8-CONTRACT.md',
  'module-8-evidence/stage-13-static.json',
  'package.json',
  'scripts/acceptance/verify-pass-363-module-8-vendor-master-rfq-requisition-readback.mjs',
  'tests/module-8-static.test.mjs',
  'tests/pass-362-module-8-rfq-item-relational-integrity.test.mjs',
  'tests/pass-363-module-8-vendor-master-rfq-requisition-readback.test.mjs'
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

/** Hash every file outside the reviewed Pass-363 boundary to prove unrelated Pass-362 code stayed byte-identical. */
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
  name: 'pass-362-unchanged-scope-snapshot',
  status: boundary.sha256 === PASS_362_UNCHANGED_SCOPE_SNAPSHOT ? 'passed' : 'failed',
  details: boundary.sha256 === PASS_362_UNCHANGED_SCOPE_SNAPSHOT
    ? `Unrelated Pass-362 scope remains byte-identical across ${boundary.fileCount} files.`
    : `Expected ${PASS_362_UNCHANGED_SCOPE_SNAPSHOT} but found ${boundary.sha256}.`
}];

const steps = [
  ['pass-363-focused-static', 'node', ['--test', 'tests/pass-363-module-8-vendor-master-rfq-requisition-readback.test.mjs']],
  ['module-8-static-acceptance', 'npm', ['run', 'module-8:gate']],
  ['full-static-regression', 'npm', ['run', 'test:static']],
  ['workspace-contract', 'npm', ['run', 'check:workspace']],
  ['migration-policy', 'npm', ['run', 'db:migrations:check']],
  ['integration-test-syntax', 'node', ['--check', 'tests/integration/module-8-api.integration.test.mjs']],
  ['playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-8-browser.spec.mjs']]
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
  kind: 'construction-erp-pass-363-module-8-vendor-master-rfq-requisition-readback',
  generatedAt: new Date().toISOString(),
  pass: 363,
  baselinePass: 362,
  status: passed ? 'PASS_363_MODULE_8_VENDOR_MASTER_RFQ_REQUISITION_READBACK_ACCEPTED' : 'PASS_363_MODULE_8_VENDOR_MASTER_RFQ_REQUISITION_READBACK_FAILED',
  repairContractItems: ['M8-02', 'M8-03'],
  businessModulesAdded: 0,
  migrationsAdded: 0,
  databaseTablesAdded: 0,
  publicRepairRoutesAdded: 11,
  originalSourceRoutesPreserved: 8,
  permissionsAdded: 0,
  stableErrorsAdded: [],
  domainEventsAdded: [],
  destructiveVendorDeleteAdded: false,
  rfqItemCrudAdded: false,
  stage26FinanceDeferralsRemainFrozen: true,
  stage27IntegrationDeferralsRemainFrozen: true,
  unchangedScopeSnapshotExpected: PASS_362_UNCHANGED_SCOPE_SNAPSHOT,
  unchangedScopeSnapshotActual: boundary.sha256,
  unchangedScopeFileCount: boundary.fileCount,
  liveDatabaseVerificationExecuted: false,
  liveDatabaseVerificationReason: 'Dependency-free packaged acceptance was executed. Live PostgreSQL/Prisma and Playwright verification still requires the configured workspace dependencies and disposable test services.',
  nextReviewedPass: 'Pass 364 - Module 9 Direct Purchase exception workflow',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
if (!passed) process.exitCode = 1;
else console.log('PASS_363_MODULE_8_VENDOR_MASTER_RFQ_REQUISITION_READBACK_ACCEPTED');
