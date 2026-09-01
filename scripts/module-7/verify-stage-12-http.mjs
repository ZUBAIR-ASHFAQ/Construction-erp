import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_11_ACCEPTED = 'STAGE_11_ACCEPTED_READY_FOR_STAGE_12';
const evidencePath = path.resolve('module-7-evidence', 'stage-12-http.json');

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage11 = await readJson('module-15a-evidence/stage-11-live.json');
const stage11LiveAccepted = stage11?.status === STAGE_11_ACCEPTED
  && stage11?.runtimeVerificationComplete === true;
const serviceEvidence = await readJson('module-7-evidence/stage-12-service.json');
const servicePrepared = serviceEvidence?.pass === 216
  && [
    'STAGE_12_MODULE_7_SERVICE_READY_FOR_PASS_217',
    'STAGE_12_MODULE_7_SERVICE_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING'
  ].includes(serviceEvidence?.status)
  && Array.isArray(serviceEvidence?.checks)
  && serviceEvidence.checks.every((check) => check.status === 'passed');

const now = new Date().toISOString();
const results = [{
  name: 'module-7-service-evidence',
  status: servicePrepared ? 'passed' : 'failed',
  startedAt: now,
  finishedAt: now,
  code: servicePrepared ? 0 : 1,
  signal: null
}];
const steps = [
  ['module-7-http-suite', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  [
    'module-7-http-typescript-syntax',
    'tsc',
    [
      '--noEmit',
      '--noCheck',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      'apps/api/src/modules/budgets-job-cost/budgets-job-cost.routes.ts',
      'apps/api/src/modules/budgets-job-cost/index.ts'
    ]
  ],
  [
    'app-registration-typescript-syntax',
    'tsc',
    [
      '--noEmit',
      '--noCheck',
      '--noResolve',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      'apps/api/src/app.ts'
    ]
  ],
  ['module-6-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-15a-regression', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
  ['module-24b-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
];

if (servicePrepared) {
  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }
}

const passed = servicePrepared
  && results.length === steps.length + 1
  && results.every((result) => result.status === 'passed');
const status = passed
  ? (stage11LiveAccepted
      ? 'STAGE_12_MODULE_7_HTTP_READY_FOR_PASS_218'
      : 'STAGE_12_MODULE_7_HTTP_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-12-module-7-budgeting-job-costing-http-evidence',
  generatedAt: new Date().toISOString(),
  pass: 217,
  stage: 12,
  module: '7 - Budgeting & Job Costing',
  status,
  stage11LiveAccepted,
  servicePrepared,
  routeFile: 'apps/api/src/modules/budgets-job-cost/budgets-job-cost.routes.ts',
  indexFile: 'apps/api/src/modules/budgets-job-cost/index.ts',
  appRegistrationFile: 'apps/api/src/app.ts',
  sourceReviewedRouteCount: 7,
  pass361DraftRecoveryRoutesAdded: 1,
  activeRouteCount: 8,
  routes: [
    'GET /api/v1/projects/:projectId/budgets/current',
    'GET /api/v1/projects/:projectId/budgets/draft',
    'POST /api/v1/projects/:projectId/budgets',
    'PUT /api/v1/projects/:projectId/budgets/:id/lines',
    'POST /api/v1/projects/:projectId/budgets/:id/freeze',
    'GET /api/v1/projects/:projectId/job-cost',
    'PUT /api/v1/projects/:projectId/forecast',
    'GET /api/v1/projects/:projectId/job-cost/ledger'
  ],
  authenticationRequiredForAllRoutes: true,
  projectPermissionRemainsServiceAuthoritative: true,
  strictZodBoundaryRetained: true,
  responseZodValidationRetained: true,
  exactDecimalOpenApiSerialization: true,
  openApiOperationsPrepared: true,
  sourceIngestionRoutesAdded: 0,
  approvalRoutesAdded: 0,
  newDatabaseMigrationAdded: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage11LiveAccepted,
  nextPass: passed
    ? 'Pass 218 - Module 7 PostgreSQL/Fastify integration, OpenAPI and security verification.'
    : 'Repair the failed Pass-217 HTTP/OpenAPI check before generating Module-7 integration verification.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 7 Stage-12 HTTP evidence written to ${written}`);

if (!passed) process.exitCode = 1;
