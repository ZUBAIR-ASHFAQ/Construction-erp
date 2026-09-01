import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const PASS_174_LIVE_VERIFIED = 'PASS_174_DEPENDENCY_AND_LIVE_ACCEPTANCE_VERIFIED_READY_FOR_PASS_175';
const STAGE_8_ACCEPTED = 'STAGE_8_ACCEPTED_READY_FOR_STAGE_9';
const REPAIR_HOLD_ACTIVE = 'STAGE_8_REPAIR_HOLD_ACTIVE';
const REPAIR_HOLD_CLEARED = 'STAGE_8_REPAIR_HOLD_CLEARED';
const FINAL_HANDOFF_CONFIRMATION = 'RUN_PASS_175_FINAL_STAGE_8_HANDOFF';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = mode === 'live'
  ? 'acceptance-evidence/pass-175-final-handoff-live.json'
  : 'acceptance-evidence/pass-175-final-handoff.json';

if (!['static', 'live'].includes(mode)) {
  throw new Error('Pass-175 final handoff mode must be static or live.');
}

/** Read one JSON evidence file and return null when it is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Create one local result with the same shape as child-process gate results. */
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

/** Run the final dependency-free repair audit before any hold-release decision. */
async function runStaticChecks(results) {
  const steps = [
    ['pass-175-focused-final-audit', 'node', ['--test', 'tests/pass-175-final-repair-audit.test.mjs']],
    ['pass-173-consolidated-regression', 'npm', ['run', 'audit-repair:regression:gate']],
    ['module-24b-final-static-gate', 'npm', ['run', 'module-24b:gate']],
    ['workspace-and-required-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }
}

/** Persist the final cleared repair hold only after genuine Stage-8 live acceptance succeeds. */
async function clearRepairHold(pass174, stage8) {
  return writeEvidence('module-24b-evidence/stage-8-repair-hold.json', {
    formatVersion: 1,
    kind: 'construction-erp-stage-8-audit-repair-hold',
    generatedAt: new Date().toISOString(),
    status: REPAIR_HOLD_CLEARED,
    openedByPass: 165,
    clearedByPass: 175,
    reason: 'Passes 165-173 repaired and re-audited the cumulative gaps, Pass 174 completed genuine dependency-backed/live verification, and the final Module 24B Stage-8 live gate passed.',
    pass174LiveStatus: pass174.status,
    stage8LiveStatus: stage8.status,
    module6Allowed: true
  });
}

const pass174 = await readJson('acceptance-evidence/pass-174-live-chain-live.json');
const repairHold = await readJson('module-24b-evidence/stage-8-repair-hold.json');
const pass174LiveVerified = pass174?.status === PASS_174_LIVE_VERIFIED && pass174?.runtimeVerificationComplete === true;
const repairHoldActive = repairHold?.status === REPAIR_HOLD_ACTIVE && repairHold?.module6Allowed === false;
const repairHoldAlreadyCleared = repairHold?.status === REPAIR_HOLD_CLEARED && repairHold?.module6Allowed === true;
const results = [];
let blockReason = null;

await runStaticChecks(results);
const staticPassed = results.length === 5 && results.every((result) => result.status === 'passed');

if (mode === 'live' && staticPassed) {
  if (repairHoldAlreadyCleared) {
    const existingStage8 = await readJson('module-24b-evidence/stage-8-live.json');
    if (existingStage8?.status === STAGE_8_ACCEPTED && pass174LiveVerified) {
      results.push(localResult('stage-8-repair-hold-already-cleared', 'passed'));
    } else {
      results.push(localResult('stage-8-repair-hold-state', 'failed', 'INVALID_CLEARED_HOLD_EVIDENCE'));
      blockReason = 'INVALID_CLEARED_HOLD_EVIDENCE';
    }
  } else if (!repairHoldActive) {
    results.push(localResult('stage-8-repair-hold-state', 'failed', 'STAGE_8_REPAIR_HOLD_STATE_INVALID'));
    blockReason = 'STAGE_8_REPAIR_HOLD_STATE_INVALID';
  } else if (!pass174LiveVerified) {
    results.push(localResult('pass-174-live-prerequisite', 'failed', 'PASS_174_LIVE_ACCEPTANCE_REQUIRED'));
    blockReason = 'PASS_174_LIVE_ACCEPTANCE_REQUIRED';
  } else {
    const finalEnv = {
      ...process.env,
      PASS_175_FINAL_HANDOFF_CONFIRM: FINAL_HANDOFF_CONFIRMATION
    };
    const finalGate = await runStep('module-24b-final-stage-8-live-gate', 'npm', ['run', 'module-24b:gate:live'], { env: finalEnv });
    results.push(finalGate);

    if (finalGate.status === 'passed') {
      const stage8 = await readJson('module-24b-evidence/stage-8-live.json');
      if (stage8?.status === STAGE_8_ACCEPTED) {
        await clearRepairHold(pass174, stage8);
        results.push(localResult('stage-8-repair-hold-release', 'passed'));
      } else {
        results.push(localResult('stage-8-final-evidence', 'failed', 'STAGE_8_FINAL_ACCEPTANCE_EVIDENCE_REQUIRED'));
        blockReason = 'STAGE_8_FINAL_ACCEPTANCE_EVIDENCE_REQUIRED';
      }
    } else {
      blockReason = 'STAGE_8_FINAL_LIVE_GATE_FAILED';
    }
  }
}

const finalHold = await readJson('module-24b-evidence/stage-8-repair-hold.json');
const finalHoldCleared = finalHold?.status === REPAIR_HOLD_CLEARED && finalHold?.module6Allowed === true;
const livePassed = mode === 'live'
  && staticPassed
  && pass174LiveVerified
  && finalHoldCleared
  && results.every((result) => result.status === 'passed');
const status = mode === 'static'
  ? (staticPassed
      ? (pass174LiveVerified
          ? 'PASS_175_FINAL_REPAIR_AUDIT_STATIC_PASSED_READY_FOR_LIVE_HANDOFF'
          : 'PASS_175_FINAL_REPAIR_AUDIT_STATIC_PASSED_PASS_174_LIVE_ACCEPTANCE_REQUIRED')
      : 'BLOCKED')
  : (livePassed ? 'PASS_175_FINAL_REPAIR_AUDIT_ACCEPTED_READY_FOR_MODULE_6' : 'BLOCKED');

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-pass-175-final-repair-audit-and-stage-8-handoff',
  generatedAt: new Date().toISOString(),
  pass: 175,
  mode,
  status,
  blockReason,
  finalRepairAuditPassed: staticPassed,
  pass174LiveVerified,
  stage8RepairHoldStatus: finalHold?.status ?? null,
  repairHoldCleared: finalHoldCleared,
  runtimeVerificationComplete: livePassed,
  module6Allowed: livePassed,
  auditedThroughPass: 174,
  verifiedRepairAreas: [
    'Project member read-before-replace and safe React round-trip',
    'User COMPANY/PROJECT role assignment read-before-replace and completeness protection',
    'Module 18 nullable Project relationships and same-company foreign keys',
    'Module 18 exact Project repository/service/API/browser isolation',
    'CRM Client links to existing Tender and Project registers',
    'BOQ CSV import through the reviewed whole-set item replacement command',
    'junior-readable service orchestration and function-purpose comments',
    'required Fastify/TypeScript/Prisma/PostgreSQL and React/Vite workspace structure',
    'migration inventory and final Module 24B Stage-8 acceptance boundary'
  ],
  unresolvedContractDecisionsNotSilentlyInvented: [
    'Project suspend/resume command remains source-contract reconciliation work because the workflow names suspension but the reviewed route table defines no command.',
    'Persistent cross-session BOQ revision reading remains source-contract reconciliation work because the reviewed route table defines no revision-read endpoint.',
    'Further Approval Project-context integration remains deferred to its explicit later source-module integration gate.'
  ],
  nextStage: livePassed
    ? 'Module 6 - WBS & Cost Codes'
    : (pass174LiveVerified
        ? 'Run audit-repair:final:gate:live with the protected live environment to complete the final Stage-8 handoff.'
        : 'Complete Pass 174 dependency-backed/live acceptance first; Module 6 remains blocked.'),
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Pass 175 ${mode} final handoff evidence written to ${written}`);

if ((mode === 'static' && !staticPassed) || (mode === 'live' && !livePassed)) process.exitCode = 1;
