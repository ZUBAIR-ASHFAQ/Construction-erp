import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEST_CONFIRMATION = 'RESET_CONSTRUCTION_ERP_TEST_DATABASE';
const PROTECTED = new Set(['postgres', 'template0', 'template1', 'construction_erp']);
const ALLOWED = /(integration[_-]?test|foundation[_-]?test|erp[_-]?test|test[_-]?erp)/i;

const here = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(here, '../..');
export const databaseDir = path.join(rootDir, 'packages/database');

/** Validate test database environment. */
export function validateTestDatabaseEnvironment(env = process.env) {
  if (env.TEST_DATABASE_CONFIRM !== TEST_CONFIRMATION) {
    throw new Error(`Set TEST_DATABASE_CONFIRM=${TEST_CONFIRMATION} before destructive Foundation database tests.`);
  }
  const raw = env.TEST_DATABASE_URL;
  if (!raw) throw new Error('TEST_DATABASE_URL is required.');

  let url;
  try { url = new URL(raw); } catch { throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('TEST_DATABASE_URL must be PostgreSQL.');

  const name = decodeURIComponent(url.pathname.replace(/^\//, '')).trim();
  if (!name || !ALLOWED.test(name)) throw new Error('Test database name is not visibly disposable/test-only.');
  if (PROTECTED.has(name.toLowerCase())) throw new Error(`Refusing protected database: ${name}`);
  return { databaseUrl: raw, databaseName: name };
}

/** Run one child-process command and reject when it fails. */
export function run(command, args, { cwd = rootDir, env = process.env, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
      shell: process.platform === 'win32'
    });
    if (input !== undefined) child.stdin.end(input);
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`));
    });
  });
}
