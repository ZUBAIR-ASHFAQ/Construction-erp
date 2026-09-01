import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';
import { validateTestDatabaseEnvironment } from '../testing/lib.mjs';

const PASS_173_ACCEPTED = 'PASS_173_CONSOLIDATED_AUDIT_REPAIR_REGRESSION_PASSED_REPAIR_HOLD_ACTIVE';
const REPAIR_HOLD_ACTIVE = 'STAGE_8_REPAIR_HOLD_ACTIVE';
const FOUNDATION_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_FOUNDATION_LIVE_GATE';
const MIGRATION_CONFIRMATION = 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE';
const TEST_CONFIRMATION = 'RESET_CONSTRUCTION_ERP_TEST_DATABASE';
const RECOVERY_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_RECOVERY_DRILL';
const RESTORE_CONFIRMATION = 'RESTORE_CONSTRUCTION_ERP_DATA';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve('acceptance-evidence', mode === 'live' ? 'pass-174-live-chain-live.json' : 'pass-174-live-chain.json');

if (!['static', 'live'].includes(mode)) {
  throw new Error('Pass-174 live-chain gate mode must be static or live.');
}

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Return true when one repository file exists. */
async function fileExists(relativePath) {
  try {
    await access(relativePath);
    return true;
  } catch {
    return false;
  }
}

/** Verify that the committed npm lockfile matches the root workspace manifest. */
async function verifyLockfile() {
  const [manifest, lockfile] = await Promise.all([
    readFile('package.json', 'utf8').then(JSON.parse),
    readFile('package-lock.json', 'utf8').then(JSON.parse)
  ]);

  if (!Number.isInteger(lockfile.lockfileVersion) || lockfile.lockfileVersion < 2 || !lockfile.packages?.['']) {
    throw new Error('package-lock.json must be a modern npm lockfile with a root packages entry.');
  }

  const root = lockfile.packages[''];
  if (JSON.stringify(root.workspaces ?? []) !== JSON.stringify(manifest.workspaces ?? [])) {
    throw new Error('package-lock.json workspace declarations do not match package.json.');
  }

  for (const field of ['dependencies', 'devDependencies']) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if (root[field]?.[name] !== spec) {
        throw new Error(`package-lock.json is out of sync for ${field}.${name}.`);
      }
    }
  }
}

/** Return one required environment value without exposing its content. */
function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Pass-174 live acceptance.`);
  return value;
}

/** Require one exact destructive-operation confirmation. */
function requireConfirmation(name, expected) {
  if (process.env[name] !== expected) {
    throw new Error(`Set ${name}=${expected} before Pass-174 live acceptance.`);
  }
}

/** Validate all live prerequisites before npm, PostgreSQL, storage or browser work begins. */
async function validateLivePrerequisites() {
  await access('package-lock.json');
  await verifyLockfile();

  requireEnv('DATABASE_URL');
  requireEnv('MIGRATION_TEST_DATABASE_URL');
  requireEnv('TEST_DATABASE_URL');
  requireEnv('RESTORE_DATABASE_URL');
  requireEnv('STORAGE_ENDPOINT');
  requireEnv('STORAGE_BUCKET');
  requireEnv('STORAGE_ACCESS_KEY_ID');
  requireEnv('STORAGE_SECRET_ACCESS_KEY');
  requireEnv('RESTORE_STORAGE_ENDPOINT');
  requireEnv('RESTORE_STORAGE_BUCKET');
  requireEnv('RESTORE_STORAGE_ACCESS_KEY_ID');
  requireEnv('RESTORE_STORAGE_SECRET_ACCESS_KEY');
  requireEnv('AUTH_ACTION_TOKEN_SECRET');

  requireConfirmation('FOUNDATION_LIVE_GATE_CONFIRM', FOUNDATION_CONFIRMATION);
  requireConfirmation('MIGRATION_TEST_CONFIRM', MIGRATION_CONFIRMATION);
  requireConfirmation('TEST_DATABASE_CONFIRM', TEST_CONFIRMATION);
  requireConfirmation('RECOVERY_DRILL_CONFIRM', RECOVERY_CONFIRMATION);
  requireConfirmation('RESTORE_CONFIRM', RESTORE_CONFIRMATION);

  if (process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
    throw new Error('RUN_FOUNDATION_DB_TESTS=1 is required for Pass-174 live acceptance.');
  }

  validateTestDatabaseEnvironment(process.env);

  if (process.env.AUTH_ACTION_TOKEN_SECRET.length < 32) {
    throw new Error('AUTH_ACTION_TOKEN_SECRET must contain at least 32 characters.');
  }
}

/** Create one local gate result with the same shape as child-process checks. */
function localResult(name, status, errorCode = null) {
  const now = new Date().toISOString();
  return {
    name,
    status,
    startedAt: now,
    finishedAt: now,
    code: status === 'passed' ? 0 : 1,
    signal: null,
    ...(errorCode ? { errorCode } : {})
  };
}

/** Run the dependency-free Pass-174 preparation checks. */
async function runStaticChecks(results) {
  const steps = [
    ['pass-173-consolidated-regression', 'npm', ['run', 'audit-repair:regression:gate']],
    ['pass-174-runner-syntax', 'node', ['--check', 'scripts/acceptance/verify-pass-174-live-chain.mjs']],
    ['foundation-live-runner-syntax', 'node', ['--check', 'scripts/foundation/run-live-acceptance.mjs']],
    ['stage-0-3-runner-syntax', 'node', ['--check', 'scripts/acceptance/run-stages-0-3.mjs']],
    ['module-24b-final-gate-syntax', 'node', ['--check', 'scripts/module-24b/verify-stage-8.mjs']],
    ['workspace-and-required-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }
}

/** Run the complete dependency-backed Stage-0-through-repair live chain without clearing the audit hold. */
async function runLiveChecks(results) {
  const env = {
    ...process.env,
    RUN_FOUNDATION_DB_TESTS: '1',
    RUN_MODULE_24A_E2E: '0',
    RUN_MODULE_18_E2E: '0',
    RUN_MODULE_22_E2E: '0',
    RUN_MODULE_2_E2E: '0',
    RUN_MODULE_3_E2E: '0',
    RUN_MODULE_4A_E2E: '0',
    RUN_MODULE_5_E2E: '0',
    RUN_MODULE_24B_E2E: '0'
  };

  const steps = [
    ['clean-install', 'npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']],
    ['typecheck', 'npm', ['run', 'typecheck']],
    ['lint', 'npm', ['run', 'lint']],
    ['prisma-validate', 'npm', ['run', 'db:validate']],
    ['prisma-generate', 'npm', ['run', 'db:generate']],
    ['full-build', 'npm', ['run', 'build']],
    ['static-repair-regression-after-build', 'npm', ['run', 'audit-repair:regression:gate']],
    ['clean-and-previous-schema-migrations', 'npm', ['run', 'db:migrations:verify']],
    ['stages-0-3-live-acceptance', 'npm', ['run', 'stages-0-3:acceptance:live']],
    ['module-2-live-acceptance', 'npm', ['run', 'module-2:acceptance:live']],
    ['module-3-live-acceptance', 'npm', ['run', 'module-3:acceptance:live']],
    ['module-4a-live-acceptance', 'npm', ['run', 'module-4a:acceptance:live']],
    ['module-5-live-acceptance', 'npm', ['run', 'module-5:acceptance:live']],
    ['module-24b-integration-live', 'npm', ['run', 'module-24b:integration:gate:live']],
    ['module-24b-security-live', 'npm', ['run', 'module-24b:security:gate:live']],
    ['module-24b-api-contract-live', 'npm', ['run', 'module-24b:api-contract:gate:live']],
    ['module-24b-playwright-live', 'npm', ['run', 'module-24b:playwright:gate:live']],
    ['module-24b-operations-live', 'npm', ['run', 'module-24b:operations:gate:live']],
    ['module-24b-readback-live', 'npm', ['run', 'module-24b:readback:gate:live']],
    ['module-24b-react-readback-live', 'npm', ['run', 'module-24b:react-readback:gate:live']],
    ['module-18-project-persistence-live', 'npm', ['run', 'module-18:project-persistence:gate:live']],
    ['module-18-project-security-live', 'npm', ['run', 'module-18:project-security:gate:live']],
    ['module-18-project-completion-live', 'npm', ['run', 'module-18:project-completion:gate:live']]
  ];

  for (const [name, command, args] of steps) {
    const stepEnv = { ...env };
    if (name === 'module-24b-playwright-live' || name === 'module-24b-react-readback-live') {
      stepEnv.RUN_MODULE_24B_E2E = '1';
    }
    if (name === 'module-18-project-completion-live') {
      stepEnv.RUN_MODULE_18_E2E = '1';
    }

    const result = await runStep(name, command, args, { env: stepEnv });
    results.push(result);
    if (result.status !== 'passed') break;
  }
}

const pass173 = await readJson('acceptance-evidence/pass-173-consolidated-regression.json');
const repairHold = await readJson('module-24b-evidence/stage-8-repair-hold.json');
const pass173Accepted = pass173?.status === PASS_173_ACCEPTED;
const repairHoldActive = repairHold?.status === REPAIR_HOLD_ACTIVE && repairHold?.module6Allowed === false;
const lockfilePresent = await fileExists('package-lock.json');
const results = [];
let blockReason = null;

if (!pass173Accepted) {
  results.push(localResult('pass-173-prerequisite', 'failed', 'PASS_173_REGRESSION_REQUIRED'));
  blockReason = 'PASS_173_REGRESSION_REQUIRED';
} else if (!repairHoldActive) {
  results.push(localResult('stage-8-repair-hold', 'failed', 'STAGE_8_REPAIR_HOLD_REQUIRED_UNTIL_PASS_175'));
  blockReason = 'STAGE_8_REPAIR_HOLD_REQUIRED_UNTIL_PASS_175';
} else {
  await runStaticChecks(results);
}

if (mode === 'live' && results.every((result) => result.status === 'passed')) {
  if (!lockfilePresent) {
    results.push(localResult('package-lock', 'failed', 'PACKAGE_LOCK_REQUIRED'));
    blockReason = 'PACKAGE_LOCK_REQUIRED';
  } else {
    try {
      await validateLivePrerequisites();
      results.push(localResult('live-prerequisites', 'passed'));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      results.push(localResult('live-prerequisites', 'failed', 'LIVE_PREREQUISITES_INVALID'));
      blockReason = 'LIVE_PREREQUISITES_INVALID';
    }
  }
}

if (mode === 'live' && results.every((result) => result.status === 'passed')) {
  await runLiveChecks(results);
}

const staticPassed = mode === 'static' && results.length === 7 && results.every((result) => result.status === 'passed');
const liveExpectedChecks = 7 + 1 + 23;
const livePassed = mode === 'live' && results.length === liveExpectedChecks && results.every((result) => result.status === 'passed');
const passed = mode === 'static' ? staticPassed : livePassed;

const status = passed
  ? (mode === 'live'
      ? 'PASS_174_DEPENDENCY_AND_LIVE_ACCEPTANCE_VERIFIED_READY_FOR_PASS_175'
      : (lockfilePresent
          ? 'PASS_174_LIVE_ACCEPTANCE_CHAIN_PREPARED_REPAIR_HOLD_ACTIVE'
          : 'PASS_174_LIVE_ACCEPTANCE_CHAIN_PREPARED_LOCKFILE_PENDING_REPAIR_HOLD_ACTIVE'))
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-pass-174-dependency-backed-live-acceptance-chain',
  generatedAt: new Date().toISOString(),
  pass: 174,
  mode,
  status,
  blockReason,
  pass173Accepted,
  repairHoldActive,
  packageLockPresent: lockfilePresent,
  packageLockRequiredForLive: true,
  runtimeVerificationComplete: livePassed,
  module6Allowed: false,
  repairHoldCleared: false,
  liveCoverage: [
    'clean npm install from a synchronized package-lock',
    'TypeScript typecheck and ESLint',
    'Prisma validate/generate and full build',
    'clean plus previous-schema migration verification',
    'Foundation Stage-0 PostgreSQL/object-storage recovery acceptance',
    'Module 24A, Module 18, Module 22, Module 2, Module 3, Module 4A and Module 5 live acceptance in dependency order',
    'Module 24B integration/security/API/Playwright/operations/readback runtime verification',
    'Pass-168/169/170 Module 18 Project persistence/security/browser completion verification'
  ],
  deliberateBoundary: 'Pass 174 never clears STAGE_8_REPAIR_HOLD_ACTIVE and never runs the final Module-24B Stage-8 acceptance gate. Pass 175 owns final re-audit, hold release and Stage-8 handoff.',
  nextPass: livePassed
    ? 'Pass 175 - Final repair audit, repair-hold release and Module-6 handoff.'
    : (lockfilePresent
        ? 'Provide the protected live environment and rerun audit-repair:live-chain:gate:live.'
        : 'Generate package-lock.json with npm run module-24a:lockfile on a machine with npm registry access, then run the guarded live chain.'),
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Pass 174 ${mode} live-chain evidence written to ${written}`);

if (!passed) process.exitCode = 1;
