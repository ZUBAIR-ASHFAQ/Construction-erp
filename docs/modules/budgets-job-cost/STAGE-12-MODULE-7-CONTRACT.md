# Stage 12 — Module 7 Budgeting & Job Costing Contract

## Purpose

Stage 12 freezes the executable boundary for **Module 7 — Budgeting & Job Costing** before Prisma models, migrations, backend code or React code are generated.

Module 7 is the Project Controls owner for approved budget versions, budget lines, source-derived commitments/actuals and forecast inputs. It must reconcile Project cost control to the existing WBS/Cost Code structure and Finance Core without inventing source-module integrations that are generated later.

The controlling dependency-aware order is:

```text
Stage 9   Module 6 - WBS & Cost Codes
Stage 10  Module 4B - BOQ Project Mapping
Stage 11  Module 15A - Finance Core
Stage 12  Module 7 - Budgeting & Job Costing
Stage 13  Module 8 - Procurement & RFQ
...
Stage 26  Module 15B - Finance Source Adapters
Stage 27  Cross-module Integration Completion
```

The corrected matrix explicitly gives Module 7 prerequisites of Module 5, Module 6 and Module 15A, and says source adapters may arrive later.

## Stage prerequisite

The direct Stage-12 handoff is genuine Stage-11 live acceptance:

```text
STAGE_11_ACCEPTED_READY_FOR_STAGE_12
```

The Module-7 contract may be reviewed and frozen while that live handoff is still pending. That does not authorize Stage-12 production runtime activation or deployment.

The actual corrected execution sequence also means Module 24B Project Scope Activation and Module 4B BOQ Project Mapping already exist before Stage 12. They may be reused only where the reviewed Module-7 contract requires Project authorization or explicitly describes estimate/BOQ-based budget creation.

## Ownership boundary

Module 7 owns exactly these source-defined tables:

```text
project_budgets
budget_lines
cost_commitments
cost_actuals
forecast_lines
```

Existing upstream ownership remains:

```text
projects                                             Module 5
wbs_nodes / cost_codes / cost_types / project_cost_codes   Module 6
gl_accounts / fiscal_periods / journals / journal_lines    Module 15A
project authorization                                Module 24B
BOQ commercial/project mapping                       Module 4 / 4B
Foundation audit / outbox / idempotency              Foundation
```

Module 7 must not create duplicate Project, WBS, Cost Code, Cost Type, Finance or source-document masters.

## Persistence contract

### project_budgets

Source-defined fields:

```text
id
company_id
project_id
version_no
budget_type
status
approved_at
total_cost
total_revenue nullable
```

Required meaning:

- each budget belongs to one Company and one Project;
- `version_no` identifies the Project budget version;
- `total_cost` and `total_revenue` are server-calculated DECIMAL values;
- only one current approved budget version may exist per Project;
- a frozen/approved budget is not overwritten to correct history; controlled revisions create later versions.

The source does not enumerate `budget_type` or budget `status` values, does not define an `is_current` field, and does not state the exact database mechanism for selecting the one current approved version. The persistence/service passes must make the narrowest source-faithful decision explicitly.

The workflow says a baseline may come from an estimate/BOQ or manual approved entries, but the source-defined `project_budgets` fields do not include an estimate or BOQ foreign key. Stage 12 must not invent `estimate_id`, `boq_id` or another undocumented source-link field.

### budget_lines

Source-defined fields:

```text
id
budget_id
wbs_node_id
cost_code_id
cost_type_id
quantity nullable
unit_rate nullable
amount
revenue_amount nullable
```

Required meaning:

- every line belongs to one budget;
- WBS, Cost Code and Cost Type must resolve inside the budget Project/Company scope;
- budget lines require a valid posting combination;
- money uses DECIMAL and is serialized without binary-floating precision loss;
- server-side calculations own authoritative totals.

Module 6 already owns `project_cost_codes`, which represents allowed Project/WBS/Cost-Code/Cost-Type posting combinations. The Module-7 source stores the three component IDs directly on `budget_lines`; it does not define a `project_cost_code_id` field. Later persistence/service work must validate the combination against Module 6 without adding an undocumented budget-line column.

The source does not state whether `amount` is always supplied or may be calculated from `quantity × unit_rate`, nor how rounding works. That calculation rule remains explicit and unresolved until the schema/service pass.

### cost_commitments

Source-defined fields:

```text
id
company_id
project_id
source_type
source_id
source_line_id
cost_structure_id
original_amount
remaining_amount
status
```

Required meaning:

- commitments are source-derived Project costs, not user-editable budget inputs;
- ingestion is idempotent by source key;
- amounts are DECIMAL and server-controlled;
- source corrections follow reversal/adjustment behavior rather than overwriting approved history.

The source names `cost_structure_id` but does not explicitly identify its foreign-key target. Module 6 owns the Project posting combination in `project_cost_codes`; Pass 212 keeps that likely relationship explicit as an unresolved persistence decision rather than silently assigning the FK.

The source does not enumerate `source_type` or commitment `status` values and does not define the exact unique key across `source_type`, `source_id` and `source_line_id`.

### cost_actuals

Source-defined fields:

```text
id
company_id
project_id
source_type
source_id
source_line_id
posting_date
cost_structure_id
amount
```

Required meaning:

- actual costs are source-derived and are never manually overwritten;
- approved/posted source corrections use reversal/adjustment;
- ingestion is idempotent by source key;
- posting date participates in locked-accounting-period rules;
- amounts are DECIMAL and server-controlled.

As with commitments, the exact `cost_structure_id` FK target and exact source-key database uniqueness shape are not stated by the source and remain explicit for the persistence pass.

### forecast_lines

Source-defined fields:

```text
id
project_id
budget_line_id
as_of_date
estimate_to_complete
forecast_final_cost
forecast_final_revenue nullable
notes
```

Required meaning:

- forecast lines belong to the selected Project and budget line;
- authorized users may update forecast inputs/assumptions;
- the system calculates EAC, variance and margin rather than allowing actual history to be overwritten;
- forecast dates must comply with the latest locked accounting-period rules.

The source does not state which forecast fields are user inputs versus server-calculated outputs. In particular, `forecast_final_cost` and `forecast_final_revenue` exist in persistence while the workflow says the system calculates EAC/variance/margin. The schema/service passes must make that authority boundary explicit instead of exposing every persistence field automatically.

The source also does not define the exact relationship between `as_of_date` and the latest closed Finance period, such as whether equality with a locked period end date is allowed. That rule must not be guessed silently.

## Source-ingestion boundary

Stage 12 owns the `cost_commitments` and `cost_actuals` persistence because they are part of Module 7's stable job-cost foundation.

However, the seven reviewed public Module-7 routes contain **no command for manually creating commitments or actuals**. Downstream source modules such as Procurement, Purchase Orders, Inventory, Subcontracts, Workforce, Equipment, Change Orders and later Finance source adapters are generated after Stage 12.

Therefore Stage 12 must not add public endpoints such as:

```text
POST /api/v1/projects/:projectId/job-cost/commitments
POST /api/v1/projects/:projectId/job-cost/actuals
PATCH /api/v1/projects/:projectId/job-cost/actuals/:id
DELETE /api/v1/projects/:projectId/job-cost/actuals/:id
```

Later source modules may use a reviewed internal Module-7 ingestion contract once their owning schemas exist. Cross-module completion remains Stage 27. Actual/commitment ingestion must stay source-key idempotent and must never become browser-authored accounting history.

## Exact reviewed Stage-12 API surface

The source defines exactly seven Module-7 operations:

```text
GET  /api/v1/projects/:projectId/budgets/current
POST /api/v1/projects/:projectId/budgets
PUT  /api/v1/projects/:projectId/budgets/:id/lines
POST /api/v1/projects/:projectId/budgets/:id/freeze
GET  /api/v1/projects/:projectId/job-cost
PUT  /api/v1/projects/:projectId/forecast
GET  /api/v1/projects/:projectId/job-cost/ledger
```

Purpose mapping:

```text
GET budgets/current       current approved budget
POST budgets              create budget version
PUT budgets/:id/lines     replace draft budget lines
POST budgets/:id/freeze   freeze approved budget
GET job-cost              budget/commitment/actual/forecast summary
PUT forecast              update authorized forecast inputs
GET job-cost/ledger       detailed cost ledger
```

Do not add generic CRUD or undocumented Module-7 routes such as:

```text
GET    /api/v1/projects/:projectId/budgets
GET    /api/v1/projects/:projectId/budgets/:id
PATCH  /api/v1/projects/:projectId/budgets/:id
DELETE /api/v1/projects/:projectId/budgets/:id
POST   /api/v1/projects/:projectId/budgets/:id/submit
POST   /api/v1/projects/:projectId/budgets/:id/approve
POST   /api/v1/projects/:projectId/budgets/:id/reopen
POST   /api/v1/projects/:projectId/job-cost/reconcile
```

unless the controlling contract is explicitly amended.

## GET query boundary

The source says GET routes accept only documented filters and list routes use bounded pagination, but the Module-7 route table does not enumerate business filters for current budget, job-cost summary or ledger.

Stage 12 must not invent date, WBS, Cost Code, Cost Type, status or source filters during the contract pass. The detailed ledger is list-like, so the schema pass may apply the project's existing bounded pagination convention without inventing additional business filters.

## Request authority boundary

Every normal Module-7 route requires an active authenticated session.

The browser must never provide authoritative values such as:

```text
companyId
actorUserId
permissions
projectScope
versionNo
status
approvedAt
totalCost
server-calculated totals
sourceType/sourceId/sourceLineId for cost ingestion
actual cost history
commitment source history
```

The route resolves `projectId` from the URL and the server revalidates Company ownership plus Module-24B Project scope before returning or mutating records.

Budget/forecast request schemas must expose only reviewed business inputs. Persistence fields are not automatically request fields.

## Permissions

The source defines these stable permissions:

```text
budgets.read
budgets.create
budgets.edit
budgets.freeze
job_cost.read
forecast.update
```

Natural route mapping:

```text
GET budgets/current       budgets.read
POST budgets              budgets.create
PUT budgets/:id/lines     budgets.edit
POST budgets/:id/freeze   budgets.freeze
GET job-cost              job_cost.read
PUT forecast              forecast.update
GET job-cost/ledger       job_cost.read
```

All permission checks remain Project-resource scoped. Route-level checks must be revalidated by service/resource policy before sensitive writes.

## Validation and business rules

The Stage-12 implementation must preserve these source-defined rules:

- budget lines require valid posting combinations;
- baseline freeze requires validated totals and approval when configured;
- forecast date cannot violate the latest locked accounting-period rules;
- costs and revenue use DECIMAL with server-side calculations;
- actual costs are source-derived and never manually overwritten;
- posted/approved source documents correct history by reversal/adjustment;
- only one current approved budget version exists per Project;
- commitment/actual ingestion is idempotent by source key.

The source does not define a tolerance-based balancing rule for budgets. Stage 12 must not reuse journal debit/credit balancing semantics simply because Finance Core exists.

## Approval ambiguity

The workflow says a baseline is submitted/frozen and the validation section says freeze requires approval **when configured**, but the Module-7 route table defines no submit/approve command and the corrected prerequisite matrix does not make Module 22 a hard prerequisite for Module 7.

Stage 12 must therefore not invent a Module-7 approval endpoint, approval table or hard-coded approval workflow. If an existing generic Module-22 approval is later connected, that integration must use the reviewed cross-cutting approval contract without changing the seven Module-7 public routes.

## Finance-period dependency

Module 7 depends on Finance Core. Forecast-date validation must respect locked accounting periods, and actual cost posting dates participate in formal accounting reconciliation.

The source does not define a new Module-7 Finance endpoint or allow Module 7 to reopen Finance periods. Module 7 must read the existing Finance Core persistence/service contract as needed and must not duplicate fiscal periods.

## Error contract

The source defines these stable Module-7 business conflicts:

```text
BUDGET_NOT_FOUND
BUDGET_VERSION_LOCKED
INVALID_COST_STRUCTURE
FORECAST_PERIOD_LOCKED
JOB_COST_RECONCILIATION_ERROR
```

Do not invent a larger public error-code vocabulary in the contract pass. Authentication/authorization/validation failures continue to use the existing shared API error envelope.

## Events / audit / outbox

The source defines:

```text
budget.created
budget.frozen
budget.revised
forecast.updated
job_cost.source_posted
```

Budget and forecast events may be emitted only after their successful business transactions. `job_cost.source_posted` belongs to the source-ingestion workflow and must not be fabricated by the browser-facing budget routes before a real source adapter exists.

Sensitive writes reuse Foundation audit and transactional outbox behavior. Audit records include actor, Company/Project scope, entity/request identity and important before/after values without secrets.

## React boundary for later passes

The reviewed future React feature path is:

```text
apps/web/src/features/budgets-job-cost/
```

The minimum eventual UI is:

```text
Budget grid
Cost-code drilldown
Budget vs committed vs actual vs forecast
EAC / variance
Revenue / margin view
Forecast comments
```

TanStack Query owns server state; React Hook Form + Zod handle forms; the UI hides unauthorized actions while the API remains authoritative.

No React code is generated in Pass 212.

## Source ambiguities deliberately preserved

Pass 212 does not silently resolve these gaps:

1. Exact `budget_type` and budget `status` tokens are not enumerated.
2. The database representation of “one current approved budget version” is not stated.
3. Estimate/BOQ-based baseline creation is described, but no source-link field or dedicated import route is defined.
4. `budget_lines.amount` input-vs-calculation and rounding semantics are not stated.
5. `cost_commitments.cost_structure_id` and `cost_actuals.cost_structure_id` do not explicitly name their FK target.
6. The exact source-key uniqueness constraint for commitment/actual idempotency is not stated.
7. Source-derived commitment/actual write APIs are intentionally absent; later adapters must not invent public CRUD.
8. Exact job-cost summary and ledger response shapes are not enumerated.
9. The detailed ledger has no documented business filters beyond the general bounded-pagination rule.
10. Freeze says “approved budget” and approval is conditional, but no submit/approve/reopen route is defined.
11. Exact forecast input fields versus calculated outputs are not enumerated.
12. The exact locked-period boundary for `forecast_lines.as_of_date` is not defined.
13. `budget.revised` is defined as an event, but the source does not state the precise transition that distinguishes a new revision from initial budget creation.
14. `job_cost.source_posted` is defined, but source adapters that can emit it are generated later.

These are implementation constraints, not invitations to expand scope.

## Pass-212 output boundary

Pass 212 is contract-only.

It may add:

```text
docs/modules/budgets-job-cost/STAGE-12-MODULE-7-CONTRACT.md
scripts/module-7/verify-stage-12-contract.mjs
tests/module-7-static.test.mjs
module-7-evidence/stage-12-contract.json
```

It must not yet add:

```text
Prisma Module-7 models
Stage-12 migration
budgets-job-cost.schema.ts
budgets-job-cost.repository.ts
budgets-job-cost.service.ts
budgets-job-cost.routes.ts
React Budgeting & Job Costing feature
source-module adapters
```

After the contract is frozen, the next pass is:

```text
Pass 213 - Module 7 reviewed Prisma models, constraints, indexes and migration
```

## Pass 213 persistence decisions

Pass 213 keeps the frozen Stage-12 business/API boundary unchanged and resolves only the database details required to create the five reviewed tables.

The narrow persistence decisions are:

```text
cost_commitments.cost_structure_id -> project_cost_codes.id
cost_actuals.cost_structure_id     -> project_cost_codes.id

source idempotency key:
company_id + project_id + source_type + source_id + source_line_id
```

These are explicit implementation interpretations because the source names `cost_structure_id` and requires source-key idempotency but does not state the exact FK target or unique-key columns. `project_cost_codes` is used because it is the existing Module-6 owner of the Project/WBS/Cost-Code/Cost-Type posting combination.

`budget_lines` continues to store only the source-defined `wbs_node_id`, `cost_code_id` and `cost_type_id`. No undocumented `project_cost_code_id` column is added. Database integrity verifies that those three IDs resolve to one posting-enabled `project_cost_codes` row in the budget Project.

The database does **not** add `is_current`, a partial index tied to a guessed APPROVED token, or a new status enum. Because the source does not enumerate budget status values, the one-current-approved-budget rule remains a service transaction rule until the reviewed status vocabulary is made executable.

The migration also keeps forecast rows inside the Project that owns their budget line. It does not guess the locked-period boundary or which forecast fields are user inputs; those remain schema/service decisions.

Pass 213 therefore adds persistence only. It does not add Module-7 API schemas, repository/service/routes, React code or source adapters.

Next:

```text
Pass 214 - Module 7 Zod request/response schema boundary for the seven reviewed Stage-12 operations
```

## Pass 214 reviewed API-schema resolutions

Pass 214 resolves only the strict Zod request/response boundary needed by the seven already-reviewed Stage-12 operations. It does not add repositories, services, Fastify routes, React code or source-module adapters.

### Budget creation authority

The create-budget request accepts only:

```text
budgetType
```

`versionNo`, `status`, `approvedAt`, `totalCost` and `totalRevenue` remain server-owned. The source describes estimate/BOQ/manual origins but defines no source-link field or dedicated import route, so Pass 214 does not invent `estimateId`, `boqId` or another origin selector.

`budgetType` remains a bounded string rather than a public enum because the source does not enumerate stable budget-type tokens.

### Draft budget-line replacement

Each replacement line accepts only the source-defined business fields:

```text
wbsNodeId
costCodeId
costTypeId
quantity optional
unitRate optional
amount
revenueAmount optional
```

`projectId`, Company ownership, Project scope and calculated budget totals are not nested browser inputs.

Pass 214 treats `amount` as an explicit draft business input because the source allows manual approved budget entries and does not define a mandatory `quantity × unitRate` formula or rounding rule. The service must still calculate authoritative budget totals server-side from the accepted exact-decimal line values. Pass 214 therefore does not silently derive `amount` from quantity/rate and does not invent a rounding policy.

Quantity/rate and money values are transmitted as exact decimal strings. The schema does not invent positivity rules that the source does not state.

### Freeze command

The reviewed freeze route defines no request fields. It is therefore a strict bodyless command:

```text
POST /api/v1/projects/:projectId/budgets/:id/freeze   {}
```

Approval linkage, current-approved selection, resulting status and `approvedAt` remain service-owned decisions. No submit/approve/reopen endpoint is added.

### Forecast authority

The forecast update request accepts one `asOfDate` and line-level assumptions containing only:

```text
budgetLineId
estimateToComplete
notes
```

`forecastFinalCost` and `forecastFinalRevenue` remain response-only calculated outputs in Pass 214. This is the narrowest authority split consistent with the source statement that authorized users update estimate-to-complete/forecast assumptions while the system calculates EAC, variance and margin.

Pass 214 does not guess the exact locked-period boundary for `asOfDate`. The later service must read Finance Core and reject prohibited dates with `FORECAST_PERIOD_LOCKED` without changing Finance periods.

### GET query boundary

The current-budget and job-cost-summary reads accept no business query filters because none are enumerated by the source.

The detailed ledger accepts only bounded:

```text
page
pageSize
```

No WBS, Cost Code, Cost Type, source, status or date filters are invented.

### Minimum response interpretations

The source does not enumerate complete job-cost response JSON shapes, so Pass 214 records the smallest executable response interpretation needed by the reviewed route purposes and minimum React requirements.

Current/create/replace/freeze budget responses return the safe Project budget version with its lines, exact-decimal totals and server-owned version/status/approval fields. `companyId`, permissions, actor identity and Project-scope internals are never exposed as business response authority.

The job-cost summary exposes:

```text
projectId
currentBudget
totals
  budgetCost
  committedCost
  actualCost
  estimateToComplete
  forecastFinalCost
  variance
  budgetRevenue
  forecastFinalRevenue
  margin
forecasts[]
```

These names represent the source-defined budget/commitment/actual/forecast, EAC/variance and revenue/margin view. They do not create a new transactional table or source of record.

The detailed ledger uses one read-only normalized row over source-derived commitment/actual history:

```text
id
recordType
sourceType
sourceId
sourceLineId
costStructureId
postingDate nullable
originalAmount nullable
remainingAmount nullable
actualAmount nullable
status nullable
```

`recordType`, `sourceType` and status remain string-backed output values; Pass 214 does not invent public enum vocabularies. The normalized ledger response is read-only and does not create commitment/actual write schemas.

### Error boundary

Pass 214 exports only the five reviewed Module-7 business codes:

```text
BUDGET_NOT_FOUND
BUDGET_VERSION_LOCKED
INVALID_COST_STRUCTURE
FORECAST_PERIOD_LOCKED
JOB_COST_RECONCILIATION_ERROR
```

They reuse the existing shared `NotFoundError`, `ValidationError` and `ConflictError` envelope rather than adding Module-specific HTTP machinery.

## Pass 214 boundary

Pass 214 generates only:

```text
apps/api/src/modules/budgets-job-cost/budgets-job-cost.schema.ts
scripts/module-7/verify-stage-12-schema.mjs
module-7-evidence/stage-12-schema.json
```

plus the existing Stage-12 contract/static verification updates required to lock this boundary.

It does not generate:

```text
budgets-job-cost.repository.ts
budgets-job-cost.service.ts
budgets-job-cost.routes.ts
Module-7 Fastify registration
React Budgeting & Job Costing feature
commitment/actual public write APIs
source-module adapters
```

The next pass is:

```text
Pass 215 - Module 7 Company/Project-scoped repository for budgets, forecasts and read-only job-cost aggregation.
```

Runtime deployment remains dependent on genuine Stage-11 live acceptance.

## Pass 215 Company/Project-scoped repository decisions

Pass 215 adds only the Module-7 repository boundary required by the seven already-reviewed Stage-12 operations. It does not add services, HTTP routes, React code or source-module adapters.

The repository file is:

```text
apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts
```

### Ownership and transaction boundary

Every Company-owned query derives `company_id` from trusted request context through `requireCompanyRepositoryScope()`. Callers do not pass `companyId` into repository input types.

Every Project-owned child read additionally carries the requested `projectId` through its parent relationship so a valid child UUID from another Project cannot be returned merely because it belongs to the same Company.

The repository accepts either the normal Prisma `DatabaseClient` or an active `TransactionClient`. Pass 215 prepares row locks and compare-and-set persistence, but the atomic business transaction remains a Pass-216 service responsibility.

### Budget version persistence

The repository provides only the primitives needed for server-owned budget versioning:

```text
find/lock owning Project
find latest Project budget version
find latest budget by a service-supplied status
find/lock one Project budget
create a server-numbered budget version
update server-calculated totals
compare-and-set lifecycle status/approved_at
```

Pass 215 does not interpret which string-backed status means "current approved". That vocabulary remains deliberately unfrozen. The repository accepts a status value only from the future service; it does not define a new enum or add an `is_current` flag.

The Project row lock exists so Pass 216 can serialize next-version/current-budget decisions inside one transaction rather than calculating `versionNo` optimistically outside a lock.

### Budget-line replacement and Module-6 integrity

Budget-line replacement validates each unique:

```text
wbsNodeId + costCodeId + costTypeId
```

against one posting-enabled `project_cost_codes` row inside the same Project and authenticated Company before replacing lines. The repository does not add the undocumented `projectCostCodeId` field to the budget-line API or table.

The replacement method is transaction-ready but does not itself create a nested transaction. Pass 216 must call it inside the service transaction together with authoritative total calculation, audit and outbox behavior.

### Forecast persistence

Forecast replacement accepts server-prepared rows containing:

```text
budgetLineId
estimateToComplete
forecastFinalCost
forecastFinalRevenue nullable
notes
```

The additional final-cost/revenue values are repository inputs only because Pass 214 already established them as server-calculated response fields. They are not browser authority. Every referenced budget line is revalidated against the same Project before rows are replaced.

Pass 215 does not decide the exact Finance locked-period boundary. That remains a Pass-216 service rule and must use Finance Core without changing fiscal-period state.

### Read-only source history

The repository adds **no** create/update/delete method for `cost_commitments` or `cost_actuals`.

It exposes only:

```text
commitment aggregation
actual aggregation
bounded combined commitment/actual ledger read
```

The combined ledger is a deterministic read-only `UNION ALL` over the two source tables. Pagination is bounded by `MODULE_7_MAX_PAGE_SIZE`, and both branches require the authenticated Company plus requested Project. Its sort order exists only to make pagination deterministic; it does not create new business precedence semantics between commitment and actual records.

The repository therefore cannot fabricate `job_cost.source_posted`; later reviewed source adapters remain responsible for source ingestion and idempotency.

### Job-cost aggregation boundary

Pass 215 exposes raw persistence aggregates needed by the next service:

```text
budget-line cost/revenue sums
commitment original/remaining sums
actual cost sum
forecast estimate-to-complete/final-cost/final-revenue sums
```

The repository deliberately does **not** decide which commitment aggregate becomes the public `committedCost`, nor does it calculate EAC, variance or margin. Those are business calculations and remain Pass-216 service responsibilities.

### Intentionally absent in Pass 215

Pass 215 does not generate:

```text
budgets-job-cost.service.ts
budgets-job-cost.routes.ts
index.ts
React Budgeting & Job Costing feature
public commitment/actual ingestion methods
Finance period mutation
new Module-7 status/budget-type enums
new public API routes
```

Next:

```text
Pass 216 - Module 7 service/business rules, Project resource policy, atomic budget/forecast transactions, audit/outbox and job-cost calculations.
```

## Pass 216 service/business-rule decisions

Pass 216 adds the Module-7 service layer required by the seven frozen Stage-12 operations. It keeps the public API surface unchanged and does not add Fastify routes, React code, approval endpoints or source-ingestion adapters.

The service file is:

```text
apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts
```

### Project resource policy

Every service method revalidates the exact requested Project through the existing Module-24B effective-permission lookup. Company ownership still comes from trusted request context inside repositories. A restricted Project scope cannot be bypassed by supplying another Project UUID.

Normal budget and forecast writes are rejected after the Project reaches `CLOSED`, preserving the Project Management rule that closed Projects reject normal transactional writes.

### Minimal executable budget lifecycle

The source does not enumerate a public budget-status enum. Pass 216 therefore does not export one. To make the reviewed create/edit/freeze/current workflows executable, the service uses only the two lifecycle words already implied by those workflows:

```text
DRAFT
FROZEN
```

A new budget version is server-numbered under a Project row lock and starts `DRAFT`. Budget-line replacement is allowed only while that version remains `DRAFT`.

The current approved budget is interpreted as the highest-version `FROZEN` budget. Older frozen versions remain immutable history; no `is_current` column, `APPROVED` token or status enum is added.

The freeze command is retry-safe. Repeating freeze on the same `FROZEN` version returns the existing snapshot and does not emit duplicate durable events.

### Budget totals and revisions

Budget-line amounts remain exact request inputs as frozen in Pass 214. Pass 216 recalculates authoritative Project-budget totals from the accepted persisted line set inside the same transaction and rejects DECIMAL(18,2) overflow without using binary floating point.

Every created version emits:

```text
budget.created
```

When a newly frozen version replaces an earlier current frozen version, the same freeze transaction additionally emits:

```text
budget.revised
```

This is the narrowest executable interpretation of the otherwise-unspecified `budget.revised` transition: a draft does not become a revised approved baseline merely because it was created; revision becomes effective when the new frozen version becomes current.

### Freeze validation and conditional approval

Before freeze, the service revalidates every stored budget line against the active Module-6 Project/WBS/Cost Code/Cost Type posting structure and recalculates totals.

The source says approval is required when configured but defines no Module-7 submit/approve route, approval link field or mandatory Module-22 dependency. Pass 216 therefore does not fabricate an approval flag or endpoint. The existing `budgets.freeze` resource permission controls the reviewed command until a concrete generic-approval integration is connected through later reviewed integration work.

### Commitment and actual authority

Pass 216 still creates no write path for `cost_commitments` or `cost_actuals`. Those rows remain source-derived, read-only Module-7 history. The browser-facing service never emits `job_cost.source_posted`.

For the public job-cost summary, `committedCost` is the current **remaining commitment** amount, not original historical commitment value. This avoids counting already-consumed commitment value again beside actual cost.

### Exact job-cost calculations

All money calculations use exact integer minor units and are range-checked before persistence/response calculations.

The current Project summary uses:

```text
budgetCost        = current frozen budget total cost, or 0 when none exists
committedCost     = sum of remaining commitment amounts
actualCost        = sum of source-derived actual amounts
estimateToComplete = sum of the latest forecast snapshot ETC inputs
forecastFinalCost = actualCost + committedCost + estimateToComplete
variance           = budgetCost - forecastFinalCost
```

The source defines no browser-editable revenue forecast assumption. Until an approved later source integration changes that contract, Project `forecastFinalRevenue` therefore uses the current frozen budget revenue and:

```text
margin = forecastFinalRevenue - forecastFinalCost
```

when revenue exists; otherwise revenue and margin remain nullable.

### Forecast snapshot calculation

The forecast `PUT` remains replacement-style for one explicit `asOfDate`. Duplicate `budgetLineId` values are rejected. Every referenced line must belong to the requested Project and still resolve to an active Module-6 posting combination.

For each submitted forecast line, the service calculates and persists:

```text
forecastFinalCost = actual cost through asOfDate
                  + current remaining commitment
                  + submitted estimateToComplete

forecastFinalRevenue = linked budget-line revenue amount, nullable
```

The browser never supplies either calculated field.

Pass 216 adds two repository read aggregates needed only for this service calculation: remaining commitment by cost structure and actual cost by cost structure through the forecast date. These are read-only and do not expand source-ingestion authority.

### Finance locked-period boundary

The source does not define a separate Module-7 locked-period table or an exact “latest locked period” algorithm. Pass 216 reuses Finance Core directly: when the requested `asOfDate` falls inside a configured fiscal period, that period must be `OPEN`; otherwise the service returns `FORECAST_PERIOD_LOCKED`.

No fiscal period is created, closed, reopened or modified by Module 7. If no Finance period contains the date, Pass 216 does not invent a new prohibition beyond the source-defined locked-period rule.

### Audit and outbox

The service records non-secret audit history for:

```text
budget.created
budget.lines_replaced
budget.frozen
forecast.updated
```

Durable outbox events are limited to the reviewed Module-7 event vocabulary:

```text
budget.created
budget.frozen
budget.revised
forecast.updated
```

`job_cost.source_posted` remains deferred to real later source adapters.

### Pass 216 boundary

Pass 216 intentionally does not generate:

```text
budgets-job-cost.routes.ts
index.ts
React Budgeting & Job Costing feature
Module-7 approval endpoint/table
commitment/actual browser writes
job_cost.source_posted emission
new public status or budget-type enums
Finance period mutation
```

Next:

```text
Pass 217 - Module 7 Fastify routes, module registration and OpenAPI metadata for exactly the seven reviewed Stage-12 operations.
```

## Pass 217 Fastify HTTP and OpenAPI boundary

Pass 217 exposes the already-reviewed Module-7 service through Fastify without changing the Stage-12 business contract. Exactly seven public operations are registered:

```text
GET  /api/v1/projects/:projectId/budgets/current
POST /api/v1/projects/:projectId/budgets
PUT  /api/v1/projects/:projectId/budgets/:id/lines
POST /api/v1/projects/:projectId/budgets/:id/freeze
GET  /api/v1/projects/:projectId/job-cost
PUT  /api/v1/projects/:projectId/forecast
GET  /api/v1/projects/:projectId/job-cost/ledger
```

The HTTP layer is implemented in:

```text
apps/api/src/modules/budgets-job-cost/budgets-job-cost.routes.ts
apps/api/src/modules/budgets-job-cost/index.ts
```

and is registered from `apps/api/src/app.ts` only when the application receives a database client, matching the existing protected business-module pattern.

### Authentication and Project authorization

Every route authenticates before parsing or executing the business command. The HTTP layer does not accept Company, actor, permission or Project-scope authority from the browser. Exact Project-resource permission evaluation remains service-authoritative through the Module-24B policy lookup prepared in Pass 216.

The seven routes therefore map to the already-frozen permissions without introducing a new authorization vocabulary:

```text
GET budgets/current       -> budgets.read
POST budgets              -> budgets.create
PUT budgets/:id/lines     -> budgets.edit
POST budgets/:id/freeze   -> budgets.freeze
GET job-cost              -> job_cost.read
PUT forecast              -> forecast.update
GET job-cost/ledger       -> job_cost.read
```

### Strict request boundary

Fastify OpenAPI metadata mirrors the Pass-214 Zod boundary rather than deriving request authority from Prisma fields.

- current-budget and job-cost summary GETs expose no business query filters;
- the detailed ledger exposes only bounded `page` and `pageSize` pagination;
- budget creation accepts only `budgetType`;
- draft line replacement accepts only the reviewed cost dimensions and exact-decimal business values;
- freeze remains a bodyless command;
- forecast update accepts only `asOfDate`, `budgetLineId`, `estimateToComplete` and `notes`;
- calculated totals, statuses, approval timestamps, source-history fields and forecast-final values remain server-owned.

Every handler re-parses params/query/body with the frozen Zod schemas before calling the service, so Fastify documentation and runtime validation cannot silently drift apart.

### Response and error boundary

All success responses use the existing `{ data: ... }` envelope and are revalidated against the Pass-214 Zod response schemas before leaving the route. Exact decimal values remain strings in OpenAPI and JSON responses.

OpenAPI advertises only the five reviewed Module-7 business conflicts where they can actually occur:

```text
BUDGET_NOT_FOUND
BUDGET_VERSION_LOCKED
INVALID_COST_STRUCTURE
FORECAST_PERIOD_LOCKED
JOB_COST_RECONCILIATION_ERROR
```

Shared authentication, authorization, request-validation, resource-not-found and internal-error codes continue to use the Foundation error envelope. Pass 217 does not invent new Module-7 error codes.

### Source-ingestion boundary retained

No HTTP command is added for `cost_commitments`, `cost_actuals`, reconciliation, manual source posting, budget approval/reopen, or generic budget CRUD. `job_cost.source_posted` remains unavailable to browser-facing Module-7 routes and deferred to reviewed later source adapters.

### Pass 217 boundary

Pass 217 adds only the HTTP/OpenAPI/module-registration layer. It does not add:

```text
React Budgeting & Job Costing pages
Playwright tests
live PostgreSQL/Fastify integration tests
commitment/actual write endpoints
new Module-7 database migration
new status/budget-type enums
approval endpoints
Finance period mutation
```

Next:

```text
Pass 218 - Module 7 PostgreSQL/Fastify integration, OpenAPI and security verification.
```

## Pass 218 PostgreSQL/Fastify integration, OpenAPI and security verification

Pass 218 adds verification only. It does not change the Module-7 production runtime, Prisma schema, migration history or public API surface. The focused live suite is prepared in:

```text
tests/integration/module-7-api.integration.test.mjs
```

The suite is intentionally guarded by the disposable integration-database switch and the genuine Stage-11 live handoff. Static preparation is safe to run without PostgreSQL:

```text
npm run module-7:integration-security:gate
```

A genuine runtime run requires both Stage-11 live acceptance and the explicit destructive-test opt-in:

```text
RUN_FOUNDATION_DB_TESTS=1 npm run module-7:integration-security:gate:live
```

### Runtime workflow coverage

The prepared live suite exercises the real Fastify application and PostgreSQL persistence for the seven reviewed operations. It verifies budget creation, complete draft-line replacement, freeze/idempotent freeze, current-budget selection, forecast replacement, job-cost summary and bounded source ledger reads.

The assertions preserve exact-decimal behavior across:

```text
budget cost
remaining commitment
actual cost
estimate to complete
forecast final cost / EAC
variance
budget / forecast revenue
margin
```

Source-derived commitment and actual rows are inserted only as test fixtures directly through the database client. Pass 218 does not add a public or internal browser-facing source-ingestion command.

### Security coverage

The prepared suite verifies:

```text
exact Project-scoped RBAC
restricted Project scope
missing Module-7 permission denial
cross-Company non-disclosure
closed-Project write rejection
strict rejection of browser authority fields
locked budget write rejection
active Module-6 posting-combination validation
closed Finance-period forecast rejection
```

The database checks also exercise the Stage-12 integrity triggers for budget-line Project cost structure, source-cost Project scope and forecast Project ownership, plus the scoped source-key uniqueness contract.

### Generated OpenAPI coverage

The live suite reads `/openapi.json` from the built application and requires exactly these seven Module-7 operation IDs:

```text
module7GetCurrentBudget
module7CreateBudget
module7ReplaceBudgetLines
module7FreezeBudget
module7GetJobCost
module7UpdateForecast
module7GetJobCostLedger
```

Every operation must retain bearer security. Budget creation remains `budgetType`-only, forecast calculated fields remain server-owned, ledger query authority remains pagination-only, and manual commitment/actual/reconciliation plus budget approval/reopen paths remain absent.

### Pass 218 boundary

Pass 218 adds no React feature, Playwright workflow, operations/concurrency acceptance pass, source adapter, migration, approval route or new business state vocabulary. Because the supplied project still lacks genuine `STAGE_11_ACCEPTED_READY_FOR_STAGE_12` runtime handoff evidence, the static Pass-218 evidence must remain fail-honest and may report:

```text
STAGE_12_MODULE_7_INTEGRATION_SECURITY_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING
```

Next:

```text
Pass 219 - Module 7 React Budgeting & Job Costing API, hooks and workflow UI preparation.
```

## Pass 219 - React Budgeting & Job Costing feature

Pass 219 adds the reviewed React feature only after the Pass-217 HTTP/OpenAPI surface and Pass-218 integration/security boundary are preserved. The feature is located exactly under:

```text
apps/web/src/features/budgets-job-cost/
├── api/
├── hooks/
├── components/
└── pages/
```

The browser API mirrors exactly the seven reviewed Module-7 operations. It does not add generic budget CRUD, commitment/actual write endpoints, reconciliation commands, approval/reopen routes or client-owned financial authority.

### Project and permission boundary

Project selection reuses the existing Module-5 Project register instead of inventing a Module-7 Project lookup. Module-7 requests remain Company/Project scoped and the Fastify/service layer remains authoritative.

The existing `/auth/me` contract exposes Company permissions plus Project membership scope, but it does not expose the exact effective Module-7 permission set for each Project. Therefore restricted Project membership may make read attempts visible through the existing Project-workspace pattern, while sensitive create/edit/freeze/forecast controls are shown only when the matching Company-level permission is visible. The UI does not guess Project-level write authority.

### Budget workflow

The React page supports the reviewed budget workflow with server-owned authority:

```text
select Project
→ read current frozen budget
→ create a server-numbered DRAFT with budgetType only
→ replace the complete DRAFT line set
→ freeze with the bodyless command
→ return to current-budget/job-cost read models
```

Budget line forms use React Hook Form + Zod and preserve exact decimal strings for quantity, unit rate, cost amount and optional revenue amount. Company ID, actor, Project scope, version number, lifecycle status, approved timestamp and totals remain server-owned.

The reviewed public API has no budget-list or DRAFT-budget-detail endpoint. Pass 219 therefore keeps a newly created DRAFT only in the browser session that created it. Leaving/reloading that session cannot recover the unfinished DRAFT through the reviewed API, and this pass deliberately does not invent browser persistence or a recovery endpoint.

### Cost structure and drilldown

The feature reuses the existing Module-6 WBS tree, Project cost-code assignment readback and Cost Code list when the identity is authorized to read them. A selected budget line is matched to the existing `project_cost_codes` assignment by WBS node, Cost Code and Cost Type IDs so its source-derived ledger entries can be inspected.

Module 6 does not expose a Cost Type master read/create route in the reviewed surface. Pass 219 therefore reuses Cost Type IDs already present in authorized Project cost-code assignments and does not add a lookup route or a new master-data workflow.

### Job-cost and forecast views

The minimum reviewed UI is present:

```text
Budget grid
Cost-code drilldown
Budget vs Committed vs Actual vs Forecast
EAC / variance
Revenue / margin
Forecast comments
```

Job-cost totals are read from the server. Commitment and actual history is displayed read-only through the bounded ledger endpoint; there is no browser create/update/delete flow for those source-derived records.

Forecast editing accepts only the reviewed as-of date, estimate-to-complete and comments. Forecast final cost/revenue, EAC, variance and margin remain response-only server calculations.

### Pass 219 boundary

Pass 219 changes no Module-7 backend runtime behavior and adds no database migration. It does not add Playwright coverage, operational/concurrency acceptance, source adapters or Stage-13 Procurement functionality.

The dependency-backed web build still has to run in an environment with installed workspace dependencies/generated packages. The supplied cumulative project also still lacks genuine Stage-11 live handoff evidence, so Pass-219 evidence must remain fail-honest when that prerequisite is absent.

Next reviewed pass: Pass 220 - Module 7 Playwright Budgeting & Job Costing workflow verification.

## Pass 220 - Playwright Budgeting & Job Costing workflow verification

Pass 220 adds verification only. It prepares one real Playwright workflow over the built React application, Fastify API and disposable PostgreSQL database in:

```text
tests/e2e/module-7-browser.spec.mjs
```

The browser flow signs in through Module 24A, selects an authorized Project through the existing Project register, creates a server-numbered DRAFT budget, replaces its exact-decimal line set with an existing Module-6 posting combination, freezes the budget, saves dated ETC/comments and verifies the server-calculated job-cost position.

The same workflow reads source-derived commitment/actual ledger rows and opens the cost-code drilldown. It does not add source-history write controls. Browser request assertions reject Company, actor, Project-scope, lifecycle, total, calculated forecast and source-record authority in request bodies, and a read-only Module-7 user is verified to receive no create/forecast controls plus HTTP 403 on direct write attempts.

Pass 220 changes no production runtime file, Prisma model or migration. The dependency-backed browser run remains guarded by `RUN_MODULE_7_E2E=1`, `RUN_FOUNDATION_DB_TESTS=1` and genuine Stage-11 live acceptance. Static preparation remains fail-honest while that prerequisite is absent.

Run the static preparation gate with:

```bash
npm run module-7:playwright:gate
```

Run the genuine browser gate only in the prepared live environment with:

```bash
RUN_MODULE_7_E2E=1 RUN_FOUNDATION_DB_TESTS=1 npm run module-7:playwright:gate:live
```

Next reviewed pass: Pass 221 - Module 7 operational, migration and concurrency verification.


## Pass 221 operational, migration and concurrency verification

Pass 221 is verification-only. It changes no Module-7 production runtime file, Prisma model, public route, permission, business state or database migration. The focused live operational scenarios remain in the existing `tests/integration/module-7-api.integration.test.mjs` file so Stage 12 does not grow a parallel test architecture.

Prepared live coverage verifies the concurrency and rollback properties that the reviewed Module-7 rules depend on:

```text
concurrent Project budget creation
→ Project row lock serializes next version numbers
→ every committed version number is unique

concurrent retry of one DRAFT freeze
→ one durable FROZEN transition
→ one budget.frozen audit row
→ one budget.frozen outbox row

newer frozen revision
→ highest-version FROZEN budget is the current approved read model
→ prior frozen versions remain historical

concurrent same-date forecast replacement
→ Project row lock serializes replace-all snapshots
→ one stored row per supplied budget line
→ no duplicate same-date forecast rows

concurrent duplicate source fixtures
→ scoped source-key unique indexes allow one commitment/actual identity only
→ no browser/source-ingestion API is introduced
```

The rollback scenario sends individually valid `DECIMAL(18,2)` line values whose aggregate total exceeds the supported Project-budget total range. Because line replacement, total calculation and total persistence share one service transaction, the calculated-range failure must restore the prior line set and totals and must not create a second `budget.lines_replaced` audit record.

The operational suite also uses `EXPLAIN (FORMAT JSON)` with sequential scans disabled inside the disposable test transaction to prove supporting indexes exist for current-budget, budget-line, commitment, actual and forecast read shapes. Pass 221 deliberately uses no hard duration thresholds because wall-clock timing is environment-dependent.

Static preparation:

```bash
npm run module-7:operations:gate
```

The genuine live gate is destructive and must run only against the prepared disposable PostgreSQL test environment:

```bash
RUN_FOUNDATION_DB_TESTS=1 npm run module-7:operations:gate:live
```

Before the focused operational PostgreSQL test runs, the live gate reruns both supported migration paths through `npm run db:migrations:verify`: clean deployment and upgrade from the immediately previous supported schema.

Live operational verification additionally requires genuine Stage-11 acceptance plus the completed Pass-218 integration/security and Pass-220 Playwright live handoffs. When any prerequisite is absent, the gate writes blocked evidence instead of claiming runtime verification.

Pass 221 adds no new migration because Pass 213 already owns the complete reviewed Module-7 persistence change.

Next reviewed pass: Pass 222 - Module 7 final Stage-12 acceptance gate.

## Pass 222 - final Stage-12 acceptance gate

Pass 222 is verification-only. It adds no production Module-7 runtime behavior, Prisma model, public route, permission, business state or database migration. Its purpose is to close Stage 12 only after the complete reviewed implementation chain has been proven.

The static gate reruns the direct Stage-12 dependency regressions for Module 15A Finance Core, Module 6 WBS & Cost Codes and Module 24B Project Scope, the complete Module-7 static suite, the full project static regression, workspace/stack checks, migration policy and syntax checks for the real PostgreSQL integration and Playwright workflows.

Run static acceptance preparation with:

```bash
npm run module-7:gate
```

A static pass is not runtime acceptance. The genuine live gate requires all of these prior live handoffs:

```text
Stage 11 Finance Core accepted
Module 7 integration/security verified
Module 7 Playwright workflow verified
Module 7 operational/migration/concurrency verification verified
```

The live gate also requires explicit disposable-database/browser confirmations before it may install dependencies, typecheck, lint, validate/generate Prisma, verify clean + immediately-previous migrations, build, run the Module-7 backend/security suite, run the Module-7 Playwright workflow, run the operational suite and rerun the prior Finance operational regression.

Run the genuine acceptance gate only in the prepared disposable environment with:

```bash
MODULE_7_LIVE_GATE_CONFIRM=RUN_CONSTRUCTION_ERP_MODULE_7_LIVE_GATE \
MIGRATION_TEST_CONFIRM=RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE \
RUN_FOUNDATION_DB_TESTS=1 \
RUN_MODULE_7_E2E=1 \
npm run module-7:acceptance:live
```

Only a successful live run may write:

```text
STAGE_12_ACCEPTED_READY_FOR_STAGE_13
```

Until the inherited Stage-11 live chain is genuinely accepted, the truthful static result remains:

```text
STAGE_12_STATIC_GATE_PASSED_STAGE_11_LIVE_HANDOFF_PENDING
```

The accepted Stage-12 boundary remains exactly five Module-7 tables, seven public operations and six active permissions. `job_cost.source_posted` remains a later source-adapter event rather than a browser-budget event. Stage suffixes do not create extra business modules.

Next dependency-aware stage after genuine Stage-12 acceptance: **Stage 13 - Module 8 Procurement & RFQ**.

---

## Pass 361 post-Stage-23 repair amendment — configured Budget approval + recoverable DRAFT

Pass 361 closes frozen repair items **M7-01** and **M7-02** from the Pass-358 Stage-0→23 repair contract. It does not reopen the Stage-12 table boundary and it does not start Module 8, Stage 26 Finance source adapters or Stage 27 integration completion.

### Conditional approval interpretation

Appendix A requires the baseline Budget freeze to use approval **when configured**, but the source route table provides no separate Module-7 submit/approve command. Pass 361 therefore keeps the existing bodyless `POST /api/v1/projects/:projectId/budgets/:id/freeze` command and makes approval a server-owned conditional handoff to Module 22.

- `BUDGET_APPROVAL_DEFINITION_CODE` is optional server configuration.
- When it is absent, the reviewed direct DRAFT → FROZEN behavior remains unchanged.
- When it is configured, the first freeze attempt validates the Project, permission, active cost structure, lines and authoritative totals, then requests/replays a Module-22 approval for resource type `project_budget`.
- The approval source key fingerprints the normalized Budget business snapshot. An unchanged retry reuses the same approval request. Editing the DRAFT changes the fingerprint, so an approval for stale line/totals content cannot freeze the changed Budget.
- While the authoritative Module-22 result is not `APPROVED`, the Budget remains `DRAFT`. Module 7 creates no custom approver table, no custom approval endpoint, no new approval permission and no duplicate approval state column.
- Once the same snapshot has an authoritative `APPROVED` result, retrying the existing freeze command performs the reviewed DRAFT → FROZEN transition and emits the existing `budget.frozen` / `budget.revised` evidence exactly as before.

### Bounded DRAFT recovery read

The original source defines seven Module-7 operations. Pass 361 adds exactly one repair read needed to resume the existing editor after browser-session loss:

```text
GET /api/v1/projects/:projectId/budgets/draft
```

The read requires `budgets.read`, has no business query filters, returns only the newest Company/Project-scoped `DRAFT`, and returns the existing `BUDGET_NOT_FOUND` error when no DRAFT exists. It is not a generic Budget list/history endpoint and does not add update/delete/reopen authority.

### Pass-361 frozen boundary

```text
Source-defined Module-7 routes: 7
Pass-361 repair read routes:    1
Active Module-7 routes:         8
Owned Module-7 tables:          5 (unchanged)
New Prisma models/tables:       0
New migrations:                 0
Active Module-7 permissions:    6 (unchanged)
New stable Module-7 errors:     0
New Module-7 domain events:     0
Custom approval routes/tables:  0
```

`job_cost.source_posted` remains deferred to real source adapters. Finance AP/AR and other Stage-26/27 boundaries remain frozen exactly as defined by Part I.
