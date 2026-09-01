import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary } from '../foundation/gate-lib.mjs';

const PASS_360_UNCHANGED_SCOPE_SNAPSHOT = '64c3d36f0b3012e76b572286b8e057a66512926ab6796fbf73f0f5e8bf3affce';
const evidencePath = path.resolve('acceptance-evidence/pass-361-module-7-budget-approval-draft-readback.json');
const allowedChangedPaths = new Set([
  'acceptance-evidence/pass-361-module-7-budget-approval-draft-readback.json',
  'scripts/acceptance/verify-pass-361-module-7-budget-approval-draft-readback.mjs',
  'package.json',
  'docs/PASS-361-MODULE-7-BUDGET-APPROVAL-DRAFT-READBACK.md',
  'docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md',
  'docs/modules/budgets-job-cost/STAGE-12-MODULE-7-CONTRACT.md',
  'apps/api/.env.example',
  'apps/api/src/app.ts',
  'apps/api/src/main.ts',
  'apps/api/src/modules/budgets-job-cost/budgets-job-cost.routes.ts',
  'apps/api/src/modules/budgets-job-cost/budgets-job-cost.schema.ts',
  'apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts',
  'apps/api/src/modules/budgets-job-cost/index.ts',
  'apps/web/src/features/budgets-job-cost/api/budgets-job-cost-api.ts',
  'apps/web/src/features/budgets-job-cost/components/budget-job-cost-workspace.tsx',
  'apps/web/src/features/budgets-job-cost/hooks/budgets-job-cost.ts',
  'module-7-evidence/stage-12-static.json',
  'packages/config/src/server.ts',
  'scripts/module-7/verify-stage-12-http.mjs',
  'scripts/module-7/verify-stage-12-integration-security.mjs',
  'scripts/module-7/verify-stage-12-react.mjs',
  'scripts/module-7/verify-stage-12-schema.mjs',
  'scripts/module-7/verify-stage-12-service.mjs',
  'scripts/module-7/verify-stage-12.mjs',
  'tests/config.test.mjs',
  'tests/e2e/module-7-browser.spec.mjs',
  'tests/integration/module-7-api.integration.test.mjs',
  'tests/module-7-static.test.mjs',
  'tests/module-8-static.test.mjs',
  'tests/pass-303-source-gap-freeze.test.mjs',
  'tests/pass-358-stage-0-23-repair-contract-freeze.test.mjs',
  'tests/pass-361-module-7-budget-approval-draft-readback.test.mjs'
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

/** Hash every file outside the reviewed Pass-361 boundary to prove unrelated Pass-360 code stayed byte-identical. */
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

if (boundary.sha256 === PASS_360_UNCHANGED_SCOPE_SNAPSHOT) {
  results.push({
    name: 'pass-360-unchanged-scope-snapshot',
    status: 'passed',
    details: `Unrelated Pass-360 scope remains byte-identical across ${boundary.fileCount} files.`
  });
} else {
  results.push({
    name: 'pass-360-unchanged-scope-snapshot',
    status: 'failed',
    details: `Expected ${PASS_360_UNCHANGED_SCOPE_SNAPSHOT} but found ${boundary.sha256}.`
  });
}

const steps = [
  ['pass-361-focused-static', 'node', ['--test', 'tests/pass-361-module-7-budget-approval-draft-readback.test.mjs']],
  ['module-7-static-acceptance', 'npm', ['run', 'module-7:gate']],
  ['full-static-regression', 'npm', ['run', 'test:static']],
  ['workspace-contract', 'npm', ['run', 'check:workspace']],
  ['migration-policy', 'npm', ['run', 'db:migrations:check']],
  ['integration-test-syntax', 'node', ['--check', 'tests/integration/module-7-api.integration.test.mjs']],
  ['playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-7-browser.spec.mjs']]
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
  kind: 'construction-erp-pass-361-module-7-budget-approval-draft-readback',
  generatedAt: new Date().toISOString(),
  pass: 361,
  baselinePass: 360,
  status: passed ? 'PASS_361_MODULE_7_BUDGET_APPROVAL_DRAFT_READBACK_ACCEPTED' : 'PASS_361_MODULE_7_BUDGET_APPROVAL_DRAFT_READBACK_FAILED',
  repairContractItems: ['M7-01', 'M7-02'],
  businessModulesAdded: 0,
  migrationsAdded: 0,
  databaseTablesAdded: 0,
  publicRoutesAdded: 1,
  permissionsAdded: 0,
  stableErrorsAdded: [],
  domainEventsAdded: [],
  configuredBudgetApprovalUsesModule22: true,
  latestDraftReadbackAdded: true,
  genericBudgetCrudAdded: false,
  manualJobCostSourceWritesAdded: false,
  stage26FinanceDeferralsRemainFrozen: true,
  stage27IntegrationDeferralsRemainFrozen: true,
  unchangedScopeSnapshotExpected: PASS_360_UNCHANGED_SCOPE_SNAPSHOT,
  unchangedScopeSnapshotActual: boundary.sha256,
  unchangedScopeFileCount: boundary.fileCount,
  liveDatabaseVerificationExecuted: false,
  liveDatabaseVerificationReason: 'This packaged acceptance run is dependency-free; live PostgreSQL/Prisma and Playwright execution remain available through the guarded Module-7 live gates when workspace dependencies and a disposable test database are configured.',
  nextReviewedPass: 'Pass 362 - Module 8 RFQ item relational integrity',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

if (!passed) process.exitCode = 1;
else console.log('PASS_361_MODULE_7_BUDGET_APPROVAL_DRAFT_READBACK_ACCEPTED');
