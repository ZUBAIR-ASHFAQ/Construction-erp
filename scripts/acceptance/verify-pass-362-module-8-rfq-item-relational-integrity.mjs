import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary } from '../foundation/gate-lib.mjs';

const PASS_361_UNCHANGED_SCOPE_SNAPSHOT = 'b0dcd1e4e2e04ac1b920245ee77380ca760b1176e25a2cb8c0523f6204ff95a2';
const evidencePath = path.resolve('acceptance-evidence/pass-362-module-8-rfq-item-relational-integrity.json');
const allowedChangedPaths = new Set([
  'acceptance-evidence/pass-362-module-8-rfq-item-relational-integrity.json',
  'apps/api/src/modules/procurement/procurement.repository.ts',
  'apps/api/src/modules/procurement/procurement.routes.ts',
  'apps/api/src/modules/procurement/procurement.schema.ts',
  'apps/api/src/modules/procurement/procurement.service.ts',
  'apps/web/src/features/procurement/api/procurement-api.ts',
  'apps/web/src/features/procurement/components/procurement-workspace.tsx',
  'docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md',
  'docs/PASS-362-MODULE-8-RFQ-ITEM-RELATIONAL-INTEGRITY.md',
  'docs/modules/procurement/STAGE-13-MODULE-8-CONTRACT.md',
  'module-8-evidence/stage-13-static.json',
  'package.json',
  'packages/database/prisma/migration-checksums.json',
  'packages/database/prisma/migration-gates.json',
  'packages/database/prisma/migrations/20260826000500_module_8_rfq_item_relational_integrity/migration.sql',
  'packages/database/prisma/schema.prisma',
  'scripts/acceptance/verify-pass-362-module-8-rfq-item-relational-integrity.mjs',
  'scripts/module-8/verify-stage-13-contract.mjs',
  'scripts/module-8/verify-stage-13-integration-security.mjs',
  'scripts/module-8/verify-stage-13-persistence.mjs',
  'scripts/module-8/verify-stage-13-playwright.mjs',
  'scripts/module-8/verify-stage-13-react.mjs',
  'scripts/module-8/verify-stage-13-repository.mjs',
  'scripts/module-8/verify-stage-13-schema.mjs',
  'scripts/module-8/verify-stage-13-service.mjs',
  'scripts/module-8/verify-stage-13.mjs',
  'tests/database.test.mjs',
  'tests/e2e/module-8-browser.spec.mjs',
  'tests/integration/module-8-api.integration.test.mjs',
  'tests/migration-system.test.mjs',
  'tests/module-8-static.test.mjs',
  'tests/pass-358-stage-0-23-repair-contract-freeze.test.mjs',
  'tests/pass-360-module-6-cost-type-archive-lifecycle.test.mjs',
  'tests/pass-361-module-7-budget-approval-draft-readback.test.mjs',
  'tests/pass-362-module-8-rfq-item-relational-integrity.test.mjs',
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

/** Hash every file outside the reviewed Pass-362 boundary to prove unrelated Pass-361 code stayed byte-identical. */
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

results.push({
  name: 'pass-361-unchanged-scope-snapshot',
  status: boundary.sha256 === PASS_361_UNCHANGED_SCOPE_SNAPSHOT ? 'passed' : 'failed',
  details: boundary.sha256 === PASS_361_UNCHANGED_SCOPE_SNAPSHOT
    ? `Unrelated Pass-361 scope remains byte-identical across ${boundary.fileCount} files.`
    : `Expected ${PASS_361_UNCHANGED_SCOPE_SNAPSHOT} but found ${boundary.sha256}.`
});

const steps = [
  ['pass-362-focused-static', 'node', ['--test', 'tests/pass-362-module-8-rfq-item-relational-integrity.test.mjs']],
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
  kind: 'construction-erp-pass-362-module-8-rfq-item-relational-integrity',
  generatedAt: new Date().toISOString(),
  pass: 362,
  baselinePass: 361,
  status: passed ? 'PASS_362_MODULE_8_RFQ_ITEM_RELATIONAL_INTEGRITY_ACCEPTED' : 'PASS_362_MODULE_8_RFQ_ITEM_RELATIONAL_INTEGRITY_FAILED',
  repairContractItems: ['M8-01'],
  businessModulesAdded: 0,
  migrationsAdded: 1,
  databaseTablesAdded: 1,
  publicRoutesAdded: 0,
  permissionsAdded: 0,
  stableErrorsAdded: [],
  domainEventsAdded: [],
  rfqItemSupportTableAdded: true,
  supplierQuotationItemForeignKeyActivated: true,
  historicalQuotationIdentityBackfillAdded: true,
  sameRfqDatabaseIntegrityAdded: true,
  separateRfqItemCrudAdded: false,
  vendorMasterRepairDeferredToPass363: true,
  stage26FinanceDeferralsRemainFrozen: true,
  stage27IntegrationDeferralsRemainFrozen: true,
  unchangedScopeSnapshotExpected: PASS_361_UNCHANGED_SCOPE_SNAPSHOT,
  unchangedScopeSnapshotActual: boundary.sha256,
  unchangedScopeFileCount: boundary.fileCount,
  liveDatabaseVerificationExecuted: false,
  liveDatabaseVerificationReason: 'This packaged acceptance run is dependency-free; live PostgreSQL/Prisma and Playwright execution remain available through the guarded Module-8 live gates when workspace dependencies and a disposable test database are configured.',
  nextReviewedPass: 'Pass 363 - Module 8 Vendor master plus durable RFQ/Requisition readback and revision contract',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
if (!passed) process.exitCode = 1;
else console.log('PASS_362_MODULE_8_RFQ_ITEM_RELATIONAL_INTEGRITY_ACCEPTED');
