import { ConfigurationError, type ConfigurationIssue } from './errors.js';
import { parseInteger, readTrimmed, type EnvironmentSource } from './parsers.js';
import type { NodeEnvironment } from './server.js';

export type OperationsConfig = Readonly<{
  exposeDiagnostics: boolean;
  readinessTimeoutMs: number;
  staleLeaseSeconds: number;
}>;

/** Parse boolean. */
function parseBoolean(
  value: string | undefined,
  key: string,
  defaultValue: boolean,
  issues: ConfigurationIssue[]
): boolean {
  if (value === undefined) return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  issues.push({ key, message: 'must be true or false', received: value });
  return defaultValue;
}

/**
 * Diagnostics are opt-in in production because Foundation has not generated
 * Administration yet. Health/readiness remain available; metrics/queue/outbox
 * surfaces should sit behind the deployment's private monitoring boundary.
 */
export function loadOperationsConfig(
  env: EnvironmentSource,
  nodeEnv: NodeEnvironment,
  externalIssues?: ConfigurationIssue[]
): OperationsConfig {
  const issues = externalIssues ?? [];

  const exposeDiagnostics = parseBoolean(
    readTrimmed(env, 'OPERATIONS_DIAGNOSTICS_ENABLED'),
    'OPERATIONS_DIAGNOSTICS_ENABLED',
    nodeEnv !== 'production',
    issues
  );

  const readinessTimeoutMs = parseInteger(
    readTrimmed(env, 'OPERATIONS_READINESS_TIMEOUT_MS'),
    'OPERATIONS_READINESS_TIMEOUT_MS',
    { defaultValue: 2000, min: 100, max: 30000 },
    issues
  );

  const staleLeaseSeconds = parseInteger(
    readTrimmed(env, 'OPERATIONS_STALE_LEASE_SECONDS'),
    'OPERATIONS_STALE_LEASE_SECONDS',
    { defaultValue: 300, min: 5, max: 86400 },
    issues
  );

  if (externalIssues === undefined && issues.length > 0) throw new ConfigurationError(issues);

  return Object.freeze({ exposeDiagnostics, readinessTimeoutMs, staleLeaseSeconds });
}
