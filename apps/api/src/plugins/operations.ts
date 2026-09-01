import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DatabaseClient } from '@construction-erp/database';
import type { ObjectStorage } from '@construction-erp/storage';
import type { OperationsConfig } from '@construction-erp/config';
import {
  HttpMetricsRegistry,
  getLivenessReport,
  getOperationalDiagnostics,
  getReadinessReport,
  renderAsyncInfrastructureMetrics
} from '@construction-erp/operations';

/** Return route template. */
function routeTemplate(request: FastifyRequest): string {
  const configured = request.routeOptions?.url;
  if (typeof configured === 'string' && configured.length > 0) return configured;
  return 'unknown';
}

export type OperationsPluginOptions = Readonly<{
  service: string;
  config: OperationsConfig;
  database?: DatabaseClient;
  objectStorage?: ObjectStorage;
}>;

/**
 * Registers safe operational endpoints and low-cardinality request metrics.
 * Diagnostic routes expose aggregate state only; no tenant/user/resource IDs or
 * queue/outbox payloads are serialized.
 */
export function registerOperations(app: FastifyInstance, options: OperationsPluginOptions): void {
  const metrics = new HttpMetricsRegistry();

  app.addHook('onResponse', async (request, reply) => {
    metrics.record({
      method: request.method,
      route: routeTemplate(request),
      statusCode: reply.statusCode,
      durationMs: Math.max(0, Date.now() - request.requestContext.startedAt.getTime())
    });
  });

  app.get('/health', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    return getLivenessReport(options.service);
  });

  app.get('/readiness', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    const report = await getReadinessReport(options.service, {
      ...(options.database ? { database: options.database } : {}),
      ...(options.objectStorage ? { storage: options.objectStorage } : {})
    }, options.config.readinessTimeoutMs);
    return reply.status(report.status === 'ready' ? 200 : 503).send(report);
  });

  if (!options.config.exposeDiagnostics) return;

  app.get('/metrics', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    reply.type('text/plain; version=0.0.4; charset=utf-8');

    let output = metrics.renderPrometheus();
    if (options.database) {
      try {
        const diagnostics = await getOperationalDiagnostics(options.database, options.config.staleLeaseSeconds);
        output += renderAsyncInfrastructureMetrics(diagnostics.queue, diagnostics.outbox);
        output += 'construction_erp_operational_collection_success 1\n';
      } catch {
        // Metrics must never expose raw database exceptions. HTTP/process
        // metrics remain scrapeable while readiness reports dependency failure.
        output += 'construction_erp_operational_collection_success 0\n';
      }
    } else {
      output += 'construction_erp_operational_collection_success 0\n';
    }
    return reply.send(output);
  });

  app.get('/operations/queues', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    if (!options.database) {
      return reply.status(503).send({ status: 'unavailable', code: 'DATABASE_NOT_CONFIGURED' });
    }
    const diagnostics = await getOperationalDiagnostics(options.database, options.config.staleLeaseSeconds);
    return {
      generatedAt: diagnostics.generatedAt,
      counts: diagnostics.queue.counts,
      dueJobs: diagnostics.queue.dueJobs,
      staleProcessingJobs: diagnostics.queue.staleProcessingJobs
    };
  });

  app.get('/operations/outbox', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    if (!options.database) {
      return reply.status(503).send({ status: 'unavailable', code: 'DATABASE_NOT_CONFIGURED' });
    }
    const diagnostics = await getOperationalDiagnostics(options.database, options.config.staleLeaseSeconds);
    return {
      generatedAt: diagnostics.generatedAt,
      counts: diagnostics.outbox.counts,
      dueEvents: diagnostics.outbox.dueEvents,
      staleProcessingEvents: diagnostics.outbox.staleProcessingEvents
    };
  });
}
