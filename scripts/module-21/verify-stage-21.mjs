import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';
import { validateTestDatabaseEnvironment } from '../testing/lib.mjs';

const STAGE_20_ACCEPTED = 'STAGE_20_ACCEPTED_READY_FOR_STAGE_21';
const INTEGRATION_VERIFIED = 'STAGE_21_MODULE_21_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_329';
const PLAYWRIGHT_VERIFIED = 'STAGE_21_MODULE_21_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_332';
const OPERATIONS_VERIFIED = 'STAGE_21_MODULE_21_OPERATIONS_VERIFIED_READY_FOR_PASS_333';
const LIVE_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_MODULE_21_LIVE_GATE';
const MIGRATION_CONFIRMATION = 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE';
const mode = process.argv.find((value) => value.startsWith('--mode='))?.slice('--mode='.length) ?? 'static';

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 21 Stage-21 gate mode must be static or live.');
}

const evidencePath = path.resolve(
  'module-21-evidence',
  mode === 'live' ? 'stage-21-live.json' : 'stage-21-static.json',
);

/** Read one optional JSON evidence file and return null when it does not exist. */
async function readEvidence(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Build one local gate result using the same shape as child-process results. */
function localResult(name, status, errorCode = null) {
  const now = new Date().toISOString();
  return {
    name,
    status,
    startedAt: now,
    finishedAt: now,
    code: status === 'passed' ? 0 : 1,
    signal: null,
    ...(errorCode ? { errorCode } : {}),
  };
}

/** Validate destructive-test guards before the final live Stage-21 acceptance run. */
async function validateLivePrerequisites(env) {
  if (env.MODULE_21_LIVE_GATE_CONFIRM !== LIVE_CONFIRMATION) {
    throw new Error(`Set MODULE_21_LIVE_GATE_CONFIRM=${LIVE_CONFIRMATION}.`);
  }

  validateTestDatabaseEnvironment(env);

  if (env.MIGRATION_TEST_CONFIRM !== MIGRATION_CONFIRMATION) {
    throw new Error(`Set MIGRATION_TEST_CONFIRM=${MIGRATION_CONFIRMATION}.`);
  }
  if (!env.MIGRATION_TEST_DATABASE_URL) throw new Error('MIGRATION_TEST_DATABASE_URL is required.');

  const migrationUrl = new URL(env.MIGRATION_TEST_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(migrationUrl.protocol)) {
    throw new Error('MIGRATION_TEST_DATABASE_URL must use PostgreSQL.');
  }

  const migrationDatabase = decodeURIComponent(migrationUrl.pathname.replace(/^\//, '')).toLowerCase();
  if (!/(migration[_-]?test|migrate[_-]?test)/.test(migrationDatabase)) {
    throw new Error('MIGRATION_TEST_DATABASE_URL must point to a visibly disposable migration-test database.');
  }
  if (['postgres', 'template0', 'template1', 'construction_erp'].includes(migrationDatabase)) {
    throw new Error(`Refusing protected migration database: ${migrationDatabase}`);
  }

  if (env.RUN_FOUNDATION_DB_TESTS !== '1') throw new Error('RUN_FOUNDATION_DB_TESTS=1 is required.');
  if (env.RUN_MODULE_21_E2E !== '1') throw new Error('RUN_MODULE_21_E2E=1 is required.');

  for (const flag of [
    'RUN_MODULE_24A_E2E',
    'RUN_MODULE_18_E2E',
    'RUN_MODULE_22_E2E',
    'RUN_MODULE_2_E2E',
    'RUN_MODULE_3_E2E',
    'RUN_MODULE_4A_E2E',
    'RUN_MODULE_5_E2E',
    'RUN_MODULE_24B_E2E',
    'RUN_MODULE_6_E2E',
    'RUN_MODULE_4B_E2E',
    'RUN_MODULE_15A_E2E',
    'RUN_MODULE_7_E2E',
    'RUN_MODULE_8_E2E',
    'RUN_MODULE_9_E2E',
    'RUN_MODULE_10_E2E',
    'RUN_MODULE_11_E2E',
    'RUN_MODULE_12_E2E',
    'RUN_MODULE_14A_E2E',
    'RUN_MODULE_13_E2E',
    'RUN_MODULE_14B_E2E',
  ]) {
    if (env[flag] === '1') throw new Error(`${flag} must not be enabled during the Module 21 browser gate.`);
  }

  await access('package-lock.json');
}

const stage20 = await readEvidence('module-14b-evidence/stage-20-live.json');
const integration = await readEvidence('module-21-evidence/stage-21-integration-security-live.json');
const playwright = await readEvidence('module-21-evidence/stage-21-playwright-live.json');
const operations = await readEvidence('module-21-evidence/stage-21-operations-live.json');
const stage20LiveAccepted = stage20?.status === STAGE_20_ACCEPTED
  && stage20?.runtimeVerificationComplete === true;
const integrationLiveVerified = integration?.status === INTEGRATION_VERIFIED
  && integration?.runtimeVerificationComplete === true;
const playwrightLiveVerified = playwright?.status === PLAYWRIGHT_VERIFIED
  && playwright?.runtimeVerificationComplete === true;
const operationsLiveVerified = operations?.status === OPERATIONS_VERIFIED
  && operations?.runtimeVerificationComplete === true;
const results = [];

if (mode === 'live' && !stage20LiveAccepted) {
  console.error('BLOCKED\nSTAGE_20_LIVE_HANDOFF_REQUIRED');
  results.push(localResult('stage-20-live-handoff-prerequisite', 'failed', 'STAGE_20_LIVE_HANDOFF_REQUIRED'));
} else if (mode === 'live' && !integrationLiveVerified) {
  console.error('BLOCKED\nSTAGE_21_MODULE_21_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-21-integration-security-live-prerequisite', 'failed', 'STAGE_21_MODULE_21_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED'));
} else if (mode === 'live' && !playwrightLiveVerified) {
  console.error('BLOCKED\nSTAGE_21_MODULE_21_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-21-playwright-live-prerequisite', 'failed', 'STAGE_21_MODULE_21_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED'));
} else if (mode === 'live' && !operationsLiveVerified) {
  console.error('BLOCKED\nSTAGE_21_MODULE_21_OPERATIONS_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-21-operations-live-prerequisite', 'failed', 'STAGE_21_MODULE_21_OPERATIONS_LIVE_VERIFICATION_REQUIRED'));
} else {
  const staticSteps = [
    ['module-5-static-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-6-static-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['module-21-static-suite', 'node', ['--test', 'tests/module-21-static.test.mjs']],
    ['full-static-regression', 'npm', ['run', 'test:static']],
    ['workspace-contract', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
    ['module-21-integration-test-syntax', 'node', ['--check', 'tests/integration/module-21-api.integration.test.mjs']],
    ['module-21-playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-21-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    ['scheduling-schema-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/scheduling/scheduling.schema.ts']],
    ['scheduling-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/scheduling/scheduling.repository.ts']],
    ['scheduling-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/scheduling/scheduling.service.ts']],
    ['scheduling-routes-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/scheduling/scheduling.routes.ts']],
    ['scheduling-index-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/scheduling/index.ts']],
    ['api-app-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/app.ts']],
    ['api-main-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/main.ts']],
    ['scheduling-browser-api-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/scheduling/api/scheduling-api.ts']],
    ['scheduling-hooks-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/scheduling/hooks/scheduling.ts']],
    [
      'scheduling-react-typescript-syntax',
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
        'apps/web/src/features/scheduling/api/scheduling-api.ts',
        'apps/web/src/features/scheduling/hooks/scheduling.ts',
        'apps/web/src/features/scheduling/components/scheduling-workspace.tsx',
        'apps/web/src/features/scheduling/pages/scheduling-page.tsx',
        'apps/web/src/features/administration/components/admin-shell.tsx',
      ],
    ],
  ];

  for (const [name, command, args] of staticSteps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }

  if (mode === 'live' && results.every((result) => result.status === 'passed')) {
    try {
      await validateLivePrerequisites(process.env);
      results.push(localResult('live-prerequisites', 'passed'));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      results.push(localResult('live-prerequisites', 'failed', 'LIVE_PREREQUISITES_INVALID'));
    }
  }

  if (mode === 'live' && results.every((result) => result.status === 'passed')) {
    const liveEnvironment = {
      ...process.env,
      RUN_FOUNDATION_DB_TESTS: '1',
      RUN_MODULE_24A_E2E: '0',
      RUN_MODULE_18_E2E: '0',
      RUN_MODULE_22_E2E: '0',
      RUN_MODULE_2_E2E: '0',
      RUN_MODULE_3_E2E: '0',
      RUN_MODULE_4A_E2E: '0',
      RUN_MODULE_5_E2E: '0',
      RUN_MODULE_24B_E2E: '0',
      RUN_MODULE_6_E2E: '0',
      RUN_MODULE_4B_E2E: '0',
      RUN_MODULE_15A_E2E: '0',
      RUN_MODULE_7_E2E: '0',
      RUN_MODULE_8_E2E: '0',
      RUN_MODULE_9_E2E: '0',
      RUN_MODULE_10_E2E: '0',
      RUN_MODULE_11_E2E: '0',
      RUN_MODULE_12_E2E: '0',
      RUN_MODULE_14A_E2E: '0',
      RUN_MODULE_13_E2E: '0',
      RUN_MODULE_14B_E2E: '0',
      RUN_MODULE_21_E2E: '1',
    };

    const liveSteps = [
      ['clean-install', 'npm', ['ci']],
      ['typecheck', 'npm', ['run', 'typecheck']],
      ['lint', 'npm', ['run', 'lint']],
      ['prisma-validate', 'npm', ['run', 'db:validate']],
      ['prisma-generate', 'npm', ['run', 'db:generate']],
      ['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify']],
      ['build', 'npm', ['run', 'build']],
      ['prepare-integration-database', 'npm', ['run', 'test:db:prepare']],
      ['module-21-backend-security-integration', 'npm', ['run', 'test:integration:module-21']],
      ['module-21-browser-workflow', 'npm', ['run', 'test:e2e:module-21']],
      ['module-21-operational-verification', 'npm', ['run', 'test:operations:module-21']],
      ['module-5-operational-regression', 'npm', ['run', 'test:operations:module-5']],
      ['module-6-operational-regression', 'npm', ['run', 'test:operations:module-6']],
      ['module-24b-operational-regression', 'npm', ['run', 'test:operations:module-24b']],
    ];

    for (const [name, command, args] of liveSteps) {
      const result = await runStep(name, command, args, { env: liveEnvironment });
      results.push(result);
      if (result.status !== 'passed') break;
    }
  }
}

const expectedChecks = mode === 'live' ? 35 : 20;
const passed = results.length === expectedChecks && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: `construction-erp-module-21-stage-21-${mode}-evidence`,
  mode,
  generatedAt: new Date().toISOString(),
  status: passed
    ? (mode === 'live'
        ? 'STAGE_21_ACCEPTED_READY_FOR_STAGE_22'
        : (stage20LiveAccepted
            ? (operationsLiveVerified
                ? 'STAGE_21_STATIC_GATE_PASSED_READY_FOR_LIVE_ACCEPTANCE'
                : 'STAGE_21_STATIC_GATE_PASSED_LIVE_VERIFICATION_PENDING')
            : 'STAGE_21_STATIC_GATE_PASSED_STAGE_20_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED',
  module: '21 - Project Scheduling',
  pass: 333,
  stage: 21,
  stage20LiveAccepted,
  integrationLiveVerified,
  playwrightLiveVerified,
  operationsLiveVerified,
  activation: passed && mode === 'live'
    ? 'STAGE_21_MODULE_21_ACCEPTED'
    : (!stage20LiveAccepted
        ? 'DO_NOT_DEPLOY_STAGE_21_UNTIL_STAGE_20_LIVE_HANDOFF'
        : (!operationsLiveVerified
            ? 'COMPLETE_STAGE_21_LIVE_VERIFICATION_CHAIN_BEFORE_ACCEPTANCE'
            : 'LIVE_STAGE_21_GATE_REQUIRED')),
  sourceDefinedTables: [
    'project_schedules',
    'schedule_activities',
    'schedule_dependencies',
    'schedule_baselines',
    'schedule_progress_updates',
  ],
  reviewedRouteCount: 8,
  reviewedWriteRouteCount: 6,
  activePermissions: [
    'schedule.read',
    'schedule.manage',
    'schedule.baseline',
    'schedule.progress',
  ],
  stableErrors: [
    'SCHEDULE_NOT_FOUND',
    'DUPLICATE_ACTIVITY_CODE',
    'SCHEDULE_DEPENDENCY_CYCLE',
    'SCHEDULE_BASELINE_LOCKED',
    'INVALID_PROGRESS_UPDATE',
  ],
  sourceDefinedEvents: [
    'schedule.created',
    'schedule.baselined',
    'schedule.progress_updated',
    'schedule.milestone_changed',
  ],
  hardDependencies: ['5 - Project Management'],
  optionalDependencies: ['6 - WBS & Cost Codes for optional activity mapping'],
  projectAuthorizationUsesModule24B: true,
  oneCurrentSchedulePerProject: true,
  baselineSnapshotImmutable: true,
  progressHistoryAppendOnly: true,
  dependencyCycleProtection: true,
  idempotentWriteBoundaryVerified: true,
  advancedCpmAdded: false,
  fullP6ParityClaimed: false,
  externalSchedulerSyncAdded: false,
  changeOrderIntegrationStillDeferredToStage22And27: true,
  dailyReportIntegrationStillDeferredToStage25And27: true,
  stage27ScheduleImpactProofStillRequired: true,
  exactApprovedBusinessModuleCount: 24,
  stageSuffixCreatesBusinessModule: false,
  unresolvedSourceContract: [
    'Project Schedule status vocabulary is not enumerated.',
    'Schedule Activity status vocabulary is not enumerated.',
    'The workflow mentions an activity owner and planned duration, but neither field is defined in the source table contract.',
    'Activity hierarchy depth and the exact post-baseline parent-change policy are not defined.',
    'Dependency types beyond the guaranteed first-scope finish-start relationship are not enumerated.',
    'Negative lead and fractional lag-day semantics are not defined.',
    'The canonical baseline snapshot_json shape and baseline numbering start value are not defined by the source.',
    'The baseline reopen/revision lifecycle and exact SCHEDULE_BASELINE_LOCKED field scope are not defined.',
    'Forecast start and complete revised-forecast persistence are not defined.',
    'Look-ahead public query parameter names and start-date semantics are not defined.',
    'Progress approval and duplicate/replace behavior for one Activity/data_date are not defined.',
    'The exact schedule.milestone_changed emission condition is not defined.',
    'Approved Change Order schedule impact belongs to Module 17 and still requires the Stage-27 integration proof.',
    'Daily Site Report activity linkage is deferred until its owning stage and Stage-27 completion.',
    'Advanced CPM/P6 calculations, calendars, resource loading and external scheduler synchronization remain outside the medium ERP scope.',
  ],
  productionRuntimeChanges: 0,
  databaseChanges: 0,
  newMigrations: 0,
  publicApiChanges: 0,
  newPermissions: 0,
  runtimeVerificationComplete: passed
    && mode === 'live'
    && stage20LiveAccepted
    && integrationLiveVerified
    && playwrightLiveVerified
    && operationsLiveVerified,
  runtimeDeploymentAllowed: passed
    && mode === 'live'
    && stage20LiveAccepted
    && integrationLiveVerified
    && playwrightLiveVerified
    && operationsLiveVerified,
  nextDependentStage: '22 - Module 17 Change Orders / Variations',
  nextReviewedPass: 'Pass 334 - Stage 22 / Module 17 Change Orders / Variations contract freeze.',
  nextStage: passed && mode === 'live'
    ? 'Stage 22 - Module 17 Change Orders / Variations'
    : 'Stage-22 contract preparation may continue, but Stage-21 runtime acceptance/deployment remains blocked until the genuine Stage-20/Stage-21 live chain passes.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 21 Stage-21 ${mode} evidence written to ${written}`);

if (passed) {
  console.log(mode === 'live'
    ? 'Module 21 Stage 21 accepted. The next dependency-aware stage is Module 17 Change Orders / Variations.'
    : 'Module 21 static Stage-21 gate passed. Live acceptance is still required.');
} else {
  process.exitCode = 1;
}
