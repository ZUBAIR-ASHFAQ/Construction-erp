import type {
  ClaimedOutboxEvent,
  ClaimedOutboxRow,
  OutboxEnvelope,
  OutboxJsonObject,
  OutboxProjectScopeSnapshot
} from './types.js';
import { OUTBOX_SCHEMA_VERSION } from './types.js';

/** Convert trusted project scope into a safe persisted snapshot. */
function projectScope(value: unknown): OutboxProjectScopeSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Stored outbox project_scope is invalid.');
  }
  const record = value as Record<string, unknown>;
  if (record.kind === 'not-resolved' || record.kind === 'all') return { kind: record.kind };
  if (record.kind === 'restricted' && Array.isArray(record.projectIds) && record.projectIds.every((x) => typeof x === 'string')) {
    return { kind: 'restricted', projectIds: Object.freeze([...record.projectIds] as string[]) };
  }
  throw new Error('Stored outbox project_scope has an unsupported shape.');
}

/** Sanitize and return one durable message payload. */
function payload(value: unknown): OutboxJsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Stored outbox payload is invalid.');
  }
  return value as OutboxJsonObject;
}

/** Convert one outbox row into the stable integration event envelope. */
export function toOutboxEnvelope(row: ClaimedOutboxRow): OutboxEnvelope {
  if (row.schema_version !== OUTBOX_SCHEMA_VERSION) {
    throw new Error(`Unsupported outbox schema version: ${row.schema_version}.`);
  }

  return Object.freeze({
    schemaVersion: OUTBOX_SCHEMA_VERSION,
    eventId: row.id,
    eventType: row.event_type,
    companyId: row.company_id,
    actorUserId: row.actor_user_id,
    projectScope: projectScope(row.project_scope),
    resource: Object.freeze({ type: row.resource_type, id: row.resource_id }),
    requestId: row.request_id,
    correlationId: row.correlation_id,
    occurredAt: row.occurred_at.toISOString(),
    payload: payload(row.payload)
  });
}

/** Convert one claimed database row into an outbox work item. */
export function toClaimedOutboxEvent(row: ClaimedOutboxRow): ClaimedOutboxEvent {
  return Object.freeze({
    envelope: toOutboxEnvelope(row),
    attemptCount: row.attempt_count,
    availableAt: row.available_at
  });
}
