import { Prisma, type PrismaClient } from '@prisma/client';
import type { QueueDiagnostics, QueueStatusCount } from './types.js';

/** Return queue diagnostics. */
export async function getQueueDiagnostics(client: PrismaClient, staleLeaseSeconds = 300): Promise<QueueDiagnostics> {
  if (!Number.isInteger(staleLeaseSeconds) || staleLeaseSeconds < 5 || staleLeaseSeconds > 86400) {
    throw new Error('staleLeaseSeconds must be an integer between 5 and 86400.');
  }

  const [groups, dueRows, staleRows] = await Promise.all([
    client.queueJob.groupBy({ by: ['queueName', 'status'], _count: { _all: true } }),
    client.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM queue_jobs
      WHERE status = 'PENDING' AND available_at <= CURRENT_TIMESTAMP
    `),
    client.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM queue_jobs
      WHERE status = 'PROCESSING'
        AND locked_at < CURRENT_TIMESTAMP - make_interval(secs => ${staleLeaseSeconds})
    `)
  ]);

  const counts: QueueStatusCount[] = groups.map((group: { queueName: string; status: string; _count: { _all: number } }) => ({
    queueName: group.queueName,
    status: group.status as QueueStatusCount['status'],
    count: group._count._all
  }));

  return Object.freeze({
    generatedAt: new Date(),
    counts: Object.freeze(counts),
    dueJobs: Number(dueRows[0]?.count ?? 0n),
    staleProcessingJobs: Number(staleRows[0]?.count ?? 0n)
  });
}
