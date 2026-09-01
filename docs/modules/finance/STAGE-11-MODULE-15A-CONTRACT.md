# Stage 11 — Module 15A Finance Core Contract

## Purpose

Stage 11 freezes the executable boundary for **Module 15A — Finance Core** before Finance Prisma models, migrations, backend code or React code are generated.

`15A` is an implementation gate inside **Module 15 — Finance & Accounting**. It is not another ERP business module.

The controlling dependency-aware order is:

```text
Stage 9   Module 6 - WBS & Cost Codes
Stage 10  Module 4B - BOQ Project Mapping
Stage 11  Module 15A - Finance Core
Stage 12  Module 7 - Budgeting & Job Costing
...
Stage 26  Module 15B - Finance Source Adapters
```

The controlling correction splits Finance into two gates so the accounting core can exist before AP/AR and source-module adapters.

## Stage prerequisite

The direct Stage-11 handoff is genuine Stage-10 live acceptance:

```text
STAGE_10_ACCEPTED_READY_FOR_STAGE_11
```

The Module 15A contract may be reviewed and frozen while that live handoff is still pending. That does not authorize Stage-11 production runtime activation or deployment.

The controlling contract gives Module 15A hard prerequisites of Foundation and Module 24A. The actual corrected execution sequence also means Projects, Module 24B, Module 6 and Module 4B already exist before Stage 11 and may be referenced where the Finance source explicitly defines optional Project/cost dimensions.

## 15A / 15B ownership split

### Owned now by Module 15A

Stage 11 owns exactly these Finance Core tables from the source-defined Module-15 table inventory:

```text
gl_accounts
fiscal_periods
journals
journal_lines
```

Stage 11 owns the accounting capabilities required by the controlling Gate-A correction:

```text
chart of accounts
fiscal periods
manual journals
balanced posting
journal reversal
trial balance
period close
```

### Deferred to Module 15B

The following source-defined Finance tables remain deferred until Stage 26:

```text
ap_invoices
ar_invoices
payments
payment_allocations
```

The following workflows also remain deferred to Module 15B or later integration completion:

```text
supplier / AP invoice adapters
PO invoice adapters
subcontract certificate adapters
payroll posting adapters
client invoice / AR adapters
payment and receipt allocation workflows
AP / AR aging and source reconciliation
```

Stage 11 must not create placeholder AP/AR/payment tables merely because Appendix A describes the complete final Module-15 shape.

## Persistence contract

### gl_accounts

Source-defined fields:

```text
id
company_id
account_code
name
account_type
parent_id nullable
status
```

Required ownership rules:

- `company_id` resolves to the Foundation Company master.
- `parent_id`, when present, is a self-reference to another GL account and must not cross Company ownership.
- account records are Company-owned accounting configuration.
- Finance repositories must preserve Company isolation.

The source does not enumerate public `account_type` or account `status` values and does not define account-tree cycle rules. Later passes must not silently invent those values or hierarchy behavior.

### fiscal_periods

Source-defined fields:

```text
id
company_id
fiscal_year
period_no
start_date
end_date
status
```

Required business meaning:

- periods are Company-owned;
- journal posting dates must resolve to an open accounting period;
- period close blocks normal posting;
- corrections after posting use reversal/adjustment behavior rather than editing posted history.

The source implies open/closed period states but does not enumerate exact public status tokens. It also does not define an API for creating, listing, opening or reopening fiscal periods.

### journals

Source-defined fields:

```text
id
company_id
journal_no
source_type
source_id nullable
posting_date
period_id
description
status
total_debit
total_credit
```

Required rules:

- `company_id` resolves to the Foundation Company master.
- `period_id` resolves to the owning Company's fiscal period.
- `journal_no` uses the existing Foundation number-sequence capability; Stage 11 must not create a second numbering system.
- `total_debit` and `total_credit` are authoritative server-calculated DECIMAL/NUMERIC values.
- debit must equal credit before posting.
- posting date must fall inside an open period.
- posted journals are immutable and are never edited or deleted.
- corrections after posting use the reviewed reversal command.

For source-generated postings, the final Finance workflow requires stable source identity plus idempotency. The Foundation already owns the canonical source-key and idempotency capabilities; Stage 11 must reuse them rather than create a Finance-only idempotency table.

The source does not enumerate journal status values or source-type values. It also does not state whether `period_id` is browser-selected or derived from `posting_date`. Later schema/service work must make that authority decision explicitly instead of guessing silently.

### journal_lines

Source-defined fields:

```text
id
journal_id
account_id
project_id nullable
cost_structure_id nullable
debit
credit
description
```

Required ownership rules:

- `journal_id` belongs to the owning Company journal.
- `account_id` references an account from the same Company.
- `project_id`, when present, references an authorized Project inside the same Company.
- monetary values use DECIMAL/NUMERIC and are transported without binary-floating precision loss.
- Project/cost dimensions must remain compatible with downstream job-cost reconciliation where required.

The source names `cost_structure_id` but does **not** explicitly identify its foreign-key target. Module 6 currently owns WBS nodes, Cost Codes, Cost Types and `project_cost_codes`; Pass 201 does not silently equate `cost_structure_id` with any one of those IDs.

The existing Foundation `FinancialPostingCommand` carries `projectId`, `wbsNodeId`, `costCodeId` and `costTypeId` dimensions separately. That existing cross-module contract does not exactly match Appendix A's single `journal_lines.cost_structure_id` field. Stage 11 keeps that mismatch explicit for the reviewed persistence/service design rather than inventing an undocumented mapping column set in this contract pass.

## Exact reviewed Stage-11 API surface

Appendix A defines ten final Module-15 operations. The controlling Part-I split means Stage 11 activates only the six Finance Core operations that do not require AP/AR/payment/source-adapter ownership:

```text
GET  /api/v1/finance/accounts
POST /api/v1/finance/journals
POST /api/v1/finance/journals/:id/post
POST /api/v1/finance/journals/:id/reverse
GET  /api/v1/finance/trial-balance
POST /api/v1/finance/periods/:id/close
```

These remain deferred to Module 15B:

```text
GET  /api/v1/finance/ap/invoices
POST /api/v1/finance/ap/invoices
GET  /api/v1/finance/ar/invoices
POST /api/v1/finance/payments
```

Do not add generic CRUD or undocumented Finance endpoints such as:

```text
POST  /api/v1/finance/accounts
PATCH /api/v1/finance/accounts/:id
GET   /api/v1/finance/periods
POST  /api/v1/finance/periods
POST  /api/v1/finance/periods/:id/reopen
GET   /api/v1/finance/journals
GET   /api/v1/finance/journals/:id
PATCH /api/v1/finance/journals/:id
DELETE /api/v1/finance/journals/:id
POST  /api/v1/finance/source-postings
```

unless the controlling contract is explicitly amended.

## Request authority boundary

All normal Finance routes require an active authenticated session.

The browser must never provide authoritative values such as:

```text
companyId
actorUserId
permissions
projectScope
journalNo
journal status
totalDebit
totalCredit
postedBy
postedAt
closedBy
closedAt
```

The service/repository must revalidate Company and, when applicable, Project resource scope before sensitive reads/writes.

For the manual journal route, operational source identity must not be forged by the browser as a substitute for the later Module-15B source adapters.

The source does not explicitly state whether a manual journal request supplies `periodId` or whether Finance derives the period from `postingDate`; keep that unresolved until the schema/service pass reviews the narrowest source-faithful design.

## Permissions

The source defines these Finance permissions:

```text
finance.accounts.read
finance.journals.read
finance.journals.create
finance.journals.post
finance.ap.manage
finance.ar.manage
finance.payments.manage
finance.periods.close
finance.reports.read
```

Stage 11 activates the Finance Core subset:

```text
finance.accounts.read
finance.journals.read
finance.journals.create
finance.journals.post
finance.periods.close
finance.reports.read
```

The AP/AR/payment permissions remain deferred with Module 15B:

```text
finance.ap.manage
finance.ar.manage
finance.payments.manage
```

Intended route mapping from the reviewed source:

```text
finance.accounts.read    -> GET accounts
finance.journals.create  -> POST manual journal
finance.journals.post    -> POST journal post / reverse
finance.reports.read     -> GET trial balance
finance.periods.close    -> POST period close
```

The source defines `finance.journals.read` but does not define a journal list/detail route in its route table. Stage 11 must not invent one solely to consume the permission.

The source also does not define a separate reversal permission. The reviewed contract therefore keeps reversal under the existing journal-posting authority unless a later contract amendment says otherwise.

## Stable source errors

The complete Module-15 source defines:

```text
ACCOUNT_NOT_FOUND
JOURNAL_NOT_BALANCED
ACCOUNTING_PERIOD_CLOSED
DUPLICATE_FINANCIAL_DOCUMENT
PAYMENT_ALLOCATION_INVALID
POSTING_MAPPING_MISSING
```

Stage 11 may use the Finance Core errors relevant to its owned workflows:

```text
ACCOUNT_NOT_FOUND
JOURNAL_NOT_BALANCED
ACCOUNTING_PERIOD_CLOSED
DUPLICATE_FINANCIAL_DOCUMENT
POSTING_MAPPING_MISSING
```

`PAYMENT_ALLOCATION_INVALID` remains deferred with Module 15B payment allocation.

The source does not define a dedicated journal-not-found, already-posted, already-reversed, period-not-found or period-already-closed code. Later passes must prefer the existing shared not-found/conflict envelope or explicitly reconcile the contract rather than silently creating a large new public error vocabulary.

## Finance Core business rules

Stage 11 freezes these source-defined rules:

- journal debit equals credit before posting;
- posting date must be inside an open period;
- all monetary values use DECIMAL/NUMERIC and precision-safe serialization;
- posted journals are never edited or deleted;
- source postings use stable source identity and idempotency;
- Project/cost dimensions reconcile to job-cost actuals where required;
- period close blocks normal posting except an authorized reopen/adjustment workflow;
- repository reads/writes enforce Company ownership and allowed Project scope;
- sensitive writes use Foundation audit/outbox behavior after successful validation.

The source only explicitly requires journal-level balance before posting. It does not specify the complete manual-journal line validation vocabulary. The existing Foundation cross-module posting contract requires each integration line to carry exactly one debit or credit, but Pass 201 does not silently promote that separate integration-contract rule into the manual-journal HTTP contract.

## Events, audit and outbox

Stage 11 activates only the source event names owned by Finance Core:

```text
journal.posted
journal.reversed
accounting_period.closed
```

These source event names remain deferred with Module 15B:

```text
ap_invoice.posted
ar_invoice.posted
payment.posted
```

The source does not define `journal.created`, `account.created` or `accounting_period.reopened`; do not invent them during Stage 11.

Audit-sensitive Finance Core actions include account setup, journal posting, reversal and period close/reopen. Audit records include actor, Company/Project scope, entity, request ID and important before/after values without secrets.

The route table defines period close but no period-reopen command. Reopen therefore remains an explicit source-contract gap rather than an invented Stage-11 endpoint.

Reviewed domain events use the Foundation outbox after successful business validation. Core posting correctness never depends on a background worker.

## Required backend structure after implementation

When production generation is authorized, Finance uses the source-defined five-file backend module:

```text
apps/api/src/modules/finance/
├── finance.schema.ts
├── finance.repository.ts
├── finance.service.ts
├── finance.routes.ts
└── index.ts
```

Prisma schema and migrations remain centralized under `packages/database/prisma/`.

Do not create an extra adapter/service tree in 15A for source modules that belong to 15B.

## React boundary for Stage 11

The final Module-15 UI includes Chart of Accounts, journal entry/posting, AP/AR registers, payment allocation, trial balance, ledgers, aging and period controls.

Because Part I splits Finance, the Stage-11 React implementation may activate only Finance Core UI supported by the 15A route boundary, such as:

```text
Chart of Accounts read view
manual journal entry/post/reverse controls
trial balance
period close status/control
```

AP/AR registers, payment allocation and AP/AR aging are deferred to 15B.

The source mentions ledgers and broader period controls but the reviewed route table does not provide ledger, period-list, period-create or reopen operations. Stage 11 must not invent frontend-only server state or hidden APIs to simulate them.

## Existing Foundation financial-posting contract

Foundation already defines a canonical `FinancialPostingCommand` with stable source identity, precision-safe debit/credit strings and optional Project/WBS/Cost Code/Cost Type dimensions.

Finance Core becomes the accounting owner that eventually validates account existence, posting mapping, balance, period and posting-state rules for that contract. Stage 11 must reuse the canonical contract rather than introduce a competing cross-module wire format.

Actual supplier, PO, subcontract, payroll and client-billing adapters that call into Finance remain deferred to Module 15B after their source schemas exist.

## Source-contract gaps kept explicit

Pass 201 keeps these unresolved items visible:

1. The workflow requires configuring Chart of Accounts, but the reviewed route table provides only `GET /finance/accounts` and no create/update command.
2. The workflow requires configuring fiscal periods, but the reviewed route table provides only period close and no list/create/open/reopen command.
3. The source defines `finance.journals.read`, journal UI and ledger review, but no journal list/detail route.
4. Period-close rules mention authorized reopen/adjustment, but no reopen/adjustment endpoint or exact workflow is defined.
5. The source does not enumerate account types, Finance statuses, journal source types or exact lifecycle tokens.
6. The source does not state whether `journals.period_id` is browser-supplied or derived from `posting_date`.
7. The source defines `journal_lines.cost_structure_id` without identifying the exact foreign-key target, while the existing Foundation posting contract carries separate WBS/Cost Code/Cost Type dimensions.
8. Reversal is required, but the source table definition contains no explicit `reversal_of_id` or equivalent linkage field and does not define the exact persistence shape of a reversal.
9. Source posting requires idempotency, but the Finance table list does not define a Finance-specific idempotency column/table; the existing Foundation idempotency capability must be reused rather than duplicated.

These gaps must not be silently filled by generic CRUD, speculative columns or invented public enums.

## Pass 201 boundary

Pass 201 is contract-only. It does not add or change:

```text
Prisma models
migration SQL
Finance API production files
Fastify registration
OpenAPI runtime operations
React production files
Playwright tests
Finance permissions at runtime
Finance domain-event runtime emission
AP / AR / payment persistence
source-module adapters
```

The next pass is:

```text
Pass 202 - Module 15A reviewed Finance Core Prisma models and migration
```

Runtime/deployment acceptance remains blocked until the Stage-10 live handoff is genuine.

## Pass 202 reviewed persistence resolution

Pass 202 resolves only the persistence ambiguity that must be settled before the Finance Core schema can exist:

```text
journal_lines.cost_structure_id -> project_cost_codes.id
```

This is an explicit Stage-11 persistence interpretation, not a new HTTP field or a new Finance master table. `project_cost_codes` is the already-generated Module-6 row that represents one Project/WBS/Cost Code/Cost Type posting combination, and Module 6 defines Finance as one of its downstream consumers.

The database therefore enforces that a journal-line cost structure belongs to the Journal Company and, when `project_id` is also present, to that exact Project. A line may still omit either nullable dimension because the source defines both fields as nullable.

The existing Foundation `FinancialPostingCommand` continues to carry its separate `projectId`, `wbsNodeId`, `costCodeId` and `costTypeId` dimensions. A later Finance service pass must resolve and validate those separate dimensions against the single persisted `ProjectCostCode` row; Pass 202 does not change the cross-module wire contract.

Pass 202 does **not** resolve the remaining public-contract gaps around Finance status tokens, source-type vocabulary, account-tree cycle policy, period reopen, reversal linkage, journal read routes or account/period configuration routes.

## Pass 202 boundary

Pass 202 generates only the reviewed Finance Core persistence and migration:

```text
gl_accounts
fiscal_periods
journals
journal_lines
```

It does not generate Finance Zod schemas, repositories, services, routes, React code, AP/AR/payment tables or source adapters. Runtime deployment remains blocked until genuine Stage-10 live acceptance.

The next pass is:

```text
Pass 203 - Module 15A Finance Core Zod request/response schema boundary
```

## Pass 203 reviewed API-schema resolutions

Pass 203 resolves only the request/response choices required to define strict Zod contracts for the six already-reviewed Finance Core operations. It does not add routes or runtime Finance behavior.

### Manual journal authority

The manual-journal request accepts only:

```text
postingDate
 description
 lines[]
   accountId
   projectId optional
   costStructureId optional
   debit
   credit
   description
```

`periodId` is deliberately **not** browser input. Finance Core derives the owning fiscal period from `postingDate` and then verifies that the resolved period is open. This is the narrowest design that enforces the source rule that posting dates must be inside an open period without exposing undocumented period-selection authority to the browser.

The manual-journal route also does not accept `sourceType` or `sourceId`. It is already explicitly the reviewed **manual journal** operation, while operational source identities belong to the canonical Foundation posting contract and later 15B adapters.

A draft manual journal is not required to be balanced at request-schema time. The source requires debit equals credit **before posting**, so `JOURNAL_NOT_BALANCED` remains a posting/service rule. Pass 203 also does not invent an additional per-line debit/credit exclusivity rule for the manual-journal HTTP contract; the separate Foundation integration command retains its own stricter line normalization.

### Command payloads

The reviewed journal-post, journal-reverse and period-close routes define no business payload fields, so Stage 11 treats them as strict bodyless commands:

```text
POST /finance/journals/:id/post      {}
POST /finance/journals/:id/reverse   {}
POST /finance/periods/:id/close      {}
```

Actor identity and resulting status remain server-owned.

### Account-list query

The source documents no account-specific filters. `GET /finance/accounts` therefore accepts only bounded `page` / `pageSize` pagination and rejects invented search/type/status filters until the source contract is amended.

### Trial-balance query and response

`GET /finance/trial-balance` requires one `periodId` query value. The route purpose says "Trial balance for allowed period" and the persisted Finance Core model already identifies fiscal periods by UUID; Stage 11 does not invent date-range or fiscal-year alternatives.

The minimum response interpretation is:

```text
periodId
rows[]
  accountId
  accountCode
  accountName
  debit
  credit
totalDebit
totalCredit
```

This is an explicit Stage-11 response-shape interpretation needed to make the reviewed trial-balance read executable. It does not add ledger, aging or period-management data that belongs outside the six-route Stage-11 boundary.

### Finance response authority

Finance responses expose safe business identifiers and accounting values but never `companyId`, permissions, Project scope or actor identity. Journal readback may expose its server-owned journal number, source identity, fiscal period, status and calculated totals; those remain output-only.

Account types, account/period/journal statuses and source-type values remain string-backed output values because the source still does not enumerate stable public token sets. Pass 203 does not create public enums for them.

## Pass 203 boundary

Pass 203 generates only:

```text
apps/api/src/modules/finance/finance.schema.ts
```

plus its static gate/evidence and existing project verification updates. It does not generate the Finance repository, service, routes, Fastify registration, OpenAPI runtime documents, React feature, AP/AR/payment contracts or source adapters.

The next pass is:

```text
Pass 204 - Module 15A Finance Core repository with Company/Project isolation and decimal-safe journal persistence workflows
```

Runtime deployment remains blocked until genuine Stage-10 live acceptance.

## Pass 204 reviewed repository boundary

Pass 204 adds only the Finance Core repository after the reviewed persistence and Zod boundaries:

```text
apps/api/src/modules/finance/finance.repository.ts
```

The repository derives Company ownership only from the trusted request context. It does not accept `companyId`, permissions or Project scope as journal business input.

### Finance Core reads and locks

The repository provides only the persistence operations needed by the six reviewed Stage-11 workflows:

```text
bounded Chart-of-Accounts listing/read
fiscal-period lookup by id
fiscal-period lookup by posting date
fiscal-period row lock
Company-owned Project lookup
Company-owned ProjectCostCode lookup
journal create/read
journal row lock
journal status transition
period status transition
trial-balance aggregation
```

No account mutation repository, period-setup repository, journal CRUD register, AP/AR repository, payment repository or source-adapter repository is added.

### Manual journal persistence

`createJournal` receives only server-prepared values. The service remains responsible for numbering, lifecycle/status decisions, open-period rules, permissions, exact Project authorization and decimal total calculation.

Before creating a journal, the repository defensively confirms that the selected period, every account, every optional Project and every optional `ProjectCostCode` row belongs to the authenticated Company. When both `projectId` and `costStructureId` are present on one line, the `ProjectCostCode` row must belong to that exact Project.

Journal header and line amounts remain decimal strings at the repository boundary and are passed directly to Prisma DECIMAL columns. The repository does not convert accounting money through JavaScript `number` arithmetic.

### Project-aware trial balance

Trial-balance aggregation uses Prisma/PostgreSQL decimal aggregation and converts the resulting Decimal values directly to strings. It never sums money with binary floating-point arithmetic.

Project visibility is applied at journal-line level. A line with only `costStructureId` is still Project-scoped because `cost_structure_id` resolves to a Project-owned `project_cost_codes` row. Restricted Project reports therefore cannot leak a line merely because `journal_lines.project_id` is null.

The repository accepts the journal lifecycle statuses selected by the later Finance service instead of inventing a public `POSTED` enum in Pass 204. Exact Finance lifecycle tokens remain a service-contract decision because the reviewed source does not enumerate them.

### Locking boundary

`lockJournalForWrite` provides the row lock needed by later post/reverse commands. `lockFiscalPeriodForWrite` provides the row lock needed to serialize posting against period close. Pass 204 does not itself perform posting, reversal or close transitions.

## Pass 204 boundary

Pass 204 generates the repository plus static gate/evidence only. It does not generate Finance service logic, routes, Fastify registration, OpenAPI runtime, React, Playwright, AP/AR/payment persistence or source-module adapters.

The next pass is:

```text
Pass 205 - Module 15A Finance Core service and business rules
```

Runtime deployment remains blocked until genuine Stage-10 live acceptance.

## Pass 205 reviewed service boundary

Pass 205 adds only the Finance Core service/business rules required by the six already-frozen Stage-11 operations:

```text
apps/api/src/modules/finance/finance.service.ts
```

The service reuses the Pass-204 repository and Foundation audit, outbox and number-sequence packages. It does not add Finance routes, AP/AR/payment behavior, source adapters or new persistence.

### Internal Finance lifecycle tokens

The source requires draft/post/reverse and open/close behavior but does not enumerate exact status strings. Pass 205 therefore records the minimum persisted service interpretation explicitly:

```text
journal status: DRAFT -> POSTED -> REVERSED
period status:  OPEN -> CLOSED
```

These are service-owned persistence tokens. They are not new browser-selectable Zod enums and no additional lifecycle such as APPROVED, VOID, REOPENED or ADJUSTMENT is invented.

Manual journals use internal `source_type = MANUAL`. Reversal journals use `source_type = REVERSAL` with `source_id = original journal id`. This uses the existing stable source columns to make the reversal relationship durable without inventing a `reversal_of` column.

### Foundation journal numbering

All journals allocate their server-owned number through the existing Foundation number-sequence transaction helper. Stage 11 uses the explicit sequence key:

```text
finance.journal
```

The sequence must be provisioned through the existing trusted Foundation/bootstrap number-sequence capability. Finance Core does not auto-create a second numbering store or accept the sequence key from the browser.

### Manual journal creation

The service:

1. derives the fiscal period from `postingDate`;
2. requires exactly one matching `OPEN` period;
3. validates all accounts inside the authenticated Company;
4. resolves every optional Project and Module-6 `ProjectCostCode` mapping;
5. requires active/posting-enabled cost structures for new journal lines;
6. revalidates exact Project permission for each Project-scoped line;
7. requires Company permission only when at least one line is Company-wide;
8. calculates debit and credit totals with exact integer minor-unit arithmetic;
9. allocates the journal number in the same transaction; and
10. persists a `DRAFT` manual journal.

Draft creation does not emit a new `journal.created` event because the reviewed Finance event inventory does not define one.

### Posting

Posting locks the journal and its fiscal period. A DRAFT journal may move to POSTED only when:

- the caller has the required Company/Project `finance.journals.post` authority;
- its current cost mappings remain valid for posting;
- the owning fiscal period is still `OPEN`; and
- exact debit and credit totals are equal.

A successful transition writes audit history and exactly the reviewed `journal.posted` outbox event in the same transaction. A repeated post of an already-POSTED journal returns the current journal without emitting a second event.

### Reversal

The reviewed reverse command creates an opposite journal rather than editing posted debit/credit lines. The reversal:

- keeps the original posting date, fiscal period, accounts and Project/cost dimensions;
- swaps each line debit and credit;
- swaps journal debit and credit totals;
- allocates a new Foundation journal number;
- persists the reversal journal directly as POSTED;
- links it by `source_type = REVERSAL` and `source_id = original journal id`; and
- transitions the original journal from POSTED to REVERSED.

The entire reversal, original status transition, audit row and `journal.reversed` outbox event commit atomically. A repeated reverse resolves the already-created reversal through the same stable source identity rather than creating another journal.

Because the source mentions an authorized reopen/adjustment workflow but defines no reopen or adjustment route, Stage 11 does not invent one. A journal whose original period is already closed cannot be reversed through this bodyless Stage-11 command; it returns `ACCOUNTING_PERIOD_CLOSED` until the controlling contract defines the missing after-close adjustment workflow.

### Trial balance

Trial balance includes both POSTED journals and REVERSED original journals. A reversal does not erase the original accounting entry: the original lines remain reportable and the opposite POSTED reversal journal offsets them while preserving immutable history.

Company-wide `finance.reports.read` includes Company-wide lines plus allowed Project lines. Project-only report authority returns only lines whose direct Project or resolved `ProjectCostCode` Project is authorized.

### Period close

Period close is a Company-level `finance.periods.close` command. The service locks the fiscal-period row and performs only:

```text
OPEN -> CLOSED
```

A repeated close is idempotent and does not emit a duplicate event. Successful first close writes audit history and exactly the reviewed `accounting_period.closed` outbox event in the same transaction.

The source does not require Stage 11 to reject close merely because DRAFT journals exist, so Pass 205 does not invent that blocker.

## Pass 205 boundary

Pass 205 changes only the existing Finance repository where one stable-source lookup and posting-status relation data are directly required by reversal/posting, plus the new Finance service and static gate/evidence.

It does not generate:

```text
finance.routes.ts
finance/index.ts
Fastify registration
OpenAPI runtime operations
React Finance UI
Playwright
new Prisma models or migrations
AP / AR / payments
source-module posting adapters
period reopen / adjustment API
account or period configuration API
journal CRUD/read API
```

The next pass is:

```text
Pass 206 - Module 15A Finance Core Fastify routes and OpenAPI registration
```

Runtime deployment remains blocked until genuine Stage-10 live acceptance.

## Pass 206 reviewed HTTP and OpenAPI boundary

Pass 206 activates the existing six Stage-11 Finance Core operations in Fastify without widening the Module-15A scope:

```text
GET  /api/v1/finance/accounts
POST /api/v1/finance/journals
POST /api/v1/finance/journals/:id/post
POST /api/v1/finance/journals/:id/reverse
GET  /api/v1/finance/trial-balance
POST /api/v1/finance/periods/:id/close
```

Every route requires the existing bearer-session authentication. Company-wide account reads and period close also perform their simple route-level Company permission checks before the service repeats the authoritative business check. Journal create/post/reverse and trial balance stay service-authoritative for exact Project scope because their Project resources come from journal lines or persisted journal ownership rather than a Project path parameter.

The HTTP layer keeps the Pass-203 Zod schemas authoritative. Manual-journal input exposes only `postingDate`, `description` and reviewed line business fields. Post, reverse and period close remain bodyless commands. Server-owned Company, actor, permissions, Project scope, journal number, source identity, period selection, lifecycle state and totals remain absent from browser input.

OpenAPI publishes the same six operations and precision-safe string money fields. It does not add AP/AR/payment operations, account CRUD, period setup/reopen, journal read CRUD, ledger/aging APIs or generic Finance endpoints.

## Pass 206 boundary

Pass 206 adds only:

```text
apps/api/src/modules/finance/finance.routes.ts
apps/api/src/modules/finance/index.ts
Fastify registration in apps/api/src/app.ts
static HTTP/OpenAPI gate and evidence
```

No Prisma model, migration, Finance business rule, AP/AR/payment workflow, source adapter, React feature or Playwright workflow is added.

The next pass is:

```text
Pass 207 - Module 15A PostgreSQL/Fastify integration, OpenAPI and security verification
```

Runtime deployment remains blocked until genuine Stage-10 live acceptance.
