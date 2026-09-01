import { access, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import process from 'node:process';

const ACCEPTED_STAGE_2 = 'STAGE_2_ACCEPTED_READY_FOR_STAGE_3';

/** Load a simple KEY=VALUE environment file without adding another dependency. */
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

/** Run one command with visible output and fail when the command fails. */
function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env,
      shell: process.platform === 'win32'
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`));
    });
  });
}

await loadEnvFile('.env.test');
await loadEnvFile('.env.migration');

let stage2Accepted = false;
try {
  const evidence = JSON.parse(await readFile('module-18-evidence/stage-2-live.json', 'utf8'));
  stage2Accepted = evidence.status === ACCEPTED_STAGE_2;
} catch {
  // The live gate writes a clear blocked evidence file when the prerequisite is missing.
}

const env = {
  ...process.env,
  MODULE_22_LIVE_GATE_CONFIRM: 'RUN_CONSTRUCTION_ERP_MODULE_22_LIVE_GATE',
  TEST_DATABASE_CONFIRM: 'RESET_CONSTRUCTION_ERP_TEST_DATABASE',
  MIGRATION_TEST_CONFIRM: 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE',
  RUN_FOUNDATION_DB_TESTS: '1',
  RUN_MODULE_24A_AUDIT_GUARD: '1',
  RUN_MODULE_24A_E2E: '0',
  RUN_MODULE_18_E2E: '0',
  RUN_MODULE_22_E2E: '1'
};

if (!stage2Accepted) {
  console.log('Module 18 live Stage-2 acceptance is still missing. Run npm run module-18:acceptance:live first.');
}

if (stage2Accepted) {
  try {
    await access('package-lock.json');
  } catch {
    console.log('package-lock.json is missing; generating it before the live Stage-3 gate.');
    await run('npm', ['run', 'module-24a:lockfile'], env);
  }
}

console.log('Running Module 22 Stage-3 live acceptance. Only explicitly disposable test databases may be reset.');
try {
  await run('npm', ['run', 'module-22:gate:live'], env);
  console.log('Module 22 live acceptance complete: module-22-evidence/stage-3-live.json reports STAGE_3_ACCEPTED_READY_FOR_STAGE_4.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error('Module 22 live acceptance is blocked. Check module-22-evidence/stage-3-live.json for the first failed gate.');
  process.exitCode = 1;
}
