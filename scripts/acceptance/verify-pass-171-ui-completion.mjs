import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const evidencePath = 'acceptance-evidence/pass-171-ui-completion.json';
const results = [];
const steps = [
  ['module-2-crm-static', 'node', ['--test', 'tests/module-2-static.test.mjs']],
  ['module-3-tender-static', 'node', ['--test', 'tests/module-3-static.test.mjs']],
  ['module-4a-boq-static', 'node', ['--test', 'tests/module-4a-static.test.mjs']],
  ['module-5-project-static', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-4a-playwright-syntax', 'node', ['--check', 'tests/e2e/module-4a-browser.spec.mjs']],
  ['complete-static-regression', 'npm', ['run', 'test:static']],
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
];

/** Run the Pass-171 static repair checks in order and stop after the first failure. */
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
  kind: 'construction-erp-pass-171-existing-module-ui-completion',
  generatedAt: new Date().toISOString(),
  pass: 171,
  status: passed ? 'PASS_171_EXISTING_MODULE_UI_COMPLETION_PREPARED_REPAIR_HOLD_ACTIVE' : 'BLOCKED',
  crmCompletion: [
    'Client detail reads related Tenders through the existing clientId list filter',
    'Client detail reads related Projects through the existing clientId list filter',
    'CRM links open the existing Tender/Project workspaces already filtered to the selected Client',
    'target module permissions and server authorization remain authoritative'
  ],
  boqCompletion: [
    'CSV import uses item_code,parent_item_code,description,unit,quantity,rate',
    'the complete file is parsed and Zod-validated before the worksheet changes',
    'parent item codes resolve to transient row keys only in browser form state',
    'saving still uses the existing PUT revision item-set command',
    'no backend import route, table, repository method or service method is added',
    'the maintained Module 4A Playwright scenario prepares CSV hierarchy coverage'
  ],
  productionBackendChanges: 0,
  databaseChanges: 0,
  migrationsAdded: 0,
  apiRoutesAdded: 0,
  permissionsAdded: 0,
  newReactProductionFiles: 0,
  repairHoldActive: true,
  module6Allowed: false,
  runtimeVerificationComplete: false,
  nextPass: 'Pass 172 - Junior-readable service refactor.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Pass 171 UI completion evidence written to ${written}`);
if (!passed) process.exitCode = 1;
