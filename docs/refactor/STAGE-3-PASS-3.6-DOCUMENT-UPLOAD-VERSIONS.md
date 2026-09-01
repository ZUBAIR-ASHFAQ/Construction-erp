# Stage 3 Pass 3.6 - Document Upload and Versions

## Scope

This pass aligns secure document upload and immutable version metadata only. Resource linking, unlinking, audit-search HTTP routes, and broader Documents UI alignment remain deferred to later Stage 3 passes.

## Implemented

- Added final `POST /api/v1/documents/uploads/init` while keeping the legacy upload-intent route temporarily for compatibility.
- Added final `POST /api/v1/documents/uploads/complete` with only `uploadIntentId` in the request body; company, actor and authority remain server-derived.
- Kept the existing `POST /api/v1/documents/:id/versions` next-version workflow.
- Upload completion now verifies storage key, size, MIME type, and SHA-256 checksum before writing document/version metadata.
- S3 HEAD requests now request provider checksum metadata with `ChecksumMode: ENABLED`.
- Added one forward PostgreSQL trigger that rejects UPDATE or DELETE on `document_versions`, making version metadata database-enforced immutable.
- Existing version-number and storage-key uniqueness constraints remain the concurrency/no-overwrite guards.
- Binary document content remains in object storage, not PostgreSQL business tables.

## Compatibility

Legacy `/api/v1/documents/upload-intents` routes remain registered so existing clients can migrate deliberately. No historical migration was edited and no legacy Document table was removed in this pass.

## Verification

- Focused Pass 3.6 tests: PASS (7/7)
- Focused migration/security regression set: PASS (20/20)
- Full static suite: PASS (3053 passed, 0 failed, 87 skipped)
- Foundation static gate: PASS (8/8)
- Module 24A compatibility gate: PASS (47/47)
- Migration policy: PASS (59/59 locked)
- Workspace check: PASS
- Function-purpose comment policy: PASS through the static suite
- TypeScript full typecheck: BLOCKED by unavailable workspace dependencies/generated package types
- Prisma validation: BLOCKED because Prisma CLI is unavailable in this environment
- Live PostgreSQL/object-storage integration proof: BLOCKED because the required disposable live environment is unavailable
