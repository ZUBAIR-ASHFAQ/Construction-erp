import {
  INTEGRATION_EVENT_ENVELOPE_VERSION,
  type IntegrationEventEnvelope,
  type IntegrationJsonObject,
  type IntegrationJsonPrimitive,
  type IntegrationJsonValue,
  type IntegrationProjectScopeSnapshot
} from '@construction-erp/contracts';

export const OUTBOX_SCHEMA_VERSION = INTEGRATION_EVENT_ENVELOPE_VERSION;

export type OutboxJsonPrimitive = IntegrationJsonPrimitive;
export type OutboxJsonValue = IntegrationJsonValue;
export type OutboxJsonObject = IntegrationJsonObject;

export type OutboxPayloadInput = Readonly<Record<string, unknown>>;
export type OutboxProjectScopeSnapshot = IntegrationProjectScopeSnapshot;

/**
 * Callers provide domain-event data only. Tenant, actor and request correlation
 * are derived from trusted request context in recordOutboxEvent().
 */
export type RecordOutboxEventInput = Readonly<{
  eventType: string;
  resourceType: string;
  resourceId: string;
  payload?: OutboxPayloadInput | null;
  occurredAt?: Date;
  availableAt?: Date;
}>;

/** Stable envelope consumed by queue/integration publishers. */
export type OutboxEnvelope = IntegrationEventEnvelope<OutboxJsonObject>;

export type OutboxClaimOptions = Readonly<{
  workerId: string;
  limit?: number;
  leaseSeconds?: number;
}>;

export type OutboxRetryOptions = Readonly<{
  eventId: string;
  workerId: string;
  retryAt: Date;
  errorCode: string;
}>;

export type OutboxCompletionOptions = Readonly<{
  eventId: string;
  workerId: string;
}>;

export type OutboxDeadLetterOptions = Readonly<{
  eventId: string;
  workerId: string;
  errorCode: string;
}>;

/** Raw row returned by the PostgreSQL SKIP LOCKED claim query. */
export type ClaimedOutboxRow = Readonly<{
  id: string;
  schema_version: number;
  company_id: string;
  actor_user_id: string | null;
  project_scope: unknown;
  event_type: string;
  resource_type: string;
  resource_id: string;
  request_id: string;
  correlation_id: string;
  payload: unknown;
  occurred_at: Date;
  available_at: Date;
  attempt_count: number;
}>;

export type ClaimedOutboxEvent = Readonly<{
  envelope: OutboxEnvelope;
  attemptCount: number;
  availableAt: Date;
}>;

export type OutboxStatusCount = Readonly<{
  status: 'PENDING' | 'PROCESSING' | 'PUBLISHED' | 'DEAD_LETTER';
  count: number;
}>;

export type OutboxDiagnostics = Readonly<{
  generatedAt: Date;
  counts: readonly OutboxStatusCount[];
  dueEvents: number;
  staleProcessingEvents: number;
}>;
