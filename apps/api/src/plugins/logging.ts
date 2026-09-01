import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requestLogBindings } from '@construction-erp/logging';

/** Return route path. */
function routePath(request: FastifyRequest): string {
  const configured = request.routeOptions?.url;
  if (typeof configured === 'string' && configured.length > 0) return configured;
  return request.url.split('?')[0] || '/';
}

/** Return duration ms. */
function durationMs(request: FastifyRequest): number {
  return Math.max(0, Date.now() - request.requestContext.startedAt.getTime());
}

/**
 * Explicit request lifecycle logging. Fastify's automatic request logging is
 * disabled so Foundation controls the exact fields and never serializes raw
 * request bodies, query values, or headers into lifecycle logs.
 */
export function registerStructuredRequestLogging(app: FastifyInstance): void {
  app.addHook('onRequest', async (request) => {
    request.log.info({
      ...requestLogBindings(request.requestContext),
      http: {
        method: request.method,
        path: routePath(request)
      }
    }, 'request.started');
  });

  app.addHook('onResponse', async (request, reply) => {
    const fields = {
      ...requestLogBindings(request.requestContext),
      http: {
        method: request.method,
        path: routePath(request),
        statusCode: reply.statusCode
      },
      durationMs: durationMs(request)
    };

    if (reply.statusCode >= 500) {
      request.log.error(fields, 'request.completed');
    } else if (reply.statusCode >= 400) {
      request.log.warn(fields, 'request.completed');
    } else {
      request.log.info(fields, 'request.completed');
    }
  });

  app.addHook('onRequestAbort', async (request) => {
    request.log.warn({
      ...requestLogBindings(request.requestContext),
      http: {
        method: request.method,
        path: routePath(request)
      },
      durationMs: durationMs(request)
    }, 'request.aborted');
  });
}
