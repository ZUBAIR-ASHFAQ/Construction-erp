import type { Prisma, PrismaClient } from '@prisma/client';

export type TransactionClient = Prisma.TransactionClient;

/**
 * Shared interactive-transaction boundary for later Foundation and ERP
 * services. Business modules should keep transaction orchestration in their
 * service layer, not in HTTP routes.
 */
export async function withTransaction<T>(
  client: PrismaClient,
  work: (tx: TransactionClient) => Promise<T>
): Promise<T> {
  return client.$transaction((tx) => work(tx));
}
