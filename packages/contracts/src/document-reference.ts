import { INTEGRATION_CONTRACT_VERSION, normalizeReferenceId } from './primitives.js';

export type DocumentReference =
  | Readonly<{
      schemaVersion: typeof INTEGRATION_CONTRACT_VERSION;
      kind: 'document';
      documentId: string;
    }>
  | Readonly<{
      schemaVersion: typeof INTEGRATION_CONTRACT_VERSION;
      kind: 'document-version';
      documentId: string;
      versionId: string;
    }>;

/** Create document reference. */
export function createDocumentReference(documentId: string): DocumentReference {
  return Object.freeze({
    schemaVersion: INTEGRATION_CONTRACT_VERSION,
    kind: 'document',
    documentId: normalizeReferenceId(documentId, 'documentId')
  });
}

/** Create document version reference. */
export function createDocumentVersionReference(documentId: string, versionId: string): DocumentReference {
  return Object.freeze({
    schemaVersion: INTEGRATION_CONTRACT_VERSION,
    kind: 'document-version',
    documentId: normalizeReferenceId(documentId, 'documentId'),
    versionId: normalizeReferenceId(versionId, 'versionId')
  });
}
