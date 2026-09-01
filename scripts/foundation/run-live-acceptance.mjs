import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const FOUNDATION_CONFIRM = 'RUN_CONSTRUCTION_ERP_FOUNDATION_LIVE_GATE';
const MIGRATION_CONFIRM = 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE';
const TEST_CONFIRM = 'RESET_CONSTRUCTION_ERP_TEST_DATABASE';
const RECOVERY_CONFIRM = 'RUN_CONSTRUCTION_ERP_RECOVERY_DRILL';
const RESTORE_CONFIRM = 'RESTORE_CONSTRUCTION_ERP_DATA';

/** Return one required environment value without printing its secret content. */
function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Foundation live acceptance.`);
  return value;
}

/** Require an exact safety confirmation before a destructive live check runs. */
function requireConfirmation(name, expected) {
  if (process.env[name] !== expected) {
    throw new Error(`Set ${name}=${expected} before running Foundation live acceptance.`);
  }
}

/** Run one reviewed repository command and stop when it fails. */
function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`));
    });
  });
}

/** Build one fresh backup location shared by the PostgreSQL and object-storage drill. */
function createRecoveryEnvironment() {
  const backupId = process.env.RECOVERY_BACKUP_ID?.trim() || `foundation-live-${new Date().toISOString().replace(/[-:.]/g, '')}`;
  const backupRoot = path.resolve(process.env.RECOVERY_BACKUP_DIR?.trim() || 'backups');
  const backupDirectory = path.join(backupRoot, backupId);

  return {
    ...process.env,
    RECOVERY_BACKUP_ID: backupId,
    RECOVERY_BACKUP_DIR: backupRoot,
    RECOVERY_POSTGRES_BACKUP_DIR: path.join(backupDirectory, 'postgres'),
    RECOVERY_STORAGE_BACKUP_DIR: path.join(backupDirectory, 'object-storage'),
  };
}

/** Verify the live Foundation environment before running builds, backups or destructive database work. */
function verifyLiveEnvironment() {
  requiredEnv('DATABASE_URL');
  requiredEnv('MIGRATION_TEST_DATABASE_URL');
  requiredEnv('TEST_DATABASE_URL');
  requiredEnv('RESTORE_DATABASE_URL');
  requiredEnv('STORAGE_ENDPOINT');
  requiredEnv('STORAGE_BUCKET');
  requiredEnv('STORAGE_ACCESS_KEY_ID');
  requiredEnv('STORAGE_SECRET_ACCESS_KEY');
  requiredEnv('RESTORE_STORAGE_ENDPOINT');
  requiredEnv('RESTORE_STORAGE_BUCKET');
  requiredEnv('RESTORE_STORAGE_ACCESS_KEY_ID');
  requiredEnv('RESTORE_STORAGE_SECRET_ACCESS_KEY');

  requireConfirmation('FOUNDATION_LIVE_GATE_CONFIRM', FOUNDATION_CONFIRM);
  requireConfirmation('MIGRATION_TEST_CONFIRM', MIGRATION_CONFIRM);
  requireConfirmation('TEST_DATABASE_CONFIRM', TEST_CONFIRM);
  requireConfirmation('RECOVERY_DRILL_CONFIRM', RECOVERY_CONFIRM);
  requireConfirmation('RESTORE_CONFIRM', RESTORE_CONFIRM);

  if (process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
    throw new Error('Set RUN_FOUNDATION_DB_TESTS=1 before running Foundation live acceptance.');
  }
}

verifyLiveEnvironment();
const liveEnv = createRecoveryEnvironment();

console.log('Running Foundation Stage-0 live acceptance.');
console.log('Step 1/4: verify the reproducible baseline.');
await run('pnpm', ['baseline:full'], liveEnv);

console.log('Step 2/4: create a fresh PostgreSQL backup for the restore drill.');
await run('pnpm', ['recovery:backup:postgres'], liveEnv);

console.log('Step 3/4: create a fresh object-storage backup for the restore drill.');
await run('pnpm', ['recovery:backup:storage'], liveEnv);

console.log('Step 4/4: run the complete Foundation Stage-0 live gate and restore verification.');
await run('pnpm', ['foundation:gate:live'], liveEnv);

console.log('Foundation live acceptance complete: Foundation Stage-0 live acceptance passed with fresh PostgreSQL and object-storage recovery evidence.');
