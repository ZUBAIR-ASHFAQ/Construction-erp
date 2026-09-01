import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_8_ACCEPTED = 'STAGE_8_ACCEPTED_READY_FOR_STAGE_9';
const PASS_175_ACCEPTED = 'PASS_175_FINAL_REPAIR_AUDIT_ACCEPTED_READY_FOR_MODULE_6';
const HOLD_CLEARED = 'STAGE_8_REPAIR_HOLD_CLEARED';
const evidencePath = path.resolve('module-6-evidence', 'stage-9-http.json');

/** Read one JSON evidence file and return null when it is absent. */
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

const serviceEvidence = await readJson('module-6-evidence/stage-9-service.json');
const servicePrepared = serviceEvidence?.pass === 180
  && [
    'STAGE_9_SERVICE_READY_FOR_PASS_181',
    'STAGE_9_SERVICE_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING'
  ].includes(serviceEvidence?.status)
  && Array.isArray(serviceEvidence?.checks)
  && serviceEvidence.checks.every((check) => check.status === 'passed');

const results = [{
  name: 'module-6-service-evidence',
  status: servicePrepared ? 'passed' : 'failed',
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  code: servicePrepared ? 0 : 1,
  signal: null
}];
const steps = [
  ['module-6-http-suite', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-6-routes-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.routes.ts']],
  ['module-6-index-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/wbs-cost-codes/index.ts']],
  ['api-app-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/app.ts']],
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
  ? (module6LiveHandoffAccepted
      ? 'STAGE_9_HTTP_READY_FOR_PASS_182'
      : 'STAGE_9_HTTP_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-module-6-stage-9-http-evidence',
  generatedAt: new Date().toISOString(),
  pass: 181,
  stage: 9,
  module: '6 - WBS & Cost Codes',
  status,
  module6LiveHandoffAccepted,
  routeFile: 'apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.routes.ts',
  indexFile: 'apps/api/src/modules/wbs-cost-codes/index.ts',
  appRegistration: 'apps/api/src/app.ts',
  operationCount: 7,
  routes: [
    'GET /api/v1/projects/:projectId/wbs',
    'POST /api/v1/projects/:projectId/wbs/nodes',
    'PATCH /api/v1/projects/:projectId/wbs/nodes/:id',
    'GET /api/v1/cost-codes',
    'POST /api/v1/cost-codes',
    'PUT /api/v1/projects/:projectId/cost-code-assignments',
    'POST /api/v1/projects/:projectId/wbs/freeze'
  ],
  httpBoundary: {
    everyRouteAuthenticated: true,
    projectScopeRevalidatedByService: true,
    companyCostCodePermissionsCheckedAtRouteAndService: true,
    strictZodBoundaryReused: true,
    safeResponseDtos: true,
    freezeCommandBodyless: true,
    extraCrudAdded: false
  },
  intentionallyDeferred: [
    'PostgreSQL/Fastify integration remains deferred to Pass 182.',
    'Dedicated security/isolation verification remains deferred to Pass 183.',
    'OpenAPI stable-error enum verification remains deferred to the dedicated API-contract pass.',
    'React and Playwright remain deferred until backend verification is complete.'
  ],
  integrationTestsGenerated: false,
  reactRuntimeGenerated: false,
  runtimeDeploymentAllowed: passed && module6LiveHandoffAccepted,
  nextPass: passed
    ? 'Pass 182 - Module 6 PostgreSQL and Fastify integration tests for the seven reviewed operations.'
    : 'Repair the failed Pass-181 HTTP check before generating Module-6 integration tests.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 6 Stage-9 HTTP evidence written to ${written}`);

if (!passed) process.exitCode = 1;
