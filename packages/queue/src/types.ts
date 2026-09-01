export const QUEUE_SCHEMA_VERSION = 1 as const;

export type QueueJsonPrimitive = string | number | boolean | null;
export type QueueJsonValue = QueueJsonPrimitive | QueueJsonObject | QueueJsonValue[];
export type QueueJsonObject = { [key: string]: QueueJsonValue };
export type QueuePayloadInput = Readonly<Record<string, unknown>>;

export type QueueProjectScopeSnapshot =
  | Readonly<{ kind: 'not-resolved' }>
  | Readonly<{ kind: 'all' }>
  | Readonly<{ kind: 'restricted'; projectIds: readonly string[] }>;

/**
 * Caller supplies job intent only. company/actor/request correlation are
 * derived from trusted request context by enqueueJob().
 */
export type EnqueueJobInput = Readonly<{
  queueName: string;
  jobType: string;
  payload?: QueuePayloadInput | null;
  availableAt?: Date;
  maxAttempts?: number;
}>;

export type QueueJobEnvelope = Readonly<{
  schemaVersion: typeof QUEUE_SCHEMA_VERSION;
  jobId: string;
  queueName: string;
  jobType: string;
  companyId: string;
  actorUserId: string | null;
  projectScope: QueueProjectScopeSnapshot;
  requestId: string;
  correlationId: string;
  enqueuedAt: string;
  payload: QueueJsonObject;
}>;

export type QueueClaimOptions = Readonly<{
  queueName: string;
  workerId: string;
  limit?: number;
  leaseSeconds?: number;
}>;

export type QueueCompletionOptions = Readonly<{
  jobId: string;
  workerId: string;
}>;

export type QueueFailureOptions = Readonly<{
  jobId: string;
  workerId: string;
  errorCode: string;
  retryAt: Date;
}>;

export type ClaimedQueueRow = Readonly<{
  id: string;
  schema_version: number;
  company_id: string;
  actor_user_id: string | null;
  project_scope: unknown;
  queue_name: string;
  job_type: string;
  request_id: string;
  correlation_id: string;
  payload: unknown;
  attempt_count: number;
  max_attempts: number;
  available_at: Date;
  created_at: Date;
}>;

export type ClaimedQueueJob = Readonly<{
  envelope: QueueJobEnvelope;
  attemptCount: number;
  maxAttempts: number;
  availableAt: Date;
}>;

export type QueueFailureOutcome = 'RETRY_SCHEDULED' | 'DEAD_LETTERED' | 'LEASE_LOST';

export type QueueStatusCount = Readonly<{
  queueName: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'DEAD_LETTER';
  count: number;
}>;

export type QueueDiagnostics = Readonly<{
  generatedAt: Date;
  counts: readonly QueueStatusCount[];
  dueJobs: number;
  staleProcessingJobs: number;
}>;
