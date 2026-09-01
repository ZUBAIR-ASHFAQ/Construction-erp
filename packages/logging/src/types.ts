export type LogProjectScope =
  | Readonly<{ kind: 'not-resolved' }>
  | Readonly<{ kind: 'all' }>
  | Readonly<{ kind: 'restricted'; projectIds: readonly string[] }>;

/**
 * Structural request-context shape. Keeping this package structurally typed
 * avoids coupling the logger to authentication while still allowing Module 24
 * to enrich logs after trusted identity/scope resolution.
 */
export type LogRequestContext = Readonly<{
  requestId: string;
  correlationId: string;
  startedAt: Date;
  security: Readonly<{
    actorUserId: string;
    companyId: string;
    projectScope: LogProjectScope;
  }> | null;
}>;

export type RequestLogBindings = Readonly<{
  requestId: string;
  correlationId: string;
  companyId?: string;
  actorUserId?: string;
  projectScopeKind?: LogProjectScope['kind'];
  projectScopeCount?: number;
}>;

/**
 * Metadata intentionally safe to copy into a future audit record, outbox event,
 * or queue job. It contains correlation/identity identifiers only — never
 * credentials, tokens, request bodies, or arbitrary headers.
 */
export type CorrelationMetadata = RequestLogBindings;

export type SafeErrorLog = Readonly<{
  name: string;
  code?: string;
  category?: string;
  statusCode?: number;
  retryable?: boolean;
}>;

export type StructuredLoggerOptionsInput = Readonly<{
  level: string;
  service: string;
  environment: string;
}>;
