import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_6 = 'STAGE_6_ACCEPTED_READY_FOR_STAGE_7';
const evidencePath = path.resolve('module-5-evidence', 'stage-7-schema.json');

/** Read Module 4A live evidence so Pass 139 cannot turn prepared schemas into deployable Stage 7. */
async function readStage6LiveAcceptance() {
  try {
    return JSON.parse(await readFile('module-4a-evidence/stage-6-live.json', 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage6 = await readStage6LiveAcceptance();
const stage6LiveAccepted = stage6?.status === ACCEPTED_STAGE_6;
const results = [];
const steps = [
  ['module-5-persistence', 'npm', ['run', 'module-5:persistence:gate']],
  ['module-5-schema-suite', 'node', ['--test', 'tests/module-5-static.test.mjs']],
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
  ? (stage6LiveAccepted
      ? 'STAGE_7_SCHEMA_READY_FOR_PASS_140'
      : 'STAGE_7_SCHEMA_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-module-5-stage-7-schema-evidence',
  generatedAt: new Date().toISOString(),
  status,
  module: '5 - Project Management',
  pass: 139,
  stage6LiveAccepted,
  activation: stage6LiveAccepted
    ? 'STAGE_7_SCHEMA_MAY_BE_USED'
    : 'DO_NOT_DEPLOY_STAGE_7_UNTIL_STAGE_6_LIVE_ACCEPTED',
  schemaFile: 'apps/api/src/modules/projects/projects.schema.ts',
  stage7Routes: 7,
  serverOwnedRequestFields: [
    'companyId', 'actorUserId', 'permissions', 'projectScope', 'status',
    'statusHistory', 'changedBy', 'createdAt', 'updatedAt'
  ],
  deferredToModule24B: [
    'project_members', 'membership replacement route', 'project.member_changed',
    'validated project membership', 'project-scoped authorization'
  ],
  runtimeDeploymentAllowed: passed && stage6LiveAccepted,
  nextPass: passed && stage6LiveAccepted
    ? 'Pass 140 - Module 5 company-scoped repository'
    : 'Pass 140 may be prepared, but Stage 7 activation remains blocked until Module 4A live Stage-6 acceptance',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 5 Stage-7 schema evidence written to ${written}`);

if (!passed) process.exitCode = 1;
