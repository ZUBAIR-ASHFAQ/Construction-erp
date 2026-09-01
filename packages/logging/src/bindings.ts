import type {
  CorrelationMetadata,
  LogRequestContext,
  RequestLogBindings
} from './types.js';

/** Return clean identifier. */
function cleanIdentifier(value: string): string {
  return value.trim();
}

/** Request log bindings. */
export function requestLogBindings(context: LogRequestContext): RequestLogBindings {
  const base = {
    requestId: cleanIdentifier(context.requestId),
    correlationId: cleanIdentifier(context.correlationId)
  };

  if (!context.security) return Object.freeze(base);

  const scope = context.security.projectScope;
  return Object.freeze({
    ...base,
    companyId: cleanIdentifier(context.security.companyId),
    actorUserId: cleanIdentifier(context.security.actorUserId),
    projectScopeKind: scope.kind,
    ...(scope.kind === 'restricted' ? { projectScopeCount: scope.projectIds.length } : {})
  });
}

/**
 * Capture only stable correlation/identity metadata for crossing an async
 * boundary. Future audit/outbox/queue passes can store this metadata without
 * copying raw HTTP input.
 */
export function captureCorrelationMetadata(context: LogRequestContext): CorrelationMetadata {
  return requestLogBindings(context);
}
