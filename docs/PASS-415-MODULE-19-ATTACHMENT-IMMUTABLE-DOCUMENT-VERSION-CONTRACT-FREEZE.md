# Pass 415 — Module 19 Initial Attachment + Immutable Document-Version Contract Freeze

## Purpose

Pass 415 freezes the smallest repair contract for cumulative audit items **A408-06** and **A408-07** without changing production behavior.

The reviewed Module-19 workflow requires an RFI to be created with attachments, and the Module-19 business rules require Document attachments to reference immutable Document versions where decision history requires it. The current implementation does neither completely: RFI creation has no initial attachment link input, while RFI responses and Submittal revisions persist only a mutable Document header ID after checking that a current version exists.

Pass 416 may implement only the contract frozen here.

## Source boundaries that control this repair

The repair preserves these reviewed boundaries:

- Module 18 owns `documents`, immutable `document_versions`, and generic `document_links`.
- The reviewed `document_links` critical fields are `id`, `document_id`, `linked_resource_type`, `linked_resource_id`, and `relation_type`; this freeze does **not** add a version column to that generic link table.
- Business modules may store Document/version IDs when they need durable evidence.
- Module 19 owns `rfis`, `rfi_responses`, `submittals`, `submittal_revisions`, and `submittal_reviews`.
- RFI responses and Submittal reviews remain append-only historical records.
- No generic CRUD route is introduced.

This freeze classifies an **RFI response** and a **submitted Submittal revision package** as decision/history evidence that must identify the exact immutable `DocumentVersion` used at command time. Initial RFI question attachments remain generic Module-18 resource links because the source-defined `document_links` shape itself is header-based.

## Frozen initial RFI attachment request contract

The existing source route remains:

```http
POST /api/v1/projects/:projectId/rfis
```

The create body may gain exactly one optional field:

```text
attachmentDocumentIds?: UUID[]
```

Rules:

- the field is optional;
- when present it contains one or more unique Document UUIDs;
- Pass 416 may apply a small bounded implementation limit of **20 Documents per command** as request-safety validation; this limit is an implementation guard, not new source business vocabulary;
- each Document must be active, belong to the same Project and authenticated Company, and have a completed current version;
- browser-supplied Company, actor, status, number or version authority remains forbidden.

No binary content is accepted by Module 19. Files continue to be uploaded/versioned through Module 18 before their IDs are referenced by Module 19.

## Frozen initial RFI attachment persistence

Pass 416 must reuse the existing Module-18 `DocumentLink` persistence instead of creating an RFI attachment table.

For each validated initial RFI attachment, create exactly this generic relationship in the same transaction as RFI creation:

```text
documentId          = supplied Document ID
linkedResourceType  = "rfi"
linkedResourceId    = newly created RFI ID
relationType        = "attachment"
```

The already-existing retry-safe `DocumentsRepository.createDocumentLink()` must be reused. No second create-link repository method is allowed.

RFI creation remains atomic: if a supplied attachment is invalid or a required link cannot be established, the new RFI and its attachment links must not partially commit.

## Frozen RFI attachment readback

The existing narrow detail amendment remains the read route:

```http
GET /api/v1/rfis/:id
```

Its `data` payload may gain:

```text
attachments[]
  documentId
```

The list is derived from Module-18 `document_links` where:

```text
linkedResourceType = "rfi"
linkedResourceId   = requested RFI ID
relationType       = "attachment"
```

Pass 416 may add exactly one necessary internal reverse-read repository method to `DocumentsRepository`, named clearly around listing resource links. It must:

- derive Company scope through the linked Document;
- accept the trusted resource type/resource ID/relation type chosen by the service;
- return stable ordering;
- remain internal and create no new public Module-18 HTTP route.

No new attachment detail endpoint is authorized.

## Frozen immutable version snapshot for RFI responses

The existing route remains:

```http
POST /api/v1/rfis/:id/respond
```

The browser continues to supply only:

```text
documentId?: UUID | null
```

The browser must **not** supply `documentVersionId`.

When a response references a Document, the service must resolve that same-Project active Document's current immutable version inside the command transaction and persist both:

```text
documentId
resolved documentVersionId
```

Pass 416 may add one nullable persistence field to `rfi_responses`:

```text
document_version_id UUID NULL
```

It must reference `document_versions.id`. New response writes with `documentId != null` must also persist the resolved version ID. A response with no Document keeps both fields null.

The RFI response API/readback shape may gain:

```text
documentVersionId: UUID | null
```

## Frozen immutable version snapshot for Submittal revisions

The existing create and submit routes remain unchanged:

```http
POST /api/v1/projects/:projectId/submittals
POST /api/v1/submittals/:id/submit
```

A DRAFT Submittal revision may still hold an optional `documentId` before submission. Immutable decision evidence is frozen when that revision is submitted.

At successful submission, the service must resolve the selected Document's current immutable version and persist:

```text
documentId
resolved documentVersionId
submittedAt
submittedBy
SUBMITTED status
```

Pass 416 may add one nullable persistence field to `submittal_revisions`:

```text
document_version_id UUID NULL
```

It must reference `document_versions.id`.

The Submittal revision API/readback shape may gain:

```text
documentVersionId: UUID | null
```

New submitted revisions must carry the exact version snapshot. DRAFT revisions may legitimately have `documentVersionId = null` until submission.

## Legacy history rule — no unsafe backfill

The migration must add the two version-reference columns as nullable.

Pass 416 must **not** backfill historical rows from a Document's current version because the current version today may not be the version that was present when an older response/revision was recorded.

Therefore:

- existing historical `rfi_responses` may remain `documentVersionId = null`;
- existing historical `submittal_revisions` may remain `documentVersionId = null`;
- new post-repair RFI responses with Documents must snapshot a version;
- new post-repair Submittal submissions must snapshot a version.

The UI may label an older `documentId` with null `documentVersionId` as legacy evidence whose exact historical version was not captured. It must not guess one.

## Frozen database/migration shape

Pass 416 may add one reviewed migration containing only the persistence required by this repair:

```text
rfi_responses.document_version_id        nullable UUID FK -> document_versions.id
submittal_revisions.document_version_id  nullable UUID FK -> document_versions.id
supporting indexes as needed for these FKs/readback
```

No new table is authorized.

The existing `document_links` table shape must remain unchanged.

## Frozen service/repository responsibilities

### DocumentsRepository

Reuse:

```text
findDocumentById()
createDocumentLink()
```

Add at most one necessary reverse resource-link reader for RFI detail attachment readback.

### RfiSubmittalsRepository

Extend existing response/revision create/update inputs to persist `documentVersionId`; do not add a parallel repository or attachment repository.

### RfiSubmittalsService

Keep authority here:

- validate same-Project active Documents;
- resolve `currentVersion.id` server-side;
- create RFI + initial links atomically;
- snapshot RFI response Document versions;
- snapshot submitted Submittal revision Document versions;
- serialize attachment and immutable-version readback.

No generic Document-management behavior moves into Module 19.

## Frozen route/API/UI behavior

Pass 416 may update only the existing Module-19 route schemas and existing React feature contract needed to expose this repair.

The existing RFI create UI may use one simple multi-value field/textarea for initial Document IDs rather than a new attachment component subsystem. Existing Module-18 navigation remains the upload/versioning workflow.

RFI detail must show initial linked Documents. RFI response history and Submittal revision history must show the exact stored version ID when available.

No new route is required, and the accepted Module-19 public route count remains **11**.

## Permission, error and event freeze

No new permission is introduced. Existing authority remains:

- `rfi.create` for initial RFI attachment linking;
- `rfi.read` for RFI detail attachment readback;
- `rfi.respond` for response evidence;
- existing Submittal create/submit/read permissions for revision evidence.

No new stable Module-19 error code is required. Existing validation/error handling may return the current validation envelope when a Document is invalid for Project/version use.

No new domain event is introduced. Existing `rfi.created`, `rfi.responded`, `submittal.submitted`, and `submittal.reviewed` vocabulary remains unchanged. Existing event/audit payloads may include the new attachment/version evidence where relevant.

## Explicit non-goals

Pass 415 does **not** authorize:

- a new RFI attachment table;
- a new Submittal attachment table;
- a `document_version_id` column on generic `document_links`;
- binary upload through Module 19;
- client-supplied `documentVersionId` authority;
- attachment delete/edit/reorder routes;
- generic RFI/Submittal CRUD;
- new permissions, stable errors or domain events;
- new backend helper/service folders;
- a second Document-link creation function;
- unsafe historical version backfill;
- the unresolved RFI `location` field;
- Module-19 notification implementation (that remains in the later shared notification repair sequence);
- Stage-25 / Module-20 production work.

## Production boundary

Pass 415 is documentation + verification only. The full accepted Pass-414 production snapshot must remain byte-identical:

```text
451 production files
c5f30d17b5b171f5e6e84a997fc68295283fb68009c13c956e82a1cd0cf733c1
```

## Acceptance for this freeze

Pass 415 is accepted only if verification proves:

- production is byte-identical to Pass 414;
- create-RFI still has no attachment input before Pass 416;
- RFI response/Submittal revision persistence still lacks immutable `documentVersionId` before Pass 416;
- Module 18 already owns immutable versions and generic Document links;
- `createDocumentLink()` already exists and is retry-safe/Company-scoped;
- no `document_version_id` is added to `document_links`;
- the frozen Pass-416 contract adds no new public route, permission, stable error, event or attachment table;
- legacy history will not be guessed/backfilled;
- the maintained static suite remains green;
- Stage 25 / Module 20 remains blocked.

## Next pass

Pass 416 is **Module 19 Attachment + Immutable Document-Version Implementation**. It must implement only the contract frozen here, then extend guarded integration/browser verification for atomic attachment linking, Company/Project isolation, immutable version snapshots, legacy-null behavior and durable detail readback.
