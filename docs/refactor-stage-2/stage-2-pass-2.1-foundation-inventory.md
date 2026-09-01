# Stage 2 - Pass 2.1 Foundation Inventory

Status: COMPLETE - inventory only, no business/runtime behavior changed.

## Purpose

Map the Foundation implementation from source code before changing it. The final 21-module requirements expect Foundation to own company master, initial provisioning, trusted request context, company isolation, stable errors/logging, idempotency, transactions, audit, outbox, queues only where needed, object storage, numbering, migration gates and tests.

## Coding rule for all following passes

- Keep code simple enough for a junior developer to follow.
- Add a short purpose comment to every function that is added or changed.
- Do not add unnecessary files, helper functions, abstractions or duplicate business logic.
- Prefer changing an existing clear file over creating a new layer.

## Source inventory

| Foundation area | Main implementation | Current finding | Next action |
| --- | --- | --- | --- |
| Company master | `packages/database/prisma/schema.prisma` `Company`; migration `20260822000100_foundation_company_master` | PRESENT. Required legal/display name, status, base currency, time zone, locale, fiscal settings and timestamps exist. | Pass 2.2 verifies every company-scoped table/FK. |
| Initial provisioning | `packages/bootstrap/src/provision.ts`; `scripts/bootstrap/initial.mjs`; Module users/RBAC bootstrap provisioner | PRESENT. Uses one DB transaction, advisory lock, request fingerprint and replay handling. Creates company/config/sequences and can create admin/system roles/permission catalog through identity provisioner. | Pass 2.3 verifies full repeat-run behavior against a live DB when available. |
| Request context | `packages/request-context`; `apps/api/src/plugins/request-context.ts` | PRESENT. Request/correlation IDs are server-established with AsyncLocalStorage. | Pass 2.4 verifies all protected routes bind authenticated security exactly once. |
| Auth-derived company/actor/permissions/project scope | `apps/api/src/plugins/authentication.ts` + users/RBAC repository | PRESENT. `authenticateRequest()` derives user company, permissions and project scope from DB records before binding security context. | Pass 2.4 traces every module route/repository for bypasses. |
| Tenant/company isolation | `packages/tenant-scope/src/scope.ts` | PRESENT. Helpers reject caller-supplied `companyId` and stamp/filter using trusted context. Static negative tests exist. | Pass 2.4 adds/validates live cross-company coverage for final modules. |
| API errors | `packages/errors`; `apps/api/src/plugins/errors.ts` | PRESENT. Stable public envelope and hidden internal details exist. | Pass 2.5 verifies consistency across all registered routes. |
| Structured logging | `packages/logging`; `apps/api/src/plugins/logging.ts` | PRESENT. Pino-compatible config and secret redaction exist. | Pass 2.5 verifies no request/body/custom logs leak secrets. |
| Audit | `packages/audit/src/record.ts`, `sanitize.ts`; `AuditLog` model | PRESENT. Audit uses the owning transaction, trusted company/actor/request scope and secret sanitization. | Pass 2.6 verifies append-only DB protection and coverage of meaningful writes. |
| Outbox | `packages/outbox`; `OutboxEvent` model | PRESENT. Transactional recording plus retry/lease/dead-letter publisher state exists. | Pass 2.5/2.6 verifies actual use and no business correctness depends on delivery. |
| Idempotency | `packages/idempotency`; `IdempotencyRecord` model | PRESENT. Company + operation + key uniqueness, fingerprint, transaction-scoped advisory lock and response replay exist. | Pass 2.5 verifies required command coverage and source-key behavior. |
| Numbering | `packages/numbering`; `NumberSequence` model | PRESENT. Allocation is company-scoped and transaction-bound. Bootstrap-only sequence provisioning is separated. | Pass 2.7 aligns final sequence keys: project, PO, invoice, receipt, payment and other approved docs. |
| Object storage | `packages/storage`; `apps/api/src/plugins/storage.ts` | PRESENT. S3-compatible storage, signed URLs and non-overwrite behavior exist. | Pass 2.7 verifies Document module is the only business file gateway and no public permanent URLs are stored. |
| Queue | `packages/queue`; `QueueJob` model; API workers | PRESENT. Durable PostgreSQL queue, leases, retries and dead-letter handling exist. | Pass 2.5 verifies queues are used only for secondary/retryable work. |
| Migration gates | `packages/database/prisma/migration-gates.json`; `scripts/migrations/*` | PRESENT, but gate history is still based on the old 24-module generation sequence. | Pass 2.8 must reconcile final 21-module migration acceptance without rewriting historical migrations unsafely. |
| Foundation tests | `tests/company-master.test.mjs`, `bootstrap.test.mjs`, `request-context.test.mjs`, `tenant-scope.test.mjs`, `foundation-acceptance.test.mjs`, `tests/integration/foundation-database.integration.test.mjs` | PRESENT. Static coverage is substantial. Live DB tests are environment-gated. | Pass 2.8 requires live DB/migration evidence before final Foundation acceptance. |

## Important findings from code, not documentation

### 1. Canonical company master already exists

`Company` is clearly marked Foundation-owned and contains the required fields. Foundation infrastructure tables (`AuditLog`, `OutboxEvent`, `IdempotencyRecord`, `NumberSequence`, `QueueJob`, `CompanyConfiguration`, `InitialBootstrapRun`) all reference it directly.

### 2. One company-scoping exception needs verification

`InventoryCountLine` has a `companyId` field but no direct Prisma `Company` relation. It is constrained transitively through composite relationships to `InventoryCount` and `InventoryItem`. The final contract says every `company_id` resolves to the Foundation company master, so Pass 2.2 must decide whether a direct company FK is required and add it if necessary.

### 3. Role company ownership is nullable

`Role.companyId` is nullable in the current schema. This came from the older users/RBAC architecture. The final Administration model describes company-owned roles. Pass 2.2/Administration alignment must verify whether global roles are still needed; do not keep nullable ownership only because the old design used it.

### 4. Bootstrap is genuinely idempotent at orchestration level

`bootstrapInitialInstallation()` uses a PostgreSQL advisory transaction lock, a stable bootstrap key, payload fingerprint, persisted bootstrap run and replay result. A second different initial company is blocked. Identity completion can resume the same pending bootstrap.

### 5. Authentication correctly derives trusted security state

`authenticateRequest()` does not accept company/permissions/project scope from the HTTP body. It looks up the access-token session, validates session/user state, resolves effective permissions/project scope from repository data and then binds `RequestSecurityContext`.

### 6. Tenant helpers are defensive but repository adoption still needs a full trace

The shared tenant-scope helpers are correct in isolation: caller `companyId` is rejected and repository predicates are stamped from context. That does not prove every repository uses them. Pass 2.4 must trace the final active repository methods and find any raw unscoped queries.

### 7. Audit/outbox/idempotency are designed to join business transactions

The shared functions accept a Prisma transaction client. This is the right design for atomic business mutation + audit + event persistence. Pass 2.5/2.6 still needs to verify actual module call sites instead of assuming every write follows the pattern.

### 8. Storage abstraction exists, but live proof is currently unavailable

The S3 implementation creates signed upload/download URLs and version-oriented puts use `IfNoneMatch: '*'` to avoid silent overwrite. Stage 0 could not perform a real storage backup because credentials/dependencies were unavailable, so no production-storage claim is made here.

### 9. Migration history is structurally healthy but semantically old-scope

Foundation migrations are ordered before dependent module tables, and explicit migration gate/checksum tooling exists. However, `migration-gates.json` still names old modules such as Module 24A/24B, Approval Workflows, Tendering, BOQ, WBS and Scheduling. Historical migrations should not be deleted casually; final-scope cleanup needs forward migrations and updated acceptance gates.

### 10. Live Foundation proof is not complete in this environment

`tests/integration/foundation-database.integration.test.mjs` only runs when `RUN_FOUNDATION_DB_TESTS=1`. Stage 0 also recorded unavailable DB credentials/dependencies. Static tests are useful evidence, but they are not a substitute for clean/previous-schema migration and live tenant-isolation tests.

## Pass 2.1 decision

Do not rewrite Foundation from scratch. The core infrastructure is mostly reusable. Harden it in-place in the following order:

1. Pass 2.2 - company master and every company FK.
2. Pass 2.3 - bootstrap/idempotent initial provisioning.
3. Pass 2.4 - request security context and cross-company/project isolation.
4. Pass 2.5 - reliability: errors, logging, transactions, idempotency, outbox and queues.
5. Pass 2.6 - audit/security hardening.
6. Pass 2.7 - numbering and object-storage contract.
7. Pass 2.8 - migrations, static/live tests and final Foundation gate.

## Pass 2.1 exit gate

- Foundation implementation locations mapped from source code: PASS.
- Known gaps recorded without changing behavior: PASS.
- No Prisma/business/API/UI behavior modified: PASS.
- No new runtime abstraction/helper created: PASS.
- Ready for Pass 2.2 company-master/FK verification: YES.
