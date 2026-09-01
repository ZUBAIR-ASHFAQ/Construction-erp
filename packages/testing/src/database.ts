import {
  createDatabaseClient,
  type DatabaseClient,
  type TransactionClient
} from '@construction-erp/database';
import type { FoundationTestEnvironment } from './environment.js';

const RESET_SQL = `TRUNCATE TABLE
  "initial_bootstrap_runs",
  "company_configurations",
  "queue_jobs",
  "number_sequences",
  "idempotency_records",
  "outbox_events",
  "audit_logs",
  "companies"
RESTART IDENTITY CASCADE;`;

class RollbackSentinel<T> extends Error {
  /** Create a new RollbackSentinel instance. */
  constructor(readonly result: T) {
    super('FOUNDATION_TEST_ROLLBACK');
  }
}

/** Create foundation test database client. */
export function createFoundationTestDatabaseClient(environment: FoundationTestEnvironment): DatabaseClient {
  return createDatabaseClient({ databaseUrl: environment.databaseUrl });
}

/**
 * Destructive reset for the dedicated Foundation integration-test database.
 * The URL safety check must happen before the client is created.
 */
export async function resetFoundationTestData(client: DatabaseClient): Promise<void> {
  await client.$executeRawUnsafe(RESET_SQL);
}

/**
 * Execute a test inside a Prisma transaction and force rollback after a
 * successful assertion path. Real failures pass through unchanged.
 */
export async function withRollbackTestTransaction<T>(
  client: DatabaseClient,
  work: (tx: TransactionClient) => Promise<T>
): Promise<T> {
  try {
    await client.$transaction(async (tx) => {
      const result = await work(tx);
      throw new RollbackSentinel(result);
    });
    throw new Error('Rollback transaction unexpectedly committed.');
  } catch (error) {
    if (error instanceof RollbackSentinel) return error.result;
    throw error;
  }
}
