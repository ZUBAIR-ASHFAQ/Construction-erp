import type { PrismaClient } from '@prisma/client';

/** Connect and execute the cheapest PostgreSQL round trip Prisma supports. */
export async function verifyDatabaseConnection(client: PrismaClient): Promise<void> {
  await client.$connect();
  await client.$queryRaw`SELECT 1`;
}

/** Disconnect database. */
export async function disconnectDatabase(client: PrismaClient): Promise<void> {
  await client.$disconnect();
}
