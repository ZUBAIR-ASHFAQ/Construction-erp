import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_5 = 'STAGE_5_ACCEPTED_READY_FOR_STAGE_6';
const evidencePath = path.resolve('module-4a-evidence', 'stage-6-contract.json');

/** Read Module 3 live evidence so the contract gate never upgrades static proof into runtime readiness. */
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
  ['module-3-static-prerequisite', 'npm', ['run', 'module-3:gate']],
  ['module-4a-contract-suite', 'node', ['--test', 'tests/module-4a-static.test.mjs']],
  ['workspace-contract', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
];

for (const [name, command, args] of steps) {
  const result = await runStep(name, command, args);
  results.push(result);
  if (result.status !== 'passed') break;
}

const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-module-4a-stage-6-contract-evidence',
  generatedAt: new Date().toISOString(),
  status: passed
    ? (stage5LiveAccepted
        ? 'STAGE_6_CONTRACT_FROZEN_READY_FOR_IMPLEMENTATION'
        : 'STAGE_6_CONTRACT_FROZEN_STAGE_5_LIVE_ACCEPTANCE_PENDING')
    : 'BLOCKED',
  module: '4A - BOQ Commercial Core',
  contractOnly: true,
  stage5LiveAccepted,
  ownedTables: ['boqs', 'boq_revisions', 'boq_items'],
  requiredSource: 'tender_id',
  deferredColumns: ['project_id', 'wbs_node_id', 'cost_code_id'],
  approvedRouteCount: 6,
  permissions: ['boq.read', 'boq.create', 'boq.edit', 'boq.freeze', 'boq.export'],
  events: ['boq.created', 'boq.revision_created', 'boq.revision_frozen'],
  runtimeImplementationAllowed: passed && stage5LiveAccepted,
  nextPass: passed && stage5LiveAccepted
    ? 'Pass 124 - Module 4A Prisma models and reviewed migration'
    : 'Pass 124 persistence may be prepared, but Stage 6 activation remains blocked until Module 3 live Stage-5 acceptance',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 4A Stage-6 contract evidence written to ${written}`);

if (passed) {
  console.log(stage5LiveAccepted
    ? 'Module 4A contract frozen. Stage 6 runtime implementation may begin with Pass 124.'
    : 'Module 4A contract frozen. Stage 6 activation remains blocked until Stage 5 live acceptance.');
} else {
  process.exitCode = 1;
}
