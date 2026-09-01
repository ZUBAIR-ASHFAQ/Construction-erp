# Stage 8 — Module 24B Project Scope Activation Contract

## Purpose

Stage 8 activates the Project-scope half of **Module 24 — Users, Roles & Permissions** after Module 5 has created the Project master.

Module 24B is an implementation gate inside Module 24. It is **not** a 25th ERP business module.

The controlling execution order is:

```text
Stage 7  Module 5 - Project Management
Stage 8  Module 24B - Project Scope Activation
Stage 9  Module 6 - WBS & Cost Codes
```

Stage 8 exists because project memberships and project-scoped authorization cannot be validated before `projects` exists.

## Stage prerequisite

The direct prerequisite is genuine Module 5 Stage-7 live acceptance:

```text
STAGE_7_ACCEPTED_READY_FOR_STAGE_8
```

The Stage-8 contract may be reviewed and frozen while live acceptance is still pending. That does not authorize deployment or allow static evidence to be promoted into runtime acceptance.

## Ownership boundary

Module 24B activates:

```text
project_members
validated Project memberships
PROJECT-scoped user-role assignment validation
project-scoped resource authorization
trusted request projectScope resolution
PUT /api/v1/projects/:id/members
projects.manage_members runtime authority
project.member_changed event emission
Project team/member React workflow
user Project-scope role-assignment React workflow
```

Module 24B does **not** take ownership of:

```text
projects or project_status_history          Module 5
WBS nodes or cost codes                     Module 6
BOQ project/WBS/cost-code mapping           Module 4B
budgets, procurement, finance or reports    later source modules
```

Existing Module 24A ownership remains unchanged for users, credentials, sessions, roles, permissions, role-permission mappings and user-role assignments.

## Persistence contract

### project_members

The source contract requires these business fields:

```text
id
project_id
user_id
project_role
status
from_date
to_date nullable
```

The Stage-8 persistence pass may also store server-owned tenant/timestamp fields needed to enforce the Foundation isolation contract. Client input never owns company identity.

Required integrity:

- `project_id` references an existing same-company Project.
- `user_id` references an existing same-company User.
- the Project and User must belong to the authenticated company;
- duplicate membership for the same Project/User pair is rejected rather than silently creating parallel active membership rows;
- membership dates must be valid and `to_date` cannot precede `from_date`;
- referenced membership history is preserved through controlled status/replacement behavior rather than generic hard-delete HTTP CRUD;
- repository reads/writes remain company- and Project-scoped.

The requirements name `project_role` but do not define a fixed enumeration of Project-role codes. Stage 8 therefore does **not invent** a new global Project-role enum. `project_role` is business membership metadata; it is not itself a permission grant. Authorization comes from Module 24 roles/permissions plus validated scope.

### user_role_assignments Project scope

Module 24A deliberately accepts `scopeType = PROJECT` only so it can return `INVALID_SCOPE_ASSIGNMENT` before projects exist. Stage 8 activates the existing stable shape:

```text
roleId
scopeType = PROJECT
scopeId = projectId
fromDate optional
toDate nullable
```

The Stage-8 migration must make PROJECT scope refer to a real same-company Project. It must also preserve valid COMPANY assignments where `scopeId` is null.

The previous Stage-1 uniqueness rule was safe only while all assignments were company-scoped. Stage 8 must replace that rule with constraints that allow the same role to be assigned to different Projects while still rejecting duplicate COMPANY or duplicate same-Project assignments.

## Membership and permission semantics

Project membership and RBAC answer different questions:

```text
Membership: Which Projects may this user participate in?
RBAC:       What may this user do?
Scope:      On which Project does that role assignment apply?
```

Security invariants:

- membership alone never grants a permission;
- a Project-scoped role assignment never grants access to a different Project;
- a Project-scoped role assignment must reference a Project the administrator is allowed to manage;
- a normal Project-scoped action must satisfy both Project access policy and permission policy;
- the actor cannot assign a role containing permissions outside the actor's own authority;
- the actor cannot grant Project scope outside the actor's own administrable Project scope;
- Project membership cannot grant permissions the user's role does not contain;
- company ownership is always derived from trusted request context;
- browser-supplied company, actor, effective permissions or effective Project scope are never trusted.

A union of permission codes across different Project-scoped roles must **not** be treated as permission on every allowed Project. Resource policy must preserve the Project attached to a scoped role assignment so a permission granted for Project A cannot authorize the same action on Project B.

## Trusted request project scope

Before Stage 8, authenticated context correctly contains:

```ts
projectScope: { kind: 'not-resolved' }
```

After Stage-8 activation, authenticated protected requests use only resolved scope:

```ts
projectScope: { kind: 'restricted', projectIds: [...] }
```

or, only when an existing reviewed company-wide authorization policy genuinely grants all-Project access:

```ts
projectScope: { kind: 'all' }
```

Stage 8 does not invent a new `all_projects` permission. If no reviewed company-wide policy applies, ordinary users resolve to the membership-derived restricted Project set.

An empty membership set must fail closed for Project-scoped resources. It must never be normalized into `all`.

`projectScope` is an access boundary, not a replacement for permission checking. Project-specific role scope must still be evaluated by resource policy when roles differ by Project.

## HTTP contract

### Activate the reviewed Project membership command

Stage 8 activates the Appendix operation that Module 5 intentionally deferred:

```text
PUT /api/v1/projects/:id/members
```

Purpose: replace the authorized membership set for one Project in one transaction.

The route uses:

```text
projects.manage_members
```

It must authenticate, validate the Project path, verify actor scope, validate all target Users, validate membership dates, perform one atomic replacement, record audit and write the outbox event.

Do not add generic membership CRUD such as:

```text
POST   /api/v1/projects/:id/members
PATCH  /api/v1/projects/:id/members/:memberId
DELETE /api/v1/projects/:id/members/:memberId
```

unless a later controlling requirement explicitly adds that workflow.

### Existing user-role route

The existing Module 24 route remains the role-assignment command:

```text
PUT /api/v1/users/:id/roles
```

Stage 8 changes its behavior only where required to validate PROJECT assignments. It does not create a second role-assignment API.

### Existing Project detail and auth responses

Stage 8 may extend the already reviewed Project detail response with the authorized team/member set needed by the Project detail UI. It should not invent a separate membership read route solely to duplicate the same data.

Authentication/current-identity responses must stop reporting `not-resolved` after Stage-8 activation and return the trusted resolved Project scope.

## Request boundary

The membership replacement body contains only business input. The exact Zod shape is prepared in Pass 153, but authority fields remain forbidden.

Allowed membership concepts:

```text
userId
projectRole
status
fromDate
toDate nullable
```

Forbidden browser authority includes:

```text
companyId
actorUserId
permissions
projectScope
effectivePermissions
changedBy
createdAt
updatedAt
```

The path Project ID identifies the membership owner. A client must not be able to send a different authoritative `projectId` inside each member row.

## Stable errors

Stage 8 activates the already reserved Project scope conflict:

```text
PROJECT_SCOPE_FORBIDDEN
```

It also reuses existing stable Module 24/5 errors where they already express the business conflict:

```text
PROJECT_NOT_FOUND
USER_NOT_FOUND
ROLE_NOT_FOUND
FORBIDDEN
INVALID_SCOPE_ASSIGNMENT
```

Pass 151 does not invent extra public error codes merely for implementation convenience. A later boundary pass may only add another code if a distinct user-correctable business conflict cannot be represented safely by the reviewed set.

## Events, audit and transaction boundary

The membership replacement transaction is:

```text
validate actor authority
  -> validate Project ownership/scope
  -> validate every User and membership row
  -> replace membership state
  -> audit membership change
  -> record project.member_changed outbox event
  -> commit once
```

The source event reserved by Module 5 is activated here:

```text
project.member_changed
```

Project-scoped role replacement continues to use Module 24's existing role-change audit/outbox behavior. Core correctness must not depend on a background worker.

Audit/outbox payloads contain IDs and safe before/after scope information only. They must not contain passwords, session credentials, tokens or secret material.

## Repository boundary

Stage-8 repository work must be small and explicit. It needs only persistence required to:

```text
prove Project belongs to active company
prove User belongs to active company
read/replace Project memberships
resolve active user Project memberships
validate PROJECT role scope
resolve Project-scoped role permissions for resource policy
```

Every repository method derives tenant ownership from trusted context. No repository method accepts caller-owned `companyId`.

The repository must never convert an empty allowed-Project set into an unbounded query.

## Service/resource-policy boundary

Service logic owns:

- membership replacement transaction;
- same-company Project/User validation;
- date/status invariants;
- administrator scope checks;
- Project-scoped role assignment validation;
- prevention of permission/scope escalation;
- resolved Project scope construction;
- Project-specific permission evaluation where role assignments differ by Project;
- audit and outbox orchestration.

Repository code should not contain HTTP errors, route policy or audit/outbox orchestration.

## React boundary

Stage 8 extends existing features only:

```text
apps/web/src/features/projects/
apps/web/src/features/administration/
```

Required UI:

- Project detail Team/Members management;
- user administration Project access display;
- company/project scope selection for role assignment;
- permission-aware controls;
- no client-owned effective Project scope.

Do not create a separate `project-scope` frontend feature unless later requirements make it genuinely necessary.

## Stage-8 verification sequence

Passes after this freeze proceed in this order:

```text
Pass 151  Module 24B contract freeze
Pass 152  project_members + PROJECT role-scope persistence/migration
Pass 153  Zod/request/response boundary
Pass 154  repository
Pass 155  service + transactions + resource policy
Pass 156  HTTP route/registration activation
Pass 157  PostgreSQL/Fastify integration workflow
Pass 158  project-scope security activation/regression
Pass 159  OpenAPI/API-contract verification
Pass 160  React registration/API hooks
Pass 161  React membership + Project-role workflow
Pass 162  Playwright allowed/denied Project workflow
Pass 163  operations/concurrency/migration/recovery verification
Pass 164  final Stage-8 acceptance gate
```

The within-module generation standard remains Prisma/migration -> Zod -> repository -> service -> Fastify -> integration/security -> OpenAPI -> React -> Playwright.

## Stage-8 exit condition

Stage 8 is complete only when all layers agree on the same trusted scope:

```text
Project membership
  = validated Project role scope
  = authentication projectScope
  = repository filtering
  = service/resource authorization
  = React-visible access
```

Only genuine live acceptance may produce:

```text
STAGE_8_ACCEPTED_READY_FOR_STAGE_9
```

The next dependency-aware stage is:

```text
Stage 9 — Module 6 WBS & Cost Codes
```

## Pass-151 contract-only boundary

Pass 151 changes no production runtime behavior.

It does **not** add:

```text
ProjectMember Prisma model
project_members migration
membership Zod schema
membership repository/service methods
PUT /api/v1/projects/:id/members runtime route
PROJECT role-scope runtime acceptance
request projectScope activation
permission seed/runtime change
project.member_changed producer
React membership UI
Playwright workflow
Module 6 work
```

The maintained contract gate may report:

```text
STAGE_8_CONTRACT_FROZEN_STAGE_7_LIVE_ACCEPTANCE_PENDING
```

while the supplied archive still lacks genuine Stage-7 live acceptance.

Only evidence containing:

```text
STAGE_7_ACCEPTED_READY_FOR_STAGE_8
```

allows the contract evidence to report that Pass 152 runtime implementation is authorized.

## Pass-154 repository preparation boundary

Pass 154 prepares only the Stage-8 persistence methods needed by Pass 155. Project membership reads and replacement primitives remain company-scoped through trusted request context. Candidate Users and Project role scopes are resolved only inside the same company. Active membership lookup returns an empty Project list when no allowed membership status is supplied; it never widens an empty result to unrestricted scope.

Company-wide effective permission lookup is restricted to `COMPANY` role assignments. A separate exact-Project permission lookup may include COMPANY assignments plus only the `PROJECT` assignment whose `scope_id` equals the requested same-company Project. This preserves the rule that Project-A permission cannot authorize Project-B.

Pass 154 also keeps the existing bootstrap compatible with the Stage-8 partial uniqueness indexes by removing reliance on the obsolete Prisma `companyId_userId_roleId` composite selector.

Pass 154 does **not** activate the membership service transaction, PROJECT assignment service acceptance, membership HTTP route, trusted request `projectScope`, `project.member_changed`, React UI or Module 6.

## Pass-155 service and resource-policy preparation boundary

Pass 155 activates the Stage-8 **service layer only**. The Project membership command is now implemented as one transaction in the existing Project service, and the existing Module 24 role-replacement service now accepts validated `PROJECT` assignments when the caller already has a resolved Project scope.

The Project membership transaction performs:

```text
resolved actor Project scope
  -> exact projects.manage_members permission on this Project
  -> lock same-company Project
  -> validate every same-company User
  -> read current membership set
  -> replace membership rows
  -> audit project.members_changed
  -> outbox project.member_changed
  -> commit once
```

The service does not trust a permission union across unrelated Projects. Exact Project authorization is resolved through the Stage-8 repository rule that combines COMPANY assignments with only the `PROJECT` assignment for the requested Project.

`PUT /api/v1/users/:id/roles` service behavior now preserves the existing full-replacement semantics while adding Stage-8 checks:

- COMPANY assignments remain supported;
- PROJECT assignments must reference a real same-company Project;
- the actor's resolved Project scope must include every Project assignment being created or removed;
- the same role may be assigned to different Projects;
- role permissions assigned on one Project must already be inside the actor's effective permissions for that exact Project;
- replacement audit/outbox snapshots include `roleId`, `scopeType` and `scopeId` so moving a role from Project A to Project B is visible and cannot look unchanged.

The source document names a membership `status` field but does not define its allowed values. Pass 155 therefore does **not** invent a Project-membership status enum. The service prepares a fail-closed restricted-scope builder that accepts an internal trusted list of eligible membership statuses. An empty eligible-status list returns an empty restricted Project set; it never becomes `all`.

Pass 155 still does **not** activate:

```text
PUT /api/v1/projects/:id/members Fastify route
membership OpenAPI operation
request authentication projectScope resolution
all-Project authorization policy
PostgreSQL/Fastify Stage-8 workflow tests
React membership UI
Module 6 work
```

The maintained Pass-155 gate may report:

```text
STAGE_8_SERVICE_PREPARED_STAGE_7_LIVE_ACCEPTANCE_PENDING
```

while genuine `STAGE_7_ACCEPTED_READY_FOR_STAGE_8` evidence is absent. Pass 156 is the membership HTTP route/registration activation pass.

## Pass-156 HTTP route and registration boundary

Pass 156 activates exactly the reviewed Stage-8 Project membership command in the existing Project Fastify module:

```text
PUT /api/v1/projects/:id/members
```

The route authenticates first, applies the reserved `projects.manage_members` route permission, validates the Project UUID and strict Pass-153 membership body, and delegates all Project-scope, same-company User, transaction, audit and outbox rules to `ProjectsService.replaceProjectMembers()`.

The public response returns only the frozen membership DTO fields. Company ownership, actor identity, effective permissions and effective Project scope remain server-owned and are not serialized into member rows.

No generic membership CRUD is added. The existing `registerProjectsRoutes` registration already mounted by `apps/api/src/app.ts` is reused, so Stage 8 does not create a second Project router or a new business module.

Pass 156 still does **not** activate authenticated request `projectScope`; that remains Pass 158. Because the supplied archive still lacks genuine Module-5 Stage-7 live acceptance, the maintained HTTP gate may report:

```text
STAGE_8_HTTP_PREPARED_STAGE_7_LIVE_ACCEPTANCE_PENDING
```

Pass 157 continues with the PostgreSQL/Fastify Stage-8 integration workflow.

## Pass 157 integration implementation note

Pass 157 adds the focused PostgreSQL/Fastify integration workflow for the already-prepared Stage-8 persistence, repository, service and HTTP layers. It verifies membership replacement, same-company User enforcement, transaction rollback, audit/outbox durability and PROJECT-scoped role-assignment persistence/authorization against the real database boundary.

Authentication intentionally remains `projectScope: { kind: 'not-resolved' }` in this pass. Therefore the public membership command is tested as a fail-closed pre-activation boundary only; Pass 158 must activate trusted membership-derived Project scope before successful authenticated HTTP membership mutation can be claimed.

## Pass-158 authenticated Project-scope security activation boundary

Pass 158 supersedes the temporary Pass-157 `not-resolved` protected-request state. Each authenticated request now re-resolves Project scope from trusted server-owned records before binding `RequestSecurityContext`. Company permission lookup remains COMPANY-scope only; Project-specific permissions are evaluated separately for the exact requested Project.

The resolved access shapes are now active:

```text
active reviewed system-admin COMPANY assignment
  -> { kind: 'all' }

ordinary authenticated user
  -> active same-company project_members
  -> { kind: 'restricted', projectIds: [...] }

no active memberships
  -> { kind: 'restricted', projectIds: [] }
```

No new `all_projects` permission is invented. The `all` branch uses the already-existing reviewed system-administrator company-wide policy; ordinary roles stay membership-bounded. Client-supplied company, permission or Project-scope authority remains ignored/rejected by the normal strict boundaries.

Existing Project APIs now enforce the Stage-8 resource policy rather than relying on one global permission union:

```text
Project list
  -> resolved membership scope
  -> COMPANY projects.read, or exact PROJECT projects.read per candidate Project
  -> bounded repository query

Project detail/update/activate/complete/close/members
  -> resolved scope contains exact Project (or reviewed all-Project policy)
  -> COMPANY permissions + PROJECT permissions for that exact Project only
  -> service command/read
```

Project creation continues to require company-scoped `projects.create`, because there is no existing Project resource against which a PROJECT role can be evaluated. A Project-A role is never unioned into Project-B authority.

Sign-in, refresh and current-identity responses now expose the same resolved `all` / `restricted` contract. Historical `not-resolved` remains only for internal/pre-authentication contexts that are not allowed to authorize Project resource operations.

Pass 158 adds focused regression preparation for system-administrator all-Project access, ordinary membership-restricted access, empty-membership fail-closed behavior, successful authenticated membership replacement and Project-A/Project-B permission separation. Live PostgreSQL/Fastify execution remains blocked until genuine `STAGE_7_ACCEPTED_READY_FOR_STAGE_8` evidence exists.

The maintained gate may therefore report:

```text
STAGE_8_SECURITY_PREPARED_STAGE_7_LIVE_ACCEPTANCE_PENDING
```

Pass 159 is the OpenAPI/API-contract verification pass.


## Pass-159 OpenAPI and exact API-contract verification boundary

Pass 159 adds no new business endpoint. It verifies the already-activated Stage-8 HTTP/security surface against generated `/openapi.json` and corrects only stale documentation metadata that still described PROJECT role assignments as rejected.

The reviewed Stage-8 public contract is now explicit:

```text
PUT /api/v1/projects/:id/members
  operationId = module24bReplaceProjectMembers
  bearer security required
  browser body = members[] only
  stable errors = INVALID_REQUEST / AUTHENTICATION_REQUIRED /
                  FORBIDDEN / PROJECT_SCOPE_FORBIDDEN /
                  PROJECT_NOT_FOUND / USER_NOT_FOUND /
                  INTERNAL_SERVER_ERROR

PUT /api/v1/users/:id/roles
  existing Module-24 operationId remains stable
  COMPANY scope remains supported
  PROJECT scope is now documented as active and validated
  stable Stage-8 conflicts include INVALID_SCOPE_ASSIGNMENT

POST /api/v1/auth/sign-in
POST /api/v1/auth/refresh
GET  /api/v1/auth/me
  projectScope = { kind: 'all' }
              or { kind: 'restricted', projectIds: [...] }
  not-resolved is not a public authenticated response shape
```

The historical Module-5 OpenAPI regression remains exactly seven `module5*` operations. Stage 8 adds the membership command as a separate `module24b*` operation, so the Module-5 proof now counts operation ownership rather than incorrectly assuming no later Project path can ever exist.

Run the dependency-free preparation gate with:

```bash
npm run module-24b:api-contract:gate
```

Run generated OpenAPI verification only with an explicitly disposable database after genuine Stage-7 acceptance:

```bash
RUN_FOUNDATION_DB_TESTS=1 TEST_DATABASE_URL=<disposable-test-db> npm run module-24b:api-contract:gate:live
```

Until genuine `STAGE_7_ACCEPTED_READY_FOR_STAGE_8` exists, the maintained gate may report:

```text
STAGE_8_API_CONTRACT_PREPARED_STAGE_7_LIVE_ACCEPTANCE_PENDING
```

Pass 160 is the React registration and API-hooks pass.

## Pass-163 operational readiness boundary

Pass 163 verifies Stage-8 whole-set writes under concurrency and adds one minimal runtime hardening: `PUT /api/v1/users/:id/roles` locks the same-company User row before replacing the complete assignment set. This mirrors the existing Project-row lock used by membership replacement and prevents concurrent replacement requests from leaving a mixed union of two complete payloads.

Operational PostgreSQL verification covers concurrent membership replacement, concurrent COMPANY/PROJECT role-assignment replacement, transaction-owned audit/outbox side effects and reviewed query-plan indexes for membership and PROJECT-scope lookups. Migration verification continues to cover clean deployment plus upgrade from the immediately previous supported schema.

The maintained static gate may report:

```text
STAGE_8_OPERATIONS_PREPARED_STAGE_7_LIVE_ACCEPTANCE_PENDING
```

A live operational result is valid only after genuine Stage-7 acceptance and successful Pass-162 live browser verification. Pass 164 remains the final Stage-8 acceptance gate before Module 6.

## Pass-164 final Stage-8 acceptance boundary

Pass 164 is verification-only. It adds the final maintained Stage-8 static/live gate and does not change the already-reviewed Project-scope runtime contract.

The completed Stage-8 ownership remains:

```text
Module 24B - Project Scope Activation
  new persistence: project_members
  extended persistence: PROJECT-scoped user_role_assignments
  reviewed Project command: PUT /api/v1/projects/:id/members
  reviewed role command extended for PROJECT scope: PUT /api/v1/users/:id/roles
  activated Project membership permission: projects.manage_members
  activated membership event: project.member_changed
  authenticated Project scope: all | restricted
```

Project membership continues to bound which Projects a user may reach; it does not itself grant business permission. COMPANY permissions and PROJECT permissions for the exact requested Project remain the authorization source.

The final live acceptance must not bypass the implementation chain. It requires genuine Module-5 Stage-7 live acceptance and successful Pass-163 live operational verification before rerunning dependency-backed build, migration, PostgreSQL/Fastify and Playwright proof.

Only genuine live success may record:

```text
STAGE_8_ACCEPTED_READY_FOR_STAGE_9
```

A dependency-free static success while Stage-7 live evidence is unavailable remains only:

```text
STAGE_8_STATIC_GATE_PASSED_STAGE_7_LIVE_ACCEPTANCE_PENDING
```

The next dependency-aware implementation stage after accepted Stage 8 is **Module 6 - WBS & Cost Codes**. Pass 164 intentionally creates no WBS model, migration, module folder, route or React feature.

## Pass-165 post-audit read-before-replace contract repair

Pass 165 freezes a corrective Stage-8 read contract after the cumulative Pass-164 audit found that both whole-set editors can write safely but cannot reload the authoritative rows they are expected to replace. This is a repair inside existing Module 5 / Module 24B APIs, not a new business module, route family, table or permission.

The repair must **reuse existing reviewed reads** rather than invent generic CRUD:

```text
GET /api/v1/projects/:id
  existing Project detail read
  -> project
  -> statusHistory
  -> members[]                 NEW readback field only

GET /api/v1/users
  existing paged User read
  -> existing user fields
  -> roleIds[]                 keep for backward-compatible display
  -> roleAssignments[]         NEW manageable readback field only
  -> roleAssignmentsComplete   NEW replacement-safety flag only
```

The Project-detail `members[]` rows use the already-reviewed Stage-8 safe membership DTO:

```text
id
projectId
userId
projectRole
status
fromDate          YYYY-MM-DD
toDate            YYYY-MM-DD | null
createdAt
updatedAt
```

No `companyId`, actor identity, permission union, effective `projectScope` or audit authority is added to a Project-member read row.

The User-list `roleAssignments[]` readback is intentionally narrower than the internal persistence row. It contains only what the existing access editor needs to reconstruct a safe replacement set:

```text
id
roleId
scopeType         COMPANY | PROJECT
scopeId           Project UUID | null
status
fromDate          YYYY-MM-DD
toDate            YYYY-MM-DD | null
```

`companyId` and duplicate `userId` ownership fields stay server-owned and are not required inside each nested assignment row.

`roleAssignmentsComplete` is mandatory because a Project-restricted administrator must never receive hidden out-of-scope assignments and then accidentally replace the target User's complete global set. The flag follows these fail-closed rules:

- `true` means the returned `roleAssignments[]` is the complete assignment set the current actor may safely submit to the existing whole-set replacement command;
- `false` means one or more existing assignments cannot be safely exposed/administered by the current actor, so the browser must not call whole-set replacement from this readback;
- callers without `users.manage` may still use the User list for normal read/display, but the access editor must not treat its assignment readback as replaceable authority;
- PROJECT assignments outside the actor's resolved Project scope are never exposed merely to make an editor convenient.

This keeps the existing authorization rule intact: scope assignment must not exceed administrator scope, and Project-A authority must not reveal or mutate Project-B access.

### Existing persistence/repository reuse

Pass 165 does not add persistence or repository methods. Pass 166 must reuse the functions already present in the cumulative tree:

```text
ProjectsRepository.listProjectMembers(projectId)
AdministrationRepository.listUsers(... roleAssignments ...)
AdministrationRepository.listUserRoleAssignments(userId) when a complete-set safety decision needs it
```

Only if implementation proves one of those existing reads cannot express the frozen contract may a minimal repository function be added in Pass 166. Generic `getProjectMembers`, assignment CRUD repositories, or a second Project/User module are not allowed.

### No new API surface

Pass 165 freezes **zero new routes**. These remain the only whole-set writes:

```text
PUT /api/v1/projects/:id/members
PUT /api/v1/users/:id/roles
```

The repair is read-before-replace, not a new member/assignment CRUD design.

### Repair hold

The Pass-164 static gate remains historical evidence, but its Stage-9 handoff is now held until the post-audit repair chain is complete. A live Stage-8 acceptance must fail while:

```text
STAGE_8_REPAIR_HOLD_ACTIVE
```

is present. Passes 166-175 may clear that hold only after backend readback, OpenAPI, React initialization, Document Project-scope repair, regression and dependency-backed/live acceptance are complete.

Therefore Pass 165 hands off to:

```text
Pass 166 - Stage-8 readback backend + OpenAPI implementation
```

and **not** directly to Module 6.

## Pass-166 Stage-8 readback backend and OpenAPI repair

Pass 166 implements the Pass-165 read-before-replace contract inside the existing Project and Users/RBAC modules. It adds no business module, table, migration, permission, repository abstraction or route.

The existing Project detail read now reuses `ProjectsRepository.listProjectMembers(projectId)` and returns:

```text
GET /api/v1/projects/:id
  project
  statusHistory
  members[]
```

`members[]` uses the existing safe Stage-8 membership DTO and keeps `companyId`, actor identity, permissions and effective Project scope server-owned.

The existing User list now returns the safe access-editor readback:

```text
GET /api/v1/users
  items[].roleIds[]
  items[].roleAssignments[]
  items[].roleAssignmentsComplete
```

`roleAssignments[]` contains only:

```text
id
roleId
scopeType
scopeId
status
fromDate

toDate
```

The readback dates use `YYYY-MM-DD`. The nested readback does not expose `companyId` or duplicate `userId` ownership fields.

The completeness decision fails closed. `roleAssignmentsComplete` is `true` only when the current actor has `users.manage` and every existing assignment can be submitted unchanged through the existing whole-set command under the actor's current COMPANY/PROJECT authority. Out-of-scope Project assignments, unsupported assignment states, missing roles or roles whose permissions exceed the actor's authority are not exposed as manageable rows and force the flag to `false`.

No new read route is introduced. The existing writes remain exactly:

```text
PUT /api/v1/projects/:id/members
PUT /api/v1/users/:id/roles
```

The generated OpenAPI contract now documents Project-detail `members[]` and User-list `roleAssignments[]` plus `roleAssignmentsComplete` on those existing reads.

The Stage-8 audit repair hold remains active. Pass 166 hands off to:

```text
Pass 167 - Stage-8 safe React editor initialization + Playwright read-before-replace regression
```

Module 6 remains blocked until the complete repair chain and genuine live acceptance are finished.


## Pass 167 - Stage-8 safe React read-before-replace workflow

Pass 167 consumes the Pass-166 readback without adding routes, tables, migrations, permissions, repository methods or backend business behavior.

The Project detail editor must initialize its complete member form from the existing `GET /api/v1/projects/:id` `members[]` response. The browser may still use only `PUT /api/v1/projects/:id/members` to replace the complete set. There is no new member-list or member CRUD endpoint.

The User access editor must initialize from `roleAssignments[]` only when `roleAssignmentsComplete === true`. When the server returns `roleAssignmentsComplete === false`, the browser must disable whole-set replacement because a hidden or non-manageable assignment could otherwise be deleted. The browser may never infer missing assignments from `roleIds[]`.

The browser regression must prove read-before-replace by loading an existing Project member and an existing COMPANY role assignment, adding or editing another row, reloading from server state, and preserving the unrelated row on replacement. Client requests remain limited to reviewed business fields and never carry company, actor, permission, effective Project-scope or audit authority.

The Stage-8 audit repair hold remains active. Pass 167 hands off to:

`Pass 168 - Module 18 Project relationship persistence repair.`
