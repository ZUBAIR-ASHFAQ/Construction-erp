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
  mode === 'live' ? 'stage-9-api-contract-live.json' : 'stage-9-api-contract.json'
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

/** Write blocked live API-contract evidence without starting database-backed OpenAPI verification. */
async function writeBlockedEvidence(reason, module6LiveHandoffAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-6-stage-9-api-contract-evidence',
    generatedAt: new Date().toISOString(),
    pass: 184,
    stage: 9,
    module: '6 - WBS & Cost Codes',
    mode,
    status: 'BLOCKED',
    module6LiveHandoffAccepted,
    reason,
    runtimeVerificationComplete: false,
    nextPass: 'Resolve the live prerequisite and rerun module-6:api-contract:gate:live before claiming Pass 184 live verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 6 Stage-9 API-contract evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 6 API-contract gate mode must be static or live.');
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

const securityEvidence = await readJson('module-6-evidence/stage-9-security.json');
const securityPrepared = securityEvidence?.pass === 183
  && [
    'STAGE_9_SECURITY_VERIFIED_READY_FOR_PASS_184',
    'STAGE_9_SECURITY_TESTS_PREPARED_FOR_LIVE_RUN',
    'STAGE_9_SECURITY_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING'
  ].includes(securityEvidence?.status)
  && Array.isArray(securityEvidence?.checks)
  && securityEvidence.checks.every((check) => check.status === 'passed');

if (mode === 'live' && !module6LiveHandoffAccepted) {
  await writeBlockedEvidence('STAGE_8_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const results = [{
    name: 'module-6-security-evidence',
    status: securityPrepared ? 'passed' : 'failed',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    code: securityPrepared ? 0 : 1,
    signal: null
  }];

  const steps = [
    ['module-6-security', 'npm', ['run', 'module-6:security:gate']],
    ['module-6-api-contract-suite', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-6-routes-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.routes.ts']],
    ['module-6-api-test-syntax', 'node', ['--check', 'tests/integration/module-6-api.integration.test.mjs']],
    ['api-registration-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/app.ts']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-6-generated-openapi-contract', 'npm', ['run', 'test:api-contract:module-6']]);
  }

  if (securityPrepared) {
    for (const [name, command, args] of steps) {
      const result = await runStep(name, command, args);
      results.push(result);
      if (result.status !== 'passed') break;
    }
  }

  const passed = securityPrepared
    && results.length === steps.length + 1
    && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'STAGE_9_API_CONTRACT_VERIFIED_READY_FOR_PASS_185'
        : (module6LiveHandoffAccepted
            ? 'STAGE_9_API_CONTRACT_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_9_API_CONTRACT_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-6-stage-9-api-contract-evidence',
    generatedAt: new Date().toISOString(),
    pass: 184,
    stage: 9,
    module: '6 - WBS & Cost Codes',
    mode,
    status,
    module6LiveHandoffAccepted,
    contractCoverage: [
      'exact seven-operation Module 6 OpenAPI inventory',
      'bearer security on every reviewed Module 6 operation',
      'strict request schemas with Company, actor, permission, Project and derived level authority absent',
      'bodyless WBS freeze command',
      'exact WBS tree, Cost Code list, mapping and freeze success DTO schemas',
      'shared error envelope with requestId nested under error',
      'route-specific stable validation, authorization, not-found and conflict error-code enums',
      'no Cost Type CRUD, archive, reopen, generic CRUD or DELETE route'
    ],
    sourceDefinedButUnreachableError: {
      code: 'COST_CODE_IN_USE',
      reason: 'The source freezes this error code, but the reviewed seven-route contract defines no Cost Code archive/delete command that can emit it.'
    },
    openApiRoute: '/openapi.json',
    productionBusinessBehaviorChanges: 0,
    openApiMetadataCorrections: [
      'replace permissive generic error schemas with the real shared error envelope',
      'document only the stable error codes each current operation can actually emit'
    ],
    runtimeVerificationComplete: passed && mode === 'live' && module6LiveHandoffAccepted,
    nextPass: passed && mode === 'live'
      ? 'Pass 185 - Module 6 React API and TanStack Query hooks.'
      : 'Pass 185 may be prepared next, but Pass 184 live verification remains blocked until the genuine Stage-8 live handoff is available.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 6 Stage-9 API-contract evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
