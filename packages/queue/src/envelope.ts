import { QUEUE_SCHEMA_VERSION, type ClaimedQueueJob, type ClaimedQueueRow, type QueueJsonObject, type QueueProjectScopeSnapshot } from './types.js';

/** Convert trusted project scope into a safe persisted snapshot. */
function projectScope(value: unknown): QueueProjectScopeSnapshot {
  if (!value || typeof value !== 'object') return { kind: 'not-resolved' };
  const record = value as Record<string, unknown>;
  if (record.kind === 'all') return { kind: 'all' };
  if (record.kind === 'restricted' && Array.isArray(record.projectIds)) {
    return { kind: 'restricted', projectIds: record.projectIds.filter((id): id is string => typeof id === 'string') };
  }
  return { kind: 'not-resolved' };
}

/** Sanitize and return one durable message payload. */
function payload(value: unknown): QueueJsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as QueueJsonObject : {};
}

/** Convert one claimed database row into a queue work item. */
export function toClaimedQueueJob(row: ClaimedQueueRow): ClaimedQueueJob {
  if (row.schema_version !== QUEUE_SCHEMA_VERSION) {
    throw new Error(`Unsupported queue schema version: ${row.schema_version}.`);
  }
  return Object.freeze({
    envelope: Object.freeze({
      schemaVersion: QUEUE_SCHEMA_VERSION,
      jobId: row.id,
      queueName: row.queue_name,
      jobType: row.job_type,
      companyId: row.company_id,
      actorUserId: row.actor_user_id,
      projectScope: projectScope(row.project_scope),
      requestId: row.request_id,
      correlationId: row.correlation_id,
      enqueuedAt: row.created_at.toISOString(),
      payload: payload(row.payload)
    }),
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    availableAt: row.available_at
  });
}
