import type { TransactionClient } from '@construction-erp/database';
import { requireRequestContext, requireRequestSecurityContext } from '@construction-erp/request-context';
import { sanitizeQueuePayload } from './sanitize.js';
import { QUEUE_SCHEMA_VERSION, type EnqueueJobInput, type QueueProjectScopeSnapshot } from './types.js';

const NAME_PATTERN = /^[a-z][a-z0-9-]{0,99}$/;
const JOB_TYPE_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const DEFAULT_MAX_ATTEMPTS = 5;
const MAX_ATTEMPTS = 100;

/** Validate and return the queue name. */
function queueName(value: string): string {
  const normalized = value.trim();
  if (!NAME_PATTERN.test(normalized)) {
    throw new Error('queueName must use lower-case letters, numbers and hyphens.');
  }
  return normalized;
}

/** Validate and return the queue job type. */
function jobType(value: string): string {
  const normalized = value.trim();
  if (!JOB_TYPE_PATTERN.test(normalized) || normalized.length > 150) {
    throw new Error('jobType must be a stable lower-case dotted/dashed identifier.');
  }
  return normalized;
}

/** Return max attempts. */
function maxAttempts(value: number | undefined): number {
  const normalized = value ?? DEFAULT_MAX_ATTEMPTS;
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > MAX_ATTEMPTS) {
    throw new Error(`maxAttempts must be an integer between 1 and ${MAX_ATTEMPTS}.`);
  }
  return normalized;
}

/** Validate one trusted company identifier supplied by server-side authentication logic. */
function companyId(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error('companyId must be a non-empty string.');
  return normalized;
}

/** Return project scope snapshot. */
function projectScopeSnapshot(scope: ReturnType<typeof requireRequestSecurityContext>['projectScope']): QueueProjectScopeSnapshot {
  if (scope.kind === 'restricted') return { kind: 'restricted', projectIds: [...scope.projectIds] };
  return { kind: scope.kind };
}

/** Insert one already-authorized durable queue job inside the caller transaction. */
async function insertQueueJob(
  tx: TransactionClient,
  authority: Readonly<{
    companyId: string;
    actorUserId: string | null;
    projectScope: QueueProjectScopeSnapshot;
  }>,
  input: EnqueueJobInput
): Promise<string> {
  const context = requireRequestContext();
  const availableAt = input.availableAt ? new Date(input.availableAt.getTime()) : new Date();
  if (Number.isNaN(availableAt.getTime())) throw new Error('availableAt must be a valid Date.');

  const job = await tx.queueJob.create({
    data: {
      schemaVersion: QUEUE_SCHEMA_VERSION,
      companyId: companyId(authority.companyId),
      actorUserId: authority.actorUserId,
      projectScope: authority.projectScope,
      queueName: queueName(input.queueName),
      jobType: jobType(input.jobType),
      requestId: context.requestId,
      correlationId: context.correlationId,
      payload: sanitizeQueuePayload(input.payload),
      status: 'PENDING',
      availableAt,
      maxAttempts: maxAttempts(input.maxAttempts)
    },
    select: { id: true }
  });

  return job.id;
}

/**
 * Queue insertion is transaction-bound so a service may atomically persist its
 * business state/audit/outbox/job. A worker is never required for the owning
 * transaction itself to be correct.
 */
export async function enqueueJob(tx: TransactionClient, input: EnqueueJobInput): Promise<string> {
  const security = requireRequestSecurityContext();
  return insertQueueJob(tx, {
    companyId: security.companyId,
    actorUserId: security.actorUserId,
    projectScope: projectScopeSnapshot(security.projectScope)
  }, input);
}

/**
 * Queue one public authentication follow-up after the server has resolved the
 * target user and company. The anonymous caller is never recorded as that user.
 */
export async function enqueueUnauthenticatedJob(
  tx: TransactionClient,
  trustedCompanyId: string,
  input: EnqueueJobInput
): Promise<string> {
  return insertQueueJob(tx, {
    companyId: trustedCompanyId,
    actorUserId: null,
    projectScope: { kind: 'not-resolved' }
  }, input);
}
