import type { TransactionClient } from '@construction-erp/database';
import {
  requireRequestContext,
  requireRequestSecurityContext
} from '@construction-erp/request-context';
import { sanitizeOutboxPayload } from './sanitize.js';
import type { OutboxProjectScopeSnapshot, RecordOutboxEventInput } from './types.js';
import { OUTBOX_SCHEMA_VERSION } from './types.js';

const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/;

/** Validate and return a required identifier. */
function requiredIdentifier(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be a non-empty string.`);
  if (normalized.length > maxLength) throw new Error(`${field} exceeds ${maxLength} characters.`);
  return normalized;
}

/** Validate and return a stable event type. */
function eventType(value: string): string {
  const normalized = requiredIdentifier(value, 'eventType', 150);
  if (!EVENT_TYPE_PATTERN.test(normalized)) {
    throw new Error('eventType must be a stable lower-case dotted name such as user.created.');
  }
  return normalized;
}

/** Return project scope snapshot. */
function projectScopeSnapshot(): OutboxProjectScopeSnapshot {
  const scope = requireRequestSecurityContext().projectScope;
  if (scope.kind === 'restricted') {
    return Object.freeze({ kind: 'restricted', projectIds: Object.freeze([...scope.projectIds]) });
  }
  return Object.freeze({ kind: scope.kind });
}

/** Normalize one optional event date. */
function normalizedDate(input: Date | undefined, field: string): Date {
  const value = input ?? new Date();
  if (Number.isNaN(value.getTime())) throw new Error(`${field} must be a valid Date.`);
  return value;
}

/**
 * Append a domain event to the Foundation outbox using the SAME Prisma
 * transaction as the owning business mutation (and recordAudit when required).
 * No network call occurs here: commit durability is the only requirement.
 */
export async function recordOutboxEvent(tx: TransactionClient, input: RecordOutboxEventInput) {
  const context = requireRequestContext();
  const security = requireRequestSecurityContext();
  const occurredAt = normalizedDate(input.occurredAt, 'occurredAt');
  const availableAt = normalizedDate(input.availableAt ?? occurredAt, 'availableAt');

  const data = {
    schemaVersion: OUTBOX_SCHEMA_VERSION,
    companyId: security.companyId,
    actorUserId: security.actorUserId,
    projectScope: projectScopeSnapshot(),
    eventType: eventType(input.eventType),
    resourceType: requiredIdentifier(input.resourceType, 'resourceType', 100),
    resourceId: requiredIdentifier(input.resourceId, 'resourceId', 128),
    requestId: requiredIdentifier(context.requestId, 'requestId', 128),
    correlationId: requiredIdentifier(context.correlationId, 'correlationId', 128),
    payload: sanitizeOutboxPayload(input.payload ?? {}),
    occurredAt,
    availableAt
  };

  return tx.outboxEvent.create({ data });
}
