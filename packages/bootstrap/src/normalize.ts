import type { Prisma } from '@prisma/client';
import { FOUNDATION_REQUIRED_SEQUENCE_KEYS, normalizeNumberSequenceDefinition } from '@construction-erp/numbering';
import { invalidBootstrapInput } from './errors.js';
import type {
  BootstrapAdministratorIntent,
  BootstrapCompanyInput,
  BootstrapIdentityIntent,
  BootstrapNumberSequenceInput,
  BootstrapSystemRoleDefinition,
  InitialBootstrapInput,
  NormalizedInitialBootstrapInput
} from './types.js';

const BOOTSTRAP_KEY = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/;
const ROLE_CODE = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CURRENCY = /^[A-Z]{3}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

const SENSITIVE_CONFIG_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'clientsecret',
  'apikey',
  'accesskey',
  'accesskeyid',
  'secretaccesskey',
  'privatekey',
  'databaseurl'
]);

/** Validate and return required text. */
function requiredText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${field} must be a non-empty string.`);
  if (normalized.length > maxLength) throw new RangeError(`${field} exceeds ${maxLength} characters.`);
  if (CONTROL.test(normalized)) throw new TypeError(`${field} must not contain control characters.`);
  return normalized;
}

/** Normalize and validate the bootstrap key. */
function bootstrapKey(value: string | undefined): string {
  const normalized = (value ?? 'initial').trim().toLowerCase();
  if (!BOOTSTRAP_KEY.test(normalized) || normalized.length > 100) {
    throw new TypeError('bootstrapKey must be a stable lower-case dotted key up to 100 characters.');
  }
  return normalized;
}

/** Normalize json key. */
function normalizeJsonKey(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/** Validate non secret json. */
function assertNonSecretJson(value: Prisma.InputJsonValue, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNonSecretJson(item, `${path}[${index}]`));
    return;
  }

  if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (SENSITIVE_CONFIG_KEYS.has(normalizeJsonKey(key))) {
        throw new TypeError(
          `${path}.${key} is secret-bearing configuration and must use environment/secret-manager infrastructure instead.`
        );
      }
      if (nested !== undefined) assertNonSecretJson(nested as Prisma.InputJsonValue, `${path}.${key}`);
    }
  }
}

/** Return json object. */
function jsonObject(value: Prisma.InputJsonObject | undefined, field: string): Prisma.InputJsonObject {
  const normalized = value ?? {};
  assertNonSecretJson(normalized, field);
  return structuredClone(normalized) as Prisma.InputJsonObject;
}

/** Normalize one bootstrap company definition. */
function company(input: BootstrapCompanyInput): BootstrapCompanyInput {
  const baseCurrency = requiredText(input.baseCurrency, 'company.baseCurrency', 3).toUpperCase();
  if (!CURRENCY.test(baseCurrency)) {
    throw new TypeError('company.baseCurrency must be a three-letter ISO-style currency code.');
  }

  const fiscalSettings = jsonObject(input.fiscalSettings, 'company.fiscalSettings');

  return Object.freeze({
    legalName: requiredText(input.legalName, 'company.legalName', 200),
    displayName: requiredText(input.displayName, 'company.displayName', 200),
    status: requiredText(input.status, 'company.status', 32).toUpperCase(),
    baseCurrency,
    timeZone: requiredText(input.timeZone, 'company.timeZone', 100),
    locale: requiredText(input.locale, 'company.locale', 35),
    fiscalSettings
  });
}

/** Parse and validate one positive BigInt string. */
function positiveBigIntString(value: string, field: string): bigint {
  const normalized = value.trim();
  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new TypeError(`${field} must be a positive integer string.`);
  }
  return BigInt(normalized);
}

/** Normalize one bootstrap number-sequence definition. */
function numberSequence(input: BootstrapNumberSequenceInput) {
  return normalizeNumberSequenceDefinition({
    sequenceKey: input.sequenceKey,
    ...(input.prefix === undefined ? {} : { prefix: input.prefix }),
    ...(input.suffix === undefined ? {} : { suffix: input.suffix }),
    ...(input.padWidth === undefined ? {} : { padWidth: input.padWidth }),
    ...(input.nextValue === undefined
      ? {}
      : { nextValue: positiveBigIntString(input.nextValue, `numberSequences.${input.sequenceKey}.nextValue`) }),
    ...(input.incrementBy === undefined
      ? {}
      : { incrementBy: positiveBigIntString(input.incrementBy, `numberSequences.${input.sequenceKey}.incrementBy`) }),
    ...(input.status === undefined ? {} : { status: input.status })
  });
}

/** Normalize and validate one role code. */
function roleCode(value: string, field: string): string {
  const normalized = requiredText(value, field, 100).toLowerCase();
  if (!ROLE_CODE.test(normalized)) {
    throw new TypeError(`${field} must be a stable lower-case permission-style code.`);
  }
  return normalized;
}

/** Normalize one bootstrap system-role definition. */
function systemRole(input: BootstrapSystemRoleDefinition): BootstrapSystemRoleDefinition {
  return Object.freeze({
    code: roleCode(input.code, 'identity.systemRoles.code'),
    name: requiredText(input.name, 'identity.systemRoles.name', 160),
    ...(input.description === undefined
      ? {}
      : { description: requiredText(input.description, 'identity.systemRoles.description', 500) })
  });
}

/** Normalize the bootstrap administrator definition. */
function administrator(input: BootstrapAdministratorIntent): BootstrapAdministratorIntent {
  const email = requiredText(input.email, 'identity.administrator.email', 320).toLowerCase();
  if (!EMAIL.test(email)) throw new TypeError('identity.administrator.email must be a valid email address.');

  const roleCodes = [...new Set(input.roleCodes.map((code) => roleCode(code, 'identity.administrator.roleCodes')))].sort();
  if (roleCodes.length === 0) {
    throw new TypeError('identity.administrator.roleCodes must assign at least one system role.');
  }

  return Object.freeze({
    email,
    name: requiredText(input.name, 'identity.administrator.name', 200),
    roleCodes: Object.freeze(roleCodes)
  });
}

/** Normalize the bootstrap identity definition. */
function identity(input: BootstrapIdentityIntent): NormalizedInitialBootstrapInput['identity'] {
  const roles = input.systemRoles.map(systemRole).sort((a, b) => a.code.localeCompare(b.code));
  if (roles.length === 0) throw new TypeError('identity.systemRoles must contain at least one role.');

  const roleCodes = roles.map((role) => role.code);
  if (new Set(roleCodes).size !== roleCodes.length) {
    throw new TypeError('identity.systemRoles contains duplicate role codes.');
  }

  const admin = administrator(input.administrator);
  const missingRole = admin.roleCodes.find((code) => !roleCodes.includes(code));
  if (missingRole) {
    throw new TypeError(`identity.administrator.roleCodes references undefined system role: ${missingRole}`);
  }

  return Object.freeze({
    administrator: admin,
    systemRoles: Object.freeze(roles)
  });
}

/** Ensure bootstrap includes the minimum company-scoped business sequences. */
function assertRequiredNumberSequences(keys: readonly string[]): void {
  const missing = FOUNDATION_REQUIRED_SEQUENCE_KEYS.filter((key) => !keys.includes(key));
  if (missing.length > 0) {
    throw new TypeError(`numberSequences is missing required Foundation keys: ${missing.join(', ')}`);
  }
}

/** Normalize initial bootstrap input. */
export function normalizeInitialBootstrapInput(input: InitialBootstrapInput): NormalizedInitialBootstrapInput {
  try {
    const sequences = input.numberSequences
      .map(numberSequence)
      .sort((a, b) => a.sequenceKey.localeCompare(b.sequenceKey));
    const keys = sequences.map((sequence) => sequence.sequenceKey);
    if (new Set(keys).size !== keys.length) {
      throw new TypeError('numberSequences contains duplicate sequence keys.');
    }
    assertRequiredNumberSequences(keys);

    return Object.freeze({
      bootstrapKey: bootstrapKey(input.bootstrapKey),
      company: company(input.company),
      configuration: jsonObject(input.configuration, 'configuration'),
      numberSequences: Object.freeze(sequences),
      identity: identity(input.identity)
    });
  } catch (cause) {
    throw invalidBootstrapInput(cause);
  }
}
