import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { ensureProvisionedNumberSequence } from '@construction-erp/numbering';
import { bootstrapFingerprint } from './fingerprint.js';
import {
  bootstrapAlreadyInitialized,
  bootstrapKeyReused,
  bootstrapRecordInvalid
} from './errors.js';
import {
  normalizeIdentityProvisioningResult,
  parsePersistedIdentityResult,
  toIdentityContext
} from './identity.js';
import { normalizeInitialBootstrapInput } from './normalize.js';
import {
  INITIAL_BOOTSTRAP_STATUS,
  type BootstrapIdentityProvisioner,
  type InitialBootstrapInput,
  type InitialBootstrapResult,
  type NormalizedInitialBootstrapInput
} from './types.js';

const INITIAL_BOOTSTRAP_LOCK = 'construction-erp.initial-bootstrap.v1';
const DEFAULT_WAREHOUSE_CODE = 'MAIN';
const DEFAULT_EXPENSE_CATEGORY_CODE = 'GENERAL';

/** Return the configured fiscal-year start month, defaulting to January. */
function configuredFiscalYearStartMonth(settings: Prisma.InputJsonObject): number {
  const value = settings.fiscalYearStartMonth;
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12
    ? value
    : 1;
}

/** Build the open fiscal period that contains the current UTC date. */
function currentFiscalPeriod(now: Date, fiscalYearStartMonth: number) {
  const calendarYear = now.getUTCFullYear();
  const calendarMonth = now.getUTCMonth() + 1;
  const periodNo = ((calendarMonth - fiscalYearStartMonth + 12) % 12) + 1;
  const fiscalYear = fiscalYearStartMonth === 1
    ? calendarYear
    : calendarMonth >= fiscalYearStartMonth
      ? calendarYear + 1
      : calendarYear;

  return {
    fiscalYear,
    periodNo,
    startDate: new Date(Date.UTC(calendarYear, calendarMonth - 1, 1)),
    endDate: new Date(Date.UTC(calendarYear, calendarMonth, 0))
  };
}

/** Create the minimum operational configuration required by built Final-21 modules. */
async function provisionMinimumOperationalConfiguration(
  tx: Prisma.TransactionClient,
  companyId: string,
  fiscalSettings: Prisma.InputJsonObject
): Promise<void> {
  await tx.warehouse.create({
    data: {
      companyId,
      projectId: null,
      code: DEFAULT_WAREHOUSE_CODE,
      name: 'Main Warehouse',
      location: null,
      status: 'ACTIVE'
    }
  });

  await tx.expenseCategory.create({
    data: {
      companyId,
      code: DEFAULT_EXPENSE_CATEGORY_CODE,
      name: 'General Site Expense',
      defaultGlAccountId: null,
      status: 'ACTIVE'
    }
  });

  const period = currentFiscalPeriod(new Date(), configuredFiscalYearStartMonth(fiscalSettings));
  await tx.fiscalPeriod.create({
    data: {
      companyId,
      fiscalYear: period.fiscalYear,
      periodNo: period.periodNo,
      startDate: period.startDate,
      endDate: period.endDate,
      status: 'OPEN'
    }
  });
}

/** Convert a JSON value to Prisma-compatible JSON input. */
function json<T extends Prisma.InputJsonValue>(value: T): T {
  return structuredClone(value) as T;
}

/** Return persisted system roles. */
function persistedSystemRoles(input: NormalizedInitialBootstrapInput): Prisma.InputJsonArray {
  return input.identity.systemRoles.map((role) => ({
    code: role.code,
    name: role.name,
    ...(role.description === undefined ? {} : { description: role.description })
  })) as Prisma.InputJsonArray;
}

/** Return persisted admin role codes. */
function persistedAdminRoleCodes(input: NormalizedInitialBootstrapInput): Prisma.InputJsonArray {
  return [...input.identity.administrator.roleCodes] as Prisma.InputJsonArray;
}

/** Return role ids json. */
function roleIdsJson(mapping: Readonly<Record<string, string>>): Prisma.InputJsonObject {
  return { ...mapping } as Prisma.InputJsonObject;
}

/** Return result from record. */
function resultFromRecord(
  kind: InitialBootstrapResult['kind'],
  input: NormalizedInitialBootstrapInput,
  record: {
    id: string;
    status: string;
    companyId: string;
    requestId: string;
    correlationId: string;
    administratorUserId: string | null;
    systemRoleIdsByCode: Prisma.JsonValue | null;
  }
): InitialBootstrapResult {
  if (
    record.status !== INITIAL_BOOTSTRAP_STATUS.IDENTITY_PENDING &&
    record.status !== INITIAL_BOOTSTRAP_STATUS.COMPLETED
  ) {
    throw bootstrapRecordInvalid(new TypeError(`Unknown initial bootstrap status: ${record.status}`));
  }

  const identity = parsePersistedIdentityResult(
    record.administratorUserId,
    record.systemRoleIdsByCode
  );

  if (record.status === INITIAL_BOOTSTRAP_STATUS.COMPLETED && identity === null) {
    throw bootstrapRecordInvalid(new TypeError('Completed bootstrap is missing identity completion proof.'));
  }
  if (record.status === INITIAL_BOOTSTRAP_STATUS.IDENTITY_PENDING && identity !== null) {
    throw bootstrapRecordInvalid(new TypeError('Identity-pending bootstrap unexpectedly contains identity completion proof.'));
  }

  if (identity) {
    const expectedRoleCodes = input.identity.systemRoles.map((role) => role.code).sort();
    const persistedRoleCodes = Object.keys(identity.systemRoleIdsByCode).sort();
    const roleCodesMatch =
      expectedRoleCodes.length === persistedRoleCodes.length
      && expectedRoleCodes.every((code, index) => code === persistedRoleCodes[index]);

    if (!roleCodesMatch) {
      throw bootstrapRecordInvalid(new TypeError('Completed bootstrap role proof does not match the original bootstrap input.'));
    }
  }

  return Object.freeze({
    kind,
    status: record.status,
    bootstrapRunId: record.id,
    companyId: record.companyId,
    requestId: record.requestId,
    correlationId: record.correlationId,
    administratorUserId: identity?.administratorUserId ?? null,
    systemRoleIdsByCode: identity?.systemRoleIdsByCode ?? null
  });
}

/** Acquire bootstrap lock. */
async function acquireBootstrapLock(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${INITIAL_BOOTSTRAP_LOCK}, 0))
  `;
}

/** Complete identity. */
async function completeIdentity(
  tx: Prisma.TransactionClient,
  input: NormalizedInitialBootstrapInput,
  record: {
    id: string;
    companyId: string;
    requestId: string;
    correlationId: string;
  },
  provisionIdentity: BootstrapIdentityProvisioner
) {
  const identityResult = normalizeIdentityProvisioningResult(
    await provisionIdentity(
      tx,
      toIdentityContext({
        bootstrapRunId: record.id,
        companyId: record.companyId,
        requestId: record.requestId,
        correlationId: record.correlationId,
        administrator: input.identity.administrator,
        systemRoles: input.identity.systemRoles
      })
    ),
    input.identity.systemRoles
  );

  return tx.initialBootstrapRun.update({
    where: { id: record.id },
    data: {
      status: INITIAL_BOOTSTRAP_STATUS.COMPLETED,
      administratorUserId: identityResult.administratorUserId,
      systemRoleIdsByCode: roleIdsJson(identityResult.systemRoleIdsByCode),
      completedAt: new Date()
    }
  });
}

/**
 * Controlled installation bootstrap.
 *
 * - Foundation creates company + non-secret company configuration + reviewed
 *   number sequences in one PostgreSQL transaction.
 * - The same transaction can create the initial system administrator and
 *   system roles when Administration supplies an identity adapter.
 * - Before Administration exists, Foundation commits a durable IDENTITY_PENDING
 *   handoff. Re-running the same bootstrap after Stage 1 resumes that exact run.
 * - A different payload under the same bootstrap key is rejected.
 *
 * No HTTP request context or client-supplied companyId is accepted because this
 * command creates the first authoritative company record.
 */
export async function bootstrapInitialInstallation(
  client: PrismaClient,
  rawInput: InitialBootstrapInput,
  provisionIdentity?: BootstrapIdentityProvisioner
): Promise<InitialBootstrapResult> {
  const input = normalizeInitialBootstrapInput(rawInput);
  const fingerprint = bootstrapFingerprint(input);

  return client.$transaction(async (tx) => {
    await acquireBootstrapLock(tx);

    const existing = await tx.initialBootstrapRun.findUnique({
      where: { bootstrapKey: input.bootstrapKey }
    });

    if (existing) {
      if (existing.requestFingerprint !== fingerprint) throw bootstrapKeyReused();

      if (existing.status === INITIAL_BOOTSTRAP_STATUS.COMPLETED) {
        return resultFromRecord('replayed', input, existing);
      }

      if (existing.status !== INITIAL_BOOTSTRAP_STATUS.IDENTITY_PENDING) {
        throw bootstrapRecordInvalid(new TypeError(`Unsupported bootstrap state: ${existing.status}`));
      }

      if (!provisionIdentity) return resultFromRecord('replayed', input, existing);

      const completed = await completeIdentity(tx, input, existing, provisionIdentity);
      return resultFromRecord('completed', input, completed);
    }

    // This is the controlled *initial* provisioning command, not a general
    // company-onboarding endpoint. A different bootstrap key must not be able
    // to create a second "initial" company.
    const [otherRuns, existingCompanies] = await Promise.all([
      tx.initialBootstrapRun.count(),
      tx.company.count()
    ]);
    if (otherRuns > 0 || existingCompanies > 0) throw bootstrapAlreadyInitialized();

    const requestId = randomUUID();
    const correlationId = requestId;

    const company = await tx.company.create({
      data: {
        legalName: input.company.legalName,
        displayName: input.company.displayName,
        status: input.company.status,
        baseCurrency: input.company.baseCurrency,
        timeZone: input.company.timeZone,
        locale: input.company.locale,
        fiscalSettings: json(input.company.fiscalSettings)
      }
    });

    await tx.companyConfiguration.create({
      data: {
        companyId: company.id,
        settings: json(input.configuration)
      }
    });

    await provisionMinimumOperationalConfiguration(tx, company.id, input.company.fiscalSettings);

    for (const sequence of input.numberSequences) {
      await ensureProvisionedNumberSequence(tx, {
        companyId: company.id,
        sequenceKey: sequence.sequenceKey,
        prefix: sequence.prefix,
        suffix: sequence.suffix,
        padWidth: sequence.padWidth,
        nextValue: sequence.nextValue,
        incrementBy: sequence.incrementBy,
        status: sequence.status
      });
    }

    let run = await tx.initialBootstrapRun.create({
      data: {
        bootstrapKey: input.bootstrapKey,
        requestFingerprint: fingerprint,
        status: INITIAL_BOOTSTRAP_STATUS.IDENTITY_PENDING,
        companyId: company.id,
        administratorEmail: input.identity.administrator.email,
        administratorName: input.identity.administrator.name,
        administratorRoleCodes: persistedAdminRoleCodes(input),
        systemRoleDefinitions: persistedSystemRoles(input),
        requestId,
        correlationId
      }
    });

    if (!provisionIdentity) return resultFromRecord('created', input, run);

    run = await completeIdentity(tx, input, run, provisionIdentity);
    return resultFromRecord('completed', input, run);
  });
}
