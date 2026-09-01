import type { TransactionClient } from '@construction-erp/database';
import { normalizeNumberSequenceDefinition } from './definition.js';
import { invalidSequenceDefinition, sequenceDefinitionConflict } from './errors.js';
import type { ProvisionNumberSequenceInput } from './types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Return trusted company id. */
function trustedCompanyId(value: string): string {
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw invalidSequenceDefinition(new TypeError('companyId must be a UUID supplied by trusted bootstrap orchestration.'));
  }
  return normalized;
}

/**
 * Bootstrap-only idempotent sequence provisioning. This is deliberately
 * separate from runtime allocation because initial company provisioning may
 * happen before Administration can establish an authenticated request context.
 * Never bind this function directly to an HTTP request body.
 */
export async function ensureProvisionedNumberSequence(
  tx: TransactionClient,
  input: ProvisionNumberSequenceInput
) {
  const companyId = trustedCompanyId(input.companyId);
  let definition;
  try {
    definition = normalizeNumberSequenceDefinition(input);
  } catch (cause) {
    throw invalidSequenceDefinition(cause);
  }

  const existing = await tx.numberSequence.findUnique({
    where: {
      companyId_sequenceKey: {
        companyId,
        sequenceKey: definition.sequenceKey
      }
    }
  });

  if (existing) {
    const sameDefinition =
      existing.prefix === definition.prefix &&
      existing.suffix === definition.suffix &&
      existing.padWidth === definition.padWidth &&
      existing.incrementBy === definition.incrementBy;

    if (!sameDefinition) throw sequenceDefinitionConflict();
    return existing;
  }

  return tx.numberSequence.create({
    data: {
      companyId,
      sequenceKey: definition.sequenceKey,
      prefix: definition.prefix,
      suffix: definition.suffix,
      padWidth: definition.padWidth,
      nextValue: definition.nextValue,
      incrementBy: definition.incrementBy,
      status: definition.status
    }
  });
}
