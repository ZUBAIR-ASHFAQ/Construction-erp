import { requireRequestSecurityContext } from '@construction-erp/request-context';
import { invalidStorageKey } from './errors.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NAMESPACE_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const CONTROL_OR_BACKSLASH = /[\\\u0000-\u001f\u007f]/;
const MAX_KEY_BYTES = 1024;

export type CompanyObjectKeyInput = Readonly<{
  namespace: string;
  objectId: string;
  versionId?: string;
}>;

/** Validate uuid. */
function assertUuid(value: string, label: string): string {
  if (!UUID_PATTERN.test(value)) throw invalidStorageKey(`${label} must be a UUID.`);
  return value.toLowerCase();
}

/** Validate storage key. */
export function assertStorageKey(key: string): string {
  if (!key || key !== key.trim()) throw invalidStorageKey('Storage key must not be empty or padded with whitespace.');
  if (new TextEncoder().encode(key).byteLength > MAX_KEY_BYTES) throw invalidStorageKey('Storage key is too long.');
  if (key.startsWith('/') || key.endsWith('/') || key.includes('//')) throw invalidStorageKey('Storage key has an invalid path shape.');
  if (CONTROL_OR_BACKSLASH.test(key)) throw invalidStorageKey('Storage key contains forbidden characters.');

  const segments = key.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..' || segment.length === 0)) {
    throw invalidStorageKey('Storage key contains an unsafe path segment.');
  }
  return key;
}

/** Ensure a persisted object key belongs to the authenticated company. */
export function assertCompanyObjectKey(rawKey: string): string {
  const security = requireRequestSecurityContext();
  const companyId = assertUuid(security.companyId, 'Company id');
  const key = assertStorageKey(rawKey);
  if (!key.startsWith(`companies/${companyId}/`)) {
    throw invalidStorageKey('Storage key does not belong to the authenticated company.');
  }
  return key;
}

/**
 * Builds a company-rooted object key without trusting a caller-supplied tenant.
 * Business modules should allocate opaque UUIDs and persist the resulting key as
 * metadata; original filenames are not embedded into the object path.
 */
export function buildCompanyObjectKey(input: CompanyObjectKeyInput): string {
  const security = requireRequestSecurityContext();
  if (!NAMESPACE_PATTERN.test(input.namespace)) throw invalidStorageKey('Storage namespace is invalid.');

  const companyId = assertUuid(security.companyId, 'Company id');
  const objectId = assertUuid(input.objectId, 'Object id');
  const versionSuffix = input.versionId ? `/${assertUuid(input.versionId, 'Version id')}` : '';
  return assertStorageKey(`companies/${companyId}/${input.namespace}/${objectId}${versionSuffix}`);
}
