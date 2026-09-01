import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_22_ACCEPTED = 'STAGE_22_ACCEPTED_READY_FOR_STAGE_23';
const evidencePath = path.resolve('module-16-evidence', 'stage-23-http.json');

/** Read one optional JSON evidence file and return null when it is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage22 = await readJson('module-17-evidence/stage-22-live.json');
const stage22LiveAccepted = stage22?.status === STAGE_22_ACCEPTED
  && stage22?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-16-invoice-retention', 'npm', ['run', 'module-16:invoice-retention:gate']],
  ['module-16-http-suite', 'node', ['--test', 'tests/module-16-static.test.mjs']],
  [
    'module-16-http-typescript-syntax',
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
      'apps/api/src/modules/client-billing/client-billing.schema.ts',
      'apps/api/src/modules/client-billing/client-billing.repository.ts',
      'apps/api/src/modules/client-billing/client-billing.service.ts',
      'apps/api/src/modules/client-billing/client-billing.routes.ts',
      'apps/api/src/modules/client-billing/index.ts'
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
      'apps/api/src/app.ts'
    ]
  ],
  ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-2-regression', 'node', ['--test', 'tests/module-2-static.test.mjs']],
  ['module-4b-regression', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
  ['module-15a-regression', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
  ['module-17-regression', 'node', ['--test', 'tests/module-17-static.test.mjs']],
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
  ? (stage22LiveAccepted
      ? 'STAGE_23_MODULE_16_HTTP_READY_FOR_PASS_353'
      : 'STAGE_23_MODULE_16_HTTP_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-23-module-16-client-billing-http-evidence',
  generatedAt: new Date().toISOString(),
  pass: 352,
  stage: 23,
  module: '16 - Client Billing',
  status,
  stage22LiveAccepted,
  routeFile: 'apps/api/src/modules/client-billing/client-billing.routes.ts',
  indexFile: 'apps/api/src/modules/client-billing/index.ts',
  appRegistrationFile: 'apps/api/src/app.ts',
  exactReviewedRouteCount: 7,
  routes: [
    'GET /api/v1/client-billing/contracts',
    'POST /api/v1/client-billing/contracts',
    'POST /api/v1/client-billing/contracts/:id/claims',
    'PUT /api/v1/client-billing/claims/:id/lines',
    'POST /api/v1/client-billing/claims/:id/certify',
    'POST /api/v1/client-billing/claims/:id/invoice',
    'POST /api/v1/client-billing/retention/:id/release'
  ],
  authenticationRequiredForAllRoutes: true,
  projectResourcePolicyRemainsAuthoritativeInService: true,
  strictZodBoundaryRetained: true,
  responseZodValidationRetained: true,
  idempotentCommandRouteCount: 6,
  bodylessCommandCount: 1,
  retentionReleaseBodyless: true,
  reviewedPermissionCount: 6,
  reviewedErrorCount: 5,
  reviewedEventCount: 5,
  appRegistrationPrepared: true,
  openApiOperationsPrepared: true,
  genericCrudRoutesAdded: 0,
  claimSubmitRouteAdded: false,
  contractUpdateRouteAdded: false,
  paymentRouteAdded: false,
  financeArAdapterGeneratedEarly: false,
  approvedChangeAdapterImplemented: false,
  reactGenerated: false,
  databaseMigrationGenerated: false,
  runtimeDeploymentAllowed: passed && stage22LiveAccepted,
  nextPass: passed
    ? 'Pass 353 - Module 16 PostgreSQL/Fastify integration, generated OpenAPI, Company/Project isolation, negative RBAC, transaction and idempotency verification.'
    : 'Repair the failed Pass-352 HTTP/OpenAPI check before generating Module-16 integration/security verification.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 16 Stage-23 HTTP evidence written to ${written}`);

if (!passed) process.exitCode = 1;
