import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const LIVE_GATE_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_FOUNDATION_LIVE_GATE';

/** Run step. */
export function runStep(name, command, args, { env = process.env, cwd = process.cwd() } = {}) {
  const startedAt = new Date();
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { stderr += chunk; process.stderr.write(chunk); });
    child.on('error', (error) => {
      resolve({ name, status: 'failed', startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), code: null, signal: null, errorCode: error.code ?? 'SPAWN_FAILED' });
    });
    child.on('exit', (code, signal) => {
      resolve({ name, status: code === 0 ? 'passed' : 'failed', startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), code, signal: signal ?? null });
    });
  });
}

/** Write evidence. */
export async function writeEvidence(filePath, evidence) {
  const target = path.resolve(filePath);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return target;
}

/** Return safe environment summary. */
export function safeEnvironmentSummary(env = process.env) {
  return Object.freeze({
    nodeVersion: process.version,
    nodeEnv: env.NODE_ENV ?? null,
    liveDatabaseTestsEnabled: env.RUN_FOUNDATION_DB_TESTS === '1',
    recoveryDrillConfirmed: env.RECOVERY_DRILL_CONFIRM === 'RUN_CONSTRUCTION_ERP_RECOVERY_DRILL',
    // Never include URLs, usernames, passwords, access keys, bucket credentials or tokens.
    restoreDatabaseConfigured: Boolean(env.RESTORE_DATABASE_URL),
    restoreStorageBucketConfigured: Boolean(env.RESTORE_STORAGE_BUCKET)
  });
}
