import {
  NUMBER_SEQUENCE_STATUS,
  type NormalizedNumberSequenceDefinition,
  type NumberSequenceDefinition,
  type NumberSequenceStatus
} from './types.js';

const SEQUENCE_KEY_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const MAX_SEQUENCE_TEXT = 40;
const MAX_PAD_WIDTH = 20;
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;

/** Validate and return a required sequence key. */
function requiredSequenceKey(value: string): string {
  const normalized = value.trim();
  if (!SEQUENCE_KEY_PATTERN.test(normalized) || normalized.length > 100) {
    throw new TypeError(
      'sequenceKey must be 1-100 characters using lowercase letters, numbers, hyphens and optional dot namespaces.'
    );
  }
  return normalized;
}

/** Return safe affix. */
function safeAffix(value: string | undefined, field: 'prefix' | 'suffix'): string {
  const normalized = value ?? '';
  if (normalized.length > MAX_SEQUENCE_TEXT) {
    throw new RangeError(`${field} must not exceed ${MAX_SEQUENCE_TEXT} characters.`);
  }
  if (CONTROL_CHARACTER_PATTERN.test(normalized)) {
    throw new TypeError(`${field} must not contain control characters.`);
  }
  return normalized;
}

/** Return positive big int. */
function positiveBigInt(value: bigint | undefined, field: 'nextValue' | 'incrementBy', fallback: bigint): bigint {
  const normalized = value ?? fallback;
  if (normalized < 1n || normalized > POSTGRES_BIGINT_MAX) {
    throw new RangeError(`${field} must be between 1 and PostgreSQL BIGINT maximum.`);
  }
  return normalized;
}

/** Return pad width. */
function padWidth(value: number | undefined): number {
  const normalized = value ?? 6;
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > MAX_PAD_WIDTH) {
    throw new RangeError(`padWidth must be an integer between 1 and ${MAX_PAD_WIDTH}.`);
  }
  return normalized;
}

/** Return status. */
function status(value: NumberSequenceStatus | undefined): NumberSequenceStatus {
  const normalized = value ?? NUMBER_SEQUENCE_STATUS.ACTIVE;
  if (normalized !== NUMBER_SEQUENCE_STATUS.ACTIVE && normalized !== NUMBER_SEQUENCE_STATUS.INACTIVE) {
    throw new TypeError('status must be ACTIVE or INACTIVE.');
  }
  return normalized;
}

/** Normalize sequence key. */
export function normalizeSequenceKey(value: string): string {
  return requiredSequenceKey(value);
}

/** Normalize number sequence definition. */
export function normalizeNumberSequenceDefinition(
  input: NumberSequenceDefinition
): NormalizedNumberSequenceDefinition {
  const nextValue = positiveBigInt(input.nextValue, 'nextValue', 1n);
  const incrementBy = positiveBigInt(input.incrementBy, 'incrementBy', 1n);
  if (nextValue > POSTGRES_BIGINT_MAX - incrementBy) {
    throw new RangeError('nextValue leaves no room for one allocation using incrementBy.');
  }

  return Object.freeze({
    sequenceKey: requiredSequenceKey(input.sequenceKey),
    prefix: safeAffix(input.prefix, 'prefix'),
    suffix: safeAffix(input.suffix, 'suffix'),
    padWidth: padWidth(input.padWidth),
    nextValue,
    incrementBy,
    status: status(input.status)
  });
}

export const NUMBER_SEQUENCE_LIMITS = Object.freeze({
  maxAffixLength: MAX_SEQUENCE_TEXT,
  maxPadWidth: MAX_PAD_WIDTH,
  postgresBigIntMax: POSTGRES_BIGINT_MAX
});
