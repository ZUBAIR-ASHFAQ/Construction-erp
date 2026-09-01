import type { FastifyInstance } from 'fastify';
import type { DatabaseClient } from '@construction-erp/database';
import {
  disconnectDatabase,
  verifyDatabaseConnection
} from '@construction-erp/database';

declare module 'fastify' {
  interface FastifyInstance {
    db: DatabaseClient;
  }
}

export type DatabasePluginOptions = Readonly<{
  client: DatabaseClient;
}>;

/**
 * Registers the centralized Prisma client and binds its lifecycle to Fastify.
 * Startup fails if PostgreSQL cannot be reached.
 */
export async function registerDatabase(
  app: FastifyInstance,
  options: DatabasePluginOptions
): Promise<void> {
  await verifyDatabaseConnection(options.client);
  app.decorate('db', options.client);

  app.addHook('onClose', async () => {
    await disconnectDatabase(options.client);
  });
}
