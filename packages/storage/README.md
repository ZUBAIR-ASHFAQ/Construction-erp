# @construction-erp/storage

Foundation Pass 14 object-storage infrastructure for the Construction ERP.

It provides a private S3-compatible adapter, safe company-rooted storage keys,
non-overwriting object writes, bounded short-lived presigning primitives and a
provider-safe health check. It does **not** implement Document Management.
Module 18 remains responsible for upload intents, document metadata, version
history, permission checks and lifecycle actions.

Runtime company keys are created with `buildCompanyObjectKey()`, which derives
`companyId` from trusted request context rather than accepting tenant ownership
from an HTTP body.

Presigned URL helpers are low-level infrastructure. A business module must
perform its own authorization and persist the intended storage key before
returning a signed URL to a client.
