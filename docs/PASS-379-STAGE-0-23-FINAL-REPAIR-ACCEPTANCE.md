# Pass 379 — Stage 0→23 Final Repair Acceptance

## Purpose

Pass 379 is the final cumulative acceptance checkpoint for the Stage-0→23 repair program frozen in Pass 358 and implemented through Pass 378.

This pass is **ACCEPTANCE_ONLY**. It adds no business behavior. It does not add or change a Prisma model, migration, database relation, permission, stable error, domain event, public API, repository command, service command, React workflow or deferred integration adapter.

The controlling source remains the 83-page **Construction ERP — Final Corrected Requirements and Code-Generation Guide**. Part I controls generation order, dependency gates, ownership and deferred integrations. Appendix A continues to control detailed workflows, API contracts, validation, authorization, events, UI and acceptance criteria unless Part I explicitly amends them.

## Baseline

- Input baseline: **Pass 378 — Stage 0→23 Code-Quality / Readability / Duplication Audit**.
- Production snapshot remains the Pass-377/378 snapshot covering `apps/`, `packages/`, `docker/`, `docker-compose.yml`, `tsconfig.base.json`, `eslint.config.mjs` and `playwright.config.mjs`.
- Deterministic production snapshot SHA-256: `605066694f64c6867e462d68aa0f7488f87f7697401e8fb42b0163695ea026e6`.
- Stage 24 / Module 19 RFI & Submittals is deliberately still absent in this acceptance pass.

## Final repair acceptance matrix

### Repairs accepted as complete before Stage 24

- Module 4 BOQ durable revision/detail readback — Pass 367.
- Module 5 controlled suspend/resume lifecycle — Pass 366.
- Module 6 durable WBS freeze/reopen — Pass 359.
- Module 6 Cost Type and archive lifecycle completion — Pass 360.
- Module 7 conditional Budget approval and durable draft/readback — Pass 361.
- Module 8 RFQ item relational integrity — Pass 362.
- Module 8 Vendor master plus RFQ/Requisition readback — Pass 363.
- Module 9 controlled direct-purchase exception — Pass 364.
- Module 9 revision/cancellation evidence — Pass 365.
- Module 10 Warehouse, ledger and low-stock readback — Pass 368.
- Module 10 UOM conversion, inventory count/reconciliation and Inventory stock periods — Pass 369.
- Module 11 detail/application/revision/retention readback and controlled revision/release — Pass 370.
- Module 12 approved usage to exactly-once Job Cost posting — Pass 371.
- Module 12 history, transfer and archive/dispose lifecycle — Pass 372.
- Module 14A/14B employee/leave lifecycle and Payroll/Payslip readback — Pass 373.
- Module 15A Finance Core management/readback — Pass 374.
- Module 16 explicit Progress Claim submission and controlled Client Contract maintenance — Pass 375.
- Module 21 activity ownership/derived duration and baseline reopen/revision — Pass 376.
- Module 17 controlled Change Request withdrawal/history — Pass 377.
- Stage 0→23 code-quality/readability/duplication audit — Pass 378.

### Deliberately unresolved policy-required items

These are not accepted as missing implementation defects because the controlling source does not define enough policy to implement them safely. Existing fail-closed behavior remains required:

- Procurement quotation normalization/evaluation policy beyond the reviewed first scope.
- Purchase Order tolerance and tax policy where no company rule is defined.
- Equipment rental calendar, idle/fuel costing, advanced maintenance policy and disposal valuation.
- Workforce Shift vocabulary and numeric daily/period hour-limit policy.
- Salary-period proration, overtime multiplier, tax/statutory/component formulas and paid/unpaid Leave effects.
- Timesheet reject/return/reopen restart semantics beyond the existing controlled post-approval adjustment path. Module 22 does not define a safe restart/version contract for a previously terminal approval request, so Pass 379 does not invent a second approval engine or hidden source-key mutation.
- Change-order required-document policy and any undefined external/client approval vocabulary.

### Correctly deferred to Stage 26

Pass 379 confirms these remain outside the pre-Stage-24 repair boundary:

- Inventory → Finance source adapter/reconciliation.
- Purchase Order/supplier AP source adapter/reconciliation.
- Subcontract certification → AP source adapter/reconciliation.
- Payroll → Finance source adapter/reconciliation.
- Client Invoice → AR source adapter/reconciliation.

### Correctly deferred to Stage 27

Pass 379 confirms these remain explicit cross-module completion work:

- Tender → BOQ → Project award conversion proof.
- Existing tender BOQ → Project/WBS mapping completion proof.
- Change Order → Client Contract adapter.
- Change Order → Subcontract adapter.
- Change Order → Schedule adapter.
- Employee → Timesheet → Payroll → labor-cost end-to-end release proof.
- Claim → Invoice → AR end-to-end proof after Stage 26.
- Reports-source integration proof before Reports/Dashboard generation.

## Required architecture acceptance

**PASS**

- React + Vite + TypeScript remains the browser stack.
- Fastify + TypeScript remains the API stack.
- Prisma ORM remains centralized under the database package.
- PostgreSQL remains the database target.
- The project remains a TypeScript modular-monolith monorepo.
- All 20 currently generated backend business-module directories still contain exactly five approved files: schema, repository, service, routes and index.
- Every named production function/method remains covered by the global short purpose-comment guard.
- No speculative helpers/managers/extra service layers were introduced.

## Cumulative static acceptance

The Pass-379 acceptance gate requires all of the following to pass from the packaged source:

1. Pass-378 production freeze and code-quality gate.
2. All focused repair evidence from Passes 359 through 378 remains registered/present.
3. Full dependency-free static regression has zero active failures.
4. Migration policy/checksum locks remain valid.
5. No Stage-24 RFI/Submittals production module exists yet.
6. Stage-26/27 and policy-required boundaries remain explicitly deferred rather than silently implemented.

The inherited 25 pre-Pass-373 absence assertions remain marked **superseded historical assertions**. They are not active failures because later approved repair passes intentionally added the capabilities those old tests had asserted were absent.

## Exit decision

**ACCEPTED FOR STAGE 24**

Pass 379 finds no remaining confirmed `REPAIR_BEFORE_STAGE_24` defect that can be safely implemented from the controlling requirements without inventing missing business policy or pulling Stage-26/27 work forward.

The next dependency-aware generation stage is therefore:

**Stage 24 — Module 19 RFI & Submittals**

Stage 24 must start from this accepted Pass-379 baseline and must follow the normal within-module order: Prisma/migration review, Zod boundary schemas, scoped repository, service/transactions/audit/outbox, Fastify routes/registration, integration/security/OpenAPI verification, React feature and Playwright workflow verification.
