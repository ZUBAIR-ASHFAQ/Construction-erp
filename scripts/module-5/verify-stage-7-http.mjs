import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_6 = 'STAGE_6_ACCEPTED_READY_FOR_STAGE_7';
const evidencePath = path.resolve('module-5-evidence', 'stage-7-http.json');

/** Read Module 4A live evidence so prepared Project HTTP code cannot be mistaken for Stage-7 deployment acceptance. */
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
  ['module-5-service', 'npm', ['run', 'module-5:service:gate']],
  ['module-5-http-suite', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-5-routes-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/projects/projects.routes.ts']],
  ['module-5-index-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/projects/index.ts']],
  ['api-app-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/app.ts']],
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
      ? 'STAGE_7_HTTP_READY_FOR_PASS_143'
      : 'STAGE_7_HTTP_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-module-5-stage-7-http-evidence',
  generatedAt: new Date().toISOString(),
  status,
  module: '5 - Project Management',
  pass: 142,
  stage6LiveAccepted,
  activation: stage6LiveAccepted
    ? 'STAGE_7_HTTP_MAY_BE_USED'
    : 'DO_NOT_DEPLOY_STAGE_7_UNTIL_STAGE_6_LIVE_ACCEPTED',
  routeFile: 'apps/api/src/modules/projects/projects.routes.ts',
  indexFile: 'apps/api/src/modules/projects/index.ts',
  appRegistration: 'apps/api/src/app.ts',
  operationCount: 7,
  routes: [
    'GET /api/v1/projects',
    'POST /api/v1/projects',
    'GET /api/v1/projects/:id',
    'PATCH /api/v1/projects/:id',
    'POST /api/v1/projects/:id/activate',
    'POST /api/v1/projects/:id/complete',
    'POST /api/v1/projects/:id/close'
  ],
  membershipRouteDeferred: 'PUT /api/v1/projects/:id/members -> Module 24B',
  runtimeDeploymentAllowed: passed && stage6LiveAccepted,
  nextPass: passed && stage6LiveAccepted
    ? 'Pass 143 - Module 5 PostgreSQL and Fastify integration workflow tests'
    : 'Pass 143 may be prepared, but Stage 7 activation remains blocked until Module 4A live Stage-6 acceptance',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 5 Stage-7 HTTP evidence written to ${written}`);

if (!passed) process.exitCode = 1;
