import { ConfigurationError, type ConfigurationIssue } from './errors.js';
import {
  parseEnum,
  parseHttpUrl,
  parseHttpUrlList,
  parseInteger,
  readTrimmed,
  type EnvironmentSource
} from './parsers.js';
import { DEVELOPMENT_DATABASE_URL, type DatabaseConfig } from './database.js';
import { loadStorageConfig, type StorageConfig } from './storage.js';
import { loadOperationsConfig, type OperationsConfig } from './operations.js';

const NODE_ENV_VALUES = ['development', 'test', 'production'] as const;
const LOG_LEVEL_VALUES = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type NodeEnvironment = (typeof NODE_ENV_VALUES)[number];
export type LogLevel = (typeof LOG_LEVEL_VALUES)[number];

export type ServerConfig = Readonly<{
  nodeEnv: NodeEnvironment;
  appName: string;
  host: string;
  port: number;
  logLevel: LogLevel;
  publicUrl: string | null;
  webOrigins: readonly string[];
  shutdownGraceMs: number;
  database: DatabaseConfig;
  storage: StorageConfig;
  operations: OperationsConfig;
  authActionTokenSecret: string;
  authActionPublicUrl: string;
  authNotificationWebhookUrl: string | null;
  authNotificationWebhookToken: string | null;
}>;

/** Parse database url. */
function parseDatabaseUrl(
  value: string | undefined,
  required: boolean,
  issues: ConfigurationIssue[]
): string {
  if (!value) {
    if (required) {
      issues.push({ key: 'DATABASE_URL', message: 'is required in production' });
    }
    return DEVELOPMENT_DATABASE_URL;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
      issues.push({
        key: 'DATABASE_URL',
        message: 'must use the postgresql:// or postgres:// protocol'
      });
      return value;
    }
    if (!url.hostname) {
      issues.push({ key: 'DATABASE_URL', message: 'must include a database host' });
    }
    if (!url.pathname || url.pathname === '/') {
      issues.push({ key: 'DATABASE_URL', message: 'must include a database name' });
    }
    return value;
  } catch {
    // DATABASE_URL is secret-bearing. Never put its received value into issues.
    issues.push({ key: 'DATABASE_URL', message: 'must be a valid PostgreSQL connection URL' });
    return value;
  }
}

/**
 * Loads server-only configuration. DATABASE_URL is intentionally kept on this
 * boundary and is never exported through browser/public configuration.
 */
export function loadServerConfig(env: EnvironmentSource): ServerConfig {
  const issues: ConfigurationIssue[] = [];

  const nodeEnv = parseEnum(
    readTrimmed(env, 'NODE_ENV'),
    'NODE_ENV',
    NODE_ENV_VALUES,
    'development',
    issues
  );

  const appName = readTrimmed(env, 'APP_NAME') ?? 'Construction ERP';
  const host = readTrimmed(env, 'API_HOST') ?? '0.0.0.0';
  const port = parseInteger(readTrimmed(env, 'API_PORT'), 'API_PORT', {
    defaultValue: 3000,
    min: 1,
    max: 65535
  }, issues);
  const logLevel = parseEnum(
    readTrimmed(env, 'LOG_LEVEL'),
    'LOG_LEVEL',
    LOG_LEVEL_VALUES,
    'info',
    issues
  );

  const publicUrl = parseHttpUrl(
    readTrimmed(env, 'API_PUBLIC_URL'),
    'API_PUBLIC_URL',
    issues,
    { required: nodeEnv === 'production' }
  );

  const webOrigins = parseHttpUrlList(
    readTrimmed(env, 'WEB_ORIGINS'),
    'WEB_ORIGINS',
    issues,
    nodeEnv === 'production' ? [] : ['http://localhost:5173']
  );

  if (nodeEnv === 'production' && webOrigins.length === 0) {
    issues.push({ key: 'WEB_ORIGINS', message: 'at least one origin is required in production' });
  }

  const shutdownGraceMs = parseInteger(
    readTrimmed(env, 'SHUTDOWN_GRACE_MS'),
    'SHUTDOWN_GRACE_MS',
    { defaultValue: 10_000, min: 1_000, max: 120_000 },
    issues
  );

  const databaseUrl = parseDatabaseUrl(
    readTrimmed(env, 'DATABASE_URL'),
    nodeEnv === 'production',
    issues
  );

  const authActionTokenSecret = readTrimmed(env, 'AUTH_ACTION_TOKEN_SECRET')
    ?? (nodeEnv === 'production' ? '' : 'development-only-auth-action-secret-change-me');
  if (authActionTokenSecret.length < 32) {
    issues.push({ key: 'AUTH_ACTION_TOKEN_SECRET', message: 'must contain at least 32 characters' });
  }

  const authActionPublicUrl = parseHttpUrl(
    readTrimmed(env, 'AUTH_ACTION_PUBLIC_URL') ?? webOrigins[0],
    'AUTH_ACTION_PUBLIC_URL',
    issues,
    { required: true }
  );
  const authNotificationWebhookUrl = parseHttpUrl(
    readTrimmed(env, 'AUTH_NOTIFICATION_WEBHOOK_URL'),
    'AUTH_NOTIFICATION_WEBHOOK_URL',
    issues
  );
  const authNotificationWebhookToken = readTrimmed(env, 'AUTH_NOTIFICATION_WEBHOOK_TOKEN') ?? null;

  const storage = loadStorageConfig(env, nodeEnv, issues);
  const operations = loadOperationsConfig(env, nodeEnv, issues);

  if (issues.length > 0 || authActionPublicUrl === null) {
    throw new ConfigurationError(issues);
  }

  return Object.freeze({
    nodeEnv,
    appName,
    host,
    port,
    logLevel,
    publicUrl,
    webOrigins: Object.freeze([...webOrigins]),
    shutdownGraceMs,
    database: Object.freeze({ url: databaseUrl }),
    storage,
    operations,
    authActionTokenSecret,
    authActionPublicUrl,
    authNotificationWebhookUrl,
    authNotificationWebhookToken
  });
}
