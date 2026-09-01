import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_5 = 'STAGE_5_ACCEPTED_READY_FOR_STAGE_6';
const evidencePath = path.resolve('module-4a-evidence', 'stage-6-service.json');

/** Read Module 3 live evidence so Pass 127 cannot promote prepared service code into deployable Stage 6. */
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
  ['module-4a-repository', 'npm', ['run', 'module-4a:repository:gate']],
  ['module-4a-service-suite', 'node', ['--test', 'tests/module-4a-static.test.mjs']],
  ['module-4a-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/boq/boq.service.ts']],
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
      ? 'STAGE_6_SERVICE_READY_FOR_PASS_128'
      : 'STAGE_6_SERVICE_PREPARED_STAGE_5_LIVE_ACCEPTANCE_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-module-4a-stage-6-service-evidence',
  generatedAt: new Date().toISOString(),
  status,
  module: '4A - BOQ Commercial Core',
  pass: 127,
  stage5LiveAccepted,
  activation: stage5LiveAccepted
    ? 'STAGE_6_SERVICE_MAY_BE_USED'
    : 'DO_NOT_DEPLOY_STAGE_6_UNTIL_STAGE_5_LIVE_ACCEPTED',
  serviceFile: 'apps/api/src/modules/boq/boq.service.ts',
  transactions: [
    'BOQ creation + audit + outbox',
    'revision creation + audit + outbox',
    'draft item replacement + audit',
    'revision freeze + current revision + audit + outbox'
  ],
  eventTypes: ['boq.created', 'boq.revision_created', 'boq.revision_frozen'],
  amountRule: 'exact four-decimal quantity/rate BigInt multiplication with half-up rounding to two-decimal money',
  exportBoundary: 'authorized source snapshot only; HTTP/file/job transport remains Pass 128',
  deferredColumns: ['project_id', 'wbs_node_id', 'cost_code_id'],
  runtimeDeploymentAllowed: passed && stage5LiveAccepted,
  nextPass: passed && stage5LiveAccepted
    ? 'Pass 128 - Module 4A Fastify routes, module index and registration'
    : 'Pass 128 may be prepared, but Stage 6 activation remains blocked until Module 3 live Stage-5 acceptance',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 4A Stage-6 service evidence written to ${written}`);

if (!passed) process.exitCode = 1;
