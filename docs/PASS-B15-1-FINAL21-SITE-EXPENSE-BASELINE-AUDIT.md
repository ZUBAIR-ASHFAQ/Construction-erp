# Pass B15.1 - Final-21 Site Expense Management Baseline Audit

## Purpose

Pass B15.1 is a **non-destructive scope, dependency, and migration-readiness audit** for Final Module 14 - Site Expense Management. It does not create the Site Expense tables, routes, services, React screens, or posting logic yet. Its job is to prove that the required upstream modules are ready, freeze the exact Final-21 ownership boundary, identify the integration points B15.2+ must use, and remove any source-level blocker that would prevent the next Prisma migration.

Controlling requirements used for this audit:

- Final Module 14 - Site Expense Management (requirements pages 58-60).
- Corrected generation sequence: Site Expense Management comes after Labour / Attendance & Payroll and before Supplier Payables.
- Hard prerequisites: Project Management, Project Stages / Progress, Finance Core, and Project Budget & Cost Tracking. Documents is optional for evidence.
- Global rule: no generic CRUD routes; posting and reversal use explicit commands.
- Final release rule: posted financial/cost history is immutable and corrections use controlled reversal/adjustment.

## Baseline verification

The B14 archive was checked before any B15.2 schema work.

| Check | Result | Notes |
| --- | --- | --- |
| `node scripts/check-workspace.mjs` | PASS | Workspace structure and required stack are valid. |
| `node --test tests/final-21-*.test.mjs` | PASS | 176/176 Final-21 static tests pass before this B15.1 audit test is added. |
| `node scripts/final-21/build-legacy-cleanup-manifest.mjs --check` | PASS | Existing Final-21 cleanup manifest is current. |
| Site Expense backend/frontend/persistence search | PASS | No active `site-expenses` backend, React feature, Prisma model, or legacy Site Expense implementation exists. |
| Prisma source sanity | REPAIRED | The B14 archive contained one duplicate `Project.attendanceEntries` relation declaration. B15.1 removes only the duplicate declaration. No table, column, migration, or runtime behavior is changed. |
| Prisma validate / TypeScript / full build | NOT RUN | The uploaded archive contains no installed dependencies. No claim is made that dependency-backed gates pass. They remain mandatory from B15.2 onward. |

## B15.1 production-change boundary

This pass intentionally makes **no Site Expense production implementation** and creates **no database migration**.

The only source repair is removal of a duplicate Prisma relation field that would block a future Prisma parse/generate step. Historical migrations are untouched.

## Current Site Expense ownership

There is currently no dedicated Site Expense owner in the active Final-21 runtime:

- no `apps/api/src/modules/site-expenses/`
- no `apps/web/src/features/site-expenses/`
- no `ExpenseCategory` Prisma model
- no `SiteExpense` Prisma model
- no `/api/v1/site-expenses` routes

This is the correct starting point for B15.2. The new module can be added without merging or deleting an older Site Expense implementation.

## Dependency audit

### Module 6 - Project Management

**Status: READY**

Reusable dependency behavior already exists:

- company-scoped Project repository reads
- direct Project lookup by ID
- Project lifecycle/status model
- Administration-backed allowed Project scope
- same-company Project ownership through Prisma relations

B15 must require a Project for every Site Expense and must reject Projects outside the authenticated scope.

### Module 7 - Project Stages / Progress

**Status: READY**

Reusable dependency behavior already exists:

- company-scoped Project Stage repository
- `findStage(projectId, stageId)` ownership check
- composite Stage -> Project relation
- optional Stage usage by downstream cost modules

B15 must keep `stage_id` optional. When supplied, the Stage must belong to the same Project.

### Module 18 - Finance & Accounting

**Status: READY FOR SOURCE POSTING**

The Finance service already exposes the required source-module integration seam:

- `postSourceJournalInTransaction(...)`
- stable `sourceKey` idempotency
- open-period validation
- active GL account validation
- Project/Stage dimension validation
- balanced debit/credit enforcement
- audit/outbox generation for the posted journal

B15 must call this integration inside the same database transaction that posts the Site Expense and its Project cost effect.

Finance also owns `cash_bank_accounts`, so Site Expense must reference Finance accounts rather than creating a duplicate cash/bank master.

### Module 9 - Project Budget & Cost Tracking

**Status: READY FOR SOURCE-DERIVED ACTUAL COST**

The Final-21 cost ledger is already prepared for Site Expense:

- `CostActual` is append-oriented source-derived history
- `sourceKey` is company-unique/idempotent
- Project is required
- Stage is optional
- cost category allow-list already contains `site_expense`
- Project/Stage totals are read from source cost rows rather than manually maintained totals

Existing operational modules write their own stable source rows into `CostActual`. B15 should follow the same simple pattern and should not add a generic browser/API endpoint that writes Project actual cost directly.

### Module 21 - Documents & Audit

**Status: CORE READY; SITE EXPENSE LINK TYPE NOT YET ENABLED**

The secure upload/version/download and audit infrastructure exists. Site Expense evidence must use a Document ID/link, never a binary blob in the business table.

Current active document link resource types do not yet include `site_expense`. That is expected at B15.1. The link type should be extended only when the Site Expense resource exists and authorization can resolve it safely.

### Foundation numbering, idempotency, audit and outbox

**Status: READY**

The current runtime already uses:

- company-scoped number allocation
- `executeIdempotentCommand(...)`
- `recordAudit(...)`
- `recordOutboxEvent(...)`
- database transactions
- server-derived company/actor/project scope

B15 should reuse these existing primitives and must not introduce a second numbering, audit, event, or idempotency framework.

## Exact B15 target persistence

B15.2 should add only the Final Module 14 persistence needed by the requirements.

### `expense_categories`

Target responsibilities:

- `id`
- `company_id`
- `code`
- `name`
- `default_gl_account_id` nullable
- `status`

Required design rules:

- category code unique inside company
- default GL account, when present, must belong to the same company
- referenced categories are deactivated rather than destructively removed when history exists

### `site_expenses`

Target responsibilities:

- `id`
- `company_id`
- `project_id`
- `stage_id` nullable
- `expense_no`
- `expense_date`
- `category_id`
- `description`
- `amount`
- `payment_mode`
- `cash_bank_account_id` nullable
- `status`
- `document_id` nullable
- `created_by`
- `posted_at` nullable

B15.2 must use one forward migration and preserve all historical migrations.

## Exact API target for later B15 route pass

The final module surface is exactly:

- `GET /api/v1/site-expenses`
- `POST /api/v1/site-expenses`
- `GET /api/v1/site-expenses/:id`
- `PATCH /api/v1/site-expenses/:id`
- `POST /api/v1/site-expenses/:id/post`
- `POST /api/v1/site-expenses/:id/reverse`

Do not add generic DELETE, generic approval workflow, bulk CRUD, or hidden alternate posting routes.

## Business invariants frozen by B15.1

The next passes must preserve these rules:

1. Project is required.
2. Stage is optional, but a supplied Stage must belong to the Project.
3. Amount is positive precise decimal money.
4. Direct cash/bank payment mode requires a valid active Finance cash/bank account.
5. Draft expenses may be edited only through permitted fields.
6. Posted expenses are immutable.
7. One Site Expense post produces one accounting effect and one Project/Stage actual-cost effect in one transaction.
8. Cost actual uses category `site_expense` and a stable source key.
9. A retry must not create a second Finance journal or second Project cost row.
10. Reversal is compensating history, never deletion of the posted expense, journal, or cost row.
11. Project Profitability is a downstream reader; B15 never writes a profit total.
12. Documents store evidence metadata/versions; Site Expense stores only a reference ID.
13. Client-supplied `companyId`, actor, permissions, posting status, and authoritative totals are never trusted.

## Reusable implementation patterns

B15 should reuse the simplest patterns already proven by recent Final-21 modules:

- Project/Stage validation similar to Equipment and Labour/Payroll.
- exact decimal amount handling without `parseFloat`, browser totals, or floating-point accounting.
- module-owned `CostActual` source adapter using a stable source key.
- `FinanceService.postSourceJournalInTransaction(...)` for atomic accounting.
- Foundation idempotency wrapper for create/post/reverse commands.
- audit/outbox calls in the same transaction as the meaningful write.
- one five-file backend module: schema, repository, service, routes, index.
- React feature later limited to `api/`, `hooks/`, `components/`, `pages/`.

## Explicitly rejected scope

B15 must not introduce:

- a standalone Approval Workflow module
- Tender/Estimate/BOQ/WBS/Cost Code dependencies
- a duplicate cash/bank table
- a duplicate Project actual-cost ledger
- a duplicate document/blob storage implementation
- direct writes to Project Profitability
- generic CRUD delete for posted expense history
- background workers as a requirement for transaction correctness

## Migration readiness finding

The upstream relational shapes needed by B15 are already present:

- Project same-company composite ownership
- Stage -> Project composite ownership
- GL accounts and cash/bank accounts
- append-only Project/Stage actual cost with `site_expense` category
- Document and audit infrastructure

Therefore B15.2 can add `expense_categories` and `site_expenses` directly without creating prerequisite bridge tables.

The one B14 Prisma source duplication discovered during this audit was removed in B15.1 so it does not contaminate the next migration work.

## B15.1 exit decision

**B15.1 is complete as a scope/dependency audit and migration-readiness pass.**

No Site Expense runtime, API, UI, or database migration is intentionally implemented here.

The next pass is **B15.2 - add the Final-21 `expense_categories` and `site_expenses` Prisma models plus one forward migration**, including same-company Project/Stage/Finance/Document integrity and required indexes/constraints. Do not add service/routes/UI in B15.2.
