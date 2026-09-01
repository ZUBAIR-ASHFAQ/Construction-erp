import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_7 = 'STAGE_7_ACCEPTED_READY_FOR_STAGE_8';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-18-evidence',
  mode === 'live' ? 'project-completion-live.json' : 'project-completion.json'
);

/** Read genuine Stage-7 acceptance before Project-dependent integration/browser work is allowed. */
async function readStage7LiveAcceptance() {
  try {
    return JSON.parse(await readFile('module-5-evidence/stage-7-live.json', 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write one blocked Pass-170 result without touching PostgreSQL or starting a browser. */
async function writeBlockedEvidence(reason, stage7LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-18-project-completion-repair',
    generatedAt: new Date().toISOString(),
    status: 'BLOCKED',
    pass: 170,
    mode,
    stage7LiveAccepted,
    reason,
    repairHoldActive: true,
    module6Allowed: false,
    runtimeVerificationComplete: false,
    nextPass: 'Pass 171 - Existing-module UI completion repair.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 18 Project completion evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 18 Project completion gate mode must be static or live.');
}

const stage7 = await readStage7LiveAcceptance();
const stage7LiveAccepted = stage7?.status === ACCEPTED_STAGE_7;

if (mode === 'live' && !stage7LiveAccepted) {
  await writeBlockedEvidence('STAGE_7_LIVE_ACCEPTANCE_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_MODULE_18_E2E !== '1') {
  await writeBlockedEvidence('RUN_MODULE_18_E2E_REQUIRED', true);
  process.exitCode = 1;
} else {
  const results = [];
  const steps = [
    ['pass-169-project-security', 'npm', ['run', 'module-18:project-security:gate']],
    ['module-18-focused-static', 'node', ['--test', 'tests/module-18-static.test.mjs']],
    ['documents-schema-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/documents/documents.schema.ts']],
    ['documents-routes-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/documents/documents.routes.ts']],
    ['documents-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/documents/documents.service.ts']],
    ['documents-browser-api-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/documents/api/documents-api.ts']],
    ['documents-hooks-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/documents/hooks/documents.ts']],
    ['module-18-integration-syntax', 'node', ['--check', 'tests/integration/module-18-api.integration.test.mjs']],
    ['module-18-playwright-syntax', 'node', ['--check', 'tests/e2e/module-18-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-18-project-integration', 'npm', ['run', 'test:project-security:module-18']]);
    steps.push(['module-18-project-browser', 'npm', ['run', 'test:e2e:module-18']]);
  }

  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }

  const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'MODULE_18_PROJECT_COMPLETION_VERIFIED_REPAIR_HOLD_ACTIVE'
        : 'MODULE_18_PROJECT_COMPLETION_PREPARED_REPAIR_HOLD_ACTIVE')
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-18-project-completion-repair',
    generatedAt: new Date().toISOString(),
    status,
    pass: 170,
    mode,
    stage7LiveAccepted,
    completionCoverage: [
      'existing upload-intent and folder-create bodies accept only a nullable Project target plus reviewed business fields',
      'existing Document and folder list routes accept an exact Project filter without adding a new route',
      'root folders and root Documents may be explicitly Project-scoped while child folders/uploads inherit trusted folder scope',
      'Project filters are reauthorized against exact documents.project.read before repository access',
      'Document detail returns server-derived version/archive capabilities for permission-aware React actions',
      'React exposes Project target/filter controls using server-authorized Project IDs without sending company or actor authority',
      'Playwright covers Project-A allow, Project-B isolation, Project target payloads, version/archive visibility and direct API denial',
      'OpenAPI exposes projectId on the existing reviewed requests and list filters'
    ],
    apiRoutesAdded: 0,
    permissionsAdded: 0,
    migrationsAdded: 0,
    newBackendModuleFiles: 0,
    newReactProductionFiles: 0,
    repairHoldActive: true,
    module6Allowed: false,
    runtimeVerificationComplete: passed && mode === 'live' && stage7LiveAccepted,
    nextPass: 'Pass 171 - Existing-module UI completion repair.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 18 Project completion evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
