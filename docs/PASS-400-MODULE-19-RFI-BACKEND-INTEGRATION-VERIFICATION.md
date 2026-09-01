# Pass 400 — Module 19 RFI Backend Integration Verification

Pass 400 is the verification-only backend checkpoint for the Pass-395→399 RFI implementation. No production runtime, Prisma model, migration SQL, route or React behavior changes in Pass 400.

The pass adds a disposable PostgreSQL + Fastify.inject integration suite for the five reviewed RFI operations:

- `GET /api/v1/projects/:projectId/rfis`
- `POST /api/v1/projects/:projectId/rfis`
- `POST /api/v1/rfis/:id/respond`
- `POST /api/v1/rfis/:id/close`
- `POST /api/v1/rfis/:id/reopen`

The live suite verifies the complete `OPEN -> respond -> CLOSED -> reopen -> OPEN` workflow, rejects a normal response while closed, and checks that responder identity, response type, timestamps and lifecycle fields remain server-owned.

It also verifies:

- idempotent replay for create, respond, close and reopen without duplicate durable effects;
- collision-free concurrent RFI number allocation;
- cross-company and Project-scope isolation;
- denied create/respond/close actions when the actor lacks the required permission;
- active same-Project assignee validation;
- same-Project versioned Document validation for response evidence;
- PostgreSQL append-only response enforcement for update and delete attempts;
- atomic audit/outbox behavior by forcing `rfi.responded` outbox insertion to fail and proving the response row and audit evidence roll back with it.

The live integration suite runs only when `RUN_FOUNDATION_DB_TESTS=1` and the normal disposable Foundation PostgreSQL integration environment is configured. The packaged archive intentionally contains no `node_modules`, and this execution environment has no PostgreSQL/Docker runtime, so Pass 400 does not claim that the live database suite was executed here. The dependency-free static gate verifies the test contract and protects the accepted Pass-399 production hashes.

The public Module-19 route surface remains exactly nine source-approved operations. The two Pass-394 readback amendments remain deferred to Pass 401:

- `GET /api/v1/rfis/:id`
- `GET /api/v1/submittals/:id`

Stage 25 / Module 20 Daily Site Reports remains untouched.

## Next pass

Pass 401 — Module 19 Detail/History Readback Repair: implement only the two frozen read-only detail contracts needed for durable RFI thread and Submittal revision/review readback before React work begins.
