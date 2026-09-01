import { createHash } from 'node:crypto';
import type { NormalizedInitialBootstrapInput } from './types.js';

type CanonicalPrimitive = null | boolean | string | number;
type CanonicalValue = CanonicalPrimitive | readonly CanonicalValue[] | CanonicalObject;
interface CanonicalObject {
  readonly [key: string]: CanonicalValue;
}

/** Convert input into deterministic canonical JSON. */
function canonical(value: unknown): CanonicalValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Bootstrap fingerprint input contains a non-finite number.');
    return value;
  }
  if (typeof value === 'bigint') return value.toString();

  if (Array.isArray(value)) return value.map(canonical);

  if (typeof value === 'object') {
    const result: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) result[key] = canonical(item);
    }
    return result;
  }

  throw new TypeError(`Bootstrap fingerprint input contains unsupported value type: ${typeof value}`);
}

/** Create a SHA-256 fingerprint for normalized bootstrap input. */
export function bootstrapFingerprint(input: NormalizedInitialBootstrapInput): string {
  const fingerprintInput = {
    schemaVersion: 1,
    bootstrapKey: input.bootstrapKey,
    company: input.company,
    configuration: input.configuration,
    numberSequences: input.numberSequences,
    identity: input.identity
  };

  return createHash('sha256')
    .update(JSON.stringify(canonical(fingerprintInput)))
    .digest('hex');
}
