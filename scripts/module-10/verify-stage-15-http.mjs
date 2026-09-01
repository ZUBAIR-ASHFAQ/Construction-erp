import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_14_ACCEPTED = 'STAGE_14_ACCEPTED_READY_FOR_STAGE_15';
const evidencePath = path.resolve('module-10-evidence', 'stage-15-http.json');

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage14 = await readJson('module-9-evidence/stage-14-live.json');
const stage14LiveAccepted = stage14?.status === STAGE_14_ACCEPTED
  && stage14?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-10-service', 'npm', ['run', 'module-10:service:gate']],
  ['module-10-http-suite', 'node', ['--test', 'tests/module-10-static.test.mjs']],
  [
    'module-10-http-typescript-syntax',
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
      'apps/api/src/modules/inventory/inventory.routes.ts',
      'apps/api/src/modules/inventory/index.ts'
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
  ['module-9-regression', 'node', ['--test', 'tests/module-9-static.test.mjs']],
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
  ? (stage14LiveAccepted
      ? 'STAGE_15_MODULE_10_HTTP_READY_FOR_PASS_251'
      : 'STAGE_15_MODULE_10_HTTP_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-15-module-10-inventory-materials-http-evidence',
  generatedAt: new Date().toISOString(),
  pass: 250,
  stage: 15,
  module: '10 - Inventory & Material Management',
  status,
  stage14LiveAccepted,
  routeFile: 'apps/api/src/modules/inventory/inventory.routes.ts',
  indexFile: 'apps/api/src/modules/inventory/index.ts',
  appRegistrationFile: 'apps/api/src/app.ts',
  exactReviewedRouteCount: 8,
  routes: [
    'GET /api/v1/inventory/items',
    'POST /api/v1/inventory/items',
    'GET /api/v1/inventory/balances',
    'POST /api/v1/inventory/receipts',
    'POST /api/v1/inventory/transfers',
    'POST /api/v1/inventory/issues',
    'POST /api/v1/inventory/returns',
    'POST /api/v1/inventory/adjustments'
  ],
  authenticationRequiredForAllRoutes: true,
  serviceResourcePolicyRemainsAuthoritative: true,
  strictZodBoundaryRetained: true,
  responseZodValidationRetained: true,
  exactDecimalOpenApiSerialization: true,
  idempotentCommandRouteCount: 5,
  reviewedPermissionCount: 6,
  reviewedErrorCount: 6,
  reviewedEventCount: 5,
  serverOwnedRequestAuthorityExposed: false,
  appRegistrationPrepared: true,
  openApiOperationsPrepared: true,
  warehouseCrudRoutesAdded: 0,
  stockLedgerReadRoutesAdded: 0,
  stockCountRoutesAdded: 0,
  lowStockRoutesAdded: 0,
  financeRoutesAdded: 0,
  newDatabaseMigrationAdded: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage14LiveAccepted,
  nextPass: passed
    ? 'Pass 251 - Module 10 PostgreSQL/Fastify integration, generated OpenAPI and security verification.'
    : 'Repair the failed Pass-250 HTTP/OpenAPI check before generating Module-10 integration/security verification.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 10 Stage-15 HTTP evidence written to ${written}`);

if (!passed) process.exitCode = 1;
