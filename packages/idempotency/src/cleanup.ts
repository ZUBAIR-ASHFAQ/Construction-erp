import { Prisma, type PrismaClient } from '@prisma/client';

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;

/** Clean up limit. */
function cleanupLimit(value: number | undefined): number {
  const normalized = value ?? DEFAULT_LIMIT;
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > MAX_LIMIT) {
    throw new TypeError(`limit must be an integer between 1 and ${MAX_LIMIT}.`);
  }
  return normalized;
}

/**
 * Deletes only expired COMPLETED records. SKIP LOCKED lets operations jobs run
 * concurrently without blocking active commands.
 */
export async function deleteExpiredIdempotencyRecords(
  client: PrismaClient,
  options: Readonly<{ limit?: number }> = {},
): Promise<number> {
  const limit = cleanupLimit(options.limit);
  const rows = await client.$transaction((tx) => tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH candidates AS (
      SELECT id
      FROM idempotency_records
      WHERE status = 'COMPLETED' AND expires_at <= CURRENT_TIMESTAMP
      ORDER BY expires_at ASC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    DELETE FROM idempotency_records AS record
    USING candidates
    WHERE record.id = candidates.id
    RETURNING record.id
  `));
  return rows.length;
}
