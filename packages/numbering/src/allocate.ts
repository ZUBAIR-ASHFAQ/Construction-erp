import { Prisma } from '@prisma/client';
import type { TransactionClient } from '@construction-erp/database';
import { requireRequestSecurityContext } from '@construction-erp/request-context';
import { normalizeSequenceKey } from './definition.js';
import { sequenceExhausted, sequenceInactive, sequenceNotFound } from './errors.js';
import { formatAllocatedNumber } from './format.js';
import type { AllocateNumberInput, NumberAllocation } from './types.js';

type AllocationRow = Readonly<{
  sequenceId: string;
  sequenceKey: string;
  allocatedValueText: string;
  prefix: string;
  suffix: string;
  padWidth: number;
}>;

/**
 * Allocate exactly one business number inside the caller's transaction.
 * Runtime company authority comes only from trusted request security context.
 *
 * The single UPDATE obtains PostgreSQL's row lock, advances next_value and
 * returns the value that was allocated. Concurrent callers serialize on the
 * sequence row; rollback also rolls back the allocation, so the business
 * mutation and its number can commit atomically.
 */
export async function allocateCompanyNumber(
  tx: TransactionClient,
  input: AllocateNumberInput
): Promise<NumberAllocation> {
  const security = requireRequestSecurityContext();
  const sequenceKey = normalizeSequenceKey(input.sequenceKey);

  const rows = await tx.$queryRaw<AllocationRow[]>(Prisma.sql`
    UPDATE "number_sequences"
    SET
      "next_value" = "next_value" + "increment_by",
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "company_id" = ${security.companyId}::uuid
      AND "sequence_key" = ${sequenceKey}
      AND "status" = 'ACTIVE'
      AND "next_value" <= 9223372036854775807 - "increment_by"
    RETURNING
      "id"::text AS "sequenceId",
      "sequence_key" AS "sequenceKey",
      ("next_value" - "increment_by")::text AS "allocatedValueText",
      "prefix",
      "suffix",
      "pad_width" AS "padWidth"
  `);

  const row = rows[0];
  if (!row) {
    const existing = await tx.numberSequence.findUnique({
      where: {
        companyId_sequenceKey: {
          companyId: security.companyId,
          sequenceKey
        }
      },
      select: {
        status: true,
        nextValue: true,
        incrementBy: true
      }
    });

    if (!existing) throw sequenceNotFound();
    if (existing.status !== 'ACTIVE') throw sequenceInactive();
    throw sequenceExhausted();
  }

  const value = BigInt(row.allocatedValueText);
  return Object.freeze({
    sequenceId: row.sequenceId,
    sequenceKey: row.sequenceKey,
    value,
    formatted: formatAllocatedNumber(value, row.prefix, row.suffix, row.padWidth)
  });
}
