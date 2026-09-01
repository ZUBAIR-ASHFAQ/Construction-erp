# Pass 393 — Module 19 Submittal Backend Verification

Pass 393 is a verification-only Stage-24 checkpoint on top of Pass 392. No production business behavior is added in Pass 393.

It adds a disposable PostgreSQL/Fastify integration suite for the four currently implemented Submittal operations. The suite covers create/list/submit/review, revise-resubmit revision history, cross-company and Project scope, permission denial, same-Project Document validation, reviewer authorization, concurrent number allocation, serialized submit/review commands, PostgreSQL append-only review enforcement, and rollback when the durable `submittal.submitted` outbox insert fails.

The live integration tests run only when `RUN_FOUNDATION_DB_TESTS=1` and the normal Foundation integration database environment is configured. Dependency-free static gates remain runnable from the packaged archive.

RFI routes, RFI persistence, React Module-19 work, Daily Site Reports, Finance source adapters and Stage-27 cross-module integrations remain deferred.
