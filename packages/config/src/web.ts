import { ConfigurationError, type ConfigurationIssue } from './errors.js';
import { parseEnum, parseHttpUrl, readTrimmed, type EnvironmentSource } from './parsers.js';

const WEB_MODE_VALUES = ['development', 'test', 'production'] as const;

export type WebMode = (typeof WEB_MODE_VALUES)[number];

export type WebConfig = Readonly<{
  mode: WebMode;
  appName: string;
  apiBaseUrl: string;
}>;

/**
 * Explicit allow-list for browser-visible configuration. Only values returned
 * here are safe to pass into the React application. Never add credentials,
 * connection strings, tokens, private keys, or storage secrets to this type.
 */
export function loadWebConfig(env: EnvironmentSource): WebConfig {
  const issues: ConfigurationIssue[] = [];

  const mode = parseEnum(
    readTrimmed(env, 'MODE'),
    'MODE',
    WEB_MODE_VALUES,
    'development',
    issues
  );

  const appName = readTrimmed(env, 'VITE_APP_NAME') ?? 'Construction ERP';
  const parsedApiBaseUrl = parseHttpUrl(
    readTrimmed(env, 'VITE_API_BASE_URL') ?? 'http://localhost:3000/api/v1',
    'VITE_API_BASE_URL',
    issues,
    { required: true }
  );

  if (issues.length > 0 || parsedApiBaseUrl === null) {
    throw new ConfigurationError(issues);
  }

  return Object.freeze({
    mode,
    appName,
    apiBaseUrl: parsedApiBaseUrl
  });
}
