# Pass 406 — Module 19 Playwright Workflow

## Purpose

Pass 406 builds on the exact Pass-405 archive and adds the browser-level Stage-24 workflow required before final Module-19 acceptance.

The accepted backend/database/UI contracts are not expanded. The new Playwright scenario drives the existing Module-24A sign-in form, shared AdminShell, Pass-404 Module-19 workspace, Pass-403 TanStack Query hooks and Pass-402 typed API client against the real Fastify/PostgreSQL stack when the live test prerequisites are available.

## Source boundary

The controlling Construction ERP specification requires:

- RFI register/detail/thread;
- RFI create, respond, close and reopen workflow;
- Submittal register and revision package;
- reviewer decision handling;
- append-only response/review history;
- Project/user/Document scope validation;
- permission-aware React actions with the API authoritative;
- Playwright coverage of the main workflow before advancing to the next dependency-aware phase.

Pass 406 does not add generic CRUD, edit/delete/archive operations, a new permission, a new event, a new table, or a Stage-25 / Module-20 production surface.

## Browser workflow added

`tests/e2e/module-19-browser.spec.mjs` now seeds the smallest real graph needed for one complete browser scenario:

- active Company;
- manager and read-only user;
- reviewed Module-19 permissions plus `projects.read`;
- active Project and Project memberships;
- RFI/Submittal number sequences;
- one active same-Project Module-18 Document with an immutable current version.

The manager browser then verifies:

1. sign in through the real Module-24A UI;
2. open `RFI & Submittals` through the Pass-405 permission-aware shell;
3. select the seeded Project through the existing Project read API;
4. create `RFI-0001` using only reviewed business inputs;
5. open the durable RFI thread;
6. append one response linked to the versioned same-Project Document;
7. close the RFI;
8. confirm a closed RFI exposes no normal response control;
9. reopen it with the reviewed reason body;
10. create `SUB-0001` with the same reviewed Project Document;
11. submit revision 1;
12. record `REVISE_RESUBMIT` with comments;
13. confirm revision 2 is created as the next DRAFT;
14. resubmit revision 2 with the reviewed Project Document;
15. reload the browser and prove the RFI response plus both Submittal revisions/review history are reconstructed from durable API readback.

## Negative permission workflow

A second browser context signs in as a read-only Module-19 user with only:

```text
rfi.read
submittals.read
projects.read
```

The test verifies the user can read the seeded Project collaboration history but cannot see create/respond/close/review controls. It also sends direct authenticated API write attempts to prove denied commands cannot mutate the accepted RFI/Submittal state. Resource-sensitive commands accept either `403` or non-disclosing `404` because the current service intentionally resolves authorization scope before revealing resource existence for several commands.

The final database assertions prove the denied user did not create extra RFIs, responses, Submittals or reviews.

## Playwright selector integration

`playwright.config.mjs` now recognizes exactly one additional selector:

```text
RUN_MODULE_19_E2E=1
```

When selected, only:

```text
tests/e2e/module-19-browser.spec.mjs
```

is run. The existing one-module-at-a-time browser rule is preserved.

The live command is registered as:

```text
npm run test:e2e:module-19
```

and requires both:

```text
RUN_MODULE_19_E2E=1
RUN_FOUNDATION_DB_TESTS=1
```

plus the normal `TEST_DATABASE_URL` required by the shared Playwright configuration.

## Production behavior

No Module-19 API, hook, component, shell navigation, Prisma model, migration, backend service/repository/route, permission, error or event behavior changes in this pass.

The only production-source edit is the explanatory note in `rfi-submittals-page.tsx`, replacing the obsolete “Playwright remains for the next pass” sentence with the now-current Pass-406 verification statement. It changes no rendered action, request, state transition or authorization rule.

## Verification

The focused Pass-406 gate verifies:

- the new browser scenario is syntactically valid;
- the scenario covers RFI create → respond → close → reopen;
- the scenario covers Submittal create → submit → `REVISE_RESUBMIT` → revision-2 resubmit;
- reload/readback checks prove durable RFI responses and Submittal revision/review history;
- a read-only user sees no mutation controls;
- denied direct API writes cannot alter final row counts;
- the shared Playwright config selects Module 19 only under `RUN_MODULE_19_E2E=1`;
- the live command requires the explicit browser/database opt-in flags;
- all accepted Module-19 backend/database/core React files remain byte-identical to Pass 405;
- no new public route, permission, migration or Module-20 production behavior is introduced.

The archive contains no installed `node_modules`, and this execution environment does not provide the project PostgreSQL/Docker runtime. Therefore Pass 406 does **not** claim that the live browser scenario was executed here. It is static/syntax verified and ready for the project’s normal live browser environment.

## Next pass

**Pass 407 — Stage 24 / Module 19 Final Acceptance**

Pass 407 should perform the cumulative Module-19 acceptance audit across persistence, schema, repository, service, HTTP/OpenAPI, integration verification, detail/history readback, typed React API, TanStack Query, accessible UI, navigation and this Playwright workflow. It should not begin Stage 25 / Module 20 production work unless Stage 24 is accepted.
