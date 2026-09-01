# Stage 2 — Module 18 Document Management Contract

## Authority and prerequisite

This pass is the contract/skeleton checkpoint for **Stage 2 — Module 18: Document Management**.
The corrected execution contract places Module 18 immediately after Module 24A and before Module 22.
Part I remains authoritative for generation order, dependency gates, table ownership, and deferred integrations.

**Activation prerequisite:** Module 24A must have a live acceptance artifact whose status is
`STAGE_1_ACCEPTED_READY_FOR_STAGE_2`. Pass 46 may prepare source structure and reviewed contracts,
but it must not activate Module 18 routes, migrations, or persistence while Stage 1 is unaccepted.

## Approved purpose

Provide secure company/project document metadata, folders, versioning, access control, and an
S3-compatible object-storage workflow. Binary data stays in object storage; PostgreSQL stores
metadata and ownership.

## Stage 2 dependency rule

Module 18 depends on:

- Module 24A identity/RBAC core.
- Foundation object-storage configuration.

Project Management (Module 5) and Module 24B project-scope activation do not exist at Stage 2.
Therefore Passes 46–62 must not create a Project model, fake project membership, or a foreign key
against a future project table. The source requirement's nullable `project_id` relationship is a
deferred integration and is added only when the referenced project table exists in its approved gate.

## Approved database ownership

Module 18 owns these business tables when persistence is implemented in Pass 47:

- `document_folders`
- `documents`
- `document_versions`
- `document_links`

The core Stage 2 persistence is company-scoped. Project relationships are deferred, not simulated.

## HTTP surface

The PDF defines these eight Module 18 business routes:

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/v1/documents/upload-intents` | Create signed upload intent |
| POST | `/api/v1/documents/upload-intents/:id/complete` | Finalize uploaded file/version |
| GET | `/api/v1/documents` | List/search documents |
| GET | `/api/v1/documents/:id` | Get document metadata/version history |
| POST | `/api/v1/documents/:id/versions` | Create next-version upload intent |
| GET | `/api/v1/documents/:id/download` | Authorize and return short-lived signed URL |
| POST | `/api/v1/documents/:id/archive` | Archive document |
| POST | `/api/v1/documents/:id/restore` | Restore archived document |

No generic delete endpoint is approved.

### Pass 86 folder-browser reconciliation amendment

The same PDF also requires `document_folders` persistence and a folder/document browser, but it does not provide any folder-management HTTP route. Pass 86 resolves that mismatch with only the two smallest routes needed by the required browser:

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/v1/documents/folders` | List one folder level in the authenticated company |
| POST | `/api/v1/documents/folders` | Create a folder in the authenticated company |

This is a narrow implementation amendment, not a new ERP module or generic folder CRUD surface. There is still no folder update/delete/move endpoint. `documents.read` authorizes folder listing and `documents.upload` authorizes folder creation, so no extra permission codes are invented.

`document_links` remains an internal cross-module contract. Pass 86 adds `DocumentsService.linkDocumentToResource()` instead of exposing generic link CRUD over HTTP.

### Pass 87 relationship-integrity amendment

Pass 87 does not add a new business table or route. It adds database-level ownership guards so a future code defect cannot persist a cross-company folder parent, document folder, document owner, upload-intent actor/folder/document relationship, or a `current_version_id` that belongs to another document. The service/repository company checks remain required and continue to provide the normal user-facing authorization behavior.

The live Stage-2 gate also requires a dedicated disposable S3-compatible test bucket. A Stage-2 live acceptance result is not valid when it only exercises the in-memory Playwright storage double.


## Stable permission contract

- `documents.read`
- `documents.upload`
- `documents.version`
- `documents.archive`
- `documents.project.read`

The final code must continue to derive company, actor identity, permissions, and project scope from
trusted server context rather than client-supplied authority fields.

## Stable error contract

- `DOCUMENT_NOT_FOUND`
- `UPLOAD_INTENT_INVALID`
- `FILE_TYPE_NOT_ALLOWED`
- `FILE_SIZE_EXCEEDED`
- `DOCUMENT_SCOPE_FORBIDDEN`
- `DOCUMENT_VERSION_CONFLICT`

## Required workflow

1. User requests a signed upload intent.
2. API validates authority and creates server-owned upload intent metadata.
3. Client uploads directly to S3-compatible storage.
4. Completion verifies the server-issued storage key and uploaded object metadata before creating a document version.
5. New versions preserve all prior versions and become current without overwriting an existing object key.
6. Download re-checks authorization and returns a short-lived signed URL.
7. Archive/restore changes controlled metadata lifecycle state without destructive version deletion.

## Business invariants

- Binary data is never stored in PostgreSQL.
- A versioned object key is never overwritten.
- Signed URLs are short-lived and are created only after authorization.
- Sensitive document categories may apply stricter resource policy.
- Version numbers must be concurrency-safe and unique per document.
- Storage keys accepted by completion must belong to a server-issued upload intent.
- Allowed MIME types and file-size limits are configurable.
- Project-scoped behavior remains deferred until genuine project scope exists.

## Events

The approved durable event names are:

- `document.created`
- `document.version_added`
- `document.archived`
- `document.restored`

Business modules decide whether document changes create user-facing notifications; Document
Management itself does not broadcast every upload.

## Audit requirements

Audit document metadata changes, new versions, archive/restore, and sensitive download
authorization when required. Include actor, company/project scope, entity, request ID, and important
before/after values. Never log passwords, tokens, secrets, storage credentials, or signed URLs.

## React feature contract

Feature root: `apps/web/src/features/documents/`

Required subfolders:

- `api/`
- `hooks/`
- `components/`
- `pages/`

Minimum eventual UI: folder/document browser, upload drop-zone, version history, linked records,
preview/download actions, and permission-aware archive/restore. TanStack Query owns server state;
React Hook Form + Zod own forms. The API remains authoritative for permission enforcement.


## Pass 50 support persistence

The four core business tables remain `document_folders`, `documents`, `document_versions`, and `document_links`.
`document_upload_intents` is short-lived workflow support metadata used only to prove that an upload was server-issued before a document version is created. It is not a new business module or a replacement for document/version records.
