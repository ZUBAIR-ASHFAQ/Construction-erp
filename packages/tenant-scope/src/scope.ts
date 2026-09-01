import { requireCompanyId } from '@construction-erp/request-context';
import {
  CrossCompanyAccessError,
  UntrustedCompanyScopeInputError
} from './errors.js';
import type {
  CompanyOwnedRecord,
  CompanyRepositoryScope,
  CompanyScoped,
  WithoutCompanyId
} from './types.js';

/** Validate no caller company id. */
function assertNoCallerCompanyId(value: Record<string, unknown>): void {
  if (Object.prototype.hasOwnProperty.call(value, 'companyId')) {
    throw new UntrustedCompanyScopeInputError();
  }
}

/** Normalize record company id. */
function normalizeRecordCompanyId(value: unknown): string {
  if (typeof value !== 'string') throw new CrossCompanyAccessError();
  const normalized = value.trim();
  if (!normalized) throw new CrossCompanyAccessError();
  return normalized;
}

/**
 * Return the current trusted company scope. This value is derived only from
 * RequestSecurityContext, never from path/query/body data.
 */
export function requireActiveCompanyId(): string {
  return requireCompanyId();
}

/**
 * Add the active company predicate to a Prisma-style `where` object. A caller
 * is not allowed to provide companyId, even when it happens to match the
 * current tenant, because ownership authority must have exactly one source.
 */
export function companyScopedWhere<T extends Record<string, unknown>>(
  where: WithoutCompanyId<T> = {} as WithoutCompanyId<T>
): CompanyScoped<T> {
  const input = where as Record<string, unknown>;
  assertNoCallerCompanyId(input);

  return Object.freeze({
    ...input,
    companyId: requireActiveCompanyId()
  }) as CompanyScoped<T>;
}

/**
 * Stamp create data with the active company. Callers cannot supply or override
 * companyId. Update operations should use companyScopedWhere() and should not
 * mutate ownership.
 */
export function companyScopedCreateData<T extends Record<string, unknown>>(
  data: WithoutCompanyId<T>
): CompanyScoped<T> {
  const input = data as Record<string, unknown>;
  assertNoCallerCompanyId(input);

  return Object.freeze({
    ...input,
    companyId: requireActiveCompanyId()
  }) as CompanyScoped<T>;
}

/** Check whether owned by active company. */
export function isOwnedByActiveCompany(record: CompanyOwnedRecord): boolean {
  return normalizeRecordCompanyId(record.companyId) === requireActiveCompanyId();
}

/** Validate owned by active company. */
export function assertOwnedByActiveCompany<T extends CompanyOwnedRecord>(record: T): T {
  if (!isOwnedByActiveCompany(record)) {
    throw new CrossCompanyAccessError();
  }
  return record;
}

/**
 * Repository methods may create this object once at entry and reuse it for all
 * reads/writes in that method. This makes the tenant predicate visible in code
 * review and difficult to omit accidentally.
 */
export function requireCompanyRepositoryScope(): CompanyRepositoryScope {
  const companyId = requireActiveCompanyId();

  return Object.freeze({
    companyId,
    where<T extends Record<string, unknown>>(where: WithoutCompanyId<T> = {} as WithoutCompanyId<T>) {
      const input = where as Record<string, unknown>;
      assertNoCallerCompanyId(input);
      return Object.freeze({ ...input, companyId }) as CompanyScoped<T>;
    },
    createData<T extends Record<string, unknown>>(data: WithoutCompanyId<T>) {
      const input = data as Record<string, unknown>;
      assertNoCallerCompanyId(input);
      return Object.freeze({ ...input, companyId }) as CompanyScoped<T>;
    },
    assertOwned<T extends CompanyOwnedRecord>(record: T) {
      if (normalizeRecordCompanyId(record.companyId) !== companyId) {
        throw new CrossCompanyAccessError();
      }
      return record;
    },
    owns(record: CompanyOwnedRecord) {
      return normalizeRecordCompanyId(record.companyId) === companyId;
    }
  });
}
