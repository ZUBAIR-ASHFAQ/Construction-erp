import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_9_ACCEPTED = 'STAGE_9_ACCEPTED_READY_FOR_STAGE_10';
const evidencePath = path.resolve('module-4b-evidence', 'stage-10-http.json');

/** Read one JSON evidence file and return null when it does not exist. */
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

const serviceEvidence = await readJson('module-4b-evidence/stage-10-service.json');
const servicePrepared = serviceEvidence?.pass === 194
  && [
    'STAGE_10_MODULE_4B_SERVICE_READY_FOR_PASS_195',
    'STAGE_10_MODULE_4B_SERVICE_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING'
  ].includes(serviceEvidence?.status)
  && Array.isArray(serviceEvidence?.checks)
  && serviceEvidence.checks.every((check) => check.status === 'passed');

const results = [{
  name: 'module-4b-service-evidence',
  status: servicePrepared ? 'passed' : 'failed',
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  code: servicePrepared ? 0 : 1,
  signal: null
}];
const steps = [
  ['module-4b-http-suite', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
  ['module-4a-regression', 'node', ['--test', 'tests/module-4a-static.test.mjs']],
  ['module-4b-routes-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/boq/boq.routes.ts']],
  ['module-4b-schema-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/boq/boq.schema.ts']],
  ['api-registration-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/app.ts']],
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
  ? (stage9LiveAccepted
      ? 'STAGE_10_MODULE_4B_HTTP_READY_FOR_PASS_196'
      : 'STAGE_10_MODULE_4B_HTTP_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-10-module-4b-http-openapi-evidence',
  generatedAt: new Date().toISOString(),
  pass: 195,
  stage: 10,
  module: '4B - BOQ Project Mapping',
  businessModule: '4 - BOQ Management',
  status,
  stage9LiveAccepted,
  routeFile: 'apps/api/src/modules/boq/boq.routes.ts',
  schemaFile: 'apps/api/src/modules/boq/boq.schema.ts',
  operationCount: 6,
  routes: [
    'GET /api/v1/boqs',
    'POST /api/v1/boqs',
    'POST /api/v1/boqs/:id/revisions',
    'PUT /api/v1/boqs/:id/revisions/:revId/items',
    'POST /api/v1/boqs/:id/revisions/:revId/freeze',
    'GET /api/v1/boqs/:id/revisions/:revId/export'
  ],
  httpOpenApiBoundary: {
    tenderProjectOrCombinedCreateDocumented: true,
    projectIdReturnedAsNullableRelationship: true,
    wbsNodeIdAndCostCodeIdAcceptedOnExistingItemCommand: true,
    wbsNodeIdAndCostCodeIdReturnedOnItems: true,
    exactProjectPermissionRemainsServiceAuthoritative: true,
    everyRouteAuthenticated: true,
    operationIdsRetainedForCompatibility: true,
    newRoutesAdded: false,
    projectListFilterInvented: false,
    costTypeRelationshipInvented: false
  },
  intentionallyDeferred: [
    'Stage-10 PostgreSQL/Fastify integration and security verification remain deferred to Pass 196.',
    'React BOQ Project/WBS/Cost Code mapping activation remains deferred until backend integration/security proof.',
    'No dedicated Project-attachment command is invented for an already-existing tender-only BOQ.',
    'No Cost Type relationship is added to BOQ items.'
  ],
  runtimeDeploymentAllowed: passed && stage9LiveAccepted,
  nextPass: passed
    ? 'Pass 196 - Module 4B PostgreSQL/Fastify integration and security verification for Project/WBS/Cost Code mappings.'
    : 'Repair the failed Pass-195 HTTP/OpenAPI check before adding Stage-10 integration/security coverage.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 4B Stage-10 HTTP/OpenAPI evidence written to ${written}`);

if (!passed) process.exitCode = 1;
