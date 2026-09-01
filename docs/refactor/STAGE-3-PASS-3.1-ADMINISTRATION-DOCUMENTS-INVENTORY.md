# Stage 3 - Pass 3.1: Administration + Documents/Audit Actual-Code Inventory

Status: **INVENTORY COMPLETE - NO FUNCTIONAL CHANGE**

This pass reads the current implementation as code, not as evidence of compliance. Existing module names, static tests, README files, and historical acceptance artifacts are treated only as clues. The final 21-module merged requirements remain the target contract.

## 1. Runtime implementation found

### Administration / authentication

Current backend implementation:

- `apps/api/src/modules/administration/administration.schema.ts`
- `apps/api/src/modules/administration/administration.repository.ts`
- `apps/api/src/modules/administration/administration.service.ts`
- `apps/api/src/modules/administration/administration.routes.ts`
- `apps/api/src/modules/administration/index.ts`
- `apps/api/src/plugins/authentication.ts`
- `apps/api/src/plugins/request-context.ts`
- `apps/api/src/workers/auth-notification.worker.ts`

Current frontend implementation:

- `apps/web/src/features/administration/api/auth-api.ts`
- `apps/web/src/features/administration/api/admin-api.ts`
- `apps/web/src/features/administration/hooks/auth.tsx`
- `apps/web/src/features/administration/pages/sign-in-page.tsx`
- `apps/web/src/features/administration/pages/users-page.tsx`
- `apps/web/src/features/administration/pages/roles-page.tsx`
- `apps/web/src/features/administration/components/admin-shell.tsx`

The code still calls this area **Module 24A / Users-RBAC**, not final **Module 2 / Administration**.

### Documents

Current backend implementation:

- `apps/api/src/modules/documents/documents.schema.ts`
- `apps/api/src/modules/documents/documents.repository.ts`
- `apps/api/src/modules/documents/documents.service.ts`
- `apps/api/src/modules/documents/documents.routes.ts`
- `apps/api/src/modules/documents/index.ts`

Current frontend implementation:

- `apps/web/src/features/documents/api/documents-api.ts`
- `apps/web/src/features/documents/hooks/documents.ts`
- `apps/web/src/features/documents/components/document-browser.tsx`
- `apps/web/src/features/documents/components/document-details-panel.tsx`
- `apps/web/src/features/documents/pages/documents-page.tsx`

The code still calls this area **Module 18 / Document Management**, not final **Module 21 / Documents & Audit Log**.

### Registration

`apps/api/src/app.ts` registers Users/RBAC whenever a database is available and registers Documents only when both database and object storage are available. `apps/web/src/main.tsx` mounts the existing permission-aware `AdminShell`.

## 2. Current persistence found

### Administration-related models

The Prisma schema currently has:

- `User`
- `AuthCredential`
- `AuthSession`
- `Role`
- `Permission`
- `RolePermission`
- `UserRoleAssignment`

Important observations:

- `User.companyId` is mandatory and linked to `Company`.
- `Role.companyId` is **nullable**, preserving legacy global/system roles.
- There is **no Administration `Department` model**.
- There is **no `UserProjectScope` / `user_project_scopes` model**.
- Project scope is currently represented partly inside `UserRoleAssignment(scopeType, scopeId)` and partly derived from `ProjectMember`.
- This means role assignment and project-access scope are currently coupled, unlike the final Administration persistence contract.

The only schema occurrence resembling a department is an employee-level text field elsewhere in the ERP. It is not an Administration-owned department master.

### Document-related models

The Prisma schema currently has:

- `DocumentFolder`
- `Document`
- `DocumentVersion`
- `DocumentLink`
- `DocumentUploadIntent`

Reusable behavior is already present:

- binary file content is not stored in business tables;
- immutable version metadata is persisted;
- storage keys are unique;
- signed upload/download flow exists;
- company/project ownership exists for Document, Folder and UploadIntent.

Final-scope mismatch in `DocumentLink`:

Current link fields are effectively:

- document ID
- linked resource type
- linked resource ID
- relation type
- created timestamp

The final Module 21 contract expects link ownership/context such as company, optional version, project, stage and creator. Those fields are not currently represented on `DocumentLink`.

### Audit persistence

Foundation owns `AuditLog` and Stage 2 already made it database append-only.

Current AuditLog uses:

- `companyId`
- `actorUserId`
- `projectScope` JSON snapshot
- `entityType`
- `entityId`
- `action`
- request/correlation IDs
- before/after JSON
- created timestamp

The final Documents & Audit model expects a searchable resource-oriented surface including project/stage dimensions. Current storage does not yet have direct `projectId` and `stageId` columns on AuditLog.

## 3. Current HTTP surface vs final Administration contract

### Current authentication routes

- `POST /api/v1/auth/sign-in`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/invitations/accept`
- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/complete`
- `POST /api/v1/auth/sign-out`
- `GET /api/v1/auth/me`

Final contract uses `login`, `logout`, and `me` as the named core endpoints. Current sign-in/sign-out naming therefore does not match the final route contract. Refresh/invitation/password-reset flows are additional legacy behavior and need an explicit keep/remove decision instead of being assumed final.

### Current user/role routes

- `GET /api/v1/users`
- `POST /api/v1/users`
- `PATCH /api/v1/users/:id`
- `POST /api/v1/users/:id/activate`
- `POST /api/v1/users/:id/deactivate`
- `GET /api/v1/roles`
- `POST /api/v1/roles`
- `PUT /api/v1/roles/:id/permissions`
- `PUT /api/v1/users/:id/roles`

Final Administration routes are under `/api/v1/admin/...`. Current paths therefore need alignment.

### Missing final Administration routes/features

No current route implements:

- replace user project scopes as a separate Administration operation;
- list departments;
- create departments.

There is also no dedicated Organization Profile Administration API in this module.

## 4. Current RBAC behavior

Good reusable implementation:

- request payloads do not accept company ownership;
- protected requests derive company, actor, permissions and project scope from server-owned session/database records;
- company repository scope is enforced through `requireCompanyRepositoryScope()`;
- inactive users are rejected by authentication;
- passwords use salted scrypt hashes;
- access and refresh tokens are separate opaque credentials and are hashed before persistence;
- user deactivation revokes sessions;
- sensitive role/permission replacements are transaction-oriented and audited;
- permission escalation checks exist before role/permission assignment changes.

Final-contract mismatches:

- current stable permissions are `users.*`, `roles.*`, `sessions.manage`; final Administration naming is `admin.users.*`, `admin.roles.*`, `admin.departments.*`, `admin.project_scopes.*`;
- global roles are currently visible through nullable `Role.companyId`; final Administration table description is company-owned;
- project scope is coupled to role assignments and project memberships instead of being an Administration-owned `user_project_scopes` surface.

## 5. Current Documents HTTP surface vs final Module 21 contract

### Current routes

- `POST /api/v1/documents/upload-intents`
- `POST /api/v1/documents/upload-intents/:id/complete`
- `GET /api/v1/documents`
- `GET /api/v1/documents/folders`
- `POST /api/v1/documents/folders`
- `GET /api/v1/documents/:id`
- `POST /api/v1/documents/:id/versions`
- `GET /api/v1/documents/:id/download`
- `POST /api/v1/documents/:id/archive`
- `POST /api/v1/documents/:id/restore`

The final Module 21 route contract instead includes signed upload init/complete, document metadata/versioning, explicit resource link/unlink operations, signed download, and audit-log search. Current route names and surface therefore do not match the final contract.

### Critical document-link finding

`DocumentsService.linkDocumentToResource()` already exists, and `DocumentsRepository.createDocumentLink()` persists a generic link, but **no Fastify route exposes this service operation**.

More importantly, the current service checks access to the Document but does **not** prove that the target resource type is allow-listed or that the referenced target resource exists and is authorized in the same company/project/stage. The final contract explicitly requires authorization checks for every linked resource.

There is no unlink route/service equivalent for the final authorized link-removal operation.

### Current document permissions

Current allow-list:

- `documents.read`
- `documents.upload`
- `documents.version`
- `documents.archive`
- `documents.project.read`

Final Module 21 additionally requires link/version/audit-oriented permissions. `documents.link`, `audit.read`, and `audit.export` are not part of the current permission contract.

### Current document lifecycle

Useful existing behavior:

- signed direct upload;
- server verifies uploaded object before completion;
- immutable version history;
- signed download;
- company/project permission filtering;
- archive/restore are non-destructive;
- storage-key company scope was hardened during Stage 2.

Folders and archive/restore are current legacy/product behavior but are not listed in the final Module 21 "Every API route" table. They must not automatically be treated as approved final routes.

## 6. Audit read/search surface

There is currently **no `/api/v1/audit-logs` route**, no Documents/Audit repository query surface, and no Audit Search React page.

Foundation write-side audit is present and append-only, but final Module 21 read/search behavior is missing.

## 7. Current React coverage

### Administration UI present

- sign in;
- user list/create/edit;
- activate/deactivate;
- role list/create;
- permission editor;
- COMPANY/PROJECT role-assignment editor.

### Administration UI missing against final contract

- department management;
- dedicated project-scope assignment separate from roles;
- organization profile Administration surface.

### Documents UI present

- document browser;
- folders;
- upload;
- immutable version upload/history;
- signed open/download;
- archive/restore;
- linked-record **display**.

### Documents/Audit UI missing against final contract

- create/remove resource links;
- project/stage/resource-specific link workflow;
- audit search;
- actor/action/resource/date filters;
- explicit employee/invoice/receipt/stage document views.

## 8. Test reality

Focused legacy static suites executed in this pass:

- Module 24A Users/RBAC static tests: PASS
- Module 18 Documents static tests: PASS
- Combined focused result: **34 passed, 0 failed**

This does **not** prove final 21-module compliance. Those tests intentionally freeze the older Module 24A and Module 18 contracts, including old permission names and old route surfaces. They are useful regression evidence for current behavior, not acceptance evidence for final Module 2 and Module 21.

Live database/object-storage/browser proof is still environment-dependent and remains outside this inventory pass.

## 9. Priority handoff for later Stage 3 passes

### Highest priority

1. Align Administration route and permission contract without weakening existing authentication security.
2. Decide and implement final company-owned role behavior.
3. Introduce final Department ownership.
4. Separate project access scope from role assignment into the final Administration model/command surface.
5. Align Documents signed-upload route contract.
6. Implement allow-listed, authorization-checked document link/unlink routes.
7. Add final audit read/search API with company/project scope enforcement.
8. Align DocumentLink and AuditLog persistence only through forward migrations; do not rewrite accepted migration history.

### Reuse rather than rewrite

Keep and adapt the existing:

- password/session security;
- request-context derivation;
- tenant-scope helpers;
- transactional RBAC writes;
- audit/outbox behavior;
- signed object-storage implementation;
- immutable DocumentVersion model/flow;
- permission-aware React data flow.

## 10. Pass boundary

No runtime behavior, Prisma model, migration, API route, permission, React component, or test contract was changed in Pass 3.1.

Next implementation pass: **Pass 3.2 - Authentication + User Management final-scope alignment.**
