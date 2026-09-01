import { INTEGRATION_CONTRACT_VERSION, normalizeReferenceId, normalizeStableToken } from './primitives.js';

export type StableSourceKey = Readonly<{
  schemaVersion: typeof INTEGRATION_CONTRACT_VERSION;
  sourceModule: string;
  sourceType: string;
  sourceId: string;
  sourceLineId: string | null;
}>;

export type StableSourceKeyInput = Readonly<{
  sourceModule: string;
  sourceType: string;
  sourceId: string;
  sourceLineId?: string | null;
}>;

/** Create stable source key. */
export function createStableSourceKey(input: StableSourceKeyInput): StableSourceKey {
  return Object.freeze({
    schemaVersion: INTEGRATION_CONTRACT_VERSION,
    sourceModule: normalizeStableToken(input.sourceModule, 'sourceModule'),
    sourceType: normalizeStableToken(input.sourceType, 'sourceType'),
    sourceId: normalizeReferenceId(input.sourceId, 'sourceId'),
    sourceLineId: input.sourceLineId == null ? null : normalizeReferenceId(input.sourceLineId, 'sourceLineId')
  });
}

/** Deterministic persistence/idempotency representation; never use display numbers as source identity. */
export function serializeStableSourceKey(sourceKey: StableSourceKey): string {
  const values = [
    `v${sourceKey.schemaVersion}`,
    sourceKey.sourceModule,
    sourceKey.sourceType,
    sourceKey.sourceId,
    sourceKey.sourceLineId ?? ''
  ];
  return values.map((value) => `${value.length}:${value}`).join('|');
}
