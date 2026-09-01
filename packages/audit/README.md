# @construction-erp/audit

Foundation Pass 10 audit infrastructure.

## Contract

`recordAudit(tx, input)` is called from a service while its business transaction is still open. It accepts a Prisma `TransactionClient`, derives company/actor/request/project-scope identifiers from trusted request context, sanitizes before/after snapshots, and appends to the Foundation-owned `audit_logs` table.

Callers provide only:

- `action`
- `entityType`
- `entityId`
- important `before` values (optional)
- important `after` values (optional)

Callers do **not** supply `companyId`, `actorUserId`, `requestId`, `correlationId`, or authorization scope.

## Secret safety

Before/after snapshots recursively redact fields whose names indicate passwords, tokens, secrets, credentials, API keys, private keys, authorization/cookie values, or database URLs. Error messages/stacks and binary data are not persisted.

## Project scope

Foundation persists the trusted project-scope snapshot as JSON (`not-resolved`, `all`, or `restricted`). It does not create a premature `project_id` foreign key before Module 5 exists. A later gate may add a direct project relationship when the project table exists and the relationship is actually required.

## Transaction rule

Audit must be written in the same database transaction as the sensitive business mutation so the two either commit together or roll back together.
