import { normalizeReferenceId, normalizeStableToken } from './primitives.js';

/**
 * Generic cross-cutting reference for audit, document and integration contracts.
 * Normal domain relationships still use direct foreign keys.
 */
export type CrossCuttingResourceReference = Readonly<{
  resourceType: string;
  resourceId: string;
}>;


/** Create resource reference. */
export function createResourceReference(resourceType: string, resourceId: string): CrossCuttingResourceReference {
  return Object.freeze({
    resourceType: normalizeStableToken(resourceType, 'resourceType'),
    resourceId: normalizeReferenceId(resourceId, 'resourceId')
  });
}
