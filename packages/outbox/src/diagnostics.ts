import { Prisma, type PrismaClient } from '@prisma/client';
import type { OutboxDiagnostics, OutboxStatusCount } from './types.js';

/**
 * Aggregate-only operational diagnostics. Payloads, resource IDs, company IDs
 * and actor IDs are deliberately never selected.
 */
export async function getOutboxDiagnostics(client: PrismaClient, staleLeaseSeconds = 300): Promise<OutboxDiagnostics> {
  if (!Number.isInteger(staleLeaseSeconds) || staleLeaseSeconds < 5 || staleLeaseSeconds > 86400) {
    throw new Error('staleLeaseSeconds must be an integer between 5 and 86400.');
  }

  const [groups, dueRows, staleRows] = await Promise.all([
    client.outboxEvent.groupBy({ by: ['status'], _count: { _all: true } }),
    client.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM outbox_events
      WHERE status = 'PENDING' AND available_at <= CURRENT_TIMESTAMP
    `),
    client.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM outbox_events
      WHERE status = 'PROCESSING'
        AND locked_at < CURRENT_TIMESTAMP - make_interval(secs => ${staleLeaseSeconds})
    `)
  ]);

  const counts: OutboxStatusCount[] = groups.map((group: { status: string; _count: { _all: number } }) => ({
    status: group.status as OutboxStatusCount['status'],
    count: group._count._all
  }));

  return Object.freeze({
    generatedAt: new Date(),
    counts: Object.freeze(counts),
    dueEvents: Number(dueRows[0]?.count ?? 0n),
    staleProcessingEvents: Number(staleRows[0]?.count ?? 0n)
  });
}
