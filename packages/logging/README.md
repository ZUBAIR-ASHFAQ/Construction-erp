# @construction-erp/logging

Structured logging primitives introduced in Foundation Pass 09 and retained by Pass 10.

## Guarantees

- server request/correlation IDs are first-class structured bindings;
- company/actor identity is logged only after trusted server-side security context exists;
- project scope logs its kind/count rather than copying arbitrary project arrays;
- request bodies are not part of lifecycle logs;
- authorization/cookies/passwords/tokens/secrets/database URLs are covered by transport redaction paths;
- custom metadata can be passed through `sanitizeLogValue`;
- exception messages/stacks are excluded by `toSafeErrorLog` because they may contain SQL or secrets;
- `captureCorrelationMetadata` creates minimal correlation metadata used by Foundation infrastructure. Pass 10 now has dedicated audit persistence; outbox/queue propagation remains later.

This package does not implement audit records, outbox persistence, or queues; those remain later Foundation passes.
