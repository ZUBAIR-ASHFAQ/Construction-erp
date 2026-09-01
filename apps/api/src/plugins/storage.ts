import type { FastifyInstance } from 'fastify';
import type { ObjectStorage } from '@construction-erp/storage';

declare module 'fastify' {
  interface FastifyInstance {
    objectStorage: ObjectStorage;
  }
}

export type StoragePluginOptions = Readonly<{
  storage: ObjectStorage;
}>;

/**
 * Registers the Foundation object-storage adapter. Connectivity is exposed by
 * storage.checkHealth() and will be included in the later Operations readiness
 * pass rather than turning startup into a transient-provider health probe.
 */
export async function registerObjectStorage(
  app: FastifyInstance,
  options: StoragePluginOptions
): Promise<void> {
  app.decorate('objectStorage', options.storage);
  app.addHook('onClose', async () => {
    options.storage.close();
  });
}
