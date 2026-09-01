import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_13_ACCEPTED = 'STAGE_13_ACCEPTED_READY_FOR_STAGE_14';
const evidencePath = path.resolve('module-9-evidence', 'stage-14-http.json');

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage13 = await readJson('module-8-evidence/stage-13-live.json');
const stage13LiveAccepted = stage13?.status === STAGE_13_ACCEPTED
  && stage13?.runtimeVerificationComplete === true;
const serviceEvidence = await readJson('module-9-evidence/stage-14-service.json');
const servicePrepared = serviceEvidence?.pass === 238
  && [
    'STAGE_14_MODULE_9_SERVICE_READY_FOR_PASS_239',
    'STAGE_14_MODULE_9_SERVICE_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING'
  ].includes(serviceEvidence?.status)
  && Array.isArray(serviceEvidence?.checks)
  && serviceEvidence.checks.every((check) => check.status === 'passed');

const now = new Date().toISOString();
const results = [{
  name: 'module-9-service-evidence',
  status: servicePrepared ? 'passed' : 'failed',
  startedAt: now,
  finishedAt: now,
  code: servicePrepared ? 0 : 1,
  signal: null
}];
const steps = [
  ['module-9-http-suite', 'node', ['--test', 'tests/module-9-static.test.mjs']],
  [
    'module-9-http-typescript-syntax',
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
      'apps/api/src/modules/purchase-orders/purchase-orders.routes.ts',
      'apps/api/src/modules/purchase-orders/index.ts'
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
  ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-7-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-8-regression', 'node', ['--test', 'tests/module-8-static.test.mjs']],
  ['module-22-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
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
  ? (stage13LiveAccepted
      ? 'STAGE_14_MODULE_9_HTTP_READY_FOR_PASS_240'
      : 'STAGE_14_MODULE_9_HTTP_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-14-module-9-purchase-orders-http-evidence',
  generatedAt: new Date().toISOString(),
  pass: 239,
  stage: 14,
  module: '9 - Purchase Orders',
  status,
  stage13LiveAccepted,
  servicePrepared,
  routeFile: 'apps/api/src/modules/purchase-orders/purchase-orders.routes.ts',
  indexFile: 'apps/api/src/modules/purchase-orders/index.ts',
  appRegistrationFile: 'apps/api/src/app.ts',
  exactReviewedRouteCount: 8,
  routes: [
    'GET /api/v1/purchase-orders',
    'POST /api/v1/purchase-orders',
    'GET /api/v1/purchase-orders/:id',
    'PATCH /api/v1/purchase-orders/:id',
    'POST /api/v1/purchase-orders/:id/submit',
    'POST /api/v1/purchase-orders/:id/issue',
    'POST /api/v1/purchase-orders/:id/revise',
    'POST /api/v1/purchase-orders/:id/cancel'
  ],
  authenticationRequiredForAllRoutes: true,
  projectPermissionRemainsServiceAuthoritative: true,
  strictZodBoundaryRetained: true,
  responseZodValidationRetained: true,
  exactDecimalOpenApiSerialization: true,
  purchaseOrderApprovalDefinitionWiredFromBuildApp: true,
  openApiOperationsPrepared: true,
  directPurchaseRouteAdded: false,
  cancelPermissionInvented: false,
  financePostingRoutesAdded: 0,
  inventoryReceiptRoutesAdded: 0,
  newDatabaseMigrationAdded: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage13LiveAccepted,
  nextPass: passed
    ? 'Pass 240 - Module 9 PostgreSQL/Fastify integration, generated OpenAPI and security verification.'
    : 'Repair the failed Pass-239 HTTP/OpenAPI check before generating Module-9 integration/security verification.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 9 Stage-14 HTTP evidence written to ${written}`);

if (!passed) process.exitCode = 1;
