import type { ConfigurationIssue } from './errors.js';

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

/** Read trimmed. */
export function readTrimmed(
  env: EnvironmentSource,
  key: string
): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

/** Parse integer. */
export function parseInteger(
  value: string | undefined,
  key: string,
  options: Readonly<{ defaultValue: number; min: number; max: number }>,
  issues: ConfigurationIssue[]
): number {
  if (value === undefined) {
    return options.defaultValue;
  }

  if (!/^\d+$/.test(value)) {
    issues.push({ key, message: 'must be an integer', received: value });
    return options.defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < options.min || parsed > options.max) {
    issues.push({
      key,
      message: `must be between ${options.min} and ${options.max}`,
      received: value
    });
    return options.defaultValue;
  }

  return parsed;
}

/** Parse enum. */
export function parseEnum<const T extends readonly string[]>(
  value: string | undefined,
  key: string,
  allowed: T,
  defaultValue: T[number],
  issues: ConfigurationIssue[]
): T[number] {
  if (value === undefined) {
    return defaultValue;
  }

  if (!allowed.includes(value)) {
    issues.push({
      key,
      message: `must be one of: ${allowed.join(', ')}`,
      received: value
    });
    return defaultValue;
  }

  return value as T[number];
}

/** Parse http url. */
export function parseHttpUrl(
  value: string | undefined,
  key: string,
  issues: ConfigurationIssue[],
  options: Readonly<{ required?: boolean }> = {}
): string | null {
  if (value === undefined) {
    if (options.required) {
      issues.push({ key, message: 'is required' });
    }
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    issues.push({ key, message: 'must be an absolute http(s) URL', received: value });
    return null;
  }
}

/** Parse http url list. */
export function parseHttpUrlList(
  value: string | undefined,
  key: string,
  issues: ConfigurationIssue[],
  defaultValue: readonly string[]
): readonly string[] {
  const rawValues = value
    ? value.split(',').map((entry) => entry.trim()).filter(Boolean)
    : [...defaultValue];

  const parsed: string[] = [];
  for (const raw of rawValues) {
    const url = parseHttpUrl(raw, key, issues);
    if (url) {
      parsed.push(url);
    }
  }

  return parsed;
}
