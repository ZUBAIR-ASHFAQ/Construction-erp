import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_8_ACCEPTED = 'STAGE_8_ACCEPTED_READY_FOR_STAGE_9';
const PASS_175_ACCEPTED = 'PASS_175_FINAL_REPAIR_AUDIT_ACCEPTED_READY_FOR_MODULE_6';
const HOLD_CLEARED = 'STAGE_8_REPAIR_HOLD_CLEARED';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-6-evidence',
  mode === 'live' ? 'stage-9-security-live.json' : 'stage-9-security.json'
);

/** Read one JSON evidence file and return null when it is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write blocked live security evidence without starting destructive PostgreSQL checks. */
async function writeBlockedEvidence(reason, module6LiveHandoffAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-6-stage-9-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 183,
    stage: 9,
    module: '6 - WBS & Cost Codes',
    mode,
    status: 'BLOCKED',
    module6LiveHandoffAccepted,
    reason,
    runtimeVerificationComplete: false,
    nextPass: 'Resolve the live prerequisite and rerun module-6:security:gate:live before claiming Pass 183 live verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 6 Stage-9 security evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 6 security gate mode must be static or live.');
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

const integrationEvidence = await readJson('module-6-evidence/stage-9-integration.json');
const integrationPrepared = integrationEvidence?.pass === 182
  && [
    'STAGE_9_INTEGRATION_VERIFIED_READY_FOR_PASS_183',
    'STAGE_9_INTEGRATION_TESTS_PREPARED_FOR_LIVE_RUN',
    'STAGE_9_INTEGRATION_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING'
  ].includes(integrationEvidence?.status)
  && Array.isArray(integrationEvidence?.checks)
  && integrationEvidence.checks.every((check) => check.status === 'passed');

if (mode === 'live' && !module6LiveHandoffAccepted) {
  await writeBlockedEvidence('STAGE_8_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const results = [{
    name: 'module-6-integration-evidence',
    status: integrationPrepared ? 'passed' : 'failed',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    code: integrationPrepared ? 0 : 1,
    signal: null
  }];

  const steps = [
    ['module-6-integration', 'npm', ['run', 'module-6:integration:gate']],
    ['module-6-security-contract', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-6-security-test-syntax', 'node', ['--check', 'tests/integration/module-6-api.integration.test.mjs']],
    ['module-6-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.repository.ts']],
    ['module-6-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.service.ts']],
    ['module-6-routes-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.routes.ts']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-6-rbac-scope-database-attacks', 'npm', ['run', 'test:security:module-6']]);
  }

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
    ? (mode === 'live'
        ? 'STAGE_9_SECURITY_VERIFIED_READY_FOR_PASS_184'
        : (module6LiveHandoffAccepted
            ? 'STAGE_9_SECURITY_TESTS_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_9_SECURITY_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-6-stage-9-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 183,
    stage: 9,
    module: '6 - WBS & Cost Codes',
    mode,
    status,
    module6LiveHandoffAccepted,
    securityFile: 'tests/integration/module-6-api.integration.test.mjs',
    coverage: [
      'authentication is required on all seven reviewed Module 6 operations',
      'wbs.read does not grant wbs.manage, wbs.freeze or Company Cost Code permissions',
      'Project-A membership and permission scope cannot access Project B',
      'Project membership never creates missing role permissions',
      'Company A cannot read Company B WBS, mappings or Cost Codes',
      'Company Cost Codes remain Company-scoped and are not filtered by Project membership',
      'client companyId, actorUserId, permissions and projectScope fields are rejected',
      'nested client projectId cannot override the route Project',
      'repository Company filters hide foreign Project and Cost Code rows',
      'service revalidates exact Project permission instead of trusting request scope',
      'database constraints reject cross-company WBS, cross-Project parent and invalid mapping ownership'
    ],
    repositoryPolicy: 'Company isolation is repository-owned; Project membership/resource authorization is service-owned.',
    productionRuntimeChanges: 0,
    runtimeVerificationComplete: passed && mode === 'live' && module6LiveHandoffAccepted,
    nextPass: passed && mode === 'live'
      ? 'Pass 184 - Module 6 OpenAPI and exact API-contract verification.'
      : 'Pass 184 may be prepared next, but Pass 183 live verification remains blocked until the genuine Stage-8 live handoff is available.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 6 Stage-9 security evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
