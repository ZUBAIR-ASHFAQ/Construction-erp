import type { IntegrationJsonObject } from './primitives.js';
import { INTEGRATION_CONTRACT_VERSION, normalizeReferenceId } from './primitives.js';

export const INTEGRATION_EVENT_ENVELOPE_VERSION = INTEGRATION_CONTRACT_VERSION;
const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_-]*)+$/;

export type IntegrationProjectScopeSnapshot =
  | Readonly<{ kind: 'not-resolved' }>
  | Readonly<{ kind: 'all' }>
  | Readonly<{ kind: 'restricted'; projectIds: readonly string[] }>;

/** Canonical wire shape already established by the Foundation transactional outbox. */
export type IntegrationEventEnvelope<TPayload extends IntegrationJsonObject = IntegrationJsonObject> = Readonly<{
  schemaVersion: typeof INTEGRATION_EVENT_ENVELOPE_VERSION;
  eventId: string;
  eventType: string;
  companyId: string;
  actorUserId: string | null;
  projectScope: IntegrationProjectScopeSnapshot;
  resource: Readonly<{ type: string; id: string }>;
  requestId: string;
  correlationId: string;
  occurredAt: string;
  payload: TPayload;
}>;

/** Validate integration project scope. */
export function validateIntegrationProjectScope(value: IntegrationProjectScopeSnapshot): IntegrationProjectScopeSnapshot {
  if (value.kind === 'not-resolved' || value.kind === 'all') return Object.freeze({ kind: value.kind });
  if (value.kind !== 'restricted' || value.projectIds.length === 0) {
    throw new Error('restricted project scope must contain at least one project ID.');
  }
  return Object.freeze({
    kind: 'restricted',
    projectIds: Object.freeze([...new Set(value.projectIds.map((id) => normalizeReferenceId(id, 'projectId')))])
  });
}

/** Validate stable event type. */
export function assertStableEventType(value: string): string {
  const normalized = value.trim();
  if (!EVENT_TYPE_PATTERN.test(normalized) || normalized.length > 150) {
    throw new Error('eventType must be a stable lower-case dotted name such as user.created.');
  }
  return normalized;
}
