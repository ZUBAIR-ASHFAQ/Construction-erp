import { createHash } from 'node:crypto';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const RESTORE_CONFIRMATION = 'RESTORE_CONSTRUCTION_ERP_DATA';
export const LIVE_DRILL_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_RECOVERY_DRILL';
const DISPOSABLE_DATABASE_PATTERN = /(restore|recovery|drill|foundation[_-]?test|integration[_-]?test)/i;
const PROTECTED_DATABASES = new Set(['postgres', 'template0', 'template1', 'construction_erp']);

/** Read one required recovery environment variable. */
export function requiredEnv(name, env = process.env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

/** Parse postgres connection. */
export function parsePostgresConnection(raw, label = 'DATABASE_URL') {
  let url;
  try { url = new URL(raw); } catch { throw new Error(`${label} must be a valid PostgreSQL URL.`); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error(`${label} must use PostgreSQL.`);
  const database = decodeURIComponent(url.pathname.replace(/^\//, '')).trim();
  if (!database) throw new Error(`${label} must include a database name.`);
  return Object.freeze({
    host: url.hostname,
    port: url.port || '5432',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    sslMode: url.searchParams.get('sslmode') ?? undefined
  });
}

/** Return postgres process env. */
export function postgresProcessEnv(connection, base = process.env) {
  return {
    ...base,
    PGHOST: connection.host,
    PGPORT: connection.port,
    PGUSER: connection.user,
    PGPASSWORD: connection.password,
    PGDATABASE: connection.database,
    ...(connection.sslMode ? { PGSSLMODE: connection.sslMode } : {})
  };
}

/** Validate restore target. */
export function assertRestoreTarget(connection, env = process.env) {
  if (env.RESTORE_CONFIRM !== RESTORE_CONFIRMATION) {
    throw new Error(`Set RESTORE_CONFIRM=${RESTORE_CONFIRMATION} before any destructive restore.`);
  }
  const name = connection.database.toLowerCase();
  const disposable = DISPOSABLE_DATABASE_PATTERN.test(name) && !PROTECTED_DATABASES.has(name);
  if (!disposable && env.RECOVERY_ALLOW_PRODUCTION_RESTORE !== '1') {
    throw new Error('Restore target is not visibly disposable. Set RECOVERY_ALLOW_PRODUCTION_RESTORE=1 only during an approved production recovery.');
  }
}

/** Ensure directory. */
export async function ensureDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return directory;
}

/** Return safe backup directory. */
export function safeBackupDirectory(raw) {
  const resolved = path.resolve(raw);
  if (resolved === path.parse(resolved).root) throw new Error('Backup directory must not be the filesystem root.');
  return resolved;
}

/** Return sha256 file. */
export async function sha256File(filePath) {
  const { createReadStream } = await import('node:fs');
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

/** Write json. */
export async function writeJson(filePath, value) {
  await ensureDirectory(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

/** Read json. */
export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

/** Validate file. */
export async function assertFile(filePath) {
  await access(filePath);
  const info = await stat(filePath);
  if (!info.isFile() || info.size === 0) throw new Error(`Expected non-empty backup file: ${filePath}`);
  return info;
}

/** Run one child-process command and reject when it fails. */
export function run(command, args, { cwd, env = process.env, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (value) => { stdout += value; });
      child.stderr.on('data', (value) => { stderr += value; });
    }
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`));
    });
  });
}

/** Return utc stamp. */
export function utcStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
