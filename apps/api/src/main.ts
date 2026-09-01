import { loadServerConfig, type ServerConfig } from '@construction-erp/config';
import { createDatabaseClient } from '@construction-erp/database';
import { createS3ObjectStorage } from '@construction-erp/storage';
import { toSafeErrorLog } from '@construction-erp/logging';
import { buildApp } from './app.js';

/** Load validated server configuration or stop startup with a safe message. */
function resolveConfig(): ServerConfig {
  try {
    return loadServerConfig(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid application configuration');
    process.exit(1);
  }
}

const config = resolveConfig();

// Prisma itself consumes DATABASE_URL during generated-client initialization.
// The typed config loader validates it first and this assignment keeps the
// database package free from process.env reads.
process.env.DATABASE_URL = config.database.url;

const database = createDatabaseClient({
  logQueries: config.nodeEnv === 'development' && config.logLevel === 'trace'
});

const objectStorage = createS3ObjectStorage(config.storage);

const app = buildApp({
  appName: config.appName,
  nodeEnv: config.nodeEnv,
  logLevel: config.logLevel,
  database,
  objectStorage,
  operations: config.operations,
  webOrigins: config.webOrigins,
  authActionTokenSecret: config.authActionTokenSecret
});

let shuttingDown = false;

/** Close the API and its resources inside the configured graceful-shutdown window. */
async function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  app.log.info({ reason, graceMs: config.shutdownGraceMs }, 'shutdown.started');
  const forcedExit = setTimeout(() => {
    app.log.fatal({ reason }, 'shutdown.grace_period_exceeded');
    process.exit(1);
  }, config.shutdownGraceMs);
  forcedExit.unref();

  try {
    await app.close();
    clearTimeout(forcedExit);
    app.log.info({ reason }, 'shutdown.completed');
    process.exitCode = exitCode;
  } catch (error) {
    clearTimeout(forcedExit);
    app.log.error({ reason, error: toSafeErrorLog(error) }, 'shutdown.failed');
    process.exitCode = 1;
  }
}

process.once('SIGTERM', () => { void shutdown('SIGTERM', 0); });
process.once('SIGINT', () => { void shutdown('SIGINT', 0); });
process.once('uncaughtException', (error) => {
  app.log.fatal({ error: toSafeErrorLog(error) }, 'process.uncaught_exception');
  void shutdown('uncaughtException', 1);
});
process.once('unhandledRejection', (reason) => {
  app.log.fatal({ error: toSafeErrorLog(reason) }, 'process.unhandled_rejection');
  void shutdown('unhandledRejection', 1);
});

try {
  await app.listen({
    host: config.host,
    port: config.port
  });
} catch (error) {
  app.log.fatal({ error: toSafeErrorLog(error) }, 'startup.failed');
  await app.close().catch(() => undefined);
  process.exitCode = 1;
}
