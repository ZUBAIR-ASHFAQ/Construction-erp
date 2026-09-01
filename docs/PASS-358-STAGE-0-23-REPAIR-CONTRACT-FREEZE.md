# Pass 358 — Stage 0→23 repair-contract freeze

## Purpose

Pass 358 is the dedicated **post-Stage-23 cumulative repair-contract freeze** on top of the exact verified Pass-357 Client Billing acceptance baseline.

It converts every confirmed Stage-0→23 gap into one explicit decision before any repair code is written:

- repair before Stage 24 through a small reviewed amendment;
- keep fail-closed until a missing business policy is supplied;
- defer to Module 15B / Stage 26;
- defer to Cross-module Integration Completion / Stage 27; or
- make no change because the current implementation is already inside the reviewed contract.

This pass is **documentation and verification only**. It deliberately changes no production runtime, Prisma model, migration, database relation, repository behavior, service behavior, HTTP route, React behavior, permission, event, status token, financial posting adapter, or calculation formula.

The controlling source is the 83-page **Construction ERP — Final Corrected Requirements and Code-Generation Guide**. Part I controls generation order, ownership, dependency gates and deferred integrations; Appendix A continues to control workflows, APIs, validation, authorization, events, UI and detailed acceptance criteria unless Part I amends them.

## Baseline and production-freeze proof

- Baseline: **Pass 357 — Stage 23 / Module 16 Client Billing final acceptance**.
- Implemented execution range audited here: **Stage 0 through Stage 23**.
- Production snapshot covers `apps/`, `packages/`, `docker/`, `docker-compose.yml`, `tsconfig.base.json`, `eslint.config.mjs` and `playwright.config.mjs`.
- Pass-357 production snapshot SHA-256: `52b0538092af159bb687586a83e59f61e70311abb9d5eed40c1d9d1713010f16`.
- Pass 358 must keep that snapshot byte-for-byte unchanged.

## Decision vocabulary

### `REPAIR_BEFORE_STAGE_24`

The source clearly requires the business capability, but the current implementation cannot fully satisfy it. A dedicated repair pass must first freeze only the missing persistence/API/permission semantics and then implement the smallest safe change.

### `POLICY_REQUIRED`

The source names the capability but does not define enough business rules to calculate or authorize it safely. Existing fail-closed behavior remains correct. No repair pass may invent a formula, status vocabulary or authority rule.

### `DEFER_STAGE_26`

Part I explicitly assigns the missing Finance source adapter/AP/AR completion to Module 15B / Stage 26. It must not be pulled forward.

### `DEFER_STAGE_27`

Part I explicitly assigns the missing cross-module adapter/proof to Stage 27. A source module may be locally complete while this integration remains intentionally deferred.

### `NO_REPAIR`

No confirmed missing Stage-0→23 capability was found that should be changed before Stage 24.

### `QUALITY_ONLY`

No business behavior changes. Cleanup is limited to purpose comments, local simplification and removal of proven duplication without breaking the required five-file module structure.

---

# Stage-by-stage repair matrix

## Stage 0 — Foundation

**Decision: `NO_REPAIR`**

The audited Foundation already owns Company bootstrap, request context, audit, outbox, idempotency, numbering, storage, queues, observability/test infrastructure and company isolation. No repair is frozen here before Stage 24.

## Stage 1 — Module 24A Users/RBAC Core

**Decision: `NO_REPAIR`**

Authentication, sessions, users, roles, permissions and Company scope are already present. Project membership remains correctly separated into 24B after Projects exist.

## Stage 2 — Module 18 Document Management

**Decision: `NO_REPAIR`**

Secure upload intent, versioning, S3-compatible storage references, signed download, archive/restore and project-aware authorization are already implemented. No new file subsystem is allowed.

## Stage 3 — Module 22 Approval Workflows

**Decision: `NO_REPAIR`**

Reusable definition versions, immutable request snapshots, approval actions, delegation, idempotency and terminal-state ownership are already implemented. Owning modules remain responsible for their own business transition.

## Stage 4 — Module 2 CRM & Client Management

**Decision: `NO_REPAIR`**

The Client master, contacts, opportunities and stage-transition foundation required by downstream modules is present. No generic CRM expansion is authorized.

## Stage 5 — Module 3 Tendering & Estimation

**Decision: `NO_REPAIR`**

Tender/estimate versioning, server-owned totals, submission and outcome handling are present. Split-award behavior remains outside the normal first scope unless explicitly designed later.

## Stage 6 — Module 4A BOQ Commercial Core

### M4A-01 — Durable revision/detail readback

**Decision: `IMPLEMENTED_PASS_367`**

The source UI requires revision comparison and a hierarchical item grid, while the reviewed public route table exposes BOQ list plus mutation/export routes only. Current mutation responses contain revision details, but a browser cannot reliably reconstruct arbitrary historical revision details after reload.

Pass 367 adds only the minimum read contract required for BOQ detail/revision-history/revision-item readback. It adds no generic item CRUD, database table, migration, permission, stable error, or domain event.

## Stage 7 — Module 5 Project Management

### M5-01 — Suspended lifecycle is represented but has no controlled command

**Decision: `IMPLEMENTED_PASS_366`**

The Project workflow names `suspended`, `completed` and `closed` controlled lifecycle states, while the original reviewed route table exposed activate, complete and close but omitted suspend/resume. Pass 366 resolves that source-contract gap with exactly two repair commands: `POST /api/v1/projects/:id/suspend` and `POST /api/v1/projects/:id/resume`.

The repair reuses `projects.close` for `ACTIVE -> SUSPENDED` and `projects.activate` for `SUSPENDED -> ACTIVE`, accepts only an optional lifecycle reason, writes `project_status_history` and audit evidence atomically, adds no Project table/migration/repository function, and deliberately does not invent `project.suspended` / `project.resumed` outbox event types. Existing downstream normal-write guards now reject `SUSPENDED` Projects where those modules already own writable-Project checks.

## Stage 8 — Module 24B Project Scope Activation

**Decision: `NO_REPAIR`**

Validated Project memberships and Project-scoped authorization exist after Module 5 as required by Part I.

## Stage 9 — Module 6 WBS & Cost Codes

### M6-01 — WBS freeze is not durable

**Decision: `REPAIR_BEFORE_STAGE_24` — planned Pass 359 — highest-priority repair**

The source requires a frozen cost-structure baseline whose later changes require controlled revision or authorized reopen. Current `freezeWbs()` locks/validates the Project, records audit/outbox evidence and returns successfully, but intentionally persists no frozen-state row/field. Later WBS/mapping mutations therefore have no durable state to reject against.

Pass 359 must add the minimum durable cost-structure state, enforce it in existing WBS/mapping writes, and add only the controlled reopen/revision behavior required to make freeze real. No new standalone business module is allowed.

### M6-02 — Cost Type master is persisted but not publicly manageable

**Decision: `REPAIR_BEFORE_STAGE_24` — planned Pass 360**

`CostType` persistence exists because Project cost combinations require it, but the source UI requires Cost Type master management and the reviewed Stage-9 route table defines no Cost Type list/create/update/archive API.

Pass 360 may add the minimum Cost Type read/manage contract and archive behavior needed by the existing Project cost-structure UI.

### M6-03 — Referenced WBS/Cost Code archive and reopen behavior

**Decision: `REPAIR_BEFORE_STAGE_24` — planned Pass 360**

The source says referenced nodes/codes remain historical and cannot be hard deleted, but the reviewed API has no archive/reopen lifecycle. Pass 360 must use status transitions, not destructive delete.

## Stage 10 — Module 4B BOQ Project Mapping

### M4B-01 — Existing tender-only BOQ award attachment

**Decision: `DEFER_STAGE_27`**

Part I requires Tender → BOQ → Project completion proof and preservation of source IDs at Stage 27. The current source defines no dedicated command for attaching a Project to an already-existing tender-only BOQ. Do not invent that cross-module award-conversion command in a local pre-Stage-24 repair.

The Stage-27 integration pass must freeze and prove this adapter together with BOQ WBS/Cost Code mappings.

## Stage 11 — Module 15A Finance Core

### M15A-01 — Chart-of-Accounts management

**Decision: `REPAIR_BEFORE_STAGE_24` — `IMPLEMENTED_PASS_374`**

Finance workflow requires Chart-of-Accounts setup, but the reviewed public API exposes account reads only. Pass 374 may add minimum account create/update/status-safe management under existing Finance authority.

### M15A-02 — Fiscal-period setup/list/reopen

**Decision: `REPAIR_BEFORE_STAGE_24` — `IMPLEMENTED_PASS_374`**

Period close exists, but setup/list/reopen needed by the Finance workflow and UI are absent. Pass 374 must preserve closed-period protection and audit every reopen.

### M15A-03 — Journal list/detail/ledger readback

**Decision: `REPAIR_BEFORE_STAGE_24` — `IMPLEMENTED_PASS_374`**

Manual journal create/post/reverse and Trial Balance exist, but the Finance UI also requires journal/ledger inspection. Add bounded permission-safe reads only; do not start AP/AR source-adapter work.

## Stage 12 — Module 7 Budgeting & Job Costing

### M7-01 — Budget freeze bypasses conditional approval

**Decision: `REPAIR_BEFORE_STAGE_24` — implemented in Pass 361**

The source says baseline freeze requires approval when configured. Current `freezeBudget()` validates lines/totals and transitions DRAFT directly to FROZEN without consulting Module 22.

Pass 361 must freeze a minimal Module-22 approval handoff and prevent final freeze until the configured approval result is authoritative. It must reuse Approval Workflows rather than adding custom approver tables.

### M7-02 — Draft Budget cannot be reliably recovered after browser-session loss

**Decision: `REPAIR_BEFORE_STAGE_24` — implemented in Pass 361**

The route table exposes current approved Budget but no list/detail read for unfinished DRAFT versions. Pass 361 may add only the bounded readback needed to resume the existing Budget editor.

### M7-03 — Cost-structure target interpretation

**Decision: `NO_REPAIR`**

The current implementation consistently interprets `cost_structure_id` as the Module-6 `project_cost_codes` combination and enforces that relation. Do not replace it with a new abstraction.

## Stage 13 — Module 8 Procurement & RFQ

### M8-01 — `supplier_quotation_items.rfq_item_id` has no enforceable target

**Decision: `IMPLEMENTED_PASS_362` — critical data-integrity amendment completed**

The source requires `supplier_quotation_items.rfq_item_id`, but defines no `rfq_items` table. Current persistence therefore cannot create a direct foreign key for this required identity.

Pass 362 adds the smallest `rfq_items` persistence needed to represent RFQ line snapshots, migrates current Stage-13 behavior safely, adds the real FK and proves same-RFQ/same-Project quotation-line integrity. It adds no unrelated catalog subsystem, public RFQ-item CRUD route, permission, stable error or domain event.

### M8-02 — Vendor master has no practical public management contract

**Decision: `IMPLEMENTED_PASS_363`**

Pass 363 adds the minimum Module-8-owned Vendor/contact list/create/update/archive/restore contract required by Procurement and PO operation. It reuses existing Procurement authority, keeps deletion unavailable, and does not create a generic CRUD subsystem.

### M8-03 — RFQ/Requisition durable readback and controlled returned/revised state

**Decision: `IMPLEMENTED_PASS_363`**

Pass 363 adds durable requisition detail plus RFQ list/detail readback and one explicit controlled requisition revision command. Revision requires a reason, requester ownership, Project permission, revisable state, active cost structures and no downstream RFQ reference; it returns the source requisition to DRAFT without silently editing an RFQ-backed document.

### M8-04 — FX/evaluation-scoring policy

**Decision: `POLICY_REQUIRED`**

The source requires normalized quotation comparison but does not define FX source/rate date, tax normalization, scoring or evaluated-price formula. Current implementation must not invent a multi-currency evaluation engine. A future business-policy amendment is required before richer comparison is enabled.

## Stage 14 — Module 9 Purchase Orders

### M9-01 — Direct-purchase exception is explicitly fail-closed

**Decision: `IMPLEMENTED_PASS_364`**

Pass 364 freezes and implements the smallest direct-purchase contract required by the source: the existing POST `/api/v1/purchase-orders` accepts a quotation-backed PO or a quotation-less exception with mandatory `directPurchaseReason`; the exception requires explicit `purchase_orders.direct_purchase` Project authority, remains subject to the normal Module-22 approval before issue, and records the reason in durable PO/audit/approval evidence.

No bypass route, automatic role grant, new business event, Finance adapter or Stage-27 integration is added.

### M9-02 — Controlled revision history is not fully reconstructable at line level

**Decision: `IMPLEMENTED_PASS_365`**

Pass 365 adds one minimal Module-9 support table for immutable BEFORE/AFTER line snapshots on every controlled revision. Existing historical revision snapshots are recovered from detailed Foundation audit before/after payloads when available. No new public route or generic versioning subsystem is added.

### M9-03 — Cancellation reason persistence/authority

**Decision: `IMPLEMENTED_PASS_365`**

Pass 365 persists `cancel_reason`, `cancelled_at` and `cancelled_by` on the Purchase Order, keeps `purchase_orders.revise` as the closest reviewed cancellation authority, backfills recoverable legacy evidence from Foundation audit history, and prevents cancellation evidence from being rewritten after the transition. No new cancellation permission is invented.

### M9-04 — Tax/rounding and issued-PO FX repricing

**Decision: `POLICY_REQUIRED`**

Do not replace the current explicit first-scope percentage/rounding convention with an invented tax engine, and do not silently revalue issued POs. A reviewed accounting/tax policy is required for broader behavior.

## Stage 15 — Module 10 Inventory & Materials

### M10-01 — Warehouse/site-store management

**Decision: `IMPLEMENTED_PASS_368`**

Pass 368 adds bounded authorized Warehouse/site-store list plus create/update master commands over the existing `warehouses` resource. Project ownership and lifecycle status remain server-controlled, no delete/archive/reassignment command is invented, and existing `inventory.read` / `inventory.item.manage` authority is reused.

### M10-02 — Stock-ledger read and low-stock view

**Decision: `IMPLEMENTED_PASS_368`**

Pass 368 adds a bounded read-only append-only stock-ledger endpoint plus nullable per-Warehouse/Item `minimum_stock_quantity` persistence and a bounded low-stock read. The low-stock rule is intentionally narrow and truthful: a balance is reported only when a threshold is configured and `quantity_on_hand <= minimum_stock_quantity`. Reserved stock is returned for visibility but is not subtracted because the source does not define that policy.

### M10-03 — UOM conversion

**Decision: `IMPLEMENTED_PASS_369`**

Pass 369 adds a deliberately small per-Item alternate-unit conversion contract. The Item base unit remains authoritative, each approved alternate unit stores an exact factor-to-base, PO receipt preserves source/base quantity and cost snapshots, and no separate generic UOM business module is created.

### M10-04 — Inventory count/reconciliation sessions

**Decision: `IMPLEMENTED_PASS_369`**

Pass 369 adds the minimum durable count header/line evidence. Creating a count snapshots expected stock without changing it; reconciliation is idempotent, refuses stale snapshots and creates only append-only adjustment movements for non-zero variance. No approval workflow is invented because the source makes adjustment approval policy-dependent and Module 10 has no hard Approval-Workflow prerequisite.

### M10-05 — Return permission/semantics and stock-period ownership

**Decision: `IMPLEMENTED_PASS_369`**

Pass 369 freezes return as the existing conservative reversal of a prior Project ISSUE and formally requires both existing `inventory.issue` and `inventory.adjust` authority; no new permission code is added. It also adds Inventory-owned OPEN/LOCKED stock periods, so `STOCK_PERIOD_LOCKED` no longer borrows Finance fiscal-period ownership.

### M10-06 — Formal Inventory accounting adapter

**Decision: `DEFER_STAGE_26`**

Formal Inventory-to-Finance source posting belongs to Module 15B / Stage 26.

## Stage 16 — Module 11 Subcontractor Management

### M11-01 — Durable subcontract/application/certification/retention readback

**Decision: `IMPLEMENTED_PASS_370`**

Pass 370 adds only bounded Subcontract detail, application/certification history, immutable revision history and retention-ledger reads. The original eight Stage-16 source operations remain preserved as the historical contract and the repair surface is explicitly separated as a post-Stage-23 amendment.

### M11-02 — Approved revision/variation workflow

**Decision: `IMPLEMENTED_PASS_370`**

Pass 370 implements the minimum historical revision mechanism: an EXECUTED Subcontract can revise only the complete existing scope-line set, keeps stable line IDs/cost mappings, reuses the existing Module-22 Subcontract approval definition and `subcontracts.execute` authority, refreshes Module-7 commitments, and stores immutable before/after revision evidence. It does not pull Change Order target integration forward.

### M11-03 — Retention release workflow

**Decision: `IMPLEMENTED_PASS_370`**

Pass 370 freezes first-scope release as a bodyless full-outstanding release. The server derives certified retention and prior releases, requires both existing `subcontracts.certify` and `subcontracts.close` authority, stores append-only release evidence, and permits close only when the certified total equals revised value and outstanding retention is zero. No new permission or client-supplied release amount is introduced.

### M11-04 — Full Subcontract AP adapter

**Decision: `DEFER_STAGE_26`**

Subcontract certification → AP/Finance source-adapter completion and reconciliation remain Stage 26 work.

## Stage 17 — Module 12 Equipment Management

### M12-01 — Usage approval authority is missing

**Decision: `IMPLEMENTED_PASS_371`**

Pass 371 adds the smallest repair contract: recorded usage keeps the existing `equipment.usage` authority, requires a configured Module-22 definition, exposes bodyless submit/post-cost commands, and keeps approval identity/status server-owned. No new Equipment permission is created.

### M12-02 — Equipment usage does not yet create Module-7 actual cost

**Decision: `IMPLEMENTED_PASS_371`**

Pass 371 posts approved usage to Module 7 exactly once using `EQUIPMENT_USAGE` + Equipment ID + Usage ID as the stable source identity. The cost structure is revalidated as posting-enabled and the usage becomes immutable after posting.

### M12-03 — Assignment/usage/maintenance history readback

**Decision: `IMPLEMENTED_PASS_372`**

Pass 372 adds bounded assignment, usage and maintenance history reads using existing persistence only. Project-derived histories preserve Module-24B visibility, while maintenance history requires Company-wide Equipment read authority.

### M12-04 — Transfer/dispose/archive lifecycle

**Decision: `IMPLEMENTED_PASS_372`**

Pass 372 adds one atomic transfer command and one bodyless archive/dispose command. Transfer closes the current assignment before creating the destination assignment and reuses existing returned/assigned events; archive preserves all historical rows and adds no advanced fleet subsystem.

### M12-05 — Owned/rented rate rules and maintenance scheduling formula

**Decision: `POLICY_REQUIRED`**

The source does not define rental calendars, idle/fuel costing, maintenance intervals or override rules. Pass 372 may expose existing persisted facts but must not invent those formulas.

## Stage 18 — Module 14A Employee Master

### M14A-01 — Leave decision/read lifecycle

**Decision: `IMPLEMENTED_PASS_373`**

Pass 373 adds a bounded leave queue plus audited bodyless approve/reject commands using the existing leave permissions. Leave balance/accrual/payroll-effect policy remains explicitly undefined.

### M14A-02 — Employee status lifecycle

**Decision: `IMPLEMENTED_PASS_373`**

Pass 373 adds bodyless activate/deactivate commands, emits the existing employee.status_changed event, and prevents new Workforce assignments/Timesheets for inactive Employees.

### M14A-03 — Effective compensation history

**Decision: `NO_REPAIR` for persistence/authority**

Later reviewed Stage-20 amendments already added `EmployeeCompensationPeriod` and protected compensation list/create authority. Do not re-add another compensation table.

### M14A-04 — Leave balance/accrual and statutory HR policy

**Decision: `POLICY_REQUIRED`**

The source does not define accrual, carry-forward, holiday calendar or statutory leave calculation. Pass 373 must not invent them.

## Stage 19 — Module 13 Workforce & Timesheets

### M13-01 — Shift identity and duplicate-by-shift rule

**Decision: `POLICY_REQUIRED`**

The source validates duplicate employee/Project/date/shift entries but defines no Shift field/model or vocabulary. Do not add a Shift subsystem from assumption.

### M13-02 — Daily/period hour-limit values

**Decision: `POLICY_REQUIRED`**

The source requires hour limits but defines no numeric policy, override authority or policy source. Existing first-scope validation must remain conservative until a business policy is supplied.

### M13-03 — Reject/return/reopen lifecycle

**Decision: `REPAIR_BEFORE_STAGE_24` — planned together with Pass 373 only if needed by the approved Timesheet workflow**

Submit/approve/adjust exist; explicit reject/return/reopen semantics are not fully reviewed. Pass 373 may freeze only the minimum lifecycle needed for Module-22 terminal results and correction without creating a second approval engine.

### M13-04 — Payroll source consumption identity

**Decision: `NO_REPAIR`**

Stage-20 amendments already added `PayrollSourceConsumption` with at-most-once finalized consumption. Do not create duplicate source-key tables.

## Stage 20 — Module 14B Payroll Completion

### M14B-01 — Salary-period proration

**Decision: `POLICY_REQUIRED`**

Current Payroll correctly blocks SALARY calculation because the source does not define salary frequency, proration, partial-period rules or unpaid-day handling. Do not invent payroll math.

### M14B-02 — Overtime calculation

**Decision: `POLICY_REQUIRED`**

The source mentions overtime but defines no multiplier/rate policy. Current calculation must remain blocked rather than assume 1.5x/2x or another formula.

### M14B-03 — Tax/statutory/allowance/bonus/deduction formulas

**Decision: `POLICY_REQUIRED`**

No statutory jurisdiction formulas or generic component engine are defined. Do not implement them from general knowledge.

### M14B-04 — Leave effect on Payroll

**Decision: `POLICY_REQUIRED`, with lifecycle plumbing repaired in Pass 373**

Pass 373 may make Leave decisions durable/readable. Whether approved Leave is paid/unpaid and how it changes Payroll still needs business policy.

### M14B-05 — Payroll Run/Payslip list/detail browser readback

**Decision: `IMPLEMENTED_PASS_373`**

Pass 373 adds bounded Payroll Run history/detail and authorized Payslip list readback without changing calculation or finalization behavior.

### M14B-06 — Payroll Finance source adapter/reconciliation

**Decision: `DEFER_STAGE_26`**

Stage 20 owns finalized Payroll and the Finance Core posting contract; Module 15B completes the source adapter/reconciliation at Stage 26.

### M14B-07 — Employee → Timesheet → Payroll → labor-cost end-to-end release proof

**Decision: `DEFER_STAGE_27`**

The corrected execution contract explicitly requires the atomic/idempotent cross-module proof at Stage 27.

## Stage 21 — Module 21 Project Scheduling

### M21-01 — Activity owner and planned duration fields

**Decision: `IMPLEMENTED_PASS_376`**

The workflow names activity owner and planned duration, while the table contract omits both. Pass 376 must freeze whether duration is persisted or derived and how owner references an authorized User.

### M21-02 — Baseline reopen/revision lifecycle

**Decision: `IMPLEMENTED_PASS_376`**

Baseline is immutable, but the source does not define the controlled reopen/revision command or exact post-baseline editable field scope. Pass 376 must preserve every baseline snapshot and never overwrite history.

### M21-03 — Advanced CPM/P6/resource loading/external synchronization

**Decision: `NO_REPAIR / OUT OF SCOPE`**

The source explicitly says this medium module does not claim full resource-loaded CPM/P6 parity. Do not expand scope.

### M21-04 — Change schedule impact and Daily Report activity integration

**Decision: `DEFER_STAGE_27`**

These are cross-module adapters/proofs, not local Schedule repair.

## Stage 22 — Module 17 Change Orders / Variations

### M17-01 — Withdraw lifecycle

**Decision: `IMPLEMENTED_PASS_377`**

Pass 377 adds one minimal local withdraw command for DRAFT or SUBMITTED Change Requests. It reuses `changes.submit`, requires a non-empty reason, records server-owned actor/time evidence, makes the withdrawn row terminal/immutable at PostgreSQL level and applies no Budget/Contract/Subcontract/Schedule impact. No new permission, stable error or domain event is introduced.

### M17-02 — Exact status/type vocabularies and approval-document policy

**Decision: `POLICY_REQUIRED`**

The source does not enumerate Change type/status/impact-status vocabularies or the exact required-document list. Do not widen current allow-lists from assumption.

### M17-03 — Client Contract/Subcontract/Schedule target adapters and already-applied reversal policy

**Decision: `DEFER_STAGE_27`**

Part I explicitly assigns configured Change target adapters and integration proof to Stage 27. Do not pull them forward.

## Stage 23 — Module 16 Client Billing

### M16-01 — Explicit Progress Claim submit lifecycle

**Decision: `IMPLEMENTED_PASS_375`**

The source workflow says review/submit Claim before certification and defines `progress_claim.submitted`, but its route table contains no Claim submit endpoint. Current certification safely records an implicit submit event in the same transaction rather than inventing a route.

Pass 375 must freeze whether submission is a distinct durable state/command. If added, certification must require the submitted/approved state and must not duplicate submit evidence.

### M16-02 — Client Contract maintenance/correction

**Decision: `IMPLEMENTED_PASS_375`**

The workflow says billing terms are maintained, but the reviewed API defines create only. Pass 375 may add controlled editable-term updates only while contract state allows them; revised Contract value remains driven by approved Change integration when configured.

### M16-03 — Payment status tracking

**Decision: `DEFER_STAGE_26` for authoritative AR/payment integration**

Module 16 should not invent a second payment subsystem. Client Invoice → AR and receipt/allocation status become authoritative through Finance Source Adapters at Stage 26.

### M16-04 — Change Order → Client Contract mapping

**Decision: `DEFER_STAGE_27`**

The exact target mapping/source key is a configured cross-module adapter and remains Stage-27 integration work.

---

# Cross-cutting database/table/relation decisions

## Confirmed current table coverage

Pass 358 found **no missing table that Appendix A explicitly lists for an already-built Stage-0→23 gate** after accounting for later reviewed amendments such as Payroll compensation/source-consumption persistence.

## Confirmed relation/persistence repair

The strongest current relational gap is Module 8:

- `supplier_quotation_items.rfq_item_id` exists as a required business identity;
- the source defines no `rfq_items` table;
- therefore the current schema cannot enforce the expected direct FK.

Pass 362 is the reviewed amendment that may add `rfq_items` and the real relation.

## Confirmed persistence repairs that must be minimal

The following may require new persistence only because current source-required history/state cannot otherwise be represented safely:

- durable WBS cost-structure freeze/reopen state;
- RFQ item identity;
- direct-purchase reason/authority evidence;
- PO revision-line snapshots if current state cannot reconstruct commercial history;
- Inventory UOM/count-session state and the unresolved return/stock-period policy;
- Subcontract revision/retention-release history;
- Equipment usage approval/posting identity.

No other speculative “future-proof” tables are authorized by this pass.

---

# Service / repository / function decision

For the public routes already implemented through Stage 23, Pass 358 did **not** find a general broken route → service → repository chain. The missing repository/service functions are primarily consequences of missing business capabilities listed above.

Future repair passes may introduce only the functions required by their frozen capability. Suggested names in audit notes are descriptive, not mandatory API contracts. Do not create helper layers merely to reduce line count.

The five-file module structure remains authoritative:

1. `*.schema.ts`
2. `*.repository.ts`
3. `*.service.ts`
4. `*.routes.ts`
5. `index.ts`

Prisma stays centralized.

---

# Junior-readable code and function-comment contract

Every repair pass from Pass 359 onward must follow these rules:

1. Every named function/method introduced or materially edited receives a short purpose comment.
2. Small inline callbacks should also have a nearby purpose comment when their intent is not obvious from the surrounding statement.
3. Keep route handlers thin; business rules belong in the existing service, persistence in the existing repository.
4. Prefer one clear function over multiple wrappers that only forward arguments.
5. Do not split a required five-file module into many extra helper files merely to make files shorter.
6. Large existing services may be simplified locally, but behavior must not change during the dedicated quality-only pass.
7. Remove a function/file only when static/runtime evidence proves it is redundant or unused.

The existing cumulative static suite already proves that **every named production function has a short purpose comment**. Pass 378 therefore does not add comment noise to already-compliant functions; it re-runs that guarantee after the repair series and focuses on local readability/simplification only.

Current service-size hotspots are recorded for that later quality-only pass, not repaired here: `administration.service.ts`, `hr-payroll.service.ts`, `purchase-orders.service.ts`, `subcontracts.service.ts`, `inventory.service.ts` and `approvals.service.ts` are all above roughly 1,100 lines.

---

# Stage 26 — frozen Finance deferrals

The following are **not Pass-358 repair defects** and must stay deferred:

1. PO/supplier → AP source adapter and reconciliation.
2. Inventory → Finance source adapter.
3. Subcontract certification → AP adapter/reconciliation.
4. Payroll → Finance source-adapter completion/reconciliation.
5. Client Invoice → AR adapter/reconciliation.
6. Finance AP/AR/payment-allocation completion that Part I assigns to Module 15B.

---

# Stage 27 — frozen integration deferrals

The following remain mandatory release proofs but must not be implemented as local pre-Stage-24 shortcuts:

1. Tender → BOQ → Project award conversion and existing BOQ Project/WBS mapping completion.
2. PR → RFQ → PO → Receipt full source-chain proof.
3. Subcontract Certification → Finance proof.
4. Employee → Timesheet → Payroll → labor-cost posting proof.
5. Change → Budget/Client Contract/Subcontract/Schedule application and reversal/adjustment proof.
6. Claim → Invoice → AR proof.
7. Document/Approval deferred cross-resource links where their owning module contract requires completion.
8. Reports → Dashboard permission-safe aggregate proof after Stages 28 and 29 exist.

---

# Repair sequence frozen by Pass 358

The next passes are dependency-aware and intentionally small:

| Pass | Repair scope |
|---:|---|
| 359 | Module 6 durable WBS freeze/reopen state |
| 360 | Module 6 Cost Type + archive lifecycle |
| 361 | Module 7 Budget approval + DRAFT readback |
| 362 | Module 8 `rfq_items` + quotation-line FK integrity |
| 363 | Module 8 Vendor master + RFQ/Requisition read/revision contract |
| 364 | Module 9 Direct Purchase exception |
| 365 | Module 9 revision-line/cancellation history |
| 366 | Module 5 suspend/resume lifecycle |
| 367 | Module 4 BOQ revision/detail history readback |
| 368 | Module 10 Warehouse + stock-ledger + low-stock |
| 369 | Module 10 UOM + count/reconciliation + return/period policy |
| 370 | Module 11 readback + revision + retention release |
| 371 | Module 12 usage approval + exactly-once Job Cost actual |
| 372 | Module 12 history + minimal transfer/dispose/archive lifecycle |
| 373 | Modules 14/13 HR/Payroll/Timesheet local lifecycle/readback repairs only |
| 374 | Module 15A Finance Core management/read APIs only |
| 375 | Module 16 Claim submit + controlled Contract maintenance |
| 376 | Module 21 activity owner/duration + baseline revision/reopen |
| 377 | Module 17 local withdraw/history completion only; no Stage-27 adapters |
| 378 | Code-quality-only comment/readability/duplication audit across Stage 0→23 |
| 379 | Full cumulative Stage-0→23 repair acceptance audit |

`POLICY_REQUIRED` items do not receive hidden default formulas inside these passes. If the business owner supplies the missing policy, add a separate reviewed amendment pass before enabling that behavior.

Only after Pass 379 passes should Stage 24 / Module 19 RFI & Submittals begin.

---

# What Pass 358 changes

Allowed changes in this pass:

- this repair-contract document;
- one focused static verification test;
- one small acceptance verifier/evidence writer;
- one package-script entry for the gate;
- generated Pass-358 acceptance evidence.

Pass 358 changes **zero production runtime files** and **zero database files**.

## Exit condition

Pass 358 passes only when:

- the focused repair-freeze test passes;
- the full existing static suite still passes;
- workspace contract still passes;
- migration policy still passes;
- production snapshot still equals the exact Pass-357 hash;
- the next reviewed implementation pass is **Pass 359 — Module 6 durable WBS freeze/reopen state**.
