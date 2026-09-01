import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  ClaimedOutboxEvent,
  ClaimedOutboxRow,
  OutboxClaimOptions,
  OutboxCompletionOptions,
  OutboxDeadLetterOptions,
  OutboxRetryOptions
} from './types.js';
import { toClaimedOutboxEvent } from './envelope.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const DEFAULT_LEASE_SECONDS = 60;
const MAX_LEASE_SECONDS = 3600;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,99}$/;

/** Validate and return the worker identifier. */
function workerId(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error('workerId must be a non-empty string.');
  if (normalized.length > 128) throw new Error('workerId exceeds 128 characters.');
  return normalized;
}

/** Validate and return an integer inside the supported bounds. */
function boundedInteger(value: number | undefined, fallback: number, min: number, max: number, field: string): number {
  const normalized = value ?? fallback;
  if (!Number.isInteger(normalized) || normalized < min || normalized > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}.`);
  }
  return normalized;
}

/** Convert a worker failure into a stable error code. */
function stableErrorCode(value: string): string {
  const normalized = value.trim();
  if (!ERROR_CODE_PATTERN.test(normalized)) {
    throw new Error('errorCode must be a stable upper-snake-case code.');
  }
  return normalized;
}

/**
 * Atomically claims due events with PostgreSQL FOR UPDATE SKIP LOCKED. A stale
 * PROCESSING lease can be reclaimed, so a worker crash does not strand events.
 * Delivery is intentionally at-least-once; consumers must deduplicate eventId.
 */
export async function claimOutboxBatch(client: PrismaClient, options: OutboxClaimOptions): Promise<readonly ClaimedOutboxEvent[]> {
  const owner = workerId(options.workerId);
  const limit = boundedInteger(options.limit, DEFAULT_LIMIT, 1, MAX_LIMIT, 'limit');
  const leaseSeconds = boundedInteger(options.leaseSeconds, DEFAULT_LEASE_SECONDS, 5, MAX_LEASE_SECONDS, 'leaseSeconds');

  const rows = await client.$transaction((tx) => tx.$queryRaw<ClaimedOutboxRow[]>(Prisma.sql`
    WITH candidates AS (
      SELECT id
      FROM outbox_events
      WHERE
        available_at <= CURRENT_TIMESTAMP
        AND (
          status = 'PENDING'
          OR (
            status = 'PROCESSING'
            AND locked_at < CURRENT_TIMESTAMP - make_interval(secs => ${leaseSeconds})
          )
        )
      ORDER BY occurred_at ASC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE outbox_events AS event
    SET
      status = 'PROCESSING',
      locked_at = CURRENT_TIMESTAMP,
      locked_by = ${owner},
      attempt_count = event.attempt_count + 1
    FROM candidates
    WHERE event.id = candidates.id
    RETURNING
      event.id,
      event.schema_version,
      event.company_id,
      event.actor_user_id,
      event.project_scope,
      event.event_type,
      event.resource_type,
      event.resource_id,
      event.request_id,
      event.correlation_id,
      event.payload,
      event.occurred_at,
      event.available_at,
      event.attempt_count
  `));

  return Object.freeze(rows.map(toClaimedOutboxEvent));
}

/** Return mark outbox published. */
export async function markOutboxPublished(client: PrismaClient, options: OutboxCompletionOptions): Promise<boolean> {
  const result = await client.outboxEvent.updateMany({
    where: {
      id: options.eventId,
      status: 'PROCESSING',
      lockedBy: workerId(options.workerId)
    },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastErrorCode: null
    }
  });
  return result.count === 1;
}

/** Return release outbox for retry. */
export async function releaseOutboxForRetry(client: PrismaClient, options: OutboxRetryOptions): Promise<boolean> {
  if (Number.isNaN(options.retryAt.getTime())) throw new Error('retryAt must be a valid Date.');
  const result = await client.outboxEvent.updateMany({
    where: {
      id: options.eventId,
      status: 'PROCESSING',
      lockedBy: workerId(options.workerId)
    },
    data: {
      status: 'PENDING',
      availableAt: options.retryAt,
      lockedAt: null,
      lockedBy: null,
      lastErrorCode: stableErrorCode(options.errorCode)
    }
  });
  return result.count === 1;
}

/** Return mark outbox dead letter. */
export async function markOutboxDeadLetter(client: PrismaClient, options: OutboxDeadLetterOptions): Promise<boolean> {
  const result = await client.outboxEvent.updateMany({
    where: {
      id: options.eventId,
      status: 'PROCESSING',
      lockedBy: workerId(options.workerId)
    },
    data: {
      status: 'DEAD_LETTER',
      lockedAt: null,
      lockedBy: null,
      lastErrorCode: stableErrorCode(options.errorCode)
    }
  });
  return result.count === 1;
}
