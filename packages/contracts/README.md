# @construction-erp/contracts — Foundation Pass 16

This package owns the stable **cross-module integration contracts** required by the corrected Foundation execution contract before business modules consume them.

The ERP specification explicitly requires stable source keys, outbox event envelopes, document references, and financial posting commands. It does **not** prescribe exact TypeScript field names or wire schemas, so the concrete version-1 shapes in this package are Foundation engineering contracts chosen to satisfy that requirement without creating premature database foreign keys or business-module ownership.

## Contracts

### Stable source keys

`createStableSourceKey()` creates a deterministic source identity from:

```text
sourceModule
sourceType
sourceId
sourceLineId nullable
```

`serializeStableSourceKey()` produces an unambiguous length-prefixed string suitable for idempotency/unique-source storage. Display document numbers are intentionally not part of source identity.

### Cross-cutting resource references

The shared shape is exactly the generic cross-cutting pair used throughout the requirements:

```text
resourceType
resourceId
```

Use this only for cross-cutting audit/document/integration references. Normal domain relationships still use direct UUID foreign keys when their owning tables exist.

### Document references

Business modules later store Document Management IDs rather than binary files. The contract supports either a document-level link or an immutable document-version link:

```text
document -> documentId
document-version -> documentId + versionId
```

Module 18 remains the owner of file metadata, version history, signed access, and authorization. Foundation does not create document tables here.

### Versioned integration event envelope

The canonical version-1 event envelope matches the already-implemented Foundation transactional outbox fields: event ID/type, company, actor, project-scope snapshot, resource reference, request/correlation IDs, timestamp, and JSON payload. Pass 16 makes this shape reusable from `@construction-erp/contracts`; `@construction-erp/outbox` now aliases this canonical contract.

### Financial posting command

The Foundation contract defines a transport shape for later source modules and Finance adapters:

```text
sourceKey
postingDate
currency
description
lines[]
```

Monetary values are decimal **strings** so module/process boundaries never introduce binary floating-point precision loss. Lines carry a stable line key, a direct account ID, debit/credit strings, optional project/cost-dimension identifiers, and memo.

This contract intentionally does **not** implement the Finance Core posting engine. Module 15A later remains responsible for account existence, posting mappings, balanced journal validation, fiscal periods, posting, close/reversal controls, and financial authorization.

## No migration in Pass 16

These are TypeScript/wire contracts only. No new database table or foreign key is required, so the six reviewed Stage 0 migrations from Pass 15 remain unchanged.
