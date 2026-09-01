import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary } from '../foundation/gate-lib.mjs';

const PASS_365_UNCHANGED_SCOPE_SNAPSHOT = '46393cf875562a6d01950948a33200dccfeaf4fb716fbba9bf72bd41414f72f5';
const evidencePath = path.resolve('acceptance-evidence/pass-366-module-5-controlled-suspend-resume.json');
const allowedChangedPaths = new Set([
  'README.md',
  'acceptance-evidence/pass-366-module-5-controlled-suspend-resume.json',
  'apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts',
  'apps/api/src/modules/change-orders/change-orders.service.ts',
  'apps/api/src/modules/client-billing/client-billing.service.ts',
  'apps/api/src/modules/inventory/inventory.service.ts',
  'apps/api/src/modules/procurement/procurement.service.ts',
  'apps/api/src/modules/projects/index.ts',
  'apps/api/src/modules/projects/projects.routes.ts',
  'apps/api/src/modules/projects/projects.schema.ts',
  'apps/api/src/modules/projects/projects.service.ts',
  'apps/api/src/modules/purchase-orders/purchase-orders.service.ts',
  'apps/api/src/modules/scheduling/scheduling.service.ts',
  'apps/api/src/modules/subcontracts/subcontracts.service.ts',
  'apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.service.ts',
  'apps/web/src/features/projects/api/projects-api.ts',
  'apps/web/src/features/projects/components/project-details-panel.tsx',
  'apps/web/src/features/projects/hooks/projects.ts',
  'docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md',
  'docs/PASS-366-MODULE-5-CONTROLLED-SUSPEND-RESUME.md',
  'docs/modules/projects/STAGE-7-MODULE-5-CONTRACT.md',
  'package.json',
  'scripts/acceptance/verify-pass-366-module-5-controlled-suspend-resume.mjs',
  'tests/e2e/module-5-browser.spec.mjs',
  'tests/integration/module-5-api.integration.test.mjs',
  'tests/module-5-static.test.mjs',
  'tests/pass-358-stage-0-23-repair-contract-freeze.test.mjs',
  'tests/pass-366-module-5-controlled-suspend-resume.test.mjs'
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

/** Hash every file outside the reviewed Pass-366 boundary to prove unrelated Pass-365 scope stayed byte-identical. */
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
  name: 'pass-365-unchanged-scope-snapshot',
  status: boundary.sha256 === PASS_365_UNCHANGED_SCOPE_SNAPSHOT ? 'passed' : 'failed',
  details: boundary.sha256 === PASS_365_UNCHANGED_SCOPE_SNAPSHOT
    ? `Unrelated Pass-365 scope remains byte-identical across ${boundary.fileCount} files.`
    : `Expected ${PASS_365_UNCHANGED_SCOPE_SNAPSHOT} but found ${boundary.sha256}.`
}];

const typescriptFiles = [
  'apps/api/src/modules/projects/projects.schema.ts',
  'apps/api/src/modules/projects/projects.service.ts',
  'apps/api/src/modules/projects/projects.routes.ts',
  'apps/api/src/modules/projects/index.ts',
  'apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.service.ts',
  'apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts',
  'apps/api/src/modules/procurement/procurement.service.ts',
  'apps/api/src/modules/purchase-orders/purchase-orders.service.ts',
  'apps/api/src/modules/inventory/inventory.service.ts',
  'apps/api/src/modules/subcontracts/subcontracts.service.ts',
  'apps/api/src/modules/client-billing/client-billing.service.ts',
  'apps/api/src/modules/change-orders/change-orders.service.ts',
  'apps/api/src/modules/scheduling/scheduling.service.ts',
  'apps/web/src/features/projects/api/projects-api.ts',
  'apps/web/src/features/projects/hooks/projects.ts',
  'apps/web/src/features/projects/components/project-details-panel.tsx'
];
const steps = [
  ['pass-366-focused-static', 'node', ['--test', 'tests/pass-366-module-5-controlled-suspend-resume.test.mjs']],
  ['module-5-cumulative-static', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['full-static-regression', 'npm', ['run', 'test:static']],
  ['workspace-contract', 'npm', ['run', 'check:workspace']],
  ['migration-policy', 'npm', ['run', 'db:migrations:check']],
  ['typescript-source-syntax', 'tsc', ['--noEmit', '--noCheck', '--noResolve', '--jsx', 'react-jsx', '--target', 'ES2022', '--module', 'ESNext', ...typescriptFiles]],
  ['module-5-integration-test-syntax', 'node', ['--check', 'tests/integration/module-5-api.integration.test.mjs']],
  ['module-5-playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-5-browser.spec.mjs']]
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
  kind: 'construction-erp-pass-366-module-5-controlled-suspend-resume',
  generatedAt: new Date().toISOString(),
  pass: 366,
  baselinePass: 365,
  status: passed ? 'PASS_366_MODULE_5_CONTROLLED_SUSPEND_RESUME_ACCEPTED' : 'PASS_366_MODULE_5_CONTROLLED_SUSPEND_RESUME_FAILED',
  repairContractItems: ['M5-01'],
  businessModulesAdded: 0,
  migrationsAdded: 0,
  databaseTablesAdded: [],
  prismaModelsAdded: [],
  repositoryFunctionsAdded: [],
  publicRepairRoutesAdded: [
    'POST /api/v1/projects/:id/suspend',
    'POST /api/v1/projects/:id/resume'
  ],
  sourceRoutesPreserved: 7,
  module24bMembershipRoutePreserved: true,
  permissionsAdded: [],
  stableErrorsAdded: [],
  domainEventsAdded: [],
  suspensionAuthority: 'projects.close',
  resumeAuthority: 'projects.activate',
  suspensionTransition: 'ACTIVE -> SUSPENDED',
  resumeTransition: 'SUSPENDED -> ACTIVE',
  lifecycleHistoryPersisted: true,
  lifecycleAuditPersisted: true,
  suspendedResumeOutboxEventsInvented: false,
  suspendedDownstreamNormalWritesBlocked: true,
  stage26FinanceDeferralsRemainFrozen: true,
  stage27IntegrationDeferralsRemainFrozen: true,
  unchangedScopeSnapshotExpected: PASS_365_UNCHANGED_SCOPE_SNAPSHOT,
  unchangedScopeSnapshotActual: boundary.sha256,
  unchangedScopeFileCount: boundary.fileCount,
  liveDatabaseVerificationExecuted: false,
  liveDatabaseVerificationReason: 'Dependency-free packaged acceptance was executed. Live PostgreSQL/Prisma and Playwright verification still requires the configured workspace dependencies and disposable test services.',
  nextReviewedPass: 'Pass 367 - Module 4 BOQ durable revision-detail/history readback',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
if (!passed) process.exitCode = 1;
else console.log('PASS_366_MODULE_5_CONTROLLED_SUSPEND_RESUME_ACCEPTED');
