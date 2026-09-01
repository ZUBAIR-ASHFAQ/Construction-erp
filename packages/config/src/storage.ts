import { ConfigurationError, type ConfigurationIssue } from './errors.js';
import {
  parseHttpUrl,
  parseInteger,
  readTrimmed,
  type EnvironmentSource
} from './parsers.js';
import type { NodeEnvironment } from './server.js';

export type StorageConfig = Readonly<{
  provider: 's3';
  endpoint: string | null;
  region: string;
  bucket: string;
  forcePathStyle: boolean;
  accessKeyId: string | null;
  secretAccessKey: string | null;
  maxSignedUrlTtlSeconds: number;
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
 * Server-only S3-compatible object-storage configuration. Credential values are
 * deliberately excluded from configuration error diagnostics.
 */
export function loadStorageConfig(
  env: EnvironmentSource,
  nodeEnv: NodeEnvironment,
  externalIssues?: ConfigurationIssue[]
): StorageConfig {
  const issues = externalIssues ?? [];
  const endpoint = parseHttpUrl(
    readTrimmed(env, 'STORAGE_ENDPOINT') ?? (nodeEnv === 'development' ? 'http://localhost:9000' : undefined),
    'STORAGE_ENDPOINT',
    issues
  );

  const region = readTrimmed(env, 'STORAGE_REGION') ?? 'us-east-1';
  const bucket = readTrimmed(env, 'STORAGE_BUCKET') ?? (nodeEnv === 'production' ? '' : 'construction-erp');
  if (!bucket) issues.push({ key: 'STORAGE_BUCKET', message: 'is required in production' });
  if (bucket && !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    issues.push({ key: 'STORAGE_BUCKET', message: 'must be a valid S3-compatible bucket name', received: bucket });
  }

  const accessKeyId = readTrimmed(env, 'STORAGE_ACCESS_KEY_ID') ?? null;
  const secretAccessKey = readTrimmed(env, 'STORAGE_SECRET_ACCESS_KEY') ?? null;
  if ((accessKeyId === null) !== (secretAccessKey === null)) {
    if (accessKeyId === null) issues.push({ key: 'STORAGE_ACCESS_KEY_ID', message: 'is required when STORAGE_SECRET_ACCESS_KEY is set' });
    if (secretAccessKey === null) issues.push({ key: 'STORAGE_SECRET_ACCESS_KEY', message: 'is required when STORAGE_ACCESS_KEY_ID is set' });
  }

  const forcePathStyle = parseBoolean(
    readTrimmed(env, 'STORAGE_FORCE_PATH_STYLE'),
    'STORAGE_FORCE_PATH_STYLE',
    endpoint !== null,
    issues
  );

  const maxSignedUrlTtlSeconds = parseInteger(
    readTrimmed(env, 'STORAGE_MAX_SIGNED_URL_TTL_SECONDS'),
    'STORAGE_MAX_SIGNED_URL_TTL_SECONDS',
    { defaultValue: 300, min: 30, max: 3600 },
    issues
  );

  if (externalIssues === undefined && issues.length > 0) throw new ConfigurationError(issues);

  return Object.freeze({
    provider: 's3',
    endpoint,
    region,
    bucket,
    forcePathStyle,
    accessKeyId,
    secretAccessKey,
    maxSignedUrlTtlSeconds
  });
}
