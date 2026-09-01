import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_6 = 'STAGE_6_ACCEPTED_READY_FOR_STAGE_7';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-5-evidence',
  mode === 'live' ? 'stage-7-security-live.json' : 'stage-7-security.json'
);

/** Read genuine Module 4A live acceptance before any Stage-7 live security verification is allowed. */
async function readStage6LiveAcceptance() {
  try {
    return JSON.parse(await readFile('module-4a-evidence/stage-6-live.json', 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write one blocked security evidence record without running destructive live database work. */
async function writeBlockedEvidence(reason, stage6LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-5-stage-7-security-evidence',
    generatedAt: new Date().toISOString(),
    status: 'BLOCKED',
    module: '5 - Project Management',
    pass: 144,
    mode,
    stage6LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    nextPass: 'Resolve the live prerequisite, then rerun module-5:security:gate:live before Pass 145.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 5 Stage-7 security evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 5 security gate mode must be static or live.');
}

const stage6 = await readStage6LiveAcceptance();
const stage6LiveAccepted = stage6?.status === ACCEPTED_STAGE_6;

if (mode === 'live' && !stage6LiveAccepted) {
  await writeBlockedEvidence('STAGE_6_LIVE_ACCEPTANCE_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const results = [];
  const steps = [
    ['module-5-integration', 'npm', ['run', 'module-5:integration:gate']],
    ['module-5-security-contract', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-5-security-syntax', 'node', ['--check', 'tests/integration/module-5-api.integration.test.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-5-rbac-isolation-database-attacks', 'npm', ['run', 'test:security:module-5']]);
  }

  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }

  const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'STAGE_7_SECURITY_VERIFIED_READY_FOR_PASS_145'
        : (stage6LiveAccepted
            ? 'STAGE_7_SECURITY_TESTS_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_7_SECURITY_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-5-stage-7-security-evidence',
    generatedAt: new Date().toISOString(),
    status,
    module: '5 - Project Management',
    pass: 144,
    mode,
    stage6LiveAccepted,
    securityFile: 'tests/integration/module-5-api.integration.test.mjs',
    coverage: [
      'authentication on all seven Stage-7 Project routes',
      'active Stage-7 permission matrix with projects.manage_members still deferred',
      'cross-company Project list/detail/update/lifecycle isolation',
      'same-company Client, Tender and Project Manager validation',
      'direct repository company filtering',
      'direct service permission and company-scope revalidation',
      'strict rejection of client-owned company/actor/permission/scope/status authority',
      'company-unique Project code constraint',
      'same-company Client/Tender/Project Manager foreign-key constraints',
      'date, currency and Project-status checks',
      'append-only lifecycle-history status and actor constraints',
      'reviewed Stage-7 index and constraint presence',
      'safe public errors without SQL or Prisma leakage'
    ],
    deferredToPass145: [
      'exact generated OpenAPI operation inventory',
      'request/response schema documentation proof',
      'stable Project error-code documentation proof'
    ],
    membershipDeferredToModule24B: true,
    productionRuntimeChanges: 0,
    runtimeVerificationComplete: passed && mode === 'live' && stage6LiveAccepted,
    nextPass: passed && mode === 'live'
      ? 'Pass 145 - Module 5 OpenAPI and API-contract verification'
      : 'Run the live security gate after genuine Stage-6 acceptance; Pass 145 may be prepared but cannot claim live Stage-7 security verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 5 Stage-7 security evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
