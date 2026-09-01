import { Prisma, type PrismaClient } from '@prisma/client';
import type { TransactionClient } from '@construction-erp/database';
import { AppError, ConflictError, ValidationError } from '@construction-erp/errors';
import {
  requireRequestContext,
  requireRequestSecurityContext,
} from '@construction-erp/request-context';
import { fingerprintRequest } from './fingerprint.js';
import type { ReplayJsonValue } from './json.js';
import { sanitizeReplayBody } from './sanitize.js';
import {
  DEFAULT_IDEMPOTENCY_RETENTION_SECONDS,
  MAX_IDEMPOTENCY_RETENTION_SECONDS,
  MIN_IDEMPOTENCY_RETENTION_SECONDS,
  type ExecuteIdempotentCommandInput,
  type IdempotentCommandResponse,
  type IdempotentCommandWork,
  type IdempotentExecutionResult,
} from './types.js';

const OPERATION_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

/** Return operation name. */
function operationName(value: string): string {
  const normalized = value.trim();
  if (!OPERATION_PATTERN.test(normalized) || normalized.length > 100) {
    throw new TypeError('operation must be a stable lower-case dotted name no longer than 100 characters.');
  }
  return normalized;
}

/** Normalize idempotency key. */
export function normalizeIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200 || CONTROL_CHARACTER_PATTERN.test(normalized)) {
    throw new ValidationError({
      code: 'INVALID_IDEMPOTENCY_KEY',
      message: 'A valid idempotency key is required.',
    });
  }
  return normalized;
}

/** Return retention seconds. */
function retentionSeconds(value: number | undefined): number {
  const normalized = value ?? DEFAULT_IDEMPOTENCY_RETENTION_SECONDS;
  if (
    !Number.isInteger(normalized) ||
    normalized < MIN_IDEMPOTENCY_RETENTION_SECONDS ||
    normalized > MAX_IDEMPOTENCY_RETENTION_SECONDS
  ) {
    throw new TypeError(
      `retentionSeconds must be an integer between ${MIN_IDEMPOTENCY_RETENTION_SECONDS} and ${MAX_IDEMPOTENCY_RETENTION_SECONDS}.`,
    );
  }
  return normalized;
}

/** Return successful response. */
function successfulResponse(response: IdempotentCommandResponse): Readonly<{ statusCode: number; body: ReplayJsonValue }> {
  if (!Number.isInteger(response.statusCode) || response.statusCode < 200 || response.statusCode > 299) {
    throw new TypeError('Idempotent command responses must use a successful HTTP status between 200 and 299.');
  }
  return Object.freeze({ statusCode: response.statusCode, body: sanitizeReplayBody(response.body) });
}

/** Return try acquire command lock. */
async function tryAcquireCommandLock(tx: TransactionClient, identity: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ acquired: boolean }>>(Prisma.sql`
    SELECT pg_try_advisory_xact_lock(hashtextextended(${identity}, 0)) AS acquired
  `);
  return rows[0]?.acquired === true;
}

/** Return decode stored response body. */
function decodeStoredResponseBody(value: Prisma.JsonValue): ReplayJsonValue {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new AppError({
      code: 'IDEMPOTENCY_RECORD_INVALID',
      message: 'The stored idempotency result is invalid.',
      statusCode: 500,
      category: 'internal',
      exposeMessage: false,
    });
  }
  const record = value as Prisma.JsonObject;
  if (!Object.prototype.hasOwnProperty.call(record, 'body')) {
    throw new AppError({
      code: 'IDEMPOTENCY_RECORD_INVALID',
      message: 'The stored idempotency result is invalid.',
      statusCode: 500,
      category: 'internal',
      exposeMessage: false,
    });
  }
  return record.body as ReplayJsonValue;
}

/** Return in progress conflict. */
function inProgressConflict(): AppError {
  return new AppError({
    code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
    message: 'An idempotent command with this key is already being processed.',
    statusCode: 409,
    category: 'conflict',
    retryable: true,
  });
}

/** Return key reused conflict. */
function keyReusedConflict(): ConflictError {
  return new ConflictError({
    code: 'IDEMPOTENCY_KEY_REUSED',
    message: 'The idempotency key was already used for a different request.',
  });
}

/**
 * Execute a business command exactly once per company/operation/key within the
 * persistence window. The business mutation, audit/outbox writes performed by
 * work(), and the completed replay record all share one Prisma transaction.
 *
 * PostgreSQL transaction-scoped advisory locks reject a concurrent duplicate
 * immediately. If the transaction rolls back, the IN_PROGRESS row rolls back
 * too, so a crash cannot strand a committed in-progress reservation.
 */
export async function executeIdempotentCommand(
  client: PrismaClient,
  input: ExecuteIdempotentCommandInput,
  work: IdempotentCommandWork,
): Promise<IdempotentExecutionResult> {
  const context = requireRequestContext();
  const security = requireRequestSecurityContext();
  const operation = operationName(input.operation);
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const requestFingerprint = fingerprintRequest(input.fingerprintInput);
  const retention = retentionSeconds(input.retentionSeconds);
  const lockIdentity = `${security.companyId}\u001f${operation}\u001f${idempotencyKey}`;

  return client.$transaction(async (tx) => {
    if (!(await tryAcquireCommandLock(tx, lockIdentity))) throw inProgressConflict();

    const uniqueKey = {
      companyId: security.companyId,
      operation,
      idempotencyKey,
    };

    const now = new Date();
    let existing = await tx.idempotencyRecord.findUnique({
      where: { companyId_operation_idempotencyKey: uniqueKey },
    });

    if (existing && existing.expiresAt <= now) {
      await tx.idempotencyRecord.delete({ where: { id: existing.id } });
      existing = null;
    }

    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) throw keyReusedConflict();
      if (
        existing.status !== 'COMPLETED' ||
        existing.responseStatus === null ||
        existing.responseBody === null ||
        existing.completedAt === null
      ) {
        throw inProgressConflict();
      }

      return Object.freeze({
        kind: 'replayed' as const,
        idempotencyRecordId: existing.id,
        requestFingerprint,
        response: Object.freeze({
          statusCode: existing.responseStatus,
          body: decodeStoredResponseBody(existing.responseBody),
        }),
      });
    }

    const expiresAt = new Date(now.getTime() + retention * 1000);
    const record = await tx.idempotencyRecord.create({
      data: {
        companyId: security.companyId,
        operation,
        idempotencyKey,
        requestFingerprint,
        status: 'IN_PROGRESS',
        requestId: context.requestId,
        correlationId: context.correlationId,
        expiresAt,
      },
    });

    const response = successfulResponse(await work(tx));
    const completedAt = new Date();

    await tx.idempotencyRecord.update({
      where: { id: record.id },
      data: {
        status: 'COMPLETED',
        responseStatus: response.statusCode,
        responseBody: { body: response.body } as Prisma.InputJsonObject,
        completedAt,
      },
    });

    return Object.freeze({
      kind: 'executed' as const,
      idempotencyRecordId: record.id,
      requestFingerprint,
      response,
    });
  });
}
