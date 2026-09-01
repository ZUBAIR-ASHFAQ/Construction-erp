# Pass B19.7 - Final-21 Project Profitability HTTP, RBAC and OpenAPI

## Purpose

B19.7 exposes the completed Final Module 19 Project Profitability service through the exact Final-21 HTTP surface. The module remains read-only and source-derived. This pass adds HTTP registration, request-boundary validation, authentication wiring, OpenAPI request/response contracts, application registration and one permission-only forward migration.

Exactly four read-only GET routes are registered:

- `GET /api/v1/project-profitability/projects/:projectId`
- `GET /api/v1/project-profitability/projects/:projectId/stages`
- `GET /api/v1/project-profitability/projects/:projectId/trend`
- `GET /api/v1/project-profitability/portfolio`

No POST, PUT, PATCH or DELETE route is added.

## Authentication and authorization

Every Project Profitability route authenticates the bearer session through the existing Foundation authentication path before invoking Module 19.

Service-level authorization remains authoritative. The HTTP layer does not replace or weaken the B19.5/B19.6 checks. The service still revalidates authenticated Project scope and the frozen permissions:

- `project_profitability.read`
- `project_profitability.finance.read`
- `project_profitability.portfolio.read` for portfolio access

Out-of-scope Projects fail with `PROFITABILITY_SCOPE_FORBIDDEN` without revealing cross-Company data.

## Boundary validation

The B19.3 Zod schemas remain the authoritative request contract.

B19.7 validates path/query values in a Fastify pre-validation hook before Fastify JSON-schema normalization can silently remove unknown fields. This preserves strict rejection of client-supplied formulas, expressions, ownership or unsupported query fields.

Invalid Project Profitability path/query input returns the stable code:

`INVALID_PROFITABILITY_FILTER`

Field-level Zod issues are included through the shared API error envelope.

## OpenAPI contract

All four routes publish:

- the `Project Profitability` tag;
- bearer security;
- unique operation IDs;
- documented path/query parameters;
- bounded pagination and trend filters;
- explicit response schemas inside the standard `{ data: ... }` success envelope;
- the shared error envelope.

The OpenAPI responses keep recognized revenue, actual cost, profit, billed, received, allocated, advance, outstanding and Supplier payable as distinct fields.

Stage responses also keep Stage weight, approved physical progress and planned Stage amount separate, and expose both `projectOnly` and `projectTotal` reconciliation objects.

Trend points expose only recognized revenue, actual cost and profit. Cash and payable values are intentionally not introduced into the trend contract.

Portfolio items keep currency on each Project and expose no cross-currency grand total or invented conversion.

## Stable errors

The documented Module 19 business errors remain exactly:

- `PROFITABILITY_SCOPE_FORBIDDEN`
- `PROFITABILITY_SOURCE_INCOMPLETE`
- `INVALID_PROFITABILITY_FILTER`

Foundation authentication and infrastructure errors retain their own existing stable codes.

## Application registration

`registerProjectProfitabilityRoutes` is exported by the existing five-file Module 19 folder and registered from `apps/api/src/app.ts` only when a database is provided.

The route registration is placed after the existing Client Receipts registration, with all Module 19 prerequisites already registered. No prerequisite module ownership is changed.

A permission-only forward migration seeds the three frozen Module 19 permission codes and grants them to the conventional active `system-admin` role for existing installations. Fresh bootstrap already grants the system administrator every installed permission. The migration creates no Project Profitability business table, view, cache or calculated balance.

## Scope intentionally deferred

B19.7 does not add:

- React Project Profitability UI;
- Project Profitability persistence, snapshot table or cache;
- Project Profitability business-data migration, table, view or cache;
- write endpoint or idempotency command;
- new business calculation in the route layer;
- cross-module live reconciliation/security completion.

## Historical checkpoint hygiene

Earlier B19.3, B19.5 and B19.6 tests that asserted HTTP registration was still deferred were adjusted only to preserve those passes as historical checkpoints after the planned B19.7 handoff. Their documentation and acceptance evidence remain unchanged.

## Next pass

**B19.8 - Project Profitability cross-module reconciliation and security:** verify Project/Stage totals against Modules 9, 15, 16, 17 and 18, negative permission and cross-Company behavior, source-status filtering, no double counting and critical cash-not-profit scenarios through repository/service/Fastify integration coverage.

## Verification results

- B19.7 focused gate including B18.10 handoff, migration and workspace checks: **116/116 PASS**
- B19.1-B19.7 Project Profitability alignment: **88/88 PASS**
- Final-21 static suite: **711/711 PASS**
- Current Foundation + Final-21 static suite: **816/816 PASS**
- Migration policy: **89/89 migrations locked across 89 gates**
- Workspace structure: **PASS**
- Legacy database-cleanup manifest: **PASS**
- TypeScript syntax transpile for changed production files: **PASS**
- Dependency-backed TypeScript/build verification: **not claimed**, because the supplied archive has no installed `node_modules`.
