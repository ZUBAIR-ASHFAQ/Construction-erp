import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_5 = 'STAGE_5_ACCEPTED_READY_FOR_STAGE_6';
const evidencePath = path.resolve('module-4a-evidence', 'stage-6-persistence.json');

/** Read Module 3 live evidence so Pass 124 never promotes prepared persistence into deployable Stage 6. */
async function readStage5LiveAcceptance() {
  try {
    return JSON.parse(await readFile('module-3-evidence/stage-5-live.json', 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage5 = await readStage5LiveAcceptance();
const stage5LiveAccepted = stage5?.status === ACCEPTED_STAGE_5;
const results = [];
const steps = [
  ['module-4a-contract', 'npm', ['run', 'module-4a:contract:gate']],
  ['module-4a-persistence-suite', 'node', ['--test', 'tests/module-4a-static.test.mjs']],
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
  ? (stage5LiveAccepted
      ? 'STAGE_6_PERSISTENCE_READY_FOR_PASS_125'
      : 'STAGE_6_PERSISTENCE_PREPARED_STAGE_5_LIVE_ACCEPTANCE_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-module-4a-stage-6-persistence-evidence',
  generatedAt: new Date().toISOString(),
  status,
  module: '4A - BOQ Commercial Core',
  pass: 124,
  stage5LiveAccepted,
  activation: stage5LiveAccepted
    ? 'STAGE_6_PERSISTENCE_MAY_BE_USED'
    : 'DO_NOT_DEPLOY_STAGE_6_UNTIL_STAGE_5_LIVE_ACCEPTED',
  ownedTables: ['boqs', 'boq_revisions', 'boq_items'],
  migration: '20260823000300_module_4a_boq_commercial_core',
  deferredColumns: ['project_id', 'wbs_node_id', 'cost_code_id'],
  runtimeDeploymentAllowed: passed && stage5LiveAccepted,
  nextPass: passed && stage5LiveAccepted
    ? 'Pass 125 - Module 4A Zod schemas and request/response contracts'
    : 'Complete Module 3 live Stage-5 acceptance before activating Stage 6 or treating Pass 125 as deployable',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 4A Stage-6 persistence evidence written to ${written}`);

if (!passed) process.exitCode = 1;
