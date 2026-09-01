# Pass B7 — Final-21 Project Stages / Progress

## Purpose

Pass B7 introduces Module 7 as the first-class physical-progress and stage-financial layer required by the Final-21 specification. The implementation deliberately keeps Stage weight, physical progress, actual cost, billing, receipts, and profitability as different concepts.

## Implemented

- Added the final five-file backend module at `apps/api/src/modules/project-stages/`.
- Added `project_stages`, `stage_progress_updates`, and `stage_progress_baselines` with a forward migration.
- Added a forward-only role-permission compatibility bridge before the already-authored B4/B5 migrations, then removed that bridge in B7. This fixes clean migration sequencing without editing historical migration SQL.
- Added the exact Final-21 route, permission, stable-error, event, company-scope, and Project-scope contract.
- Stage weights use exact decimal handling and a frozen baseline is accepted only at exactly `100.0000%`.
- Fixed Price Stage planned value is derived server-side from Project value × Stage weight and recalculated from the current Project value immediately before baseline freeze.
- Once the Stage baseline is frozen, Project commercial model/value/currency edits are blocked so Stage planned values cannot silently drift from the frozen baseline.
- Approved Stage physical progress produces deterministic weighted overall Project progress.
- Lower physical-progress corrections require an authorized approver and a correction note; history remains append-only and audited.
- First approved non-zero progress sets the actual Stage start date. Approved 100% progress completes the Stage using the progress date. An approved correction below 100% re-opens the Stage without deleting history.
- Stage actual cost is read from the existing source-derived `cost_actuals` ledger.
- Stage billed amount is read from issued/posted Client Invoice lines.
- Documents & Audit now allows an authorized `project_stage` resource link so Stage progress evidence can use the existing secure Document flow.
- Added the React Stage setup/progress workspace with TanStack Query, React Hook Form, and Zod, including the Stage progress timeline.
- Added focused B7 static regression tests.

## Deliberately deferred to later approved passes

- Client Receipts does not exist yet in the approved generation order. B7 therefore returns `receivedAmount = 0.00` and does not invent a receipt source. The real Stage received/outstanding calculation will be connected when Module 16 is generated.
- Existing downstream modules still contain transitional nullable `stageId` fields. Their real Stage foreign-key and same-Project validation is added in each module's dedicated alignment pass so old supported databases can be migrated safely rather than force-dropping historical data in B7.
- Cost + Percentage Stage planned amount is left unset until its approved billing baseline exists. B7 does not invent a calculation rule that is absent from the controlling specification.
- The legacy `ProjectMember` bridge remains untouched for Pass B8 Project Team / Assignment migration.

## B7 exit condition

Module 7 now owns Stage planning, the frozen 100% baseline, append-only physical-progress history, approval, weighted overall progress, Stage lifecycle dates, evidence linkage, and source-derived Stage financial reads. Project Team remains the next implementation pass.
