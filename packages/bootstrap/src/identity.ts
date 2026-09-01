import type { Prisma } from '@prisma/client';
import { bootstrapIdentityResultInvalid, bootstrapRecordInvalid } from './errors.js';
import type {
  BootstrapIdentityProvisioningContext,
  BootstrapIdentityProvisioningResult,
  BootstrapSystemRoleDefinition
} from './types.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Validate and return a UUID value. */
function uuid(value: string, field: string): string {
  const normalized = value.trim();
  if (!UUID.test(normalized)) throw new TypeError(`${field} must be a UUID.`);
  return normalized;
}

/** Normalize identity provisioning result. */
export function normalizeIdentityProvisioningResult(
  result: BootstrapIdentityProvisioningResult,
  requestedRoles: readonly BootstrapSystemRoleDefinition[]
): BootstrapIdentityProvisioningResult {
  try {
    const expectedCodes = requestedRoles.map((role) => role.code).sort();
    const actualCodes = Object.keys(result.systemRoleIdsByCode).sort();
    if (expectedCodes.length !== actualCodes.length ||
        expectedCodes.some((code, index) => code !== actualCodes[index])) {
      throw new TypeError('Identity adapter must return exactly one role UUID for each requested system-role code.');
    }

    const mapping: Record<string, string> = {};
    for (const code of expectedCodes) {
      const roleId = result.systemRoleIdsByCode[code];
      if (roleId === undefined) throw new TypeError(`Missing role UUID for ${code}.`);
      mapping[code] = uuid(roleId, `systemRoleIdsByCode.${code}`);
    }

    if (new Set(Object.values(mapping)).size !== expectedCodes.length) {
      throw new TypeError('Identity adapter must return a different role UUID for each requested system-role code.');
    }

    return Object.freeze({
      administratorUserId: uuid(result.administratorUserId, 'administratorUserId'),
      systemRoleIdsByCode: Object.freeze(mapping)
    });
  } catch (cause) {
    throw bootstrapIdentityResultInvalid(cause);
  }
}

/** Parse persisted identity result. */
export function parsePersistedIdentityResult(
  administratorUserId: string | null,
  value: Prisma.JsonValue | null
): BootstrapIdentityProvisioningResult | null {
  if (administratorUserId === null && value === null) return null;
  if (administratorUserId === null || value === null || Array.isArray(value) || typeof value !== 'object') {
    throw bootstrapRecordInvalid(new TypeError('Persisted identity result is incomplete.'));
  }

  try {
    const mapping: Record<string, string> = {};
    for (const [code, roleId] of Object.entries(value)) {
      if (typeof roleId !== 'string') throw new TypeError('Persisted system role identifiers must be strings.');
      mapping[code] = uuid(roleId, `systemRoleIdsByCode.${code}`);
    }
    if (new Set(Object.values(mapping)).size !== Object.keys(mapping).length) {
      throw new TypeError('Persisted system role identifiers must be unique per role code.');
    }
    return Object.freeze({
      administratorUserId: uuid(administratorUserId, 'administratorUserId'),
      systemRoleIdsByCode: Object.freeze(mapping)
    });
  } catch (cause) {
    throw bootstrapRecordInvalid(cause);
  }
}

/** Convert provisioning output into trusted bootstrap identity context. */
export function toIdentityContext(input: {
  bootstrapRunId: string;
  companyId: string;
  requestId: string;
  correlationId: string;
  administrator: BootstrapIdentityProvisioningContext['administrator'];
  systemRoles: BootstrapIdentityProvisioningContext['systemRoles'];
}): BootstrapIdentityProvisioningContext {
  return Object.freeze({
    bootstrapRunId: input.bootstrapRunId,
    companyId: input.companyId,
    requestId: input.requestId,
    correlationId: input.correlationId,
    administrator: input.administrator,
    systemRoles: input.systemRoles
  });
}
