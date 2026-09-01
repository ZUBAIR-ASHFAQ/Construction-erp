import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  createRequestContext,
  normalizeCorrelationId,
  runWithRequestContext,
  type RequestContext
} from '@construction-erp/request-context';

declare module 'fastify' {
  interface FastifyRequest {
    requestContext: RequestContext;
  }
}

/** Return first header value. */
function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Resolve correlation id. */
function resolveCorrelationId(request: FastifyRequest): string | undefined {
  return normalizeCorrelationId(firstHeaderValue(request.headers['x-correlation-id']))
    ?? normalizeCorrelationId(firstHeaderValue(request.headers['x-request-id']));
}

/**
 * Creates one server-owned request ID for every request and establishes an
 * AsyncLocalStorage context that services/repositories can consume without
 * accepting company/actor scope from the client payload.
 */
export function registerRequestContext(app: FastifyInstance): void {
  app.decorateRequest('requestContext');

  app.addHook('onRequest', (request: FastifyRequest, reply: FastifyReply, done) => {
    const correlationId = resolveCorrelationId(request);
    const context = createRequestContext(
      correlationId
        ? { requestId: request.id, correlationId }
        : { requestId: request.id }
    );

    request.requestContext = context;
    reply.header('x-request-id', context.requestId);
    reply.header('x-correlation-id', context.correlationId);

    runWithRequestContext(context, done);
  });
}
