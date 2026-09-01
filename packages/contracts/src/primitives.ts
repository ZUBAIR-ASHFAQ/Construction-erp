export const INTEGRATION_CONTRACT_VERSION = 1 as const;

export type IntegrationJsonPrimitive = string | number | boolean | null;
export type IntegrationJsonValue = IntegrationJsonPrimitive | IntegrationJsonObject | IntegrationJsonValue[];
export type IntegrationJsonObject = { [key: string]: IntegrationJsonValue };

const STABLE_TOKEN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

/** Normalize stable token. */
export function normalizeStableToken(value: string, fieldName: string): string {
  const normalized = value.trim().toLowerCase();
  if (!STABLE_TOKEN.test(normalized) || normalized.length > 120) {
    throw new Error(`${fieldName} must be a stable lower-case token.`);
  }
  return normalized;
}

/** Normalize reference id. */
export function normalizeReferenceId(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`${fieldName} must be a non-empty safe reference identifier.`);
  }
  return normalized;
}

/** Normalize currency. */
export function normalizeCurrency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!ISO_CURRENCY.test(normalized)) throw new Error('currency must be a three-letter uppercase code.');
  return normalized;
}

/** Normalize iso date. */
export function normalizeIsoDate(value: string, fieldName = 'postingDate'): string {
  const match = ISO_DATE.exec(value.trim());
  if (!match) throw new Error(`${fieldName} must use YYYY-MM-DD.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${fieldName} must be a valid calendar date.`);
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * Financial values cross module/process boundaries as decimal strings so no
 * IEEE-754 precision is lost before Prisma/PostgreSQL DECIMAL handling.
 */
export function normalizeDecimalString(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!DECIMAL.test(normalized)) throw new Error(`${fieldName} must be a non-negative decimal string.`);
  const [whole, fraction] = normalized.split('.');
  const normalizedWhole = BigInt(whole ?? '0').toString();
  if (!fraction) return normalizedWhole;
  const trimmedFraction = fraction.replace(/0+$/, '');
  return trimmedFraction ? `${normalizedWhole}.${trimmedFraction}` : normalizedWhole;
}

/** Normalize optional text. */
export function normalizeOptionalText(value: string | null | undefined, fieldName: string, maxLength = 500): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) {
    throw new Error(`${fieldName} contains unsupported content.`);
  }
  return normalized;
}
