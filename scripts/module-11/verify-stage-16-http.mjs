import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_15_ACCEPTED = 'STAGE_15_ACCEPTED_READY_FOR_STAGE_16';
const evidencePath = path.resolve('module-11-evidence', 'stage-16-http.json');

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage15 = await readJson('module-10-evidence/stage-15-live.json');
const stage15LiveAccepted = stage15?.status === STAGE_15_ACCEPTED
  && stage15?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-11-service', 'npm', ['run', 'module-11:service:gate']],
  ['module-11-http-suite', 'node', ['--test', 'tests/module-11-static.test.mjs']],
  [
    'module-11-http-typescript-syntax',
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
      'apps/api/src/modules/subcontracts/subcontracts.routes.ts',
      'apps/api/src/modules/subcontracts/index.ts'
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
  ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-7-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-8-regression', 'node', ['--test', 'tests/module-8-static.test.mjs']],
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
  ? (stage15LiveAccepted
      ? 'STAGE_16_MODULE_11_HTTP_READY_FOR_PASS_262'
      : 'STAGE_16_MODULE_11_HTTP_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-16-module-11-subcontractor-management-http-evidence',
  generatedAt: new Date().toISOString(),
  pass: 261,
  stage: 16,
  module: '11 - Subcontractor Management',
  status,
  stage15LiveAccepted,
  routeFile: 'apps/api/src/modules/subcontracts/subcontracts.routes.ts',
  indexFile: 'apps/api/src/modules/subcontracts/index.ts',
  appRegistrationFile: 'apps/api/src/app.ts',
  serverConfigFile: 'packages/config/src/server.ts',
  exactReviewedRouteCount: 8,
  routes: [
    'GET /api/v1/subcontractors',
    'POST /api/v1/subcontractors',
    'POST /api/v1/subcontracts',
    'PATCH /api/v1/subcontracts/:id',
    'POST /api/v1/subcontracts/:id/execute',
    'POST /api/v1/subcontracts/:id/payment-applications',
    'POST /api/v1/subcontracts/:id/payment-applications/:appId/certify',
    'POST /api/v1/subcontracts/:id/close'
  ],
  authenticationRequiredForAllRoutes: true,
  serviceResourcePolicyRemainsAuthoritative: true,
  strictZodBoundaryRetained: true,
  responseZodValidationRetained: true,
  exactDecimalOpenApiSerialization: true,
  idempotentCommandRouteCount: 7,
  bodylessCommandCount: 2,
  reviewedPermissionCount: 7,
  reviewedErrorCount: 5,
  reviewedEventCount: 5,
  approvalDefinitionServerOwned: true,
  approvalDefinitionEnvironmentKey: 'SUBCONTRACT_APPROVAL_DEFINITION_CODE',
  serverOwnedRequestAuthorityExposed: false,
  appRegistrationPrepared: true,
  openApiOperationsPrepared: true,
  subcontractReadbackRoutesAdded: 0,
  paymentApplicationReadbackRoutesAdded: 0,
  retentionReleaseRoutesAdded: 0,
  genericApprovalRoutesAdded: 0,
  changeOrderRoutesAdded: 0,
  financeRoutesAdded: 0,
  newDatabaseMigrationAdded: false,
  integrationTestsGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage15LiveAccepted,
  nextPass: passed
    ? 'Pass 262 - Module 11 PostgreSQL/Fastify integration, generated OpenAPI, Company/Project isolation, RBAC, approval, commitment and certification security verification.'
    : 'Repair the failed Pass-261 HTTP/OpenAPI check before generating Module-11 integration/security verification.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 11 Stage-16 HTTP evidence written to ${written}`);

if (!passed) process.exitCode = 1;
