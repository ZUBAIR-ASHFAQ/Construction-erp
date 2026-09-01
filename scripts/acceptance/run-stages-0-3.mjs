import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { writeEvidence } from '../foundation/gate-lib.mjs';

const modeArg = process.argv.find((value) => value.startsWith('--mode='))?.slice('--mode='.length) ?? 'static';
if (!['static', 'live'].includes(modeArg)) throw new Error('Stage 0-3 regression mode must be static or live.');
const mode = modeArg;
const evidencePath = path.resolve('acceptance-evidence', `stages-0-3-${mode}.json`);

const STATIC_STAGES = [
  {
    name: 'reproducible-baseline',
    script: 'baseline:static'
  },
  {
    name: 'foundation-stage-0',
    script: 'foundation:gate',
    evidenceFile: 'foundation-evidence/stage-0-static.json',
    expectedStatus: 'READY_FOR_STAGE_1_STATIC'
  },
  {
    name: 'module-24a-stage-1',
    script: 'module-24a:gate',
    evidenceFile: 'module-24a-evidence/stage-1-static.json',
    expectedStatus: 'STATIC_GATE_PASSED_LIVE_ACCEPTANCE_PENDING'
  },
  {
    name: 'module-18-stage-2',
    script: 'module-18:gate',
    evidenceFile: 'module-18-evidence/stage-2-static.json',
    expectedStatusPrefix: 'STAGE_2_STATIC_GATE_PASSED_'
  },
  {
    name: 'module-22-stage-3',
    script: 'module-22:gate',
    evidenceFile: 'module-22-evidence/stage-3-static.json',
    expectedStatusPrefix: 'STAGE_3_STATIC_GATE_PASSED_'
  }
];

const LIVE_STAGES = [
  {
    name: 'foundation-stage-0',
    script: 'foundation:acceptance:live',
    evidenceFile: 'foundation-evidence/stage-0-live.json',
    expectedStatus: 'READY_FOR_STAGE_1_LIVE'
  },
  {
    name: 'module-24a-stage-1',
    script: 'module-24a:acceptance:live',
    evidenceFile: 'module-24a-evidence/stage-1-live.json',
    expectedStatus: 'STAGE_1_ACCEPTED_READY_FOR_STAGE_2'
  },
  {
    name: 'module-18-stage-2',
    script: 'module-18:acceptance:live',
    evidenceFile: 'module-18-evidence/stage-2-live.json',
    expectedStatus: 'STAGE_2_ACCEPTED_READY_FOR_STAGE_3'
  },
  {
    name: 'module-22-stage-3',
    script: 'module-22:acceptance:live',
    evidenceFile: 'module-22-evidence/stage-3-live.json',
    expectedStatus: 'STAGE_3_ACCEPTED_READY_FOR_STAGE_4'
  }
];

/** Load simple KEY=VALUE files so the live runner can reuse the reviewed stage commands. */
async function loadEnvFile(filePath) {
  try {
    await access(filePath);
  } catch {
    return;
  }

  const source = await readFile(filePath, 'utf8');
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

/** Run one existing repository script and keep its output visible. */
function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', scriptName], {
      env: process.env,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${scriptName} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`));
    });
  });
}

/** Read one stage evidence file, returning null when that stage has not written evidence yet. */
async function readEvidence(filePath) {
  if (!filePath) return null;
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** Check that one stage wrote the acceptance status expected by this regression mode. */
function hasExpectedStatus(stage, evidence) {
  if (!stage.evidenceFile) return true;
  if (!evidence?.status) return false;
  if (stage.expectedStatus) return evidence.status === stage.expectedStatus;
  return evidence.status.startsWith(stage.expectedStatusPrefix);
}

/** Run one stage and verify that its evidence was refreshed by the current command. */
async function runStage(stage) {
  console.log(`\nRunning ${stage.name}: npm run ${stage.script}`);
  const previousEvidence = await readEvidence(stage.evidenceFile);

  try {
    await runScript(stage.script);
  } catch (error) {
    const evidence = await readEvidence(stage.evidenceFile);
    return {
      name: stage.name,
      script: stage.script,
      status: 'failed',
      evidenceFile: stage.evidenceFile ?? null,
      evidenceStatus: evidence?.status ?? null,
      evidenceGeneratedAt: evidence?.generatedAt ?? null,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  const evidence = await readEvidence(stage.evidenceFile);
  const evidenceRefreshed = !stage.evidenceFile || evidence?.generatedAt !== previousEvidence?.generatedAt;
  const evidenceAccepted = evidenceRefreshed && hasExpectedStatus(stage, evidence);

  return {
    name: stage.name,
    script: stage.script,
    status: evidenceAccepted ? 'passed' : 'failed',
    evidenceFile: stage.evidenceFile ?? null,
    evidenceStatus: evidence?.status ?? null,
    evidenceGeneratedAt: evidence?.generatedAt ?? null,
    error: evidenceAccepted ? null : 'STAGE_EVIDENCE_NOT_REFRESHED_OR_ACCEPTED'
  };
}

/** Run the selected Stage 0-3 sequence and stop immediately after the first failed stage. */
async function runSequence(stages) {
  const results = [];
  for (const stage of stages) {
    const result = await runStage(stage);
    results.push(result);
    if (result.status !== 'passed') break;
  }
  return results;
}

/** Report whether all four live stage evidence files already show accepted status. */
async function allLiveStagesAccepted() {
  for (const stage of LIVE_STAGES) {
    const evidence = await readEvidence(stage.evidenceFile);
    if (!hasExpectedStatus(stage, evidence)) return false;
  }
  return true;
}

if (mode === 'live') {
  await loadEnvFile('.env.test');
  await loadEnvFile('.env.migration');
  await loadEnvFile('.env.recovery');
}

console.log(`Running consolidated Stage 0-3 ${mode} regression.`);
const stages = mode === 'live' ? LIVE_STAGES : STATIC_STAGES;
const results = await runSequence(stages);
const passed = results.length === stages.length && results.every((result) => result.status === 'passed');
const liveStagesAccepted = await allLiveStagesAccepted();

const evidence = {
  formatVersion: 1,
  kind: `construction-erp-stages-0-3-${mode}-regression-evidence`,
  mode,
  generatedAt: new Date().toISOString(),
  status: passed
    ? (mode === 'live'
        ? 'STAGES_0_3_ACCEPTED_READY_FOR_MODULE_2'
        : (liveStagesAccepted
            ? 'STAGES_0_3_STATIC_REGRESSION_PASSED_LIVE_ACCEPTANCE_COMPLETE'
            : 'STAGES_0_3_STATIC_REGRESSION_PASSED_LIVE_ACCEPTANCE_PENDING'))
    : 'BLOCKED',
  coveredStages: ['Foundation', 'Module 24A', 'Module 18', 'Module 22'],
  liveStagesAccepted,
  nextStage: passed && mode === 'live'
    ? 'Module 2 - CRM & Client Management'
    : (passed ? 'Complete the Stage 0-3 live acceptance sequence' : 'Fix the first failed Stage 0-3 regression check'),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Consolidated Stage 0-3 evidence written to ${written}`);

if (!passed) {
  process.exitCode = 1;
} else if (mode === 'live') {
  console.log('Stages 0-3 are live-accepted. Module 2 CRM & Client Management may begin.');
} else {
  console.log('Stages 0-3 static regression passed. Live acceptance remains authoritative for deployment readiness.');
}
