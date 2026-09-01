import type { DatabaseClient } from '@construction-erp/database';
import { getOutboxDiagnostics, type OutboxDiagnostics } from '@construction-erp/outbox';
import { getQueueDiagnostics, type QueueDiagnostics } from '@construction-erp/queue';
import type { OperationalDiagnostics } from './types.js';

/** Return prometheus label. */
function prometheusLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('"', '\\"');
}

/** Return operational diagnostics. */
export async function getOperationalDiagnostics(
  database: DatabaseClient,
  staleLeaseSeconds = 300
): Promise<OperationalDiagnostics> {
  const [queue, outbox] = await Promise.all([
    getQueueDiagnostics(database, staleLeaseSeconds),
    getOutboxDiagnostics(database, staleLeaseSeconds)
  ]);

  return Object.freeze({
    generatedAt: new Date().toISOString(),
    queue,
    outbox
  });
}

/** Return render async infrastructure metrics. */
export function renderAsyncInfrastructureMetrics(
  queue: QueueDiagnostics,
  outbox: OutboxDiagnostics
): string {
  const lines = [
    '# HELP construction_erp_queue_jobs Queue job count by queue and state.',
    '# TYPE construction_erp_queue_jobs gauge'
  ];

  for (const item of queue.counts) {
    lines.push(`construction_erp_queue_jobs{queue="${prometheusLabel(item.queueName)}",status="${prometheusLabel(item.status)}"} ${item.count}`);
  }
  lines.push(`construction_erp_queue_due_jobs ${queue.dueJobs}`);
  lines.push(`construction_erp_queue_stale_processing_jobs ${queue.staleProcessingJobs}`);

  lines.push('# HELP construction_erp_outbox_events Outbox event count by state.');
  lines.push('# TYPE construction_erp_outbox_events gauge');
  for (const item of outbox.counts) {
    lines.push(`construction_erp_outbox_events{status="${prometheusLabel(item.status)}"} ${item.count}`);
  }
  lines.push(`construction_erp_outbox_due_events ${outbox.dueEvents}`);
  lines.push(`construction_erp_outbox_stale_processing_events ${outbox.staleProcessingEvents}`);

  return `${lines.join('\n')}\n`;
}
