import type { DatabaseClient } from '@construction-erp/database';
import type { ObjectStorage } from '@construction-erp/storage';
import type { DependencyHealth, LivenessReport, ReadinessReport } from './types.js';

export type ReadinessDependencies = Readonly<{
  database?: DatabaseClient;
  storage?: ObjectStorage;
}>;

const DEFAULT_TIMEOUT_MS = 2_000;

/** Return elapsed ms. */
function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round((performance.now() - startedAt) * 1000) / 1000);
}

/** Return with timeout. */
async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('DEPENDENCY_TIMEOUT')), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Return not configured. */
function notConfigured(): DependencyHealth {
  return Object.freeze({ status: 'not-configured', latencyMs: 0, code: 'DEPENDENCY_NOT_CONFIGURED' });
}

/** Return database health. */
async function databaseHealth(database: DatabaseClient | undefined, timeoutMs: number): Promise<DependencyHealth> {
  if (!database) return notConfigured();
  const startedAt = performance.now();
  try {
    await withTimeout(database.$queryRaw`SELECT 1`, timeoutMs);
    return Object.freeze({ status: 'ok', latencyMs: elapsedMs(startedAt) });
  } catch (error) {
    const code = error instanceof Error && error.message === 'DEPENDENCY_TIMEOUT'
      ? 'DEPENDENCY_TIMEOUT'
      : 'DATABASE_UNAVAILABLE';
    return Object.freeze({ status: 'error', latencyMs: elapsedMs(startedAt), code });
  }
}

/** Return storage health. */
async function storageHealth(storage: ObjectStorage | undefined, timeoutMs: number): Promise<DependencyHealth> {
  if (!storage) return notConfigured();
  const startedAt = performance.now();
  try {
    const result = await withTimeout(storage.checkHealth(), timeoutMs);
    if (result.status === 'ok') {
      return Object.freeze({ status: 'ok', latencyMs: elapsedMs(startedAt) });
    }
    return Object.freeze({ status: 'error', latencyMs: elapsedMs(startedAt), code: 'STORAGE_UNAVAILABLE' });
  } catch (error) {
    const code = error instanceof Error && error.message === 'DEPENDENCY_TIMEOUT'
      ? 'DEPENDENCY_TIMEOUT'
      : 'STORAGE_UNAVAILABLE';
    return Object.freeze({ status: 'error', latencyMs: elapsedMs(startedAt), code });
  }
}

/** Return liveness report. */
export function getLivenessReport(service: string): LivenessReport {
  return Object.freeze({
    status: 'ok',
    service: service.trim() || 'construction-erp',
    checkedAt: new Date().toISOString(),
    uptimeSeconds: Math.max(0, Math.round(process.uptime() * 1000) / 1000)
  });
}

/** Return readiness report. */
export async function getReadinessReport(
  service: string,
  dependencies: ReadinessDependencies,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<ReadinessReport> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    throw new Error('timeoutMs must be an integer between 100 and 30000.');
  }

  const [database, storage] = await Promise.all([
    databaseHealth(dependencies.database, timeoutMs),
    storageHealth(dependencies.storage, timeoutMs)
  ]);

  const ready = database.status === 'ok' && storage.status === 'ok';
  return Object.freeze({
    status: ready ? 'ready' : 'not-ready',
    service: service.trim() || 'construction-erp',
    checkedAt: new Date().toISOString(),
    dependencies: Object.freeze({ database, storage })
  });
}
