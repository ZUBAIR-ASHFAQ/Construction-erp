import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_21_ACCEPTED = 'STAGE_21_ACCEPTED_READY_FOR_STAGE_22';
const evidencePath = path.resolve('module-17-evidence', 'stage-22-http.json');

/** Read one optional JSON evidence file and return null when it is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage21 = await readJson('module-21-evidence/stage-21-live.json');
const stage21LiveAccepted = stage21?.status === STAGE_21_ACCEPTED
  && stage21?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-17-impact', 'npm', ['run', 'module-17:impact:gate']],
  ['module-17-http-suite', 'node', ['--test', 'tests/module-17-static.test.mjs']],
  [
    'module-17-http-typescript-syntax',
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
      'apps/api/src/modules/change-orders/change-orders.schema.ts',
      'apps/api/src/modules/change-orders/change-orders.repository.ts',
      'apps/api/src/modules/change-orders/change-orders.service.ts',
      'apps/api/src/modules/change-orders/change-orders.routes.ts',
      'apps/api/src/modules/change-orders/index.ts'
    ]
  ],
  [
    'runtime-composition-typescript-syntax',
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
      'apps/api/src/app.ts',
      'apps/api/src/main.ts',
      'packages/config/src/server.ts'
    ]
  ],
  ['config-regression-source', 'node', ['--test', 'tests/module-14b-static.test.mjs']],
  ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-7-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-22-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
  ['module-24b-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
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
  ? (stage21LiveAccepted
      ? 'STAGE_22_MODULE_17_HTTP_READY_FOR_PASS_341'
      : 'STAGE_22_MODULE_17_HTTP_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-22-module-17-change-orders-http-evidence',
  generatedAt: new Date().toISOString(),
  pass: 340,
  stage: 22,
  module: '17 - Change Orders / Variations',
  status,
  stage21LiveAccepted,
  routeFile: 'apps/api/src/modules/change-orders/change-orders.routes.ts',
  indexFile: 'apps/api/src/modules/change-orders/index.ts',
  appRegistrationFile: 'apps/api/src/app.ts',
  serverConfigFile: 'packages/config/src/server.ts',
  exactReviewedRouteCount: 7,
  routes: [
    'GET /api/v1/change-orders',
    'POST /api/v1/change-orders/requests',
    'PUT /api/v1/change-orders/requests/:id/lines',
    'POST /api/v1/change-orders/requests/:id/submit',
    'POST /api/v1/change-orders/requests/:id/approve',
    'POST /api/v1/change-orders/requests/:id/reject',
    'GET /api/v1/change-orders/:id/impact'
  ],
  authenticationRequiredForAllRoutes: true,
  projectResourcePolicyRemainsAuthoritativeInService: true,
  strictZodBoundaryRetained: true,
  responseZodValidationRetained: true,
  idempotentCommandRouteCount: 5,
  bodylessCommandCount: 2,
  reviewedPermissionCount: 6,
  reviewedErrorCount: 5,
  reviewedEventCount: 5,
  approvalDefinitionEnvironmentKey: 'CHANGE_REQUEST_APPROVAL_DEFINITION_CODE',
  approvalDefinitionServerOwned: true,
  changesApproveAndApplyEnforcedByService: true,
  mandatoryBudgetImpactAlreadyIntegratedBeforeApproveRouteExposure: true,
  appRegistrationPrepared: true,
  openApiOperationsPrepared: true,
  genericCrudRoutesAdded: 0,
  standaloneApplyRouteAdded: false,
  detailGetRouteAdded: false,
  withdrawRouteAdded: false,
  scheduleAdapterGenerated: false,
  subcontractAdapterGenerated: false,
  clientBillingAdapterGenerated: false,
  newDatabaseMigrationAdded: false,
  integrationTestsGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage21LiveAccepted,
  nextPass: passed
    ? 'Pass 341 - Module 17 PostgreSQL/Fastify integration, generated OpenAPI, Company/Project isolation, negative RBAC, transaction and idempotency verification.'
    : 'Repair the failed Pass-340 HTTP/OpenAPI check before generating Module-17 integration/security verification.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 17 Stage-22 HTTP evidence written to ${written}`);

if (!passed) process.exitCode = 1;
