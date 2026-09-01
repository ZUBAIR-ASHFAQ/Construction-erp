import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const evidencePath = 'acceptance-evidence/pass-173-consolidated-regression.json';
const results = [];
const steps = [
  ['audit-repair-focused-regression', 'node', ['--test', 'tests/audit-repair-regression.test.mjs']],
  ['module-24b-static', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
  ['module-18-static', 'node', ['--test', 'tests/module-18-static.test.mjs']],
  ['module-2-static', 'node', ['--test', 'tests/module-2-static.test.mjs']],
  ['module-3-static', 'node', ['--test', 'tests/module-3-static.test.mjs']],
  ['module-4a-static', 'node', ['--test', 'tests/module-4a-static.test.mjs']],
  ['module-5-static', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-22-static', 'node', ['--test', 'tests/module-22-static.test.mjs']],
  ['complete-static-regression', 'npm', ['run', 'test:static']],
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
];

/** Run the consolidated Pass-173 audit-repair regression checks in dependency order. */
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
  kind: 'construction-erp-pass-173-consolidated-audit-repair-regression',
  generatedAt: new Date().toISOString(),
  pass: 173,
  status: passed ? 'PASS_173_CONSOLIDATED_AUDIT_REPAIR_REGRESSION_PASSED_REPAIR_HOLD_ACTIVE' : 'BLOCKED',
  auditedRepairPasses: [165, 166, 167, 168, 169, 170, 171, 172],
  verifiedAreas: [
    'Stage-8 Project-member read-before-replace',
    'Stage-8 User role/project-scope read-before-replace',
    'Module 18 nullable Project persistence and same-company foreign keys',
    'Module 18 repository/service Project isolation',
    'Module 18 HTTP/OpenAPI/React/E2E Project completion',
    'CRM Client to Tender/Project links',
    'BOQ CSV import through the existing whole-set save command',
    'junior-readable service orchestration',
    'approved five-file backend module layout',
    'function-purpose comments and required stack through full static regression',
    'absence of stale production text claiming Project scope still waits for Module 24B'
  ],
  behaviorChangesIntended: 0,
  databaseChanges: 0,
  migrationsAdded: 0,
  apiRoutesAdded: 0,
  permissionsAdded: 0,
  repairHoldActive: true,
  module6Allowed: false,
  runtimeVerificationComplete: false,
  nextPass: 'Pass 174 - Reproducible dependency-backed and live acceptance chain.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Pass 173 consolidated audit-repair evidence written to ${written}`);
if (!passed) process.exitCode = 1;
