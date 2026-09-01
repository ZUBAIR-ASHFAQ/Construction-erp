import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_9_ACCEPTED = 'STAGE_9_ACCEPTED_READY_FOR_STAGE_10';
const evidencePath = path.resolve('module-4b-evidence', 'stage-10-contract.json');

/** Read one evidence file and return null when the file does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage9 = await readJson('module-6-evidence/stage-9-live.json');
const stage9LiveAccepted = stage9?.status === STAGE_9_ACCEPTED
  && stage9?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-4a-static-prerequisite', 'node', ['--test', 'tests/module-4a-static.test.mjs']],
  ['module-6-static-prerequisite', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-4b-contract-suite', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
  ['workspace-contract', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
];

for (const [name, command, args] of steps) {
  const result = await runStep(name, command, args);
  results.push(result);
  if (result.status !== 'passed') break;
}

const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
const status = passed
  ? (stage9LiveAccepted
      ? 'STAGE_10_MODULE_4B_CONTRACT_FROZEN_READY_FOR_PASS_191'
      : 'STAGE_10_MODULE_4B_CONTRACT_FROZEN_STAGE_9_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-10-module-4b-contract-evidence',
  generatedAt: new Date().toISOString(),
  pass: 190,
  stage: 10,
  module: '4B - BOQ Project Mapping',
  businessModule: '4 - BOQ Management',
  status,
  contractOnly: true,
  stage9LiveAccepted,
  extendedTables: ['boqs', 'boq_items'],
  activatedColumns: ['boqs.project_id', 'boq_items.wbs_node_id', 'boq_items.cost_code_id'],
  reviewedRouteCount: 6,
  newRouteCount: 0,
  reviewedPermissions: ['boq.read', 'boq.create', 'boq.edit', 'boq.freeze', 'boq.export'],
  reviewedEvents: ['boq.created', 'boq.revision_created', 'boq.revision_frozen'],
  existingTenderBoqsRemainValid: true,
  projectIdNullable: true,
  costTypeIdAddedToBoqItems: false,
  unresolvedSourceAmbiguities: [
    'The source defines no dedicated command for attaching a Project to an already-existing tender-only BOQ after Project award.',
    'The source keeps WBS and Cost Code item mappings nullable and does not state that both values must always be supplied together.'
  ],
  productionRuntimeActivationAllowed: passed && stage9LiveAccepted,
  persistencePreparationAllowed: passed,
  nextPass: passed
    ? 'Pass 191 - Module 4B reviewed Prisma relationship migration. Deployment remains blocked until the Stage-9 live handoff is genuine.'
    : 'Repair the failed Pass-190 contract check before preparing persistence.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 4B Stage-10 contract evidence written to ${written}`);

if (!passed) process.exitCode = 1;
