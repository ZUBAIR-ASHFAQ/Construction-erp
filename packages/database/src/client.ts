import { PrismaClient } from '@prisma/client';

export type DatabaseClient = PrismaClient;

export type CreateDatabaseClientOptions = Readonly<{
  logQueries?: boolean;
  /** Optional explicit datasource used by disposable test/maintenance tooling. */
  databaseUrl?: string;
}>;

/**
 * Creates a Prisma client without connecting immediately. The API lifecycle
 * owns connect/disconnect so startup can fail cleanly when PostgreSQL is down.
 *
 * Production normally relies on DATABASE_URL. Foundation testing may provide
 * an already safety-validated disposable database URL explicitly.
 */
export function createDatabaseClient(
  options: CreateDatabaseClientOptions = {}
): DatabaseClient {
  return new PrismaClient({
    ...(options.databaseUrl ? { datasourceUrl: options.databaseUrl } : {}),
    log: options.logQueries
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error']
  });
}
