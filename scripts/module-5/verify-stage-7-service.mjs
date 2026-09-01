import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_6 = 'STAGE_6_ACCEPTED_READY_FOR_STAGE_7';
const evidencePath = path.resolve('module-5-evidence', 'stage-7-service.json');

/** Read Module 4A live evidence so prepared Project service code cannot be mistaken for Stage-7 deployment acceptance. */
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
  ['module-5-repository', 'npm', ['run', 'module-5:repository:gate']],
  ['module-5-service-suite', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-5-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/projects/projects.service.ts']],
  ['module-5-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/projects/projects.repository.ts']],
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
      ? 'STAGE_7_SERVICE_READY_FOR_PASS_142'
      : 'STAGE_7_SERVICE_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-module-5-stage-7-service-evidence',
  generatedAt: new Date().toISOString(),
  status,
  module: '5 - Project Management',
  pass: 141,
  stage6LiveAccepted,
  activation: stage6LiveAccepted
    ? 'STAGE_7_SERVICE_MAY_BE_USED'
    : 'DO_NOT_DEPLOY_STAGE_7_UNTIL_STAGE_6_LIVE_ACCEPTED',
  serviceFile: 'apps/api/src/modules/projects/projects.service.ts',
  repositoryAdjustment: 'one same-company Tender row lock used to serialize the one-primary-Project rule',
  lifecycle: ['DRAFT -> ACTIVE', 'ACTIVE -> COMPLETED', 'COMPLETED -> CLOSED'],
  retrySafeStates: ['ACTIVE', 'COMPLETED', 'CLOSED'],
  eventTypes: ['project.created', 'project.activated', 'project.completed', 'project.closed'],
  auditActions: ['project.created', 'project.updated', 'project.activated', 'project.completed', 'project.closed'],
  closeReadiness: 'optional service callback; downstream blocker tables are not invented in Stage 7',
  ownedTables: ['projects', 'project_status_history'],
  deferredTable: 'project_members',
  runtimeDeploymentAllowed: passed && stage6LiveAccepted,
  nextPass: passed && stage6LiveAccepted
    ? 'Pass 142 - Module 5 Fastify routes, module index and app registration'
    : 'Pass 142 may be prepared, but Stage 7 activation remains blocked until Module 4A live Stage-6 acceptance',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 5 Stage-7 service evidence written to ${written}`);

if (!passed) process.exitCode = 1;
