import { Prisma, type PrismaClient } from '@prisma/client';
import { toClaimedQueueJob } from './envelope.js';
import type {
  ClaimedQueueJob,
  ClaimedQueueRow,
  QueueClaimOptions,
  QueueCompletionOptions,
  QueueFailureOptions,
  QueueFailureOutcome
} from './types.js';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 250;
const DEFAULT_LEASE_SECONDS = 120;
const MAX_LEASE_SECONDS = 3600;
const QUEUE_NAME_PATTERN = /^[a-z][a-z0-9-]{0,99}$/;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,99}$/;

/** Validate and return non-blank text. */
function nonBlank(value: string, field: string, max = 128): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be non-empty.`);
  if (normalized.length > max) throw new Error(`${field} exceeds ${max} characters.`);
  return normalized;
}

/** Validate and return the queue name. */
function queueName(value: string): string {
  const normalized = value.trim();
  if (!QUEUE_NAME_PATTERN.test(normalized)) throw new Error('queueName is invalid.');
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
  if (!ERROR_CODE_PATTERN.test(normalized)) throw new Error('errorCode must be a stable upper-snake-case code.');
  return normalized;
}

/**
 * Claims due jobs with SKIP LOCKED. PROCESSING rows whose lease expired may be
 * reclaimed after worker crashes. Delivery is at-least-once; handlers must be
 * retry-safe/idempotent for external side effects.
 */
export async function claimQueueJobs(client: PrismaClient, options: QueueClaimOptions): Promise<readonly ClaimedQueueJob[]> {
  const queue = queueName(options.queueName);
  const owner = nonBlank(options.workerId, 'workerId');
  const limit = boundedInteger(options.limit, DEFAULT_LIMIT, 1, MAX_LIMIT, 'limit');
  const leaseSeconds = boundedInteger(options.leaseSeconds, DEFAULT_LEASE_SECONDS, 5, MAX_LEASE_SECONDS, 'leaseSeconds');

  const rows = await client.$transaction(async (tx: Prisma.TransactionClient) => {
    // A worker may crash on its final permitted attempt. Once that lease is
    // stale there is no legal next attempt, so terminalize it before claiming
    // new work rather than leaving it stranded forever in PROCESSING.
    await tx.$executeRaw(Prisma.sql`
      UPDATE queue_jobs
      SET
        status = 'DEAD_LETTER',
        locked_at = NULL,
        locked_by = NULL,
        last_error_code = COALESCE(last_error_code, 'QUEUE_WORKER_LEASE_EXPIRED'),
        dead_lettered_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE queue_name = ${queue}
        AND status = 'PROCESSING'
        AND attempt_count >= max_attempts
        AND locked_at < CURRENT_TIMESTAMP - make_interval(secs => ${leaseSeconds})
    `);

    return tx.$queryRaw<ClaimedQueueRow[]>(Prisma.sql`
      WITH candidates AS (
        SELECT id
        FROM queue_jobs
        WHERE
          queue_name = ${queue}
          AND available_at <= CURRENT_TIMESTAMP
          AND attempt_count < max_attempts
          AND (
            status = 'PENDING'
            OR (
              status = 'PROCESSING'
              AND locked_at < CURRENT_TIMESTAMP - make_interval(secs => ${leaseSeconds})
            )
          )
        ORDER BY available_at ASC, created_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE queue_jobs AS job
      SET
        status = 'PROCESSING',
        locked_at = CURRENT_TIMESTAMP,
        locked_by = ${owner},
        attempt_count = job.attempt_count + 1,
        updated_at = CURRENT_TIMESTAMP
      FROM candidates
      WHERE job.id = candidates.id
      RETURNING
        job.id,
        job.schema_version,
        job.company_id,
        job.actor_user_id,
        job.project_scope,
        job.queue_name,
        job.job_type,
        job.request_id,
        job.correlation_id,
        job.payload,
        job.attempt_count,
        job.max_attempts,
        job.available_at,
        job.created_at
    `);
  });

  return Object.freeze(rows.map(toClaimedQueueJob));
}

/** Complete queue job. */
export async function completeQueueJob(client: PrismaClient, options: QueueCompletionOptions): Promise<boolean> {
  const result = await client.queueJob.updateMany({
    where: {
      id: options.jobId,
      status: 'PROCESSING',
      lockedBy: nonBlank(options.workerId, 'workerId')
    },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastErrorCode: null
    }
  });
  return result.count === 1;
}

/**
 * Failure policy is centralized: the current attempt is dead-lettered once it
 * reaches maxAttempts; otherwise it is rescheduled. Only stable error codes are
 * persisted, never provider exception messages/stacks.
 */
export async function failQueueJob(client: PrismaClient, options: QueueFailureOptions): Promise<QueueFailureOutcome> {
  if (Number.isNaN(options.retryAt.getTime())) throw new Error('retryAt must be a valid Date.');
  const owner = nonBlank(options.workerId, 'workerId');
  const errorCode = stableErrorCode(options.errorCode);

  const rows = await client.$queryRaw<Array<{ outcome: 'RETRY_SCHEDULED' | 'DEAD_LETTERED' }>>(Prisma.sql`
    UPDATE queue_jobs
    SET
      status = CASE WHEN attempt_count >= max_attempts THEN 'DEAD_LETTER' ELSE 'PENDING' END,
      available_at = CASE WHEN attempt_count >= max_attempts THEN available_at ELSE ${options.retryAt} END,
      locked_at = NULL,
      locked_by = NULL,
      last_error_code = ${errorCode},
      dead_lettered_at = CASE WHEN attempt_count >= max_attempts THEN CURRENT_TIMESTAMP ELSE NULL END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${options.jobId}
      AND status = 'PROCESSING'
      AND locked_by = ${owner}
    RETURNING CASE WHEN status = 'DEAD_LETTER' THEN 'DEAD_LETTERED' ELSE 'RETRY_SCHEDULED' END AS outcome
  `);

  return rows[0]?.outcome ?? 'LEASE_LOST';
}
