import type { TransactionClient } from '@construction-erp/database';
import type { ReplayJsonValue } from './json.js';

export const DEFAULT_IDEMPOTENCY_RETENTION_SECONDS = 7 * 24 * 60 * 60;
export const MIN_IDEMPOTENCY_RETENTION_SECONDS = 60;
export const MAX_IDEMPOTENCY_RETENTION_SECONDS = 30 * 24 * 60 * 60;

/**
 * fingerprintInput must be the normalized, validated business-command input.
 * Do not include secrets, credentials, access tokens or binary data.
 */
export type ExecuteIdempotentCommandInput = Readonly<{
  operation: string;
  idempotencyKey: string;
  fingerprintInput: unknown;
  retentionSeconds?: number;
}>;

export type IdempotentCommandResponse = Readonly<{
  statusCode: number;
  body: unknown;
}>;

export type IdempotentExecutionResult = Readonly<{
  kind: 'executed' | 'replayed';
  idempotencyRecordId: string;
  requestFingerprint: string;
  response: Readonly<{
    statusCode: number;
    body: ReplayJsonValue;
  }>;
}>;

export type IdempotentCommandWork = (
  tx: TransactionClient,
) => Promise<IdempotentCommandResponse>;
