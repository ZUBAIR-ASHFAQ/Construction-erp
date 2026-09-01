# Pass 303 — Cross-module source-gap audit freeze before Stage 20

## Purpose

This pass freezes the unresolved source-contract gaps that already exist across the implemented Construction ERP stages before **Stage 20 / Module 14B Payroll Completion** is generated.

This is a documentation and verification gate only. It does not add or change a Prisma model, migration, repository function, service function, Fastify route, React behavior, permission, event, posting adapter, or business rule.

The controlling execution contract places **Module 14B at Stage 20** after Module 13 Workforce & Timesheets, Module 15A Finance Core, Module 22 Approval Workflows, Module 18 Document Management and Module 14A Employee Master. It separately defers source-specific Finance adapters to **Module 15B / Stage 26** and deferred cross-module completion to **Stage 27**.

## Freeze rule

An unresolved item below must not be silently implemented from assumption. A later pass may implement it only after either:

1. the controlling source already gives enough exact contract to proceed safely; or
2. a reviewed amendment explicitly freezes the missing persistence/API/permission/calculation behavior.

Safe fail-closed behavior already present in the code may remain in place until the source contract is resolved.

## Category A — Must be resolved before Stage 20 Payroll runtime implementation

These gaps directly affect the correctness, authorization, lifecycle, or idempotency of payroll calculation/finalization.

### A1. Effective compensation and pay authority

**Source requirement:** HR/Payroll must maintain pay type and approved compensation inputs; salary/pay rates use DECIMAL and effective dates are explicit. Payroll consumes approved Workforce time.

**Current gap:** Module 14A has `base_salary` and `hourly_rate`, but the source defines no `pay_type` field, compensation component/history model, effective-date field/history, or salary-specific permission.

**Required decision before runtime:** freeze the authoritative historical compensation lookup used for each payroll period and each approved Timesheet date, including which values are salary-based versus hourly.

### A2. Overtime and approved labor-rate policy

**Source requirement:** Job-cost labor values use approved HR/Payroll rates, not arbitrary user-entered cost, and payroll imports approved regular/overtime inputs.

**Current gap:** the source does not define the regular-rate selection rule, overtime multiplier/rate rule, effective-date lookup, rounding, or whether payroll and Job Cost share the same derived labor-rate result.

**Required decision before runtime:** freeze the exact server-owned rate calculation contract. The browser must never supply authoritative labor cost.

### A3. Payroll calculation policy

**Source requirement:** calculate earnings, deductions and net pay server-side; review blocking exceptions before finalization.

**Current gap:** the source defines no exact earnings/deduction component rules, salary proration rule, overtime calculation formula, leave effect rule, statutory/tax formula, rounding convention, exception persistence, or override request shape.

**Required decision before runtime:** freeze the medium-ERP payroll calculation rules that are actually in scope. Do not invent a payroll engine or statutory rules not present in the source.

### A4. Payroll approval lifecycle

**Source requirement:** payroll is reviewed, submitted/approved and finalized; finalization requires approval completed and all blocking exceptions resolved.

**Current gap:** Module 14 lists create/calculate/finalize payroll routes but no reviewed payroll submit/approve/reject/return route, no approval-definition selection contract, and no explicit mapping between Module 22 approval state and Payroll status.

**Required decision before runtime:** freeze how Module 14B reuses Module 22, which command starts approval, which state allows finalization, and how rejected/returned runs behave.

### A5. Payroll-run identity and overlap rule

**Source requirement:** payroll run periods cannot overlap for the same payroll group if configured.

**Current gap:** no payroll-group table, field, configuration source, or default grouping rule is defined.

**Required decision before runtime:** either define the payroll-group identity/configuration contract or explicitly freeze one Company-wide payroll group for the reviewed medium ERP.

### A6. Approved Timesheet eligibility and Payroll-period locking

**Source requirement:** approved hours become locked payroll input; approved payroll periods block normal Timesheet edits.

**Current gap:** Stage 19 has no Payroll-period persistence/link because Module 14B did not yet exist. The exact lock boundary, period match and readback rule are undefined.

**Required decision before runtime:** freeze the Payroll-run-to-Timesheet selection and locking relationship before Payroll can consume Stage-19 rows.

### A7. Shift/hour-limit correctness before Payroll consumption

**Source requirement:** Workforce validates daily/period hour limits and prevents duplicate employee/project/date/shift entries where not allowed.

**Current gap:** the source defines no Shift field and no hour-limit policy values. Stage 19 therefore cannot fully prove those two rules from the reviewed contract.

**Required decision before runtime:** resolve the Shift identity/duplicate rule and hour-limit policy, or explicitly amend those requirements before Payroll treats approved time as authoritative input.

### A8. Leave effects when Payroll policy includes leave

**Source requirement:** leave requests are recorded/approved where included in Payroll policy and leave effects are part of HR/Payroll.

**Current gap:** `leave.read` and `leave.approve` permissions and the `leave.approved` event exist, but no reviewed leave list/detail/approve/reject routes are defined. No leave balance/accrual/day-calculation policy is defined.

**Required decision before runtime:** if leave affects Stage-20 calculation, freeze the minimum leave approval/read contract and the exact payroll effect. If leave does not affect the first Payroll scope, record that exclusion explicitly.

### A9. At-most-once Payroll consumption/source identity

**Source requirement:** one approved Workforce source entry must post to payroll at most once, and Payroll finalization is idempotent.

**Current gap:** Stage 19 defines no Payroll source-key/posting-status fields or readback shape. Module 14B has not yet defined the unique source identity used to prevent duplicate consumption.

**Required decision before runtime:** freeze the source key, source-line identity, consumed/finalized state and correction/reversal behavior.

### A10. Stage 20 versus Stage 26 Finance boundary

**Source requirement:** Stage 20 delivers Payroll finalization and a Finance Core posting contract; Stage 26 completes payroll source adapters/reconciliations. Appendix A also says Payroll posting to Finance is atomic with finalization/outbox recording.

**Current gap:** the exact split between the Stage-20 Finance Core posting contract and the later Module-15B payroll adapter is not specified.

**Required decision before runtime:** freeze what Stage 20 may post directly to Module 15A, what remains deferred to Stage 26, and what evidence can truthfully be called atomic before the Stage-26 adapter exists.

## Category B — Explicitly deferred to Stage 26 / Stage 27

These items must **not** be pulled into Stage 20 merely to make Payroll appear complete.

1. Module 15B AP/AR tables and supplier/client payment allocation behavior remain Stage 26 work.
2. PO/supplier Finance source adapters remain Stage 26 work.
3. Subcontract certification to AP/Finance source adapter and reconciliation remain Stage 26 work.
4. Formal Inventory accounting/source adapters remain Stage 26 work.
5. Payroll source-adapter completion/reconciliation beyond the frozen Stage-20 Finance Core boundary remains Stage 26 work.
6. Client-invoice to AR source adapter remains Stage 26 work.
7. Cross-module proof that Employee -> Timesheet -> Payroll finalization -> labor-cost posting is atomic/idempotent remains a Stage-27 release proof.
8. Deferred source-key/target links across Change, Finance, Documents, Approvals and reporting sources remain Stage-27 integration-completion work where Part I assigns them there.

## Category C — Source amendment required, but not a Stage 20 Payroll blocker

These are confirmed incompletenesses in already implemented modules. They remain frozen and must be repaired in dedicated passes rather than mixed into Payroll.

### Module 6 — WBS & Cost Codes

- Cost Type master UI is required but no reviewed Cost Type list/create API exists.
- Archive behavior is described but no WBS/Cost Code archive command exists.
- Freeze is described as a durable baseline with controlled revision/reopen, but no durable freeze-state field/table or reopen/revision command is defined.

### Module 7 — Budgeting & Job Costing

- No reviewed budget list or DRAFT-budget detail/readback route exists.
- Conditional approval is described but no submit/approve/reopen command exists.
- `cost_structure_id` target and several job-cost/forecast response/calculation details are not fully enumerated.

### Module 8 — Procurement & RFQ

- Module 8 owns `vendors` and `vendor_contacts`, but no reviewed Vendor-master public management API exists.
- `supplier_quotation_items.rfq_item_id` has no defined `rfq_items` table or explicit FK target.
- Requisition revision/return-to-draft, quotation import and normalized comparison/FX rules are described without complete executable contracts.

### Module 9 — Purchase Orders

- Direct-purchase bypass requires permission/reason/approval but the permission, request shape and persistence are not defined.
- Controlled PO line/rate history is required but the reviewed model has no revision-line snapshot table.
- Cancellation reason persistence/permission, exact tax/rounding and issued-PO FX/repricing rules are not fully defined.

### Module 10 — Inventory & Materials

- Warehouse/site-store management has no reviewed management API.
- Stock-ledger and low-stock UI requirements have no dedicated read contract; low-stock thresholds are not persisted.
- UOM conversion, valuation method details, stock-count workflow, return permission/semantics and stock-period ownership are incomplete.

### Module 11 — Subcontractor Management

- Required subcontract detail/application/certification/retention readback has no reviewed GET contract.
- Revision/variation and retention-release workflows lack complete routes/persistence/permissions.
- Certification deductions, closeout proof and exact commercial formulas are incomplete.

### Module 12 — Equipment Management

- Approved usage is required before cost posting, but no usage approval lifecycle exists.
- Assignment/usage/maintenance history reads are absent from the reviewed route table.
- Transfer/dispose/archive, maintenance policy, owned/rented rate rules and posted-usage correction are incomplete.

### Module 14A — Employee Master gaps not selected as Stage-20 blockers

- Employee status transition route is absent although `employee.status_changed` is source-defined.
- Employee number authority is not defined as manual versus Foundation-numbered.
- Employee detail GET, Trade identity and one-to-one User uniqueness are not defined.

### Module 15A — Finance Core

- Chart-of-Accounts setup is described but reviewed Stage-11 API exposes only account reads.
- Fiscal-period list/setup/reopen APIs are absent.
- Journal list/detail readback is absent although `finance.journals.read` and ledger UI are described.
- Some source tokens, `cost_structure_id` target details and reversal linkage remain implementation-contract gaps.

## What Pass 303 deliberately does not change

- no database table or relation
- no Prisma model
- no migration
- no Zod request/response schema
- no repository function
- no service logic
- no Fastify route
- no React component/hook/API client
- no permission code
- no status/event token
- no accounting posting adapter
- no Payroll calculation rule

## Stage-20 entry condition

**Stage 20 runtime generation is blocked by Category A.** Static contract/design passes may continue, but production Payroll persistence/service/API/UI must not be generated from assumptions.

The next reviewed pass is **Pass 304 — Compensation and labor-rate authority contract**. It should resolve only A1/A2 and the directly related parts of A3, without starting Payroll persistence or unrelated module repairs.
