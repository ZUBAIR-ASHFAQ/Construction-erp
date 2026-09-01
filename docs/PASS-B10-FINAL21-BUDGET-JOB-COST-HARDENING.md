# Pass B10 - Final-21 Project Budget & Cost Tracking Hardening

## Purpose

Align Module 9 with the controlling Final 21-module Construction ERP contract while keeping the implementation small, readable and source-traceable.

## Implemented

- Kept the backend as the required five-file module: schema, repository, service, routes and index.
- Exposed only the seven documented Module 9 routes.
- Removed the obsolete draft-budget read endpoint.
- Simplified Project budgets to version, status, currency, total amount, creator and frozen timestamp.
- Kept budget lines on Project + optional Stage + simple cost category only.
- Added real Stage integrity for budget lines, commitments, actuals and forecasts.
- Simplified commitments to one source-keyed amount instead of original/remaining/source-line duplication.
- Simplified actual costs to append-only source-keyed rows.
- Replaced legacy dated forecast snapshots with current Project/Stage/category forecast lines.
- Kept actual and commitment writes owned by operational source modules; Module 9 exposes read/summary behavior only.
- Updated Procurement, Inventory and Equipment adapters to the simplified source-key contract.
- Added idempotency to budget creation, line replacement, freeze and forecast replacement.
- Kept permission checks, Project scope, audit and outbox behavior in service logic.
- Updated React forms to use Stage/category budget and forecast lines and a bounded source-cost ledger.
- Added a forward-only migration; historical migrations were not edited.

## Final Module 9 routes

- `GET /api/v1/projects/:projectId/budgets/current`
- `POST /api/v1/projects/:projectId/budgets`
- `PUT /api/v1/projects/:projectId/budgets/:id/lines`
- `POST /api/v1/projects/:projectId/budgets/:id/freeze`
- `GET /api/v1/projects/:projectId/job-cost`
- `GET /api/v1/projects/:projectId/job-cost/ledger`
- `PUT /api/v1/projects/:projectId/forecast`

## Important invariants

- Frozen budgets are immutable; a revision creates a new version.
- Stage references must belong to the same Project and Company.
- Cost categories are limited to material, labour, security, equipment, subcontract, site_expense and other.
- Actual costs are source-derived and never browser-created in Module 9.
- Commitment and actual source keys remain Company-scoped and idempotent.
- Posted actual history is not overwritten by forecast values.
- Billing, receipts and profitability are not mixed into Module 9 cost totals.

## Deferred to later owning passes

- Procurement-specific final hardening remains Pass B11.
- Inventory legacy WBS/Cost Code cleanup remains Pass B12.
- Equipment Stage/cost final alignment remains Pass B13.
- Payroll/Site Expense/Supplier Payable source adapters are completed in their owning later passes.
- Broad legacy evidence/test/script cleanup remains the final cleanup pass so historical migration evidence is not destroyed prematurely.
