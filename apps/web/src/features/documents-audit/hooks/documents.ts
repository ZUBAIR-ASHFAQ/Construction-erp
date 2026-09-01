import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getDocument,
  getDocumentDownload,
  listAuditLogs,
  listDocuments,
  uploadDocument,
  uploadDocumentVersion,
  type ListAuditLogsInput,
  type ListDocumentsInput,
  type UploadDocumentInput,
  type UploadDocumentVersionInput
} from '../api/documents-api.js';

const DOCUMENTS_QUERY_KEY = ['module-21', 'documents'] as const;
const AUDIT_LOGS_QUERY_KEY = ['module-21', 'audit-logs'] as const;

/** Load one filtered, server-paginated document page. */
export function useDocuments(input: ListDocumentsInput = {}, enabled = true) {
  return useQuery({
    queryKey: [...DOCUMENTS_QUERY_KEY, input],
    queryFn: () => listDocuments(input),
    enabled
  });
}

/** Load one document and its immutable version history. */
export function useDocument(documentId: string | null) {
  return useQuery({
    queryKey: [...DOCUMENTS_QUERY_KEY, documentId],
    queryFn: () => getDocument(documentId as string),
    enabled: documentId !== null
  });
}

/** Search audit history with permission-safe server filters. */
export function useAuditLogs(input: ListAuditLogsInput = {}, enabled = true) {
  return useQuery({
    queryKey: [...AUDIT_LOGS_QUERY_KEY, input],
    queryFn: () => listAuditLogs(input),
    enabled
  });
}

/** Upload a new document through the signed direct-upload flow. */
export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UploadDocumentInput) => uploadDocument(input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
    }
  });
}

/** Upload the next immutable version of an existing document. */
export function useUploadDocumentVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UploadDocumentVersionInput) => uploadDocumentVersion(input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
    }
  });
}

/** Request an authorized short-lived download URL. */
export function useDocumentDownload() {
  return useMutation({ mutationFn: (documentId: string) => getDocumentDownload(documentId) });
}
