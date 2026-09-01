import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_8_ACCEPTED = 'STAGE_8_ACCEPTED_READY_FOR_STAGE_9';
const PASS_175_ACCEPTED = 'PASS_175_FINAL_REPAIR_AUDIT_ACCEPTED_READY_FOR_MODULE_6';
const HOLD_CLEARED = 'STAGE_8_REPAIR_HOLD_CLEARED';
const evidencePath = path.resolve('module-6-evidence', 'stage-9-contract.json');

/** Read one JSON evidence file and return null when it is not present. */
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
  ['pass-175-final-static-prerequisite', 'npm', ['run', 'audit-repair:final:gate']],
  ['module-6-contract-suite', 'node', ['--test', 'tests/module-6-static.test.mjs']],
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
  ? (module6LiveHandoffAccepted
      ? 'STAGE_9_MODULE_6_CONTRACT_FROZEN_READY_FOR_PASS_177'
      : 'STAGE_9_MODULE_6_CONTRACT_FROZEN_STAGE_8_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-9-module-6-contract-evidence',
  generatedAt: new Date().toISOString(),
  pass: 176,
  stage: 9,
  module: '6 - WBS & Cost Codes',
  status,
  contractOnly: true,
  module6LiveHandoffAccepted,
  ownedTables: ['wbs_nodes', 'cost_codes', 'cost_types', 'project_cost_codes'],
  reviewedRouteCount: 7,
  reviewedPermissions: ['wbs.read', 'wbs.manage', 'cost_codes.read', 'cost_codes.manage', 'wbs.freeze'],
  reviewedEvents: ['wbs.node_created', 'wbs.updated', 'cost_code.created', 'project.cost_structure_frozen'],
  unresolvedSourceAmbiguities: [
    'Cost Type master is required by workflow/React requirements but the reviewed API route table defines no Cost Type read/create route.',
    'The workflow says unused codes may be archived but the reviewed API route table defines no archive command.',
    'Frozen baseline rules mention controlled revision/authorized reopen but the reviewed API route table defines only freeze.',
    'Public status/category values are not enumerated by the source.',
    'The source persists WBS level but does not explicitly define whether it is client input or server-derived.'
  ],
  productionRuntimeActivationAllowed: passed && module6LiveHandoffAccepted,
  persistencePreparationAllowed: passed,
  module4bDeferred: true,
  nextPass: passed
    ? 'Pass 177 - Module 6 Prisma models and migration. Runtime/deployment acceptance remains blocked until the Stage-8 live handoff is genuine.'
    : 'Repair the failed Pass-176 contract check before preparing persistence.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 6 Stage-9 contract evidence written to ${written}`);

if (!passed) process.exitCode = 1;
