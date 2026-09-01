# Module 18 — Current Implementation

## Scope

Module 18 owns secure company-scoped document metadata, folders, immutable versions, document-resource links and S3-compatible storage workflows.

The backend keeps the required five-file structure:

```text
apps/api/src/modules/documents/
  documents.schema.ts
  documents.repository.ts
  documents.service.ts
  documents.routes.ts
  index.ts
```

Project relationships remain deferred until Project Management and Module 24B exist.

## Persistence

The centralized Prisma schema contains:

- `document_folders`
- `documents`
- `document_versions`
- `document_links`
- `document_upload_intents` as necessary short-lived infrastructure metadata

Important constraints include:

- immutable/unique version storage keys;
- unique version number per document;
- retry-safe document-resource links;
- same-company folder/document/user relationships;
- `documents.current_version_id` must point to a version belonging to the same document.

## Upload workflow

```text
request upload intent
  -> validate permission/company/folder/file policy
  -> create server-owned storage key
  -> return signed PUT URL + required headers
  -> browser uploads directly to object storage
  -> complete upload intent
  -> verify key/size/type/checksum
  -> create document/version metadata atomically
```

New document versions use a different immutable object key. Existing version objects are never overwritten.

## Download and lifecycle

Download requests re-check authorization before returning a short-lived signed URL. Archive and restore update metadata through explicit lifecycle commands; object versions are not destructively deleted.

## Folder browser reconciliation

The requirements define `document_folders` and require a folder/document browser but do not list folder-management routes. The implementation therefore uses only the minimum reviewed reconciliation routes:

```text
GET  /api/v1/documents/folders
POST /api/v1/documents/folders
```

No generic folder update/delete/move/copy API was added.

## Document-resource links

`DocumentsService.linkDocumentToResource()` is an internal service boundary for future ERP modules. It validates company ownership and creates a retry-safe generic document link. Future modules should call the service boundary rather than reaching directly into the Module 18 repository.

## React feature

```text
apps/web/src/features/documents/
  api/
  hooks/
  components/
  pages/
```

The UI provides folder navigation, folder creation, upload, version history, download/preview actions and archive/restore actions. Users do not manually type folder UUIDs.

## Verification

Static gate:

```bash
npm run module-18:gate
```

Live acceptance:

```bash
npm run module-18:acceptance:live
```

The live gate requires accepted Stage-1 evidence and uses real PostgreSQL plus explicitly disposable S3-compatible storage. Acceptance is valid only when `module-18-evidence/stage-2-live.json` reports:

```text
STAGE_2_ACCEPTED_READY_FOR_STAGE_3
```

## Pass 168 - deferred Project relationship activation

The original Stage-2 Document Management persistence intentionally omitted Project foreign keys because the Project master and Module 24B Project scope did not exist yet. Pass 168 activates only that previously deferred persistence relationship after both prerequisites exist.

The following nullable columns are now present:

```text
document_folders.project_id
documents.project_id
document_upload_intents.project_id
```

`document_folders.project_id` and `documents.project_id` are the requirements-owned relationships. `document_upload_intents.project_id` is internal server-owned continuity metadata so the Project selected for a signed upload is carried through completion without asking the browser to reassert authority.

All three Project references use `(project_id, company_id) -> projects(id, company_id)`. Existing company-wide document rows remain valid with `project_id = NULL`. Database triggers also prevent folder trees, documents and upload intents from mixing different nullable Project scopes.

This pass changes persistence only. Repository/service Project authorization, request schemas, OpenAPI and React Project selectors remain deferred to Pass 169 and Pass 170. The Stage-8 audit repair hold remains active.
