import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const evidencePath = 'acceptance-evidence/pass-172-service-readability.json';
const results = [];
const steps = [
  ['module-18-static', 'node', ['--test', 'tests/module-18-static.test.mjs']],
  ['module-22-static', 'node', ['--test', 'tests/module-22-static.test.mjs']],
  ['module-3-static', 'node', ['--test', 'tests/module-3-static.test.mjs']],
  ['documents-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/documents/documents.service.ts']],
  ['approvals-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/approvals/approvals.service.ts']],
  ['tender-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/tendering-estimation/tendering-estimation.service.ts']],
  ['complete-static-regression', 'npm', ['run', 'test:static']],
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
];

/** Run the Pass-172 readability checks in order and stop after the first failure. */
async function runChecks() {
  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }
}

await runChecks();
const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-pass-172-service-readability',
  generatedAt: new Date().toISOString(),
  pass: 172,
  status: passed ? 'PASS_172_JUNIOR_READABLE_SERVICE_REFACTOR_PREPARED_REPAIR_HOLD_ACTIVE' : 'BLOCKED',
  refactoredServices: [
    'documents.service.ts completeUploadIntent workflow',
    'approvals.service.ts actOnApproval workflow',
    'approvals.service.ts requestApprovalInTransaction workflow',
    'tendering-estimation.service.ts submitTender workflow'
  ],
  behaviorChangesIntended: 0,
  databaseChanges: 0,
  migrationsAdded: 0,
  apiRoutesAdded: 0,
  permissionsAdded: 0,
  repositoryMethodsAdded: 0,
  serviceFilesAdded: 0,
  productionFilesAdded: 0,
  repairHoldActive: true,
  module6Allowed: false,
  runtimeVerificationComplete: false,
  nextPass: 'Pass 173 - Consolidated audit-repair regression gate.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Pass 172 service-readability evidence written to ${written}`);
if (!passed) process.exitCode = 1;
