import { access, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import process from 'node:process';

/** Load a simple KEY=VALUE environment file without introducing another runtime dependency. */
async function loadEnvFile(filePath) {
  try {
    await access(filePath);
  } catch {
    return false;
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
  return true;
}

/** Run one command with inherited stdio and reject on failure. */
function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`));
    });
  });
}

await loadEnvFile('.env.test');
await loadEnvFile('.env.migration');

try {
  await access('package-lock.json');
} catch {
  console.log('The package lockfile is missing; generating it before live acceptance.');
  await run('npm', ['run', 'module-24a:lockfile']);
}

const env = {
  ...process.env,
  MODULE_24A_LIVE_GATE_CONFIRM: 'RUN_CONSTRUCTION_ERP_MODULE_24A_LIVE_GATE',
  TEST_DATABASE_CONFIRM: 'RESET_CONSTRUCTION_ERP_TEST_DATABASE',
  MIGRATION_TEST_CONFIRM: 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE',
  RUN_FOUNDATION_DB_TESTS: '1',
  RUN_MODULE_24A_AUDIT_GUARD: '1',
  RUN_MODULE_24A_E2E: '1',
};

console.log('Running Module 24A Stage-1 live acceptance. This command is destructive only against explicitly named disposable test databases.');
await run('npm', ['run', 'module-24a:gate:live'], env);
console.log('Module 24A live acceptance complete: verify module-24a-evidence/stage-1-live.json reports STAGE_1_ACCEPTED_READY_FOR_STAGE_2 before beginning Module 18.');
