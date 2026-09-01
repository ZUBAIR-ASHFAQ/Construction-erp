# Pass 410 — Procurement Runtime Config Wiring Repair

## Purpose

Pass 410 closes audit item A408-02 without changing Module-8 business logic, persistence, routes, permissions, errors or events. The Procurement service already accepted two server-owned policy options, and `buildApp()` already passed those options into `registerProcurementRoutes()`. The missing link was normal API startup: the server configuration loader did not expose either value and `apps/api/src/main.ts` therefore could not pass either value into `buildApp()`.

## Repaired startup chain

The normal startup path is now complete:

```text
process.env
  -> loadServerConfig()
  -> ServerConfig
  -> apps/api/src/main.ts
  -> buildApp()
  -> registerProcurementRoutes()
  -> ProcurementService
```

Pass 410 adds exactly these server-only deployment settings:

```text
PROCUREMENT_REQUISITION_APPROVAL_DEFINITION_CODE
PROCUREMENT_REQUIRE_RATIONALE_FOR_NON_LOWEST_SELECTION
```

`PROCUREMENT_REQUISITION_APPROVAL_DEFINITION_CODE` is optional. When absent, existing Module-8 behavior continues to allow the service's direct internal DRAFT -> SUBMITTED path. When configured, the existing service reuses Module-22 approval orchestration.

`PROCUREMENT_REQUIRE_RATIONALE_FOR_NON_LOWEST_SELECTION` defaults to `false` and accepts only the literal values `true` or `false`. When enabled, the already-implemented selection policy requires the existing `rationale` input for a non-lowest stored-total quotation. The browser does not control this policy.

## Validation

The approval definition code uses the same narrow server-side token rule as other configured Module-22 definition codes: 1–100 letters, numbers, dot, underscore or hyphen characters. Unsafe values are rejected by `loadServerConfig()` before startup.

The boolean policy reuses the existing `parseEnum()` helper instead of adding a third boolean-parser function to the config package.

## Production boundary

Pass 410 changes only two runtime TypeScript files plus the API environment example:

- `packages/config/src/server.ts`
- `apps/api/src/main.ts`
- `apps/api/.env.example`

The following accepted Module-8 files remain byte-identical to Pass 409:

- `procurement.schema.ts`
- `procurement.repository.ts`
- `procurement.service.ts`
- `procurement.routes.ts`
- `procurement/index.ts`
- `apps/api/src/app.ts`
- centralized Prisma schema

No new table, migration, route, repository function, service function, permission, stable error, event, frontend field or dependency is introduced.

## Historical-test supersession

The Pass-408 test that characterized the missing Procurement startup wiring is retained as skipped historical evidence now that Pass 410 performs the repair. The Pass-409 meta-test that required that characterization to remain active is likewise retained as historical evidence. Because Pass 410 is the first planned production repair after the audit-only Passes 407–409, their whole-production-snapshot assertions are also retained but skipped; their focused functional assertions continue to run. The maintained static runner remains broad; no test file is excluded to obtain a green result.

## Verification contract

Pass 410 must verify:

- both settings exist in `ServerConfig`;
- both settings are loaded and validated from server environment values;
- both settings are passed from `main.ts` into `buildApp()`;
- the already-existing `buildApp()` -> Module-8 route/service wiring remains intact;
- development defaults preserve the pre-repair behavior (`null` / `false`);
- invalid approval-definition and boolean values are rejected;
- Module-8 core/backend/database files remain byte-identical;
- the required stack and five-file module architecture remain unchanged;
- the complete maintained dependency-free static suite remains green;
- Stage 25 / Module 20 remains blocked by the cumulative repair plan.

## Next pass

Pass 411 is **Module-22 Delegation Readback Contract Freeze**. It must freeze only the minimum read-only contract required to make the source-required delegation screen durable. It must not add generic Approval CRUD or implementation before the contract decision is reviewed.

## Verification result

The completed Pass-410 state was verified with:

```text
Pass-410 focused cumulative gate        171 tests
Passed                                   169
Historical skips                           2
Failed                                     0

Maintained dependency-free static suite 3037 tests
Passed                                  2972
Historical skips                          65
Failed                                     0

Config package TypeScript typecheck       PASS
Disposable config runtime verification    PASS
Config runtime unit suite               17/17 PASS
Changed TypeScript transpilation           PASS
Migration policy                        53/53 PASS
Named-function purpose-comment guard      PASS
Changed-file whitespace                    PASS
node_modules in archive candidate             0
```

The new deterministic production snapshot contains 451 production files and hashes to:

```text
ecad3f2be21ac22ca4d0ffef48cc0d383aefe7fe22d0a56ed84d858f802496a8
```

That production hash changes from Pass 409 only because the planned server configuration/startup repair changes `packages/config/src/server.ts`, `apps/api/src/main.ts`, and the deployment example. Accepted Module-8 service/repository/routes/schema/index, `apps/api/src/app.ts`, and Prisma remain byte-identical.
