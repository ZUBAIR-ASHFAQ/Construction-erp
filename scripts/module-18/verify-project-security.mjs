import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_7 = 'STAGE_7_ACCEPTED_READY_FOR_STAGE_8';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-18-evidence',
  mode === 'live' ? 'project-security-live.json' : 'project-security.json'
);

/** Read genuine Stage-7 acceptance before Project-dependent live security checks are allowed. */
async function readStage7LiveAcceptance() {
  try {
    return JSON.parse(await readFile('module-5-evidence/stage-7-live.json', 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write one blocked Project-security result without touching the disposable database. */
async function writeBlockedEvidence(reason, stage7LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-18-project-security-repair',
    generatedAt: new Date().toISOString(),
    status: 'BLOCKED',
    pass: 169,
    mode,
    stage7LiveAccepted,
    reason,
    repairHoldActive: true,
    module6Allowed: false,
    runtimeVerificationComplete: false,
    nextPass: 'Pass 170 - Module 18 HTTP, OpenAPI, React and E2E Project completion.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 18 Project security evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 18 Project security gate mode must be static or live.');
}

const stage7 = await readStage7LiveAcceptance();
const stage7LiveAccepted = stage7?.status === ACCEPTED_STAGE_7;

if (mode === 'live' && !stage7LiveAccepted) {
  await writeBlockedEvidence('STAGE_7_LIVE_ACCEPTANCE_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const results = [];
  const steps = [
    ['pass-168-project-persistence', 'npm', ['run', 'module-18:project-persistence:gate']],
    ['module-18-focused-static', 'node', ['--test', 'tests/module-18-static.test.mjs']],
    ['documents-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/documents/documents.repository.ts']],
    ['documents-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/documents/documents.service.ts']],
    ['users-rbac-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/administration/administration.repository.ts']],
    ['module-18-integration-syntax', 'node', ['--check', 'tests/integration/module-18-api.integration.test.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-18-project-security-live', 'npm', ['run', 'test:project-security:module-18']]);
  }

  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }

  const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'MODULE_18_PROJECT_SECURITY_VERIFIED_REPAIR_HOLD_ACTIVE'
        : 'MODULE_18_PROJECT_SECURITY_PREPARED_REPAIR_HOLD_ACTIVE')
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-18-project-security-repair',
    generatedAt: new Date().toISOString(),
    status,
    pass: 169,
    mode,
    stage7LiveAccepted,
    securityCoverage: [
      'company-wide Documents continue to require the existing company permission',
      'Project-scoped reads require resolved Project membership plus documents.project.read for that exact Project',
      'Project-scoped upload, version and archive commands require the matching exact Project permission',
      'Document and folder lists filter Project rows in the repository before returning them',
      'Project-A role permissions cannot authorize Project-B Document rows',
      'trusted folder Project ownership flows into upload intent and created Document metadata',
      'existing Document Project ownership flows into version upload intents',
      'upload completion revalidates the persisted Project target before mutation',
      'cross-company Document isolation remains unchanged'
    ],
    productionFilesChanged: 4,
    apiRoutesAdded: 0,
    permissionsAdded: 0,
    migrationsAdded: 0,
    repairHoldActive: true,
    module6Allowed: false,
    runtimeVerificationComplete: passed && mode === 'live' && stage7LiveAccepted,
    nextPass: 'Pass 170 - Module 18 HTTP, OpenAPI, React and E2E Project completion.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 18 Project security evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
