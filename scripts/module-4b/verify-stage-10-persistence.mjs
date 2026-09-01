import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_9_ACCEPTED = 'STAGE_9_ACCEPTED_READY_FOR_STAGE_10';
const evidencePath = path.resolve('module-4b-evidence', 'stage-10-persistence.json');

/** Read one JSON evidence file and return null when the file does not exist. */
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
  ['module-4b-contract', 'npm', ['run', 'module-4b:contract:gate']],
  ['module-4b-persistence-suite', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
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
  ? (stage9LiveAccepted
      ? 'STAGE_10_MODULE_4B_PERSISTENCE_READY_FOR_PASS_192'
      : 'STAGE_10_MODULE_4B_PERSISTENCE_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-10-module-4b-persistence-evidence',
  generatedAt: new Date().toISOString(),
  pass: 191,
  stage: 10,
  module: '4B - BOQ Project Mapping',
  businessModule: '4 - BOQ Management',
  status,
  stage9LiveAccepted,
  migration: '20260823000800_module_4b_boq_project_mapping',
  activatedColumns: [
    'boqs.project_id',
    'boq_items.wbs_node_id',
    'boq_items.cost_code_id'
  ],
  tenderIdNowNullable: true,
  existingTenderBoqsRemainValid: true,
  historicalMappingsBackfilled: false,
  costTypeIdAddedToBoqItems: false,
  databaseIntegrity: [
    'BOQ keeps at least one of tender_id or project_id.',
    'BOQ Project must belong to the BOQ Company.',
    'BOQ-item WBS must belong to the BOQ Project.',
    'BOQ-item Cost Code must belong to the BOQ Company.'
  ],
  apiRelationshipFieldsGenerated: false,
  repositoryRelationshipLogicGenerated: false,
  serviceRelationshipLogicGenerated: false,
  reactRelationshipUiGenerated: false,
  runtimeDeploymentAllowed: passed && stage9LiveAccepted,
  nextPass: passed
    ? 'Pass 192 - Module 4B Zod request/response relationship activation inside the existing six BOQ operations.'
    : 'Repair the failed Pass-191 persistence check before activating Module-4B API schemas.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 4B Stage-10 persistence evidence written to ${written}`);

if (!passed) process.exitCode = 1;
