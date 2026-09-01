# Stage 2 - Pass 2.4 Request Security and Isolation

Status: COMPLETE for static/source hardening. Live database proof remains blocked by the Stage-0 environment limits.

## What was checked from code

- Read the request-context package, Fastify request-context plugin and authentication flow.
- Traced every current backend `*.repository.ts`; all current module repositories use `requireCompanyRepositoryScope()` somewhere in their persistence boundary.
- Counted every registered module route against `authenticateRequest()` calls. All non-public routes authenticate; the only five unauthenticated routes are the intended sign-in/refresh/invitation/password-reset entry points.
- Checked Project scope resolution and resource-policy call sites. Authentication derives company, actor, permissions and Project scope from persisted session/User/RBAC data, not request headers or bodies.
- Searched direct `findUnique`, `update` and `delete` calls against Prisma models that contain `companyId` to find writes that could bypass a top-level tenant predicate.

## Repairs made

1. `packages/request-context/src/context.ts`
   - Rejects malformed runtime Project-scope kinds instead of silently treating an unknown kind as `restricted`.
   - Rejects non-array restricted Project IDs.
   - Validates non-empty security strings safely even if JavaScript/`any` bypasses TypeScript.

2. `packages/tenant-scope/src/scope.ts`
   - Defensive ownership checks now reject non-string persisted/runtime `companyId` values with the existing non-disclosing cross-company error.

3. `apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts`
   - Replaced two top-level `update({ where: { id } })` lifecycle writes with conditional Company + Project scoped `updateMany()` calls.
   - RFI and Submittal lifecycle writes now re-check the trusted company predicate at the write statement itself instead of relying only on a prior scoped read.

4. Added one focused regression test file:
   - `tests/stage-2-pass-2.4-security-isolation.test.mjs`
   - Covers malformed Project scope, malformed company ownership, route authentication coverage, server-derived authentication authority and scoped lifecycle writes.

## Validation

- Focused Pass 2.4 tests: 5 passed, 0 failed.
- `npm run test:static`: 3,012 passed, 0 failed, 87 skipped.
- `npm run foundation:gate`: PASS, including 8/8 Foundation acceptance checks.
- Function-comment policy: PASS through the existing static test.

## Limits not hidden by this pass

- Live cross-company database tests were not run because the current environment still has no usable database/dependency setup from Stage 0.
- The repository still contains the older module architecture. This pass hardens the code that is currently registered; it does not claim the final 21-module refactor is complete.
- Project-scope persistence still comes from the existing Project membership/RBAC design. Final Administration alignment is a later business-module concern and was not rewritten in this Foundation pass.

## Pass 2.4 exit decision

Static request security and current-code tenant isolation are hardened enough to proceed to Pass 2.5. Live DB isolation proof remains an explicit final Foundation gate requirement.
