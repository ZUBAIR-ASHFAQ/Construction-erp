import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_15_ACCEPTED = 'STAGE_15_ACCEPTED_READY_FOR_STAGE_16';
const evidencePath = path.resolve('module-11-evidence', 'stage-16-react.json');

/** Read one JSON evidence file and return null when that evidence is absent. */
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

const integrationEvidence = await readJson('module-11-evidence/stage-16-integration-security.json');
const integrationPrepared = integrationEvidence?.pass === 262
  && [
    'STAGE_16_MODULE_11_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_263',
    'STAGE_16_MODULE_11_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN',
    'STAGE_16_MODULE_11_INTEGRATION_SECURITY_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING'
  ].includes(integrationEvidence?.status)
  && Array.isArray(integrationEvidence?.checks)
  && integrationEvidence.checks.every((check) => check.status === 'passed');

const now = new Date().toISOString();
const results = [{
  name: 'module-11-integration-security-evidence',
  status: integrationPrepared ? 'passed' : 'failed',
  startedAt: now,
  finishedAt: now,
  code: integrationPrepared ? 0 : 1,
  signal: null
}];

const steps = [
  ['module-11-integration-security-regression', 'npm', ['run', 'module-11:integration-security:gate']],
  ['module-11-react-static-suite', 'node', ['--test', 'tests/module-11-static.test.mjs']],
  [
    'module-11-react-typescript-syntax',
    'tsc',
    [
      '--noEmit',
      '--noCheck',
      '--jsx',
      'react-jsx',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      'apps/web/src/features/subcontracts/api/subcontracts-api.ts',
      'apps/web/src/features/subcontracts/hooks/subcontracts.ts',
      'apps/web/src/features/subcontracts/components/subcontracts-workspace.tsx',
      'apps/web/src/features/subcontracts/pages/subcontracts-page.tsx',
      'apps/web/src/features/administration/components/admin-shell.tsx'
    ]
  ],
  ['module-5-static-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-static-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-7-static-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-8-static-regression', 'node', ['--test', 'tests/module-8-static.test.mjs']],
  ['module-22-static-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
  ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
];

if (integrationPrepared) {
  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }
}

const passed = integrationPrepared
  && results.length === steps.length + 1
  && results.every((result) => result.status === 'passed');
const status = passed
  ? (stage15LiveAccepted
      ? 'STAGE_16_MODULE_11_REACT_PREPARED_FOR_DEPENDENCY_BACKED_BUILD'
      : 'STAGE_16_MODULE_11_REACT_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-16-module-11-subcontractor-management-react-evidence',
  generatedAt: new Date().toISOString(),
  pass: 263,
  stage: 16,
  module: '11 - Subcontractor Management',
  status,
  stage15LiveAccepted,
  reactCoverage: [
    'typed browser API maps exactly to the eight reviewed Module-11 operations and sends Idempotency-Key on all seven writes',
    'TanStack Query owns the subcontractor register, Module-22 approval read, Module-7 commitment read and command mutation server state',
    'React Hook Form plus Zod validates subcontractor, draft subcontract, scope/BOQ-cost lines, progress application and certification inputs using exact decimal strings',
    'subcontractor register supports optional existing Module-8 Vendor UUID linkage without inventing a Vendor-list or Vendor-write endpoint',
    'draft create/edit keeps Project identity, numbering, status, original/revised header values and approval authority server-owned',
    'execution UI reuses existing Module-22 approval state and Module-7 commitment ledger rather than adding Module-11 approval/commitment routes',
    'progress/certification UI sends only reviewed line inputs while cumulative limits, header totals and retention remain server-authoritative',
    'subcontract detail, application and retention sections use latest command readback and explicitly preserve missing public GET/readback APIs across reloads',
    'permission-aware admin shell exposes Module 11 only for reviewed Module-11 permissions or existing restricted Project scope'
  ],
  intentionallyAbsent: [
    'No subcontract list/detail GET, payment-application history GET, retention-ledger GET, revision command or retention-release route is added.',
    'No Vendor lookup/list endpoint is invented; optional Vendor linkage uses an explicit existing Vendor UUID.',
    'No Finance/AP/GL write is added; certified payment source posting remains deferred to Module 15B / Stage 26.',
    'No Change Order variation adapter is added; executed-subcontract revision remains deferred to the later reviewed integration stage.',
    'No client-owned subcontract number, application number, status, original/revised total, claimed/certified total, retention amount, approval state or commitment source key is sent.'
  ],
  productionBackendChanges: 0,
  databaseChanges: 0,
  newMigrations: 0,
  newReactFiles: 4,
  adminShellIntegrationChanged: true,
  styleSheetChanged: true,
  publicRoutesAdded: 0,
  runtimeVerificationComplete: false,
  dependencyBackedWebBuildRequired: true,
  nextPass: passed
    ? 'Pass 264 - Module 11 Playwright browser workflow verification for subcontractor/vendor linkage, approval/execution, commitment, application/certification and permission-negative cases.'
    : 'Repair the failed Pass-263 React check before adding Stage-16 Playwright coverage.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 11 Stage-16 React evidence written to ${written}`);
if (!passed) process.exitCode = 1;
