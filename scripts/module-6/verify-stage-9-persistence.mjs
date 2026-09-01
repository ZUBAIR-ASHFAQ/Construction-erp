import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_8_ACCEPTED = 'STAGE_8_ACCEPTED_READY_FOR_STAGE_9';
const PASS_175_ACCEPTED = 'PASS_175_FINAL_REPAIR_AUDIT_ACCEPTED_READY_FOR_MODULE_6';
const HOLD_CLEARED = 'STAGE_8_REPAIR_HOLD_CLEARED';
const evidencePath = path.resolve('module-6-evidence', 'stage-9-persistence.json');

/** Read one JSON evidence file and return null when it is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const pass175 = await readJson('acceptance-evidence/pass-175-final-handoff-live.json');
const stage8 = await readJson('module-24b-evidence/stage-8-live.json');
const repairHold = await readJson('module-24b-evidence/stage-8-repair-hold.json');
const module6LiveHandoffAccepted = pass175?.status === PASS_175_ACCEPTED
  && pass175?.runtimeVerificationComplete === true
  && pass175?.module6Allowed === true
  && stage8?.status === STAGE_8_ACCEPTED
  && repairHold?.status === HOLD_CLEARED
  && repairHold?.module6Allowed === true;

const results = [];
const steps = [
  ['module-6-contract', 'npm', ['run', 'module-6:contract:gate']],
  ['module-6-persistence-suite', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
];

for (const [name, command, args] of steps) {
  const result = await runStep(name, command, args);
  results.push(result);
  if (result.status !== 'passed') break;
}

const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
const status = passed
  ? (module6LiveHandoffAccepted
      ? 'STAGE_9_PERSISTENCE_READY_FOR_PASS_178'
      : 'STAGE_9_PERSISTENCE_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-module-6-stage-9-persistence-evidence',
  generatedAt: new Date().toISOString(),
  pass: 177,
  stage: 9,
  module: '6 - WBS & Cost Codes',
  status,
  module6LiveHandoffAccepted,
  ownedTables: ['wbs_nodes', 'cost_codes', 'cost_types', 'project_cost_codes'],
  migration: '20260823000700_module_6_wbs_cost_codes_core',
  runtimeDeploymentAllowed: passed && module6LiveHandoffAccepted,
  apiRuntimeGenerated: false,
  reactRuntimeGenerated: false,
  unresolvedPersistenceContract: [
    'The source defines Project cost-structure freeze but no durable Project-level freeze field/table.',
    'Public status/category values remain unenumerated.',
    'WBS level API ownership remains unresolved.',
    'Cost Type master still has no reviewed HTTP route.'
  ],
  nextPass: passed
    ? 'Pass 178 - Module 6 Zod boundary. Keep unresolved source ambiguities explicit and do not activate runtime while the Stage-8 live handoff is pending.'
    : 'Repair the failed Pass-177 persistence check before generating the Module-6 Zod boundary.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 6 Stage-9 persistence evidence written to ${written}`);

if (!passed) process.exitCode = 1;
